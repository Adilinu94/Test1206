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
import type { PipelineState, PhaseRecord, PhaseStatus, CreateStateOptions } from './types.js';

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

  return lines.join('\n');
}

/**
 * Delete the state file (e.g. after a successful full run, or via --clean).
 */
export async function clearState(statePath: string = DEFAULT_STATE_PATH): Promise<void> {
  const abs = path.resolve(statePath);
  if (existsSync(abs)) {
    await fs.unlink(abs);
  }
}
