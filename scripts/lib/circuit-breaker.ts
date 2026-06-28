#!/usr/bin/env node
/**
 * scripts/lib/circuit-breaker.ts — UMBAUPLAN v2.0 Phase 7: Circuit Breaker
 *
 * Schützt externe Service-Calls (MCP, WP REST, Unframer) vor
 * Kaskaden-Ausfällen durch das standard Circuit-Breaker-Pattern.
 *
 * States:
 *   CLOSED    — Normalbetrieb, Calls werden ausgefuehrt
 *   OPEN      — Circuit ist offen, Calls werden sofort abgelehnt (fast-fail)
 *   HALF_OPEN — Test-Phase, begrenzte Calls werden zugelassen
 *
 * Jeder Circuit Breaker ist nach einem Service benannt (z.B. 'mcp', 'unframer',
 * 'wp-rest') und wird ueber die CircuitBreakerRegistry verwaltet.
 *
 * Usage:
 *   import { CircuitBreaker, CircuitBreakerRegistry } from './lib/circuit-breaker.js';
 *
 *   // Direkt:
 *   const cb = new CircuitBreaker({ name: 'mcp', failureThreshold: 5 });
 *   const result = await cb.call(() => bridge.call('some-ability', {}));
 *
 *   // Registry:
 *   const registry = new CircuitBreakerRegistry();
 *   const mcpCb = registry.get('mcp', { failureThreshold: 5 });
 *   const result = await mcpCb.call(() => bridge.call('some-ability', {}));
 *
 * Konfiguration via Umgebungsvariablen:
 *   CB_MCP_FAILURE_THRESHOLD=5
 *   CB_MCP_RESET_TIMEOUT=30000
 *   CB_DEFAULT_FAILURE_THRESHOLD=3
 */

// ── Types ──────────────────────────────────────────────────────────────────

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Breaker-Name (fuer Logs und Registry) */
  name?: string;
  /** Anzahl konsekutiver Fehler bevor Circuit oeffnet (default: 5) */
  failureThreshold?: number;
  /** ms bis HALF_OPEN nach OPEN (default: 30000) */
  resetTimeout?: number;
  /** Maximale Calls in HALF_OPEN bevor Erfolgs-Entscheidung (default: 3) */
  halfOpenMaxCalls?: number;
  /** Anzahl Erfolge in HALF_OPEN um wieder zu CLOSED zu gehen (default: 2) */
  successThreshold?: number;
  /** Per-Call Timeout in ms (default: 30000) */
  timeout?: number;
}

export interface CircuitBreakerCallOptions {
  /** Timeout fuer diesen spezifischen Call */
  timeout?: number;
  /** Wenn true: Fehler die nicht retryable sind (4xx) zaehlen NICHT als Failure */
  onlyRetryableFailures?: boolean;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  failureCount: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  openedAt: number | null;
  isOpen: boolean;
}

export interface CircuitBreakerCallbacks {
  onOpen?: (name: string, failures: number) => void;
  onClose?: (name: string) => void;
  onHalfOpen?: (name: string) => void;
  onFailure?: (name: string, error: Error, consecutiveFailures: number) => void;
  onSuccess?: (name: string, durationMs: number) => void;
}

// ── Error Types ────────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  name = 'CircuitOpenError';
  circuitName: string;
  openedAt: number;
  remainingMs: number;

  constructor(name: string, openedAt: number, resetTimeout: number) {
    const remaining = Math.max(0, openedAt + resetTimeout - Date.now());
    const remainingSec = Math.ceil(remaining / 1000);
    super(
      `Circuit '${name}' is OPEN — fast-fail (retry in ~${remainingSec}s)`
    );
    this.circuitName = name;
    this.openedAt = openedAt;
    this.remainingMs = remaining;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT = 30_000;       // 30 Sekunden
const DEFAULT_HALF_OPEN_MAX_CALLS = 3;
const DEFAULT_SUCCESS_THRESHOLD = 2;
const DEFAULT_TIMEOUT = 30_000;

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 1 ? fallback : n;
}

