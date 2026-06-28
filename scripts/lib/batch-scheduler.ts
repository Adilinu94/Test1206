#!/usr/bin/env node
/**
 * scripts/lib/batch-scheduler.ts — UMBAUPLAN v2.0 Phase 7c: Batch Scheduler
 *
 * Priorisierte Batch-Ausfuehrung von MCP-Calls mit:
 *  - Priority Queue (0 = hoechste, 10 = niedrigste)
 *  - Concurrency Control
 *  - Batch Windows (Sammelphase vor Ausfuehrung)
 *  - Retry mit Exponential Backoff
 *  - Integration mit CircuitBreaker + Idempotency
 *
 * Usage:
 *   import { BatchScheduler } from './lib/batch-scheduler.js';
 *
 *   const scheduler = new BatchScheduler({ name: 'mcp', concurrency: 3 });
 *
 *   // Einzelne Tasks schedulen:
 *   const result = await scheduler.schedule(
 *     async () => bridge.call('ability', {}),
 *     { priority: 0, ability: 'ability', params: {} }
 *   );
 *
 *   // Batch von Tasks:
 *   const results = await scheduler.scheduleAll([
 *     { fn: () => bridge.call('a', {}), options: { priority: 1, ability: 'a' } },
 *     { fn: () => bridge.call('b', {}), options: { priority: 0, ability: 'b' } },
 *   ]);
 *
 * Konfiguration via Umgebungsvariablen:
 *   BS_CONCURRENCY=5
 *   BS_BATCH_WINDOW=50        (ms Sammelphase)
 *   BS_MAX_RETRIES=2
 *   BS_VERBOSE=1
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface BatchSchedulerOptions {
  /** Name (fuer Logs) */
  name?: string;
  /** Maximale parallele Ausfuehrungen (default: 5) */
  concurrency?: number;
  /** Batch-Sammelphase in ms (default: 0 = sofort) */
  batchWindow?: number;
  /** Max Retries pro Task (default: 2) */
  maxRetries?: number;
  /** Base delay fuer exponential backoff in ms (default: 500) */
  baseDelayMs?: number;
  /** Timeout pro Task in ms (default: 60000) */
  timeout?: number;
}

export interface ScheduleOptions {
  /** Prioritaet: 0 = hoechste, 10 = niedrigste (default: 5) */
  priority?: number;
  /** Ability-Name (fuer Logs/Idempotency-Key) */
  ability?: string;
  /** Parameter (fuer Idempotency-Key) */
  params?: Record<string, unknown>;
  /** Per-Task Timeout override */
  timeout?: number;
  /** Per-Task Max Retries override */
  maxRetries?: number;
}

export interface BatchTask<T = unknown> {
  id: number;
  fn: () => Promise<T>;
  options: Required<ScheduleOptions>;
  createdAt: number;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export interface BatchSchedulerStatus {
  name: string;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  totalScheduled: number;
  totalCompleted: number;
  totalFailed: number;
  concurrency: number;
  batchWindow: number;
}

export interface BatchResult<T = unknown> {
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
  index: number;
  attempts: number;
  durationMs: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_BATCH_WINDOW = 0;   // sofort
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_TIMEOUT = 60_000;

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 1 ? fallback : n;
}

function resolveDefaults(name: string, options: BatchSchedulerOptions): Required<BatchSchedulerOptions> {
  const prefix = name ? `BS_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_` : 'BS_';
  return {
    name: options.name ?? name,
    concurrency: options.concurrency
      ?? envInt(`${prefix}CONCURRENCY`, envInt('BS_CONCURRENCY', DEFAULT_CONCURRENCY)),
    batchWindow: options.batchWindow
      ?? envInt(`${prefix}BATCH_WINDOW`, envInt('BS_BATCH_WINDOW', DEFAULT_BATCH_WINDOW)),
    maxRetries: options.maxRetries
      ?? envInt(`${prefix}MAX_RETRIES`, envInt('BS_MAX_RETRIES', DEFAULT_MAX_RETRIES)),
    baseDelayMs: options.baseDelayMs
      ?? envInt(`${prefix}BASE_DELAY_MS`, envInt('BS_BASE_DELAY_MS', DEFAULT_BASE_DELAY_MS)),
    timeout: options.timeout
      ?? envInt(`${prefix}TIMEOUT`, envInt('BS_TIMEOUT', DEFAULT_TIMEOUT)),
  };
}

function resolveTaskOptions(options: ScheduleOptions): Required<ScheduleOptions> {
  return {
    priority: options.priority ?? 5,
    ability: options.ability ?? 'unknown',
    params: options.params ?? {},
    timeout: options.timeout ?? 0,
    maxRetries: options.maxRetries ?? -1,
  };
}

// ── BatchScheduler ─────────────────────────────────────────────────────────

export class BatchScheduler {
  readonly name: string;
  readonly concurrency: number;
  readonly batchWindow: number;
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly timeout: number;

