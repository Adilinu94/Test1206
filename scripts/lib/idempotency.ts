#!/usr/bin/env node
/**
 * scripts/lib/idempotency.ts — UMBAUPLAN v2.0 Phase 7b: Idempotenz
 *
 * Dedupliziert parallele MCP-Calls per Promise-Dedup:
 * Wenn der gleiche Call (ability + params) bereits in-flight ist,
 * wird das existierende Promise zurueckgegeben statt eines neuen Calls.
 *
 * Zusaetzlich: TTL-basierter Result-Cache fuer kurz aufeinanderfolgende
 * identische Calls (default 2s TTL).
 *
 * Usage:
 *   import { Idempotency, IdempotencyRegistry } from './lib/idempotency.js';
 *
 *   // Direkt:
 *   const idem = new Idempotency({ name: 'mcp' });
 *   const result = await idem.call(
 *     () => bridge.call('some-ability', {}),
 *     'some-ability',
 *     {}
 *   );
 *
 *   // Registry:
 *   const registry = new IdempotencyRegistry();
 *   const mcpIdem = registry.get('mcp');
 *   const result = await mcpIdem.call(
 *     () => bridge.call('some-ability', {}),
 *     'some-ability',
 *     {}
 *   );
 *
 * Konfiguration via Umgebungsvariablen:
 *   IDEM_TTL=2000           (Result-Cache TTL in ms, default: 2000)
 *   IDEM_MCP_TTL=5000       (Per-Instance override)
 *   IDEM_VERBOSE=1
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface IdempotencyOptions {
  /** Name (fuer Logs und Registry) */
  name?: string;
  /** Result-Cache TTL in ms (default: 2000) */
  ttl?: number;
  /** Maximale Anzahl gecachter Eintraege (default: 500) */
  maxEntries?: number;
}

export interface IdempotencyStatus {
  name: string;
  totalCalls: number;
  deduplicated: number;
  cacheHits: number;
  cacheSize: number;
  inFlight: number;
  totalCacheSize: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_TTL = 2_000;          // 2 Sekunden Result-Cache
const DEFAULT_MAX_ENTRIES = 500;

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 1 ? fallback : n;
}

function resolveDefaults(name: string, options: IdempotencyOptions): Required<IdempotencyOptions> {
  const prefix = name ? `IDEM_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_` : 'IDEM_';
  return {
    name: options.name ?? name,
    ttl: options.ttl ?? envInt(`${prefix}TTL`, envInt('IDEM_TTL', DEFAULT_TTL)),
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
  };
}

/** Erzeugt einen deterministischen Key aus ability + params. */
export function dedupKey(ability: string, params: Record<string, unknown> = {}): string {
  // Sortiere Keys fuer deterministischen Output
  const sorted = Object.keys(params).sort().reduce((acc, k) => {
    acc[k] = params[k];
    return acc;
  }, {} as Record<string, unknown>);
  return `${ability}:${JSON.stringify(sorted)}`;
}

// ── Idempotency ────────────────────────────────────────────────────────────

export class Idempotency {
  readonly name: string;
  readonly ttl: number;
  readonly maxEntries: number;

  private _inFlight: Map<string, Promise<unknown>> = new Map();
  private _resultCache: Map<string, { data: unknown; expires: number }> = new Map();

  private _totalCalls: number = 0;
  private _deduplicated: number = 0;
  private _cacheHits: number = 0;

  constructor(options: IdempotencyOptions = {}) {
    const resolved = resolveDefaults(options.name || 'default', options);
    this.name       = resolved.name;
    this.ttl        = resolved.ttl;
    this.maxEntries = resolved.maxEntries;
  }

  // ── Public Properties ──────────────────────────────────────────────────

  get inFlight(): number { return this._inFlight.size; }
  get cacheSize(): number { return this._resultCache.size; }
  get totalCalls(): number { return this._totalCalls; }
  get deduplicated(): number { return this._deduplicated; }
  get cacheHits(): number { return this._cacheHits; }
  get totalCacheSize(): number { return this._resultCache.size; }

  // ── Core API ───────────────────────────────────────────────────────────