function resolveDefaults(name: string, options: CircuitBreakerOptions): Required<CircuitBreakerOptions> {
  const prefix = name ? `CB_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_` : 'CB_';
  return {
    name: options.name ?? name,
    failureThreshold: options.failureThreshold
      ?? envInt(`${prefix}FAILURE_THRESHOLD`, DEFAULT_FAILURE_THRESHOLD),
    resetTimeout: options.resetTimeout
      ?? envInt(`${prefix}RESET_TIMEOUT`, DEFAULT_RESET_TIMEOUT),
    halfOpenMaxCalls: options.halfOpenMaxCalls
      ?? envInt(`${prefix}HALF_OPEN_MAX_CALLS`, DEFAULT_HALF_OPEN_MAX_CALLS),
    successThreshold: options.successThreshold
      ?? envInt(`${prefix}SUCCESS_THRESHOLD`, DEFAULT_SUCCESS_THRESHOLD),
    timeout: options.timeout
      ?? envInt(`${prefix}TIMEOUT`, DEFAULT_TIMEOUT),
  };
}

/** Heuristik: ist der Fehler retryable? (Netzwerk, Timeout, 5xx) */
export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  // Check for known retryable patterns
  const msg = String(e.message || '').toLowerCase();
  const name = String(e.name || '').toLowerCase();

  // Timeout / Abort
  if (name === 'timeouterror' || name === 'aborterror') return true;
  // Network errors
  if (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset')
  ) return true;
  // HTTP 5xx
  if (typeof e.status === 'number' && e.status >= 500 && e.status < 600) return true;
  // Rate limit
  if (e.status === 429) return true;
  // Generic timeout in message
  if (msg.includes('timeout') && (msg.includes('ms') || msg.includes('seconds'))) return true;

  return false;
}

// ── CircuitBreaker ─────────────────────────────────────────────────────────

export class CircuitBreaker {
  readonly name: string;
  readonly failureThreshold: number;
  readonly resetTimeout: number;
  readonly halfOpenMaxCalls: number;
  readonly successThreshold: number;
  readonly timeout: number;

  private _state: CircuitState = CircuitState.CLOSED;
  private _failureCount: number = 0;
  private _consecutiveSuccesses: number = 0;
  private _halfOpenCallCount: number = 0;
  private _lastFailureTime: number | null = null;
  private _lastSuccessTime: number | null = null;
  private _openedAt: number | null = null;

  private _totalCalls: number = 0;
  private _totalFailures: number = 0;
  private _totalSuccesses: number = 0;

  private _callbacks: CircuitBreakerCallbacks;

  constructor(options: CircuitBreakerOptions = {}, callbacks: CircuitBreakerCallbacks = {}) {
    const resolved = resolveDefaults(options.name || 'default', options);
    this.name             = resolved.name;
    this.failureThreshold = resolved.failureThreshold;
    this.resetTimeout     = resolved.resetTimeout;
    this.halfOpenMaxCalls = resolved.halfOpenMaxCalls;
    this.successThreshold = resolved.successThreshold;
    this.timeout          = resolved.timeout;
    this._callbacks       = callbacks;
  }

  // ── Public Properties ──────────────────────────────────────────────────

  get state(): CircuitState {
    this._transitionIfNeeded();
    return this._state;
  }

  get failureCount(): number { return this._failureCount; }
  get consecutiveSuccesses(): number { return this._consecutiveSuccesses; }
  get isOpen(): boolean { return this.state === CircuitState.OPEN; }
  get isClosed(): boolean { return this.state === CircuitState.CLOSED; }
  get isHalfOpen(): boolean { return this.state === CircuitState.HALF_OPEN; }
  get lastFailureTime(): number | null { return this._lastFailureTime; }
  get lastSuccessTime(): number | null { return this._lastSuccessTime; }
  get openedAt(): number | null { return this._openedAt; }

  // ── State Management ───────────────────────────────────────────────────

