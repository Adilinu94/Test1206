/**
 * scripts/lib/pipeline-state.js — Pipeline State Persistence
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

// ── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {'pending'|'completed'|'failed'|'skipped'} PhaseStatus
 *
 * @typedef {{
 *   status: PhaseStatus,
 *   startedAt?: string,
 *   completedAt?: string,
 *   durationMs?: number,
 *   output?: unknown,
 *   error?: string,
 * }} PhaseRecord
 *
 * @typedef {{
 *   version: string,
 *   startedAt: string,
 *   updatedAt: string,
 *   target: string,
 *   framerUrl: string,
 *   postId: number|null,
 *   phases: Record<string, PhaseRecord>,
 * }} PipelineState
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * @param {string} statePath
 * @returns {Promise<PipelineState>}
 */
export async function loadState(statePath = DEFAULT_STATE_PATH) {
  const abs = path.resolve(statePath);
  if (!existsSync(abs)) return null;
  const raw = await fs.readFile(abs, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Initialize a fresh state object (no phases completed).
 *
 * @param {{ target?: string, framerUrl?: string, postId?: number|null }} opts
 * @returns {PipelineState}
 */
export function createState({ target = 'default', framerUrl = '', postId = null } = {}) {
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
 *
 * @param {PipelineState} state
 * @param {string} statePath
 */
export async function saveState(state, statePath = DEFAULT_STATE_PATH) {
  const abs = path.resolve(statePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const updated = { ...state, updatedAt: new Date().toISOString() };
  await fs.writeFile(abs, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

/**
 * Mark a phase as completed and persist.
 *
 * @param {PipelineState} state
 * @param {string} phaseName
 * @param {unknown} [output]
 * @param {string} [statePath]
 * @returns {Promise<PipelineState>}
 */
export async function savePhase(state, phaseName, output = null, statePath = DEFAULT_STATE_PATH) {
  const startedAt = state.phases[phaseName]?.startedAt ?? new Date().toISOString();
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - new Date(startedAt).getTime();

  const updated = {
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
 *
 * @param {PipelineState} state
 * @param {string} phaseName
 * @param {string} [statePath]
 * @returns {Promise<PipelineState>}
 */
export async function startPhase(state, phaseName, statePath = DEFAULT_STATE_PATH) {
  const updated = {
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
 *
 * @param {PipelineState} state
 * @param {string} phaseName
 * @param {string|Error} error
 * @param {string} [statePath]
 * @returns {Promise<PipelineState>}
 */
export async function markFailed(state, phaseName, error, statePath = DEFAULT_STATE_PATH) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const updated = {
    ...state,
    phases: {
      ...state.phases,
      [phaseName]: {
        ...(state.phases[phaseName] ?? {}),
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
 *
 * @param {PipelineState|null} state
 * @param {string[]} phaseNames - Ordered list of phase names
 * @returns {string|null}
 */
export function getResumablePhase(state, phaseNames = PIPELINE_PHASES) {
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
 *
 * @param {PipelineState|null} state
 * @param {string} phaseName
 * @returns {boolean}
 */
export function isPhaseCompleted(state, phaseName) {
  if (!state) return false;
  return state.phases[phaseName]?.status === 'completed';
}

/**
 * Get the output saved for a completed phase (e.g. file paths, metadata).
 *
 * @param {PipelineState|null} state
 * @param {string} phaseName
 * @returns {unknown}
 */
export function getPhaseOutput(state, phaseName) {
  if (!state) return null;
  return state.phases[phaseName]?.output ?? null;
}

/**
 * Pretty-print a state summary for CLI output.
 *
 * @param {PipelineState} state
 * @returns {string}
 */
export function formatStateReport(state) {
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
 *
 * @param {string} [statePath]
 */
export async function clearState(statePath = DEFAULT_STATE_PATH) {
  const abs = path.resolve(statePath);
  if (existsSync(abs)) {
    await fs.unlink(abs);
  }
}