  /**
   * Fuehrt eine async-Funktion MIT Dedup-Schutz aus.
   *
   * @param fn       Async-Funktion die den Service-Call ausfuehrt
   * @param ability  Ability-Name (fuer Key-Generierung)
   * @param params   Parameter (fuer Key-Generierung)
   * @returns        Ergebnis der fn()
   */
  async call<T>(
    fn: () => Promise<T>,
    ability: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const key = dedupKey(ability, params);

    // 1. Result-Cache Check (kurzlebiger Cache gegen Rapid-Re-Calls)
    const cached = this._resultCache.get(key);
    if (cached && Date.now() < cached.expires) {
      this._cacheHits++;
      this._log(`cache-HIT: ${ability}`);
      return cached.data as T;
    }

    // 2. In-Flight Dedup: gleicher Call bereits unterwegs?
    const existing = this._inFlight.get(key);
    if (existing) {
      this._deduplicated++;
      this._log(`DEDUP: ${ability} (in-flight Promise reused)`);
      return existing as Promise<T>;
    }

    // 3. Neuer Call
    this._totalCalls++;

    const promise = (async (): Promise<T> => {
      try {
        const result = await fn();

        // Ergebnis cachen
        this._evictIfNeeded();
        this._resultCache.set(key, {
          data: result,
          expires: Date.now() + this.ttl,
        });

        return result;
      } finally {
        // In-flight Eintrag entfernen (ob Erfolg oder Fehler)
        this._inFlight.delete(key);
      }
    })();

    this._inFlight.set(key, promise);
    return promise;
  }

  /**
   * Fuehrt mehrere Calls mit Dedup-Schutz aus.
   * Nuetzlich fuer callParallel()-Patterns wo gleiche Abilities
   * mehrfach in der Batch-Liste vorkommen.
   */
  async callAll<T>(
    calls: Array<{
      fn: () => Promise<T>;
      ability: string;
      params?: Record<string, unknown>;
    }>,
  ): Promise<T[]> {
    return Promise.all(
      calls.map(c => this.call(c.fn, c.ability, c.params || {}))
    );
  }