  /** Prueft ob ein Zustandsuebergang faellig ist (OPEN → HALF_OPEN). */
  private _transitionIfNeeded(): void {
    if (
      this._state === CircuitState.OPEN &&
      this._openedAt !== null &&
      Date.now() - this._openedAt >= this.resetTimeout
    ) {
      this._state = CircuitState.HALF_OPEN;
      this._halfOpenCallCount = 0;
      this._consecutiveSuccesses = 0;
      this._log(`OPEN → HALF_OPEN (Reset-Timeout von ${this.resetTimeout}ms erreicht)`);
      this._callbacks.onHalfOpen?.(this.name);
    }
  }

  /** Oeffnet den Circuit sofort. */
  private _open(): void {
    // Use string comparison to avoid TS narrowing issues
    // (callers may have already narrowed _state to CLOSED|HALF_OPEN)
    if ((this._state as string) === 'OPEN') return;
    const prevState = this._state;
    this._state = CircuitState.OPEN;
    this._openedAt = Date.now();
    this._halfOpenCallCount = 0;
    this._consecutiveSuccesses = 0;
    if (prevState !== CircuitState.OPEN) {
      process.stderr.write(
        `[circuit-breaker] ${this.name}: ${prevState} → OPEN ` +
        `(${this._failureCount} consecutive failures, ` +
        `reset in ${this.resetTimeout / 1000}s)\n`
      );
    }
    this._callbacks.onOpen?.(this.name, this._failureCount);
  }

  /** Schliesst den Circuit (Erfolg in HALF_OPEN). */
  private _close(): void {
    if (this._state === CircuitState.CLOSED) return;
    const prevState = this._state;
    this._state = CircuitState.CLOSED;
    this._failureCount = 0;
    this._consecutiveSuccesses = 0;
    this._halfOpenCallCount = 0;
    this._openedAt = null;
    process.stderr.write(
      `[circuit-breaker] ${this.name}: ${prevState} → CLOSED (erholt)\n`
    );
    this._callbacks.onClose?.(this.name);
  }

  // ── Core API ───────────────────────────────────────────────────────────

