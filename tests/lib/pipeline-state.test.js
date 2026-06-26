/**
 * Tests for scripts/lib/pipeline-state.js
 *
 * Tests state persistence, phase tracking, and resume logic.
 * Uses tmp directories so no file system pollution.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import {
  createState,
  savePhase,
  startPhase,
  markFailed,
  getResumablePhase,
  isPhaseCompleted,
  getPhaseOutput,
  formatStateReport,
  clearState,
  loadState,
  saveState,
  PIPELINE_PHASES,
  STATE_VERSION,
} from '../../scripts/lib/pipeline-state.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir;
let statePath;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(tmpdir(), 'pipeline-state-test-'));
  statePath = path.join(tmpDir, 'state.json');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── createState ───────────────────────────────────────────────────────────────

describe('createState', () => {
  it('creates state with correct version', () => {
    const state = createState();
    assert.equal(state.version, STATE_VERSION);
  });

  it('creates state with empty phases map', () => {
    const state = createState();
    assert.deepEqual(state.phases, {});
  });

  it('accepts target/framerUrl/postId options', () => {
    const state = createState({ target: 'testseite', framerUrl: 'https://ex.framer.app', postId: 42 });
    assert.equal(state.target, 'testseite');
    assert.equal(state.framerUrl, 'https://ex.framer.app');
    assert.equal(state.postId, 42);
  });

  it('has valid ISO timestamps', () => {
    const state = createState();
    assert.ok(!isNaN(Date.parse(state.startedAt)));
    assert.ok(!isNaN(Date.parse(state.updatedAt)));
  });
});

// ── saveState / loadState ─────────────────────────────────────────────────────

describe('saveState / loadState', () => {
  it('round-trips state to disk', async () => {
    const state = createState({ target: 'solar-local', framerUrl: 'https://x.framer.app' });
    await saveState(state, statePath);
    const loaded = await loadState(statePath);
    assert.equal(loaded.target, 'solar-local');
    assert.equal(loaded.framerUrl, 'https://x.framer.app');
  });

  it('returns null for non-existent state file', async () => {
    const loaded = await loadState(path.join(tmpDir, 'nope.json'));
    assert.equal(loaded, null);
  });

  it('returns null for corrupt JSON', async () => {
    await fs.writeFile(statePath, '{not valid json', 'utf-8');
    const loaded = await loadState(statePath);
    assert.equal(loaded, null);
  });

  it('updates updatedAt on save', async () => {
    const state = createState();
    const before = state.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const saved = await saveState(state, statePath);
    assert.ok(saved.updatedAt >= before);
  });

  it('creates parent directories if missing', async () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c', 'state.json');
    await saveState(createState(), nested);
    const exists = await fs.access(nested).then(() => true).catch(() => false);
    assert.ok(exists);
  });
});

// ── savePhase ─────────────────────────────────────────────────────────────────

describe('savePhase', () => {
  it('marks a phase as completed', async () => {
    let state = createState();
    state = await savePhase(state, 'css-tokens', { file: 'tokens.json' }, statePath);
    assert.equal(state.phases['css-tokens'].status, 'completed');
  });

  it('stores the phase output', async () => {
    let state = createState();
    state = await savePhase(state, 'framer-export', { dir: '/tmp/exports/x' }, statePath);
    assert.equal(state.phases['framer-export'].output.dir, '/tmp/exports/x');
  });

  it('records completedAt timestamp', async () => {
    let state = createState();
    state = await savePhase(state, 'framer-export', null, statePath);
    assert.ok(!isNaN(Date.parse(state.phases['framer-export'].completedAt)));
  });

  it('records durationMs', async () => {
    let state = createState();
    state = await startPhase(state, 'css-tokens', statePath);
    await new Promise((r) => setTimeout(r, 10));
    state = await savePhase(state, 'css-tokens', null, statePath);
    assert.ok(state.phases['css-tokens'].durationMs >= 0);
  });

  it('persists to disk so loadState sees it', async () => {
    let state = createState();
    state = await savePhase(state, 'token-mapping', { ok: true }, statePath);
    const loaded = await loadState(statePath);
    assert.equal(loaded.phases['token-mapping'].status, 'completed');
  });
});

// ── markFailed ────────────────────────────────────────────────────────────────

describe('markFailed', () => {
  it('marks a phase as failed', async () => {
    let state = createState();
    state = await markFailed(state, 'convert-xml', 'Parse error', statePath);
    assert.equal(state.phases['convert-xml'].status, 'failed');
  });

  it('stores the error message', async () => {
    let state = createState();
    state = await markFailed(state, 'convert-xml', 'Parse error', statePath);
    assert.equal(state.phases['convert-xml'].error, 'Parse error');
  });

  it('accepts Error objects', async () => {
    let state = createState();
    state = await markFailed(state, 'convert-xml', new Error('Boom'), statePath);
    assert.equal(state.phases['convert-xml'].error, 'Boom');
  });
});

// ── getResumablePhase ─────────────────────────────────────────────────────────

describe('getResumablePhase', () => {
  it('returns first phase when state is null', () => {
    const phase = getResumablePhase(null, PIPELINE_PHASES);
    assert.equal(phase, PIPELINE_PHASES[0]);
  });

  it('returns first incomplete phase', async () => {
    let state = createState();
    state = await savePhase(state, 'framer-export', null, statePath);
    state = await savePhase(state, 'css-tokens', null, statePath);
    const phase = getResumablePhase(state, PIPELINE_PHASES);
    assert.equal(phase, 'browser-crawl-fallback');
  });

  it('returns null when all phases are completed', async () => {
    let state = createState();
    for (const name of PIPELINE_PHASES) {
      state = await savePhase(state, name, null, statePath);
    }
    const phase = getResumablePhase(state, PIPELINE_PHASES);
    assert.equal(phase, null);
  });

  it('resumes after a failed phase (failed ≠ completed)', async () => {
    let state = createState();
    state = await savePhase(state, 'framer-export', null, statePath);
    state = await markFailed(state, 'css-tokens', 'Network error', statePath);
    const phase = getResumablePhase(state, PIPELINE_PHASES);
    assert.equal(phase, 'css-tokens');
  });

  it('returns first phase for empty state with no phases recorded', () => {
    const state = createState();
    const phase = getResumablePhase(state, PIPELINE_PHASES);
    assert.equal(phase, PIPELINE_PHASES[0]);
  });
});

// ── isPhaseCompleted ──────────────────────────────────────────────────────────

describe('isPhaseCompleted', () => {
  it('returns false for null state', () => {
    assert.equal(isPhaseCompleted(null, 'framer-export'), false);
  });

  it('returns false for phase not in state', () => {
    const state = createState();
    assert.equal(isPhaseCompleted(state, 'framer-export'), false);
  });

  it('returns true for completed phase', async () => {
    let state = createState();
    state = await savePhase(state, 'framer-export', null, statePath);
    assert.equal(isPhaseCompleted(state, 'framer-export'), true);
  });

  it('returns false for failed phase', async () => {
    let state = createState();
    state = await markFailed(state, 'framer-export', 'err', statePath);
    assert.equal(isPhaseCompleted(state, 'framer-export'), false);
  });
});

// ── getPhaseOutput ────────────────────────────────────────────────────────────

describe('getPhaseOutput', () => {
  it('returns null for null state', () => {
    assert.equal(getPhaseOutput(null, 'css-tokens'), null);
  });

  it('returns null for phase not completed', () => {
    const state = createState();
    assert.equal(getPhaseOutput(state, 'css-tokens'), null);
  });

  it('returns stored output', async () => {
    let state = createState();
    state = await savePhase(state, 'css-tokens', { file: 'tokens.json', count: 12 }, statePath);
    const out = getPhaseOutput(state, 'css-tokens');
    assert.equal(out.file, 'tokens.json');
    assert.equal(out.count, 12);
  });
});

// ── formatStateReport ─────────────────────────────────────────────────────────

describe('formatStateReport', () => {
  it('includes all PIPELINE_PHASES in output', async () => {
    const state = createState({ target: 'solar', framerUrl: 'https://x.framer.app' });
    const report = formatStateReport(state);
    for (const name of PIPELINE_PHASES) {
      assert.ok(report.includes(name), `Missing phase: ${name}`);
    }
  });

  it('shows completed phases with ✓', async () => {
    let state = createState();
    state = await savePhase(state, 'framer-export', null, statePath);
    const report = formatStateReport(state);
    assert.ok(report.includes('✓ framer-export'));
  });

  it('shows failed phases with ✗', async () => {
    let state = createState();
    state = await markFailed(state, 'convert-xml', 'err', statePath);
    const report = formatStateReport(state);
    assert.ok(report.includes('✗ convert-xml'));
  });

  it('includes target and URL', () => {
    const state = createState({ target: 'testseite', framerUrl: 'https://y.framer.app' });
    const report = formatStateReport(state);
    assert.ok(report.includes('testseite'));
    assert.ok(report.includes('https://y.framer.app'));
  });
});

// ── clearState ────────────────────────────────────────────────────────────────

describe('clearState', () => {
  it('removes state file', async () => {
    await saveState(createState(), statePath);
    await clearState(statePath);
    const exists = await fs.access(statePath).then(() => true).catch(() => false);
    assert.equal(exists, false);
  });

  it('does not throw when file does not exist', async () => {
    await assert.doesNotReject(() => clearState(path.join(tmpDir, 'none.json')));
  });
});