  /**
   * Entfernt abgelaufene Cache-Eintraege.
   */
  purgeExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of this._resultCache) {
      if (now >= entry.expires) {
        this._resultCache.delete(key);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Kompletter Reset: leert In-Flight und Result-Cache.
   */
  reset(): void {
    const inFlightCount = this._inFlight.size;
    const cacheCount = this._resultCache.size;
    this._inFlight.clear();
    this._resultCache.clear();
    this._totalCalls = 0;
    this._deduplicated = 0;
    this._cacheHits = 0;
    this._log(`reset: ${inFlightCount} in-flight, ${cacheCount} cache geleert`);
  }

  /**
   * Status-Snapshot fuer Monitoring.
   */
  status(): IdempotencyStatus {
    return {
      name: this.name,
      totalCalls: this._totalCalls,
      deduplicated: this._deduplicated,
      cacheHits: this._cacheHits,
      cacheSize: this._resultCache.size,
      inFlight: this._inFlight.size,
      totalCacheSize: this._resultCache.size,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private _evictIfNeeded(): void {
    if (this._resultCache.size < this.maxEntries) return;

    // FIFO-Eviction: aeltesten Eintrag entfernen
    const oldest = this._resultCache.keys().next().value;
    if (oldest) {
      this._resultCache.delete(oldest);
    }
  }

  private _log(message: string): void {
    if (
      process.env.IDEM_VERBOSE === '1' ||
      process.env.MCP_VERBOSE === '1'
    ) {
      process.stderr.write(`[idempotency] ${this.name}: ${message}\n`);
    }
  }
}

export default Idempotency;

// ── IdempotencyRegistry ───────────────────────────────────────────────────

export class IdempotencyRegistry {
  private _instances: Map<string, Idempotency> = new Map();

  /**
   * Holt oder erstellt eine Idempotency-Instanz per Name.
   */
  get(
    name: string,
    options: IdempotencyOptions = {},
  ): Idempotency {
    if (this._instances.has(name)) {
      return this._instances.get(name)!;
    }
    const idem = new Idempotency({ ...options, name });
    this._instances.set(name, idem);
    return idem;
  }

  /**
   * Entfernt eine Instanz aus der Registry.
   */
  remove(name: string): boolean {
    return this._instances.delete(name);
  }

  /**
   * Setzt alle registrierten Instanzen zurueck.
   */
  resetAll(): void {
    for (const idem of this._instances.values()) {
      idem.reset();
    }
  }

  /**
   * Gibt alle registrierten Instanzen zurueck.
   */
  getAll(): Idempotency[] {
    return [...this._instances.values()];
  }

  /**
   * Status-Snapshot aller Instanzen.
   */
  status(): IdempotencyStatus[] {
    return this.getAll().map(i => i.status());
  }

  /**
   * Gibt die Namen aller registrierten Instanzen zurueck.
   */
  names(): string[] {
    return [...this._instances.keys()];
  }

  /** Anzahl registrierter Instanzen. */
  get size(): number {
    return this._instances.size;
  }
}

// ── Self-Test ─────────────────────────────────────────────────────────────
// node --import tsx scripts/lib/idempotency.ts --self-test

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
║     framer-v4-pipeline-v2 — Idempotency v1.0.0             ║
║     UMBAUPLAN Phase 7b: Call Deduplication                 ║
╚══════════════════════════════════════════════════════════════╝
`);

    // ── Test 1: Normal call without dedup ─────────────────────────
    console.log('── Test 1: Normal call (no dedup) ──');
    {
      const idem = new Idempotency({ name: 'test1' });
      let callCount = 0;
      const result = await idem.call(
        async () => { callCount++; return 'hello'; },
        'test-ability',
        { x: 1 },
      );
      assert(result === 'hello', 'call() returns fn result');
      assert(callCount === 1, 'fn executed exactly once');
      assert(idem.totalCalls === 1, 'totalCalls = 1');
      assert(idem.deduplicated === 0, 'no dedup needed');
    }

    // ── Test 2: Dedup in-flight call ──────────────────────────────
    console.log('── Test 2: Dedup concurrent in-flight call ──');
    {
      const idem = new Idempotency({ name: 'test2' });
      let callCount = 0;

      // Slow fn that takes 50ms
      const slowFn = async () => {
        callCount++;
        await new Promise(r => setTimeout(r, 50));
        return 'slow-result';
      };

      const [r1, r2, r3] = await Promise.all([
        idem.call(slowFn, 'slow-ability', { id: 1 }),
        idem.call(slowFn, 'slow-ability', { id: 1 }),
        idem.call(slowFn, 'slow-ability', { id: 1 }),
      ]);

      assert(r1 === 'slow-result', 'result 1 correct');
      assert(r2 === 'slow-result', 'result 2 correct');
      assert(r3 === 'slow-result', 'result 3 correct');
      assert(callCount === 1, 'fn only executed ONCE (2 deduplicated)');
      assert(idem.totalCalls === 1, 'totalCalls = 1');
      assert(idem.deduplicated === 2, 'deduplicated = 2');
    }

    // ── Test 3: Different params = different keys ─────────────────
    console.log('── Test 3: Different params = different calls ──');
    {
      const idem = new Idempotency({ name: 'test3' });
      let callCount = 0;
      const fn = async (v: number) => { callCount++; return v; };

      const [r1, r2] = await Promise.all([
        idem.call(() => fn(1), 'math', { x: 1 }),
        idem.call(() => fn(2), 'math', { x: 2 }),
      ]);

      assert(r1 === 1, 'result 1 correct');
      assert(r2 === 2, 'result 2 correct');
      assert(callCount === 2, 'both fns executed (different keys)');
      assert(idem.totalCalls === 2, 'totalCalls = 2');
      assert(idem.deduplicated === 0, 'no dedup across different keys');
    }

    // ── Test 4: Different ability = different keys ────────────────
    console.log('── Test 4: Different ability = different calls ──');
    {
      const idem = new Idempotency({ name: 'test4' });
      let callCount = 0;
      const fn = async () => { callCount++; return 'ok'; };

      const [r1, r2] = await Promise.all([
        idem.call(fn, 'ability-a', {}),
        idem.call(fn, 'ability-b', {}),
      ]);

      assert(r1 === 'ok' && r2 === 'ok', 'both results ok');
      assert(callCount === 2, 'both fns executed (different abilities)');
    }

    // ── Test 5: Result Cache (TTL) ────────────────────────────────
    console.log('── Test 5: Result Cache (TTL-based) ──');
    {
      const idem = new Idempotency({ name: 'test5', ttl: 100 });
      let callCount = 0;
      const fn = async () => { callCount++; return 'cached'; };

      // First call
      const r1 = await idem.call(fn, 'cache-test', {});
      assert(r1 === 'cached', 'first call returns result');
      assert(callCount === 1, 'fn executed once');
      assert(idem.cacheHits === 0, 'no cache hit yet');

      // Second call within TTL → cache hit
      const r2 = await idem.call(fn, 'cache-test', {});
      assert(r2 === 'cached', 'second call returns cached result');
      assert(callCount === 1, 'fn NOT re-executed (cache hit)');
      assert(idem.cacheHits === 1, 'cacheHits = 1');

      // Wait for TTL to expire
      await new Promise(r => setTimeout(r, 150));

      // Third call after TTL → fresh call
      const r3 = await idem.call(fn, 'cache-test', {});
      assert(r3 === 'cached', 'third call returns result');
      assert(callCount === 2, 'fn re-executed after TTL expiry');
      assert(idem.cacheHits === 1, 'cacheHits still = 1');
    }

    // ── Test 6: Error handling (errors NOT cached) ─────────────────
    console.log('── Test 6: Errors are NOT cached ──');
    {
      const idem = new Idempotency({ name: 'test6', ttl: 5000 });
      let callCount = 0;

      const failFn = async () => { callCount++; throw new Error('fail'); };

      try { await idem.call(failFn, 'failing', {}); } catch { /* expected */ }
      assert(callCount === 1, 'first call executed');
      assert(idem.inFlight === 0, 'in-flight cleared after error');

      // Should execute again (error not cached)
      try { await idem.call(failFn, 'failing', {}); } catch { /* expected */ }
      assert(callCount === 2, 'second call also executed (error not cached)');
    }

    // ── Test 7: dedupKey determinism ──────────────────────────────
    console.log('── Test 7: dedupKey determinism ──');
    {
      const k1 = dedupKey('ability', { b: 2, a: 1 });
      const k2 = dedupKey('ability', { a: 1, b: 2 });
      assert(k1 === k2, 'Key order-independent (sorted keys)');

      const k3 = dedupKey('ability-a', {});
      const k4 = dedupKey('ability-b', {});
      assert(k3 !== k4, 'Different abilities = different keys');
    }

    // ── Test 8: callAll ────────────────────────────────────────────
    console.log('── Test 8: callAll batch dedup ──');
    {
      const idem = new Idempotency({ name: 'test8' });
      let callCount = 0;
      const fn = async () => { callCount++; return 'batch'; };

      const results = await idem.callAll([
        { fn, ability: 'dup-me', params: { id: 1 } },
        { fn, ability: 'dup-me', params: { id: 1 } },
        { fn, ability: 'other', params: {} },
      ]);

      assert(results.length === 3, '3 results returned');
      assert(results.every(r => r === 'batch'), 'all results correct');
      assert(callCount === 2, 'only 2 executions (1 deduplicated)');
      assert(idem.deduplicated === 1, 'deduplicated = 1');
    }

    // ── Test 9: purgeExpired ───────────────────────────────────────
    console.log('── Test 9: purgeExpired ──');
    {
      const idem = new Idempotency({ name: 'test9', ttl: 10 });
      let callCount = 0;
      const fn = async () => { callCount++; return 'purge-test'; };

      await idem.call(fn, 'purge', {});
      assert(idem.cacheSize === 1, '1 entry in cache');

      await new Promise(r => setTimeout(r, 20));
      const purged = idem.purgeExpired();
      assert(purged === 1, '1 entry purged');
      assert(idem.cacheSize === 0, 'cache empty after purge');
    }

    // ── Test 10: Registry ──────────────────────────────────────────
    console.log('── Test 10: IdempotencyRegistry ──');
    {
      const registry = new IdempotencyRegistry();

      const a = registry.get('mcp', { ttl: 100 });
      const b = registry.get('mcp', { ttl: 999 });
      assert(a === b, 'Second get() returns same instance');
      assert(registry.size === 1, 'Only one instance registered');
      assert(registry.names().includes('mcp'), 'Names list contains mcp');

      const c = registry.get('unframer');
      assert(registry.size === 2, 'Two instances registered');
      assert(c !== a, 'Different name = different instance');

      const status = registry.status();
      assert(status.length === 2, 'status() returns 2 entries');

      registry.remove('mcp');
      assert(registry.size === 1, 'remove() works');

      const d = registry.get('mcp');
      assert(d !== a, 'New instance after remove+get');
    }

    // ── Test 11: reset() ───────────────────────────────────────────
    console.log('── Test 11: reset() ──');
    {
      const idem = new Idempotency({ name: 'test11', ttl: 5000 });
      let callCount = 0;
      const fn = async () => { callCount++; return 'reset-test'; };

      await idem.call(fn, 'r-ability', {});
      assert(idem.cacheSize === 1, 'cache has 1 entry');
      assert(idem.totalCalls === 1, 'totalCalls = 1');

      idem.reset();
      assert(idem.cacheSize === 0, 'cache empty after reset');
      assert(idem.inFlight === 0, 'no in-flight after reset');
      assert(idem.totalCalls === 0, 'totalCalls reset');
      assert(idem.deduplicated === 0, 'deduplicated reset');
    }

    // ── Test 12: Cache eviction under maxEntries ───────────────────
    console.log('── Test 12: Cache eviction (maxEntries) ──');
    {
      const idem = new Idempotency({ name: 'test12', ttl: 5000, maxEntries: 3 });
      let callCount = 0;
      const fn = async (n: number) => { callCount++; return n; };

      for (let i = 0; i < 5; i++) {
        await idem.call(() => fn(i), `evict-${i}`, {});
      }

      // FIFO eviction: max 3 entries
      const size = idem.cacheSize;
      assert(size <= 3, `cache size ≤ maxEntries (actual: ${size})`);
      assert(callCount === 5, 'all 5 fns executed');
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
