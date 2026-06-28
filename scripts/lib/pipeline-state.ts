/**
 * scripts/lib/pipeline-state.ts — Pipeline State Persistence
 *
 * Saves/loads build state between wizard pipeline runs so that --resume
 * can skip already-completed phases. Written after each successful phase.
 *
 * State file location: .pipeline/state.json (relative to cwd / configurable)
 *
 * Usage:
 *   import { loadState, savePhase, markFailed, getResumablePhase } from './pipeline-state.js';
 *   const state = await loadState();
 *   await savePhase(state, 'css-tokens', { tokenFile: 'tokens.json' });
 *   // Resume:
 *   const resumeFrom = getResumablePhase(state, PIPELINE_PHASES);
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createHash } from 'node:crypto';
import type { PipelineState, PhaseRecord, PhaseStatus, CreateStateOptions, ArtifactRecord } from './types.js';

// ── Constants ───────────────────────────────────────────────────────────────

export const STATE_VERSION = '1.0';
export const DEFAULT_STATE_PATH = '.pipeline/state.json';

/**
 * Canonical phase names for the 14-step pipeline, in order.
 * Used by getResumablePhase() to determine which phase to restart from.
 */
export const PIPELINE_PHASES = [
  'framer-export',
  'css-tokens',
  'browser-crawl-fallback',
  'mcp-project-xml',
  'mcp-section-xml',
  'style-references',
  'token-mapping',
  'token-validation',
  'design-system',
  'resolve-fonts',
  'convert-xml',
  'pre-build-validate',
  'elementor-set-content',
  'visual-qa',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function loadState(statePath: string = DEFAULT_STATE_PATH): Promise<PipelineState | null> {
  const abs = path.resolve(statePath);
  if (!existsSync(abs)) return null;
  const raw = await fs.readFile(abs, 'utf-8');
  try {
    return JSON.parse(raw) as PipelineState;
  } catch {
    return null;
  }
}

/**
 * Initialize a fresh state object (no phases completed).
 */
export function createState({ target = 'default', framerUrl = '', postId = null }: CreateStateOptions = {}): PipelineState {
  const now = new Date().toISOString();
  return {
    version: STATE_VERSION,
    startedAt: now,
    updatedAt: now,
    target,
    framerUrl,
    postId,
    phases: {},
  };
}

/**
 * Persist state to disk. Creates parent directory if needed.
 */
export async function saveState(state: PipelineState, statePath: string = DEFAULT_STATE_PATH): Promise<PipelineState> {
  const abs = path.resolve(statePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const updated = { ...state, updatedAt: new Date().toISOString() };
  await fs.writeFile(abs, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

/**
 * Mark a phase as completed and persist.
 */
export async function savePhase(
  state: PipelineState,
  phaseName: string,
  output: unknown = null,
  statePath: string = DEFAULT_STATE_PATH,
): Promise<PipelineState> {
  const startedAt = state.phases[phaseName]?.startedAt ?? new Date().toISOString();
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - new Date(startedAt).getTime();

  const updated: PipelineState = {
    ...state,
    phases: {
      ...state.phases,
      [phaseName]: {
        status: 'completed',
        startedAt,
        completedAt,
        durationMs,
        output,
      },
    },
  };
  return saveState(updated, statePath);
}

/**
 * Mark a phase as started (before execution begins).
 */
export async function startPhase(
  state: PipelineState,
  phaseName: string,
  statePath: string = DEFAULT_STATE_PATH,
): Promise<PipelineState> {
  const updated: PipelineState = {
    ...state,
    phases: {
      ...state.phases,
      [phaseName]: {
        status: 'pending',
        startedAt: new Date().toISOString(),
      },
    },
  };
  return saveState(updated, statePath);
}

/**
 * Mark a phase as failed and persist.
 */
export async function markFailed(
  state: PipelineState,
  phaseName: string,
  error: string | Error,
  statePath: string = DEFAULT_STATE_PATH,
): Promise<PipelineState> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const existing = state.phases[phaseName] ?? {};
  const updated: PipelineState = {
    ...state,
    phases: {
      ...state.phases,
      [phaseName]: {
        ...(existing as PhaseRecord),
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: errorMessage,
      },
    },
  };
  return saveState(updated, statePath);
}

/**
 * Determine which phase to resume from, given a state and the ordered phase list.
 *
 * Returns the name of the first phase that is NOT completed/skipped.
 * Returns null if all phases are done (nothing to resume).
 */
export function getResumablePhase(state: PipelineState | null, phaseNames: string[] = PIPELINE_PHASES): string | null {
  if (!state) return phaseNames[0] ?? null;

  for (const name of phaseNames) {
    const record = state.phases[name];
    if (!record || (record.status !== 'completed' && record.status !== 'skipped')) {
      return name;
    }
  }
  return null; // all done
}

/**
 * Check whether a specific phase was already completed.
 */
export function isPhaseCompleted(state: PipelineState | null, phaseName: string): boolean {
  if (!state) return false;
  return state.phases[phaseName]?.status === 'completed';
}

/**
 * Get the output saved for a completed phase (e.g. file paths, metadata).
 */
export function getPhaseOutput(state: PipelineState | null, phaseName: string): unknown {
  if (!state) return null;
  return state.phases[phaseName]?.output ?? null;
}

/**
 * Pretty-print a state summary for CLI output.
 */
export function formatStateReport(state: PipelineState): string {
  const lines = [
    `Pipeline State (v${state.version})`,
    `  Started : ${state.startedAt}`,
    `  Updated : ${state.updatedAt}`,
    `  Target  : ${state.target}`,
    `  URL     : ${state.framerUrl || '(none)'}`,
    `  Post-ID : ${state.postId ?? '(none)'}`,
    '',
    '  Phases:',
  ];

  for (const name of PIPELINE_PHASES) {
    const record = state.phases[name];
    if (!record) {
      lines.push(`    - ${name}: pending`);
    } else {
      const icon = record.status === 'completed' ? '✓' : record.status === 'failed' ? '✗' : record.status === 'skipped' ? '–' : '…';
      const dur = record.durationMs != null ? ` (${record.durationMs}ms)` : '';
      lines.push(`    ${icon} ${name}: ${record.status}${dur}`);
      if (record.error) lines.push(`      ↳ Error: ${record.error}`);
    }
  }

  // ── Artifacts Section (UMBAUPLAN Phase 1.3) ─────────────────────────────
  if (state.artifacts && Object.keys(state.artifacts).length > 0) {
    lines.push('', '  Artifacts:');
    for (const [key, artifact] of Object.entries(state.artifacts)) {
      const shortHash = artifact.hash.slice(0, 12);
      lines.push(`    📦 ${key}: ${artifact.path} (sha256:${shortHash}…)`);
    }
  }

  return lines.join('\n');
}

// ── Artifact Management (UMBAUPLAN Phase 1.3) ────────────────────────────────

/**
 * Compute SHA-256 hash of any JSON-serializable content.
 * Used for artifact integrity verification.
 */
export function calculateHash(content: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(content ?? null))
    .digest('hex');
}

/**
 * Register an artifact in the pipeline state with SHA-256 integrity hash.
 * Reads the file at `artifactPath`, hashes its content, and stores the
 * path + hash + timestamp in `state.artifacts`.
 *
 * If `statePath` is provided, the updated state is persisted immediately.
 */
export async function addArtifact(
  state: PipelineState,
  key: string,
  artifactPath: string,
  statePath?: string,
): Promise<PipelineState> {
  const abs = path.resolve(artifactPath);

  let content: string;
  try {
    content = await fs.readFile(abs, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`addArtifact: cannot read "${abs}": ${msg}`);
  }

  // Try to parse as JSON for structured hashing; fall back to raw string
  let parsed: unknown = content;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Not JSON — hash the raw string
  }

  const hash = calculateHash(parsed);
  const timestamp = new Date().toISOString();

  const updated: PipelineState = {
    ...state,
    artifacts: {
      ...(state.artifacts || {}),
      [key]: { path: abs, hash, timestamp },
    },
  };

  if (statePath) {
    return saveState(updated, statePath);
  }
  return updated;
}

/**
 * Result of a single artifact integrity check.
 */
export interface ArtifactVerificationResult {
  key: string;
  path: string;
  valid: boolean;
  expectedHash?: string;
  actualHash?: string;
  error?: string;
}

/**
 * Verify integrity of all registered artifacts.
 *
 * Re-reads each artifact file, re-computes its SHA-256 hash,
 * and compares against the stored hash. Returns a detailed
 * result for each artifact.
 *
 * @returns { valid: boolean, results: ArtifactVerificationResult[] }
 */
export async function verifyArtifactIntegrity(
  state: PipelineState,
): Promise<{ valid: boolean; results: ArtifactVerificationResult[] }> {
  const artifacts = state.artifacts || {};
  const entries = Object.entries(artifacts);

  if (entries.length === 0) {
    return { valid: true, results: [] };
  }

  const results: ArtifactVerificationResult[] = [];

  for (const [key, artifact] of entries) {
    const result: ArtifactVerificationResult = {
      key,
      path: artifact.path,
      valid: false,
      expectedHash: artifact.hash,
    };

    try {
      const content = await fs.readFile(artifact.path, 'utf-8');

      let parsed: unknown = content;
      try {
        parsed = JSON.parse(content);
      } catch {
        // Not JSON — hash the raw string
      }

      const actualHash = calculateHash(parsed);
      result.actualHash = actualHash;
      result.valid = actualHash === artifact.hash;
    } catch (err: unknown) {
      result.error = err instanceof Error ? err.message : String(err);
    }

    results.push(result);
  }

  const valid = results.every(r => r.valid);
  return { valid, results };
}

/**
 * List all registered artifacts with their metadata.
 */
export function listArtifacts(
  state: PipelineState,
): Array<{ key: string } & ArtifactRecord> {
  const artifacts = state.artifacts || {};
  return Object.entries(artifacts).map(([key, record]) => ({
    key,
    ...record,
  }));
}

/**
 * Remove a single artifact from the state.
 * If `statePath` is provided, the updated state is persisted immediately.
 */
export async function removeArtifact(
  state: PipelineState,
  key: string,
  statePath?: string,
): Promise<PipelineState> {
  if (!state.artifacts || !state.artifacts[key]) {
    return state; // nothing to remove
  }

  const { [key]: _removed, ...remaining } = state.artifacts;
  const updated: PipelineState = {
    ...state,
    artifacts: remaining,
  };

  if (statePath) {
    return saveState(updated, statePath);
  }
  return updated;
}

/**
 * Remove all artifacts from the state.
 * If `statePath` is provided, the updated state is persisted immediately.
 */
export async function clearArtifacts(
  state: PipelineState,
  statePath?: string,
): Promise<PipelineState> {
  const updated: PipelineState = {
    ...state,
    artifacts: {},
  };

  if (statePath) {
    return saveState(updated, statePath);
  }
  return updated;
}

// ── State Cleanup ────────────────────────────────────────────────────────────

/**
 * Delete the state file (e.g. after a successful full run, or via --clean).
 */
export async function clearState(statePath: string = DEFAULT_STATE_PATH): Promise<void> {
  const abs = path.resolve(statePath);
  if (existsSync(abs)) {
    await fs.unlink(abs);
  }
}