  /**
   * Fuehrt eine async-Funktion MIT Circuit-Breaker-Schutz aus.
   *
   * @param fn  Async-Funktion die den Service-Call ausfuehrt
   * @param options  Per-Call Optionen
   * @returns  Ergebnis der fn()
   * @throws  CircuitOpenError wenn Circuit OPEN ist
   * @throws  Den Original-Fehler wenn der Call fehlschlaegt
   */
  async call<T>(
    fn: () => Promise<T>,
    options: CircuitBreakerCallOptions = {},
  ): Promise<T> {
    this._transitionIfNeeded();

    // Fast-fail wenn OPEN
    if (this._state === CircuitState.OPEN) {
      this._totalCalls++;
      throw new CircuitOpenError(this.name, this._openedAt!, this.resetTimeout);
    }

    // HALF_OPEN: nur begrenzte Anzahl Calls zulassen
    if (this._state === CircuitState.HALF_OPEN) {
      if (this._halfOpenCallCount >= this.halfOpenMaxCalls) {
        this._totalCalls++;
        throw new CircuitOpenError(
          this.name,
          this._openedAt!,
          this.resetTimeout
        );
      }
      this._halfOpenCallCount++;
    }

    this._totalCalls++;

    const timeout = options.timeout ?? this.timeout;
    const startTime = Date.now();

    try {
      // Optionaler Timeout via Promise.race
      const result = timeout > 0
        ? await Promise.race([
            fn(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout after ${timeout}ms`)),
                timeout
              )
            ),
          ])
        : await fn();

      const durationMs = Date.now() - startTime;
      this._recordSuccess(durationMs);
      return result;

    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;

      // Pruefe ob der Fehler als Failure zaehlt
      const isRetryable = isRetryableError(err);
      const shouldCount = options.onlyRetryableFailures ? isRetryable : true;

      if (shouldCount) {
        this._recordFailure(err as Error);
      }

      this._callbacks.onFailure?.(
        this.name,
        err as Error,
        this._failureCount
      );

      throw err;
    }
  }

  /**
   * Manuell einen Erfolg aufzeichnen (fuer Callbacks/externe Nutzung).
   * Ueblicherweise brauchst du `call()`, das dies automatisch macht.
   */
  recordSuccess(durationMs = 0): void {
    this._recordSuccess(durationMs);
  }

  /**
   * Manuell einen Fehler aufzeichnen.
   */
  recordFailure(err: Error = new Error('manual failure')): void {
    this._recordFailure(err);
    this._callbacks.onFailure?.(this.name, err, this._failureCount);
  }

  /**
   * Force-Reset: Setzt Circuit auf CLOSED und loescht alle Zaehler.
   */
  reset(): void {
    const prevState = this._state;
    this._state = CircuitState.CLOSED;
    this._failureCount = 0;
    this._consecutiveSuccesses = 0;
    this._halfOpenCallCount = 0;
    this._openedAt = null;
    if (prevState !== CircuitState.CLOSED) {
      process.stderr.write(
        `[circuit-breaker] ${this.name}: ${prevState} → CLOSED (manual reset)\n`
      );
    }
  }

  /** Status-Snapshot fuer Monitoring. */
  status(): CircuitBreakerStatus {
    this._transitionIfNeeded();
    return {
      name: this.name,
      state: this._state,
      failureCount: this._failureCount,
      consecutiveSuccesses: this._consecutiveSuccesses,
      totalCalls: this._totalCalls,
      totalFailures: this._totalFailures,
      totalSuccesses: this._totalSuccesses,
      lastFailureTime: this._lastFailureTime,
      lastSuccessTime: this._lastSuccessTime,
      openedAt: this._openedAt,
      isOpen: this._state === CircuitState.OPEN,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private _recordSuccess(durationMs: number): void {
    this._totalSuccesses++;
    this._lastSuccessTime = Date.now();

    if (this._state === CircuitState.HALF_OPEN) {
      this._consecutiveSuccesses++;
      this._log(
        `HALF_OPEN success ${this._consecutiveSuccesses}/${this.successThreshold} ` +
        `(${durationMs}ms)`
      );
      if (this._consecutiveSuccesses >= this.successThreshold) {
        this._close();
      }
    } else if (this._state === CircuitState.CLOSED) {
      // Ein Erfolg reset den Failure-Zaehler in CLOSED
      if (this._failureCount > 0) {
        this._failureCount = 0;
        this._log(`failure count reset nach Erfolg (${durationMs}ms)`);
      }
    }
  }

  private _recordFailure(err: Error): void {
    this._totalFailures++;
    this._failureCount++;
    this._lastFailureTime = Date.now();
    // _open() and _close() already reset _consecutiveSuccesses

    const msg = String(err.message || err).slice(0, 120);
    this._log(
      `FAILURE ${this._failureCount}/${this.failureThreshold}: ${msg}`
    );

    if (this._state === CircuitState.HALF_OPEN) {
      // Ein Fehler in HALF_OPEN → sofort wieder OPEN
      this._open();
    } else if (
      this._state === CircuitState.CLOSED &&
      this._failureCount >= this.failureThreshold
    ) {
      this._open();
    }
    // OPEN: Fehler werden trotzdem gezaehlt (auch wenn keine Calls durchgehen)
    // Das passiert wenn z.B. recordFailure() manuell aufgerufen wird
  }

  private _log(message: string): void {
    if (
      process.env.CB_VERBOSE === '1' ||
      process.env.MCP_VERBOSE === '1'
    ) {
      process.stderr.write(`[circuit-breaker] ${this.name}: ${message}\n`);
    }
  }
}

export default CircuitBreaker;

// ── CircuitBreakerRegistry ─────────────────────────────────────────────────

export class CircuitBreakerRegistry {
  private _breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Holt oder erstellt einen Circuit Breaker per Name.
   *
   * @param name    Eindeutiger Name (z.B. 'mcp', 'unframer', 'wp-rest')
   * @param options Konfiguration (nur beim ersten Mal)
   * @param callbacks Event-Callbacks
   */
  get(
    name: string,
    options: CircuitBreakerOptions = {},
    callbacks: CircuitBreakerCallbacks = {},
  ): CircuitBreaker {
    if (this._breakers.has(name)) {
      return this._breakers.get(name)!;
    }
    const cb = new CircuitBreaker({ ...options, name }, callbacks);
    this._breakers.set(name, cb);
    return cb;
  }

  /**
   * Entfernt einen Circuit Breaker aus der Registry.
   */
  remove(name: string): boolean {
    return this._breakers.delete(name);
  }

  /**
   * Setzt alle registrierten Breaker zurueck.
   */
  resetAll(): void {
    for (const cb of this._breakers.values()) {
      cb.reset();
    }
  }

  /**
   * Setzt einen einzelnen Breaker zurueck.
   */
  reset(name: string): boolean {
    const cb = this._breakers.get(name);
    if (!cb) return false;
    cb.reset();
    return true;
  }

  /**
   * Gibt alle registrierten Breaker zurueck.
   */
  getAll(): CircuitBreaker[] {
    return [...this._breakers.values()];
  }

  /**
   * Status-Snapshot aller Breaker (fuer Monitoring/Dashboards).
   */
  status(): CircuitBreakerStatus[] {
    return this.getAll().map(cb => cb.status());
  }

  /**
   * Gibt die Namen aller registrierten Breaker zurueck.
   */
  names(): string[] {
    return [...this._breakers.keys()];
  }

  /**
   * Prueft ob ein Circuit OPEN ist (fast-fail Check vor Batch-Operationen).
   */
  isOpen(name: string): boolean {
    const cb = this._breakers.get(name);
    return cb ? cb.isOpen : false;
  }

  /**
   * Anzahl registrierter Breaker.
   */
  get size(): number {
    return this._breakers.size;
  }
}

// ── Self-Test ─────────────────────────────────────────────────────────────
// node --import tsx scripts/lib/circuit-breaker.ts --self-test

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
║     framer-v4-pipeline-v2 — Circuit Breaker v1.0.0          ║
║     UMBAUPLAN Phase 7: Cascading Failure Protection        ║
╚══════════════════════════════════════════════════════════════╝
`);

    // ── Test 1: CLOSED → normal operation ───────────────────────
    console.log('── Test 1: CLOSED state (normal operation) ──');
    {
      const cb = new CircuitBreaker({ name: 'test1', failureThreshold: 3 });
      assert(cb.state === CircuitState.CLOSED, 'Initial state is CLOSED');
      assert(cb.isClosed === true, 'isClosed is true');
      assert(cb.isOpen === false, 'isOpen is false');
      assert(cb.failureCount === 0, 'failureCount is 0');

      const result = await cb.call(async () => 'success');
      assert(result === 'success', 'call() returns fn result');
      assert(cb.failureCount === 0, 'failureCount stays 0 after success');
      assert(cb.status().totalCalls === 1, 'totalCalls increments');
      assert(cb.status().totalSuccesses === 1, 'totalSuccesses increments');
    }

    // ── Test 2: CLOSED → OPEN after failures ─────────────────────
    console.log('── Test 2: CLOSED → OPEN after threshold ──');
    {
      const cb = new CircuitBreaker({ name: 'test2', failureThreshold: 2 });
      let failures = 0;
      const badFn = async () => { failures++; throw new Error('fail'); };

      try { await cb.call(badFn); } catch { /* expected */ }
      assert(cb.state === CircuitState.CLOSED, 'Still CLOSED after 1 failure');
      assert(cb.failureCount === 1, 'failureCount = 1');

      try { await cb.call(badFn); } catch { /* expected */ }
      assert(cb.state === CircuitState.OPEN, 'OPEN after 2nd failure (threshold=2)');
      assert(cb.isOpen === true, 'isOpen is true');
    }

    // ── Test 3: OPEN → fast-fail ─────────────────────────────────
    console.log('── Test 3: OPEN → fast-fail with CircuitOpenError ──');
    {
      const cb = new CircuitBreaker({
        name: 'test3',
        failureThreshold: 1,
        resetTimeout: 60_000,
      });

      try { await cb.call(async () => { throw new Error('fail'); }); } catch { /* */ }
      assert(cb.state === CircuitState.OPEN, 'OPEN after 1 failure');

      try {
        await cb.call(async () => 'should not run');
        assert(false, 'Should have thrown CircuitOpenError');
      } catch (err: unknown) {
        assert(err instanceof CircuitOpenError, 'Throws CircuitOpenError');
        const ce = err as CircuitOpenError;
        assert(ce.name === 'CircuitOpenError', 'Error name is CircuitOpenError');
        assert(ce.circuitName === 'test3', 'Error contains circuit name');
      }
    }

    // ── Test 4: OPEN → HALF_OPEN after timeout ───────────────────
    console.log('── Test 4: OPEN → HALF_OPEN after resetTimeout ──');
    {
      const cb = new CircuitBreaker({
        name: 'test4',
        failureThreshold: 1,
        resetTimeout: 1, // 1ms!
      });

      try { await cb.call(async () => { throw new Error('fail'); }); } catch { /* */ }
      assert(cb.state === CircuitState.OPEN, 'OPEN after failure');

      // Wait for resetTimeout (50ms safety margin for CI)
      await new Promise(r => setTimeout(r, 50));
      assert(cb.state === CircuitState.HALF_OPEN, 'HALF_OPEN after timeout');
      assert(cb.isHalfOpen === true, 'isHalfOpen is true');
    }

    // ── Test 5: HALF_OPEN → CLOSED on success ────────────────────
    console.log('── Test 5: HALF_OPEN → CLOSED on success ──');
    {
      const cb = new CircuitBreaker({
        name: 'test5',
        failureThreshold: 1,
        resetTimeout: 1,
        successThreshold: 1,
      });

      try { await cb.call(async () => { throw new Error('fail'); }); } catch { /* */ }
      await new Promise(r => setTimeout(r, 50));
      assert(cb.state === CircuitState.HALF_OPEN, 'HALF_OPEN');

      const result = await cb.call(async () => 'recovered');
      assert(result === 'recovered', 'call succeeds');
      assert(cb.state === CircuitState.CLOSED, 'CLOSED after success in HALF_OPEN');
      assert(cb.failureCount === 0, 'failureCount reset to 0');
    }

    // ── Test 6: HALF_OPEN → OPEN on failure ──────────────────────
    console.log('── Test 6: HALF_OPEN → OPEN on failure ──');
    {
      const cb = new CircuitBreaker({
        name: 'test6',
        failureThreshold: 1,
        resetTimeout: 1,
      });

      try { await cb.call(async () => { throw new Error('fail1'); }); } catch { /* */ }
      await new Promise(r => setTimeout(r, 50));
      assert(cb.state === CircuitState.HALF_OPEN, 'HALF_OPEN');

      try { await cb.call(async () => { throw new Error('fail2'); }); } catch { /* */ }
      assert(cb.state === CircuitState.OPEN, 'Back to OPEN after HALF_OPEN failure');
    }

    // ── Test 7: onlyRetryableFailures ─────────────────────────────
    console.log('── Test 7: onlyRetryableFailures option ──');
    {
      const cb = new CircuitBreaker({ name: 'test7', failureThreshold: 2 });

      // Non-retryable error (404)
      try {
        await cb.call(
          async () => { throw Object.assign(new Error('Not Found'), { status: 404 }); },
          { onlyRetryableFailures: true },
        );
      } catch { /* expected */ }
      assert(cb.failureCount === 0, 'Non-retryable error (404) NOT counted');

      // Retryable error (500)
      try {
        await cb.call(
          async () => { throw Object.assign(new Error('Server Error'), { status: 500 }); },
          { onlyRetryableFailures: true },
        );
      } catch { /* expected */ }
      assert(cb.failureCount === 1, 'Retryable error (500) IS counted');
    }

    // ── Test 8: reset() ───────────────────────────────────────────
    console.log('── Test 8: reset() ──');
    {
      const cb = new CircuitBreaker({
        name: 'test8',
        failureThreshold: 1,
        resetTimeout: 60_000,
      });

      try { await cb.call(async () => { throw new Error('fail'); }); } catch { /* */ }
      assert(cb.state === CircuitState.OPEN, 'OPEN');
      cb.reset();
      assert(cb.state === CircuitState.CLOSED, 'CLOSED after reset()');
      assert(cb.failureCount === 0, 'failureCount reset');
    }

    // ── Test 9: Registry ──────────────────────────────────────────
    console.log('── Test 9: CircuitBreakerRegistry ──');
    {
      const registry = new CircuitBreakerRegistry();

      const a = registry.get('mcp', { failureThreshold: 3 });
      const b = registry.get('mcp', { failureThreshold: 99 });
      assert(a === b, 'Second get() returns same instance');
      assert(registry.size === 1, 'Only one breaker registered');
      assert(registry.names().includes('mcp'), 'Names list contains mcp');

      const c = registry.get('unframer', { failureThreshold: 2 });
      assert(registry.size === 2, 'Two breakers registered');
      assert(c !== a, 'Different name = different instance');

      const status = registry.status();
      assert(status.length === 2, 'status() returns 2 entries');
      assert(status[0].name === 'mcp' || status[1].name === 'mcp', 'status includes mcp');
      assert(status[0].name === 'unframer' || status[1].name === 'unframer', 'status includes unframer');

      registry.remove('mcp');
      assert(registry.size === 1, 'remove() works');
      assert(!registry.names().includes('mcp'), 'mcp removed from names');

      // get() after remove creates new instance
      const d = registry.get('mcp');
      assert(d !== a, 'New instance after remove+get');
    }

    // ── Test 10: isRetryableError ─────────────────────────────────
    console.log('── Test 10: isRetryableError heuristic ──');
    {
      assert(isRetryableError({ name: 'TimeoutError', message: 'timeout' }) === true, 'TimeoutError');
      assert(isRetryableError({ name: 'AbortError', message: 'aborted' }) === true, 'AbortError');
      assert(isRetryableError({ message: 'fetch failed' }) === true, 'fetch failed');
      assert(isRetryableError({ message: 'ECONNREFUSED' }) === true, 'ECONNREFUSED');
      assert(isRetryableError({ status: 500, message: 'server error' }) === true, 'HTTP 500');
      assert(isRetryableError({ status: 503, message: 'unavailable' }) === true, 'HTTP 503');
      assert(isRetryableError({ status: 429, message: 'rate limit' }) === true, 'HTTP 429');

      assert(isRetryableError({ status: 404, message: 'not found' }) === false, 'HTTP 404 is NOT retryable');
      assert(isRetryableError({ status: 401, message: 'unauthorized' }) === false, 'HTTP 401 is NOT retryable');
      assert(isRetryableError(new SyntaxError('invalid json')) === false, 'SyntaxError is NOT retryable');
    }

    // ── Test 11: Status snapshot ──────────────────────────────────
    console.log('── Test 11: Status snapshot ──');
    {
      const cb = new CircuitBreaker({ name: 'test11' });
      await cb.call(async () => 'ok');
      const s = cb.status();
      assert(s.name === 'test11', 'name in status');
      assert(s.state === CircuitState.CLOSED, 'state in status');
      assert(s.totalCalls === 1, 'totalCalls in status');
      assert(s.totalSuccesses === 1, 'totalSuccesses in status');
      assert(s.totalFailures === 0, 'totalFailures in status');
      assert(s.isOpen === false, 'isOpen in status');
      assert(typeof s.lastSuccessTime === 'number', 'lastSuccessTime is number');
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
