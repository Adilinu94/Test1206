/**
 * scripts/lib/mcp-client.ts — Phase 1.2 Retry-Logik
 *
 * Resilient HTTP client for Novamira MCP API calls with exponential
 * backoff, jitter, and structured logging.
 *
 * Architecture note (v3.0.0):
 *   In the current arch, MCP calls go through the Claude agent's
 *   novamira-solar-local connector. This client handles the HTTP
 *   fallback path (REST endpoints, sync-schema, diagnostics) where
 *   direct fetch() calls benefit from retry resilience.
 *
 * Retry policy:
 *   - Retryable: 5xx server errors, network errors (fetch failed),
 *     timeouts (AbortError), 429 rate-limit
 *   - Non-retryable: 4xx client errors (401, 403, 404, 422, etc.),
 *     JSON parse errors (invalid response is a caller bug)
 *   - Delay: baseDelayMs * 2^attempt + random(0, 200) [jitter]
 *   - Max retries: configurable, default 3
 *
 * Usage:
 *   import { McpClient } from './lib/mcp-client.js';
 *   const client = new McpClient('http://solar.local', {
 *     maxRetries: 3,
 *     baseDelayMs: 1000,
 *     timeout: 30000,
 *   });
 *   const schema = await client.get('/wp-json/novamira-adrianv2/v1/prop-schema');
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import type { McpClientOptions, RetryOptions } from './types.js';
import { CircuitBreaker } from './circuit-breaker.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if the error is retryable. */
function isRetryable(err: { status?: number; ok?: boolean; message?: string; name?: string }): boolean {
  // fetch() threw — network error or timeout
  if (!err.status && !err.ok && err.message) {
    const msg = err.message.toLowerCase();
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
    if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('enotfound')) return true;
  }
  // HTTP 5xx or 429
  if (typeof err.status === 'number') {
    if (err.status >= 500 && err.status < 600) return true;
    if (err.status === 429) return true;
  }
  return false;
}

// ─── McpClient ───────────────────────────────────────────────────────────────

export class McpClient {
  baseUrl: string;
  maxRetries: number;
  baseDelayMs: number;
  timeout: number;
  verbose: boolean;
  private _closed: boolean;
  private _circuitBreaker: CircuitBreaker | null = null;

  constructor(baseUrl: string, options: McpClientOptions = {}) {
    this.baseUrl     = baseUrl.replace(/\/+$/, '');
    this.maxRetries  = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.timeout     = options.timeout ?? 30000;
    this.verbose     = options.verbose ?? false;
    this._closed     = false;

    // Circuit Breaker Integration (UMBAUPLAN Phase 7)
    if (options.circuitBreaker) {
      this._circuitBreaker = options.circuitBreaker;
    } else if (process.env.CB_MCP_ENABLED === '1') {
      this._circuitBreaker = new CircuitBreaker({ name: 'mcp-client', failureThreshold: 5 });
    }
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;

    try {
      const undici = require('undici') as { getGlobalDispatcher: () => { destroy?: () => void; close?: () => void } };
      const dispatcher = undici.getGlobalDispatcher();
      if (dispatcher) {
        if (typeof dispatcher.destroy === 'function') dispatcher.destroy();
        else if (typeof dispatcher.close === 'function') dispatcher.close();
      }
    } catch {
      // undici is a Node 18+ internal
    }
  }

  // ── Circuit Breaker Access ──────────────────────────────────────────────

  /** Setzt oder aktiviert einen CircuitBreaker nachtraeglich. */
  setCircuitBreaker(cb: CircuitBreaker): void {
    this._circuitBreaker = cb;
  }

  /** Gibt den aktuellen CircuitBreaker zurueck (oder null). */
  getCircuitBreaker(): CircuitBreaker | null {
    return this._circuitBreaker;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async executeAbility(ability: string, params: Record<string, unknown> = {}, retryOpts: RetryOptions = {}): Promise<unknown> {
    const endpoint = '/wp-json/mcp/novamira';
    const body = {
      ability_name: ability,
      parameters: params,
    };

    const fetcher = () => this._fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, retryOpts);

    // Circuit Breaker Wrapper (UMBAUPLAN Phase 7)
    if (this._circuitBreaker) {
      return this._circuitBreaker.call(fetcher);
    }
    return fetcher();
  }

  async get(path: string, retryOpts: RetryOptions = {}): Promise<unknown> {
    const fetcher = () => this._fetch(path, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    }, retryOpts);