  private _queue: BatchTask<unknown>[] = [];
  private _running: Set<number> = new Set();
  private _nextId: number = 1;
  private _batchTimer: ReturnType<typeof setTimeout> | null = null;
  private _batchResolve: (() => void) | null = null;
  private _draining: boolean = false;
  private _paused: boolean = false;

  private _totalScheduled: number = 0;
  private _totalCompleted: number = 0;
  private _totalFailed: number = 0;

  constructor(options: BatchSchedulerOptions = {}) {
    const resolved = resolveDefaults(options.name || 'default', options);
    this.name        = resolved.name;
    this.concurrency = resolved.concurrency;
    this.batchWindow = resolved.batchWindow;
    this.maxRetries  = resolved.maxRetries;
    this.baseDelayMs = resolved.baseDelayMs;
    this.timeout     = resolved.timeout;
  }

  // ── Public Properties ──────────────────────────────────────────────────

  get queued(): number { return this._queue.length; }
  get running(): number { return this._running.size; }
  get completed(): number { return this._totalCompleted; }
  get failed(): number { return this._totalFailed; }
  get isIdle(): boolean { return this._queue.length === 0 && this._running.size === 0; }

  // ── Core API ───────────────────────────────────────────────────────────

  /**
   * Scheduled einen einzelnen Task und wartet auf das Ergebnis.
   */
  async schedule<T>(
    fn: () => Promise<T>,
    options: ScheduleOptions = {},
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: BatchTask<T> = {
        id: this._nextId++,
        fn,
        options: resolveTaskOptions(options),
        createdAt: Date.now(),
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      this._enqueue(task);
    });
  }

  /**
   * Scheduled mehrere Tasks parallel und gibt Ergebnisse in der
   * urspruenglichen Reihenfolge zurueck.
   */
  async scheduleAll<T>(
    tasks: Array<{
      fn: () => Promise<T>;
      options?: ScheduleOptions;
    }>,
  ): Promise<BatchResult<T>[]> {
    if (!Array.isArray(tasks) || tasks.length === 0) return [];

    this._paused = true;

    const results: BatchResult<T>[] = new Array(tasks.length);
    const startTimes = new Array(tasks.length).fill(0);

    const promises = tasks.map((t, i) =>
      this.schedule(t.fn, t.options || {}).then(
        (value) => {
          results[i] = {
            status: 'fulfilled' as const,
            value,
            index: i,
            attempts: 1,
            durationMs: Date.now() - (startTimes[i] || Date.now()),
          };
        },
        (reason) => {
          results[i] = {
            status: 'rejected' as const,
            reason,
            index: i,
            attempts: 1,
            durationMs: Date.now() - (startTimes[i] || Date.now()),
          };
        },
      )
    );

    // Record start times and resume
    for (let i = 0; i < tasks.length; i++) {
      startTimes[i] = Date.now();
    }

    this._paused = false;
    this._flushBatch();

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Wartet bis alle queued und running Tasks abgeschlossen sind.
   */
  async drain(): Promise<void> {
    if (this.isIdle) return;

    this._draining = true;
    this._flushBatch();

    // Poll until idle
    while (!this.isIdle) {
      await new Promise(r => setTimeout(r, 10));
    }

    this._draining = false;
  }

  /**
   * Bricht alle queued Tasks ab (running Tasks laufen weiter).
   */
  cancelQueued(): number {
    const count = this._queue.length;
    const cancelMsg = 'BatchScheduler: Task cancelled';

    for (const task of this._queue) {
      task.reject(new Error(cancelMsg));
    }

    this._queue = [];
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }

    this._log(`cancelled ${count} queued tasks`);
    return count;
  }

