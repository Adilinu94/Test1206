/**
 * scripts/lib/types.ts — Shared TypeScript type definitions
 *
 * Ported 1:1 from JSDoc @typedef annotations in the respective modules.
 * Do not invent new types — only port what exists in the code.
 */

// ── pipeline-state.js ────────────────────────────────────────────────────────

export type PhaseStatus = 'pending' | 'completed' | 'failed' | 'skipped';

export interface PhaseRecord {
  status: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: unknown;
  error?: string;
}

export interface PipelineState {
  version: string;
  startedAt: string;
  updatedAt: string;
  target: string;
  framerUrl: string;
  postId: number | null;
  phases: Record<string, PhaseRecord>;
}

export interface CreateStateOptions {
  target?: string;
  framerUrl?: string;
  postId?: number | null;
}

// ── mcp-client.js ────────────────────────────────────────────────────────────

export interface McpClientOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  timeout?: number;
  verbose?: boolean;
  /** Optionaler CircuitBreaker fuer Fail-Fast-Schutz (UMBAUPLAN Phase 7) */
  circuitBreaker?: import('./circuit-breaker.js').CircuitBreaker;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

// ── mcp-cache.js ─────────────────────────────────────────────────────────────

export interface McpDesignSystemCacheData {
  data: unknown;
  expires: number;
  cached_at: string;
}

/** Minimal interface for the MCP bridge/adapter passed to cache methods. */
export interface McpCaller {
  call(ability: string, params?: Record<string, unknown>): Promise<unknown>;
}