    if (this._circuitBreaker) {
      return this._circuitBreaker.call(fetcher);
    }
    return fetcher();
  }

  async discoverAbilities(retryOpts: RetryOptions = {}): Promise<unknown> {
    return this.executeAbility('mcp-adapter-discover-abilities', {}, retryOpts);
  }

  // ── Core fetch with retry ───────────────────────────────────────────────

  async _fetch(path: string, fetchOpts: Record<string, unknown> = {}, retryOpts: RetryOptions = {}): Promise<unknown> {
    const maxRetries  = retryOpts.maxRetries  ?? this.maxRetries;
    const baseDelayMs = retryOpts.baseDelayMs ?? this.baseDelayMs;
    const url = this.baseUrl + path;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const isLastAttempt = attempt === maxRetries;

      try {
        const response = await this._send(url, fetchOpts);

        if (response.status === 204) return null;

        // 4xx client error — don't retry
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const body = await this._readBody(response);
          throw Object.assign(
            new Error(`HTTP ${response.status} from ${url}: ${body.slice(0, 300)}`),
            { status: response.status, body, retryable: false } as { status: number; body: string; retryable: boolean }
          );
        }

        // 5xx or 429 — may retry
        if (response.status >= 500 || response.status === 429) {
          const body = await this._readBody(response);
          const err = Object.assign(
            new Error(`HTTP ${response.status} from ${url}: ${body.slice(0, 300)}`),
            { status: response.status, body, retryable: true } as { status: number; body: string; retryable: boolean }
          );
          if (isLastAttempt) throw err;
          await this._retryDelay(err, attempt, baseDelayMs, maxRetries);
          continue;
        }

        // Parse JSON
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            return await response.json();
          } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            throw Object.assign(
              new Error(`Invalid JSON from ${url}: ${errMsg}`),
              { status: response.status, retryable: false } as { status: number; retryable: boolean }
            );
          }
        }
        return await response.text();

      } catch (err: unknown) {
        const typedErr = err as { retryable?: boolean; message?: string };
        if (typedErr.retryable === false) throw err;
        if (!isRetryable(typedErr)) throw err;
        if (isLastAttempt) {
          this._log('ERROR', `All ${maxRetries + 1} attempts failed for ${url}: ${typedErr.message}`);
          throw err;
        }
        await this._retryDelay(err as Error, attempt, baseDelayMs, maxRetries);
      }
    }
    throw new Error(`Unexpected end of retry loop for ${url}`);
  }

  async _send(url: string, fetchOpts: Record<string, unknown>): Promise<Response> {
    if (this._closed) throw new Error('McpClient is closed');
    const headers = (fetchOpts.headers as Record<string, string> | undefined) ?? {};
    return fetch(url, {
      ...fetchOpts,
      signal: AbortSignal.timeout(this.timeout),
      headers: {
        ...headers,
        'Connection': 'close',
      },
    });
  }

  async _readBody(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.slice(0, 2000);
    } catch {
      return '(unable to read body)';
    }
  }

  async _retryDelay(_err: Error, attempt: number, baseDelayMs: number, maxRetries: number): Promise<void> {
    const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 201);
    const attemptNum = attempt + 1;
    this._log('WARN',
      `Retry ${attemptNum}/${maxRetries} in ${delay}ms — ${_err.message.slice(0, 120)}`
    );
    await new Promise<void>(resolve => setTimeout(resolve, delay));
  }

  _log(level: 'WARN' | 'ERROR' | 'INFO', message: string): void {
    const prefix = `[mcp-client] ${level}:`;
    if (level === 'ERROR') {
      process.stderr.write(prefix + ' ' + message + '\n');
    } else if (level === 'WARN' || this.verbose) {
      process.stderr.write(prefix + ' ' + message + '\n');
    }
  }
}

export default McpClient;

// ── Self-Test ─────────────────────────────────────────────────────────────────
// node --import tsx scripts/lib/mcp-client.js --self-test

if (process.argv.includes('--self-test')) {
  const client = new McpClient('http://localhost', { verbose: true });

  const delays: string[] = [];
  for (let i = 0; i < 3; i++) {
    delays.push(String(client.baseDelayMs * Math.pow(2, i)) + '[0-200]ms jitter');
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║       framer-v4-pipeline-v2 — MCP Client v1.0.0             ║
║       Phase 1.2: Exponential-Backoff Retry                  ║
╚══════════════════════════════════════════════════════════════╝

✅ Configuration:
   Base URL:      ${client.baseUrl}
   Max Retries:   ${client.maxRetries}
   Base Delay:    ${client.baseDelayMs}ms
   Timeout:       ${client.timeout}ms

📐 Retry Delays (exponential + jitter):
   Attempt 1: ${delays[0]}
   Attempt 2: ${delays[1]}
   Attempt 3: ${delays[2]}

🔄 Retryable errors:
   ✓ HTTP 5xx (500-599)
   ✓ HTTP 429 (rate limit)
   ✓ Network failure (fetch failed, ECONNREFUSED, ENOTFOUND)
   ✓ Timeout (AbortError, TimeoutError)

🚫 Non-retryable errors:
   ✗ HTTP 4xx (400-499, except 429)
   ✗ JSON parse errors
   ✗ Invalid URL / configuration

📋 Usage:
   import { McpClient } from './lib/mcp-client.js';
   const client = new McpClient('http://solar.local');
   const data = await client.get('/wp-json/novamira-adrianv2/v1/prop-schema');

Status: READY
`);
  process.exit(0);
}