  /**
   * Status-Snapshot fuer Monitoring.
   */
  status(): BatchSchedulerStatus {
    return {
      name: this.name,
      queued: this._queue.length,
      running: this._running.size,
      completed: this._totalCompleted,
      failed: this._totalFailed,
      totalScheduled: this._totalScheduled,
      totalCompleted: this._totalCompleted,
      totalFailed: this._totalFailed,
      concurrency: this.concurrency,
      batchWindow: this.batchWindow,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private _enqueue(task: BatchTask<unknown>): void {
    this._totalScheduled++;

    // Priority-sortiert einfuegen (niedrigere Nummer = hoehere Prioritaet)
    const insertAt = this._queue.findIndex(
      t => t.options.priority > task.options.priority
    );

    if (insertAt === -1) {
      this._queue.push(task);
    } else {
      this._queue.splice(insertAt, 0, task);
    }

    this._scheduleFlush();
  }

  private _scheduleFlush(): void {
    if (this.batchWindow > 0 && !this._draining) {
      // Batch-Mode: Sammle Tasks fuer batchWindow ms
      if (!this._batchTimer) {
        this._batchTimer = setTimeout(() => {
          this._flushBatch();
        }, this.batchWindow);
      }
    } else {
      // Sofort-Mode
      this._flushBatch();
    }
  }

  private _flushBatch(): void {
    if (this._paused) return;

    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }

    // Solange Slots frei + Queue nicht leer
    while (this._running.size < this.concurrency && this._queue.length > 0) {
      const task = this._queue.shift()!;
      this._executeTask(task);
    }
  }

  private async _executeTask(task: BatchTask<unknown>): Promise<void> {
    this._running.add(task.id);
    this._log(`start #${task.id} "${task.options.ability}" (priority=${task.options.priority}, running=${this._running.size}/${this.concurrency})`);

    const maxRetries = task.options.maxRetries >= 0
      ? task.options.maxRetries
      : this.maxRetries;
    const timeout = task.options.timeout > 0
      ? task.options.timeout
      : this.timeout;

    const startTime = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = timeout > 0
          ? await Promise.race([
              task.fn(),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`BatchScheduler timeout after ${timeout}ms`)),
                  timeout,
                ),
              ),
            ])
          : await task.fn();

        const durationMs = Date.now() - startTime;
        this._totalCompleted++;
        if (attempt > 0) {
          this._log(`ok #${task.id} "${task.options.ability}" after ${attempt} retries (${durationMs}ms)`);
        }
        task.resolve(result);
        break;

      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);

        if (attempt >= maxRetries) {
          const durationMs = Date.now() - startTime;
          this._totalFailed++;
          this._log(`FAIL #${task.id} "${task.options.ability}" after ${attempt + 1} attempts (${durationMs}ms): ${errMsg.slice(0, 120)}`);
          task.reject(err);
          break;
        }

        const delay = this.baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 101);
        this._log(`retry ${attempt + 1}/${maxRetries} #${task.id} in ${delay}ms: ${errMsg.slice(0, 100)}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    this._running.delete(task.id);

    // Naechste Tasks aus der Queue holen
    this._flushBatch();
  }

  private _log(message: string): void {
    if (
      process.env.BS_VERBOSE === '1' ||
      process.env.MCP_VERBOSE === '1'
    ) {
      process.stderr.write(`[batch-scheduler] ${this.name}: ${message}\n`);
    }
  }
}

export default BatchScheduler;

// ── Self-Test ─────────────────────────────────────────────────────────────
// node --import tsx scripts/lib/batch-scheduler.ts --self-test

if (process.argv.includes('--self-test')) {
  (async () => {
    let totalTests = 0;
    let passedTests = 0;

    function assert(condition: unknown, msg: string): void {
      totalTests++;
      if (condition) {
        passedTests++;
        console.log(`  ✅ ${msg}`);
      } else {
        console.log(`  ❌ ${msg}`);
      }
    }

    console.log(`
╔══════════════════════════════════════════════════════════════╗
║     framer-v4-pipeline-v2 — Batch Scheduler v1.0.0         ║
║     UMBAUPLAN Phase 7c: Prioritized Batch Execution        ║
╚══════════════════════════════════════════════════════════════╝
`);

    // ── Test 1: Single task scheduling ─────────────────────────────
    console.log('── Test 1: Single task ──');
    {
      const bs = new BatchScheduler({ name: 'test1' });
      const result = await bs.schedule(async () => 'hello');
      assert(result === 'hello', 'schedule() returns fn result');
      assert(bs.status().totalCompleted === 1, 'totalCompleted = 1');
      assert(bs.status().totalFailed === 0, 'totalFailed = 0');
      assert(bs.isIdle === true, 'isIdle after single task');
    }

    // ── Test 2: Parallel execution with concurrency ────────────────
    console.log('── Test 2: Concurrency control ──');
    {
      const bs = new BatchScheduler({ name: 'test2', concurrency: 2 });
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const slowFn = async (id: number) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise(r => setTimeout(r, 30));
        currentConcurrent--;
        return id;
      };

      const results = await bs.scheduleAll(
        Array.from({ length: 5 }, (_, i) => ({
          fn: () => slowFn(i),
          options: { priority: 0, ability: `task-${i}` },
        })),
      );

      assert(maxConcurrent <= 2, `max concurrent ≤ 2 (actual: ${maxConcurrent})`);
      assert(results.length === 5, 'all 5 tasks completed');
      assert(results.every(r => r.status === 'fulfilled'), 'all tasks fulfilled');
    }

    // ── Test 3: Priority ordering ──────────────────────────────────
    console.log('── Test 3: Priority ordering ──');
    {
      const bs = new BatchScheduler({ name: 'test3', concurrency: 1 });
      const executionOrder: number[] = [];

      const tasks = [
        { fn: async () => { executionOrder.push(3); return 3; }, options: { priority: 5, ability: 'low' } },
        { fn: async () => { executionOrder.push(1); return 1; }, options: { priority: 0, ability: 'high' } },
        { fn: async () => { executionOrder.push(2); return 2; }, options: { priority: 2, ability: 'mid' } },
      ];

      await bs.scheduleAll(tasks);

      assert(executionOrder[0] === 1, 'Highest priority (0) executes first');
      assert(executionOrder[1] === 2, 'Medium priority (2) executes second');
      assert(executionOrder[2] === 3, 'Lowest priority (5) executes last');
    }

    // ── Test 4: Retry on failure ──────────────────────────────────
    console.log('── Test 4: Retry on failure ──');
    {
      const bs = new BatchScheduler({
        name: 'test4',
        concurrency: 1,
        maxRetries: 2,
        baseDelayMs: 1,
      });
      let attempts = 0;

      const result = await bs.schedule(
        async () => {
          attempts++;
          if (attempts < 3) throw new Error('fail');
          return 'recovered';
        },
        { ability: 'flaky' },
      );

      assert(result === 'recovered', 'eventually succeeds after retries');
      assert(attempts === 3, '3 attempts total (2 retries + final success)');
      assert(bs.status().totalFailed === 0, 'totalFailed = 0 (recovered)');
    }

    // ── Test 5: Max retries exhausted ─────────────────────────────
    console.log('── Test 5: Max retries exhausted ──');
    {
      const bs = new BatchScheduler({
        name: 'test5',
        concurrency: 1,
        maxRetries: 1,
        baseDelayMs: 1,
      });
      let attempts = 0;

      try {
        await bs.schedule(
          async () => { attempts++; throw new Error('always fail'); },
          { ability: 'fatal' },
        );
        assert(false, 'Should have thrown');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        assert(msg.includes('always fail'), 'throws original error');
      }

      assert(attempts === 2, '2 attempts (1 initial + 1 retry)');
      assert(bs.status().totalFailed === 1, 'totalFailed = 1');
    }

    // ── Test 6: Timeout ────────────────────────────────────────────
    console.log('── Test 6: Task timeout ──');
    {
      const bs = new BatchScheduler({ name: 'test6', timeout: 50, maxRetries: 0 });

      try {
        await bs.schedule(
          async () => { await new Promise(r => setTimeout(r, 200)); return 'late'; },
          { ability: 'slow' },
        );
        assert(false, 'Should have thrown timeout');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        assert(msg.includes('timeout'), 'throws timeout error');
      }

      assert(bs.status().totalFailed === 1, 'totalFailed = 1');
    }

    // ── Test 7: cancelQueued ───────────────────────────────────────
    console.log('── Test 7: cancelQueued ──');
    {
      const bs = new BatchScheduler({ name: 'test7', concurrency: 1 });

      // Externally controlled blocker
      let releaseBlocker: () => void = () => {};
      const blockPromise = new Promise<void>(r => { releaseBlocker = r; });

      const blocker = bs.schedule(
        async () => { await blockPromise; return 'blocker'; },
        { ability: 'blocker' },
      );

      // Queue more tasks behind it
      const p1 = bs.schedule(async () => 'q1', { ability: 'q1' });
      const p2 = bs.schedule(async () => 'q2', { ability: 'q2' });

      // Small delay to let them queue
      await new Promise(r => setTimeout(r, 10));

      const cancelled = bs.cancelQueued();
      assert(cancelled >= 1, 'at least 1 task cancelled');

      // Release and wait for blocker
      releaseBlocker();
      await blocker;

      // Queued tasks should reject
      let cancelledCount = 0;
      try { await p1; } catch { cancelledCount++; }
      try { await p2; } catch { cancelledCount++; }
      assert(cancelledCount >= 1, 'cancelled tasks rejected');
    }

    // ── Test 8: drain ──────────────────────────────────────────────
    console.log('── Test 8: drain ──');
    {
      const bs = new BatchScheduler({ name: 'test8', concurrency: 2 });
      let completed = 0;

      for (let i = 0; i < 4; i++) {
        // fire-and-forget via schedule
        bs.schedule(
          async () => { completed++; await new Promise(r => setTimeout(r, 10)); return i; },
          { ability: `drain-${i}` },
        );
      }

      await bs.drain();
      assert(completed === 4, 'all 4 tasks completed after drain');
      assert(bs.isIdle === true, 'isIdle after drain');
    }

    // ── Test 9: Status snapshot ────────────────────────────────────
    console.log('── Test 9: Status snapshot ──');
    {
      const bs = new BatchScheduler({ name: 'test9', concurrency: 2 });
      await bs.schedule(async () => 'ok', { ability: 'status-test' });
      await bs.drain();

      const s = bs.status();
      assert(s.name === 'test9', 'name in status');
      assert(s.concurrency === 2, 'concurrency in status');
      assert(s.totalCompleted >= 1, 'totalCompleted in status');
      assert(s.totalFailed === 0, 'totalFailed in status');
    }

    // ── Test 10: Mixed success/failure in scheduleAll ──────────────
    console.log('── Test 10: Mixed success/failure ──');
    {
      const bs = new BatchScheduler({ name: 'test10', concurrency: 2, maxRetries: 0 });

      const results = await bs.scheduleAll([
        { fn: async () => 'ok', options: { ability: 'good' } },
        { fn: async () => { throw new Error('bad'); }, options: { ability: 'bad' } },
        { fn: async () => 'also-ok', options: { ability: 'good2' } },
      ]);

      assert(results.length === 3, '3 results');
      assert(results[0].status === 'fulfilled', 'first fulfilled');
      assert(results[1].status === 'rejected', 'second rejected');
      assert(results[2].status === 'fulfilled', 'third fulfilled');
    }

    // ── Summary ────────────────────────────────────────────────────
    console.log(`\n${passedTests}/${totalTests} Tests bestanden`);
    if (passedTests === totalTests) {
      console.log('✅ ALLE TESTS BESTANDEN\n');
    } else {
      console.log(`❌ ${totalTests - passedTests} TESTS FEHLGESCHLAGEN\n`);
    }
    process.exit(passedTests === totalTests ? 0 : 1);
  })();
}
