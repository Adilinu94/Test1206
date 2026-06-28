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
  addArtifact,
  calculateHash,
  verifyArtifactIntegrity,
  listArtifacts,
  removeArtifact,
  clearArtifacts,
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

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACT MANAGEMENT (UMBAUPLAN Phase 1.3)
// ═══════════════════════════════════════════════════════════════════════════════

// ── calculateHash ─────────────────────────────────────────────────────────────

describe('calculateHash', () => {
  it('returns a 64-char hex string for any content', () => {
    const hash = calculateHash({ hello: 'world' });
    assert.equal(hash.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(hash));
  });

  it('is deterministic — same input → same hash', () => {
    const a = calculateHash({ a: 1, b: 2 });
    const b = calculateHash({ a: 1, b: 2 });
    assert.equal(a, b);
  });

  it('is content-sensitive — different input → different hash', () => {
    const a = calculateHash({ a: 1 });
    const b = calculateHash({ a: 2 });
    assert.notEqual(a, b);
  });

  it('handles strings', () => {
    const hash = calculateHash('hello world');
    assert.equal(hash.length, 64);
  });

  it('handles null', () => {
    const hash = calculateHash(null);
    assert.equal(hash.length, 64);
  });
});

// ── addArtifact ───────────────────────────────────────────────────────────────

describe('addArtifact', () => {
  it('adds an artifact with hash to state', async () => {
    const testFile = path.join(tmpDir, 'test-artifact.json');
    await fs.writeFile(testFile, JSON.stringify({ key: 'value' }), 'utf-8');

    let state = createState();
    state = await addArtifact(state, 'test-artifact', testFile, statePath);

    assert.ok(state.artifacts);
    assert.ok(state.artifacts['test-artifact']);
    assert.equal(state.artifacts['test-artifact'].path, testFile);
    assert.equal(state.artifacts['test-artifact'].hash.length, 64);
    assert.ok(!isNaN(Date.parse(state.artifacts['test-artifact'].timestamp)));
  });

  it('persists to disk when statePath provided', async () => {
    const testFile = path.join(tmpDir, 'test-artifact.json');
    await fs.writeFile(testFile, JSON.stringify({ key: 'value' }), 'utf-8');

    let state = createState();
    await addArtifact(state, 'test-artifact', testFile, statePath);

    const loaded = await loadState(statePath);
    assert.ok(loaded.artifacts);
    assert.ok(loaded.artifacts['test-artifact']);
    assert.equal(loaded.artifacts['test-artifact'].path, testFile);
  });

  it('throws when file does not exist', async () => {
    const state = createState();
    const missingFile = path.join(tmpDir, 'does-not-exist.json');
    await assert.rejects(
      () => addArtifact(state, 'missing', missingFile),
      /addArtifact: cannot read/,
    );
  });

  it('adds multiple artifacts independently', async () => {
    const file1 = path.join(tmpDir, 'a.json');
    const file2 = path.join(tmpDir, 'b.json');
    await fs.writeFile(file1, JSON.stringify({ n: 1 }), 'utf-8');
    await fs.writeFile(file2, JSON.stringify({ n: 2 }), 'utf-8');

    let state = createState();
    state = await addArtifact(state, 'a', file1);
    state = await addArtifact(state, 'b', file2, statePath);

    assert.equal(Object.keys(state.artifacts).length, 2);
    assert.ok(state.artifacts.a);
    assert.ok(state.artifacts.b);
    assert.notEqual(state.artifacts.a.hash, state.artifacts.b.hash);
  });

  it('returns in-memory state when no statePath provided', async () => {
    const testFile = path.join(tmpDir, 'test-artifact.json');
    await fs.writeFile(testFile, JSON.stringify({ test: true }), 'utf-8');

    let state = createState();
    state = await addArtifact(state, 'inline', testFile);

    // Should be in state object but NOT on disk
    assert.ok(state.artifacts.inline);
    const onDisk = await loadState(path.join(tmpDir, 'state.json'));
    // no state.json was saved since statePath was not provided
    assert.equal(onDisk, null);
  });
});

// ── verifyArtifactIntegrity ───────────────────────────────────────────────────

describe('verifyArtifactIntegrity', () => {
  it('returns valid:true for empty artifacts', async () => {
    const state = createState();
    const result = await verifyArtifactIntegrity(state);
    assert.equal(result.valid, true);
    assert.deepEqual(result.results, []);
  });

  it('returns valid:true for unmodified artifacts', async () => {
    const testFile = path.join(tmpDir, 'test-artifact.json');
    await fs.writeFile(testFile, JSON.stringify({ data: [1, 2, 3] }), 'utf-8');

    let state = createState();
    state = await addArtifact(state, 'data', testFile);

    const result = await verifyArtifactIntegrity(state);
    assert.equal(result.valid, true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].key, 'data');
    assert.equal(result.results[0].valid, true);
  });

  it('returns valid:false for modified artifacts', async () => {
    const testFile = path.join(tmpDir, 'test-artifact.json');
    await fs.writeFile(testFile, JSON.stringify({ original: true }), 'utf-8');

    let state = createState();
    state = await addArtifact(state, 'data', testFile);

    // Modify the file after adding the artifact
    await fs.writeFile(testFile, JSON.stringify({ modified: true }), 'utf-8');

    const result = await verifyArtifactIntegrity(state);
    assert.equal(result.valid, false);
    assert.equal(result.results[0].valid, false);
    assert.ok(result.results[0].actualHash);
    assert.notEqual(result.results[0].actualHash, result.results[0].expectedHash);
  });

  it('reports missing files with error', async () => {
    const testFile = path.join(tmpDir, 'test-artifact.json');
    await fs.writeFile(testFile, JSON.stringify({ temp: true }), 'utf-8');

    let state = createState();
    state = await addArtifact(state, 'temp', testFile);

    // Delete the file
    await fs.unlink(testFile);

    const result = await verifyArtifactIntegrity(state);
    assert.equal(result.valid, false);
    assert.equal(result.results[0].valid, false);
    assert.ok(result.results[0].error);
  });

  it('checks multiple artifacts', async () => {
    const file1 = path.join(tmpDir, 'a.json');
    const file2 = path.join(tmpDir, 'b.json');
    await fs.writeFile(file1, JSON.stringify({ a: 1 }), 'utf-8');
    await fs.writeFile(file2, JSON.stringify({ b: 2 }), 'utf-8');

    let state = createState();
    state = await addArtifact(state, 'a', file1);
    state = await addArtifact(state, 'b', file2);

    const result = await verifyArtifactIntegrity(state);
    assert.equal(result.valid, true);
    assert.equal(result.results.length, 2);
  });
});

// ── listArtifacts ─────────────────────────────────────────────────────────────

describe('listArtifacts', () => {
  it('returns empty array for no artifacts', () => {
    const state = createState();
    const list = listArtifacts(state);
    assert.deepEqual(list, []);
  });

  it('returns all artifacts with keys', async () => {
    const file1 = path.join(tmpDir, 'a.json');
    const file2 = path.join(tmpDir, 'b.json');
    await fs.writeFile(file1, JSON.stringify({ a: 1 }), 'utf-8');
    await fs.writeFile(file2, JSON.stringify({ b: 2 }), 'utf-8');

    let state = createState();
    state = await addArtifact(state, 'a', file1);
    state = await addArtifact(state, 'b', file2);

    const list = listArtifacts(state);
    assert.equal(list.length, 2);
    assert.ok(list.some(item => item.key === 'a'));
    assert.ok(list.some(item => item.key === 'b'));
    assert.equal(list[0].hash.length, 64);
  });
});

// ── removeArtifact ────────────────────────────────────────────────────────────

describe('removeArtifact', () => {
  it('removes a single artifact', async () => {
    const file1 = path.join(tmpDir, 'a.json');
    const file2 = path.join(tmpDir, 'b.json');
    await fs.writeFile(file1, JSON.stringify({ a: 1 }), 'utf-8');
    await fs.writeFile(file2, JSON.stringify({ b: 2 }), 'utf-8');

    let state = createState();
    state = await addArtifact(state, 'a', file1);
    state = await addArtifact(state, 'b', file2);

    state = await removeArtifact(state, 'a', statePath);
    assert.equal(Object.keys(state.artifacts).length, 1);
    assert.ok(!state.artifacts.a);
    assert.ok(state.artifacts.b);

    // Verify persisted
    const loaded = await loadState(statePath);
    assert.equal(Object.keys(loaded.artifacts).length, 1);
  });

  it('is a no-op for missing key', async () => {
    let state = createState();
    state = await removeArtifact(state, 'nonexistent');
    assert.ok(!state.artifacts || Object.keys(state.artifacts).length === 0);
  });
});

// ── clearArtifacts ────────────────────────────────────────────────────────────

describe('clearArtifacts', () => {
  it('removes all artifacts', async () => {
    const file1 = path.join(tmpDir, 'a.json');
    const file2 = path.join(tmpDir, 'b.json');
    await fs.writeFile(file1, JSON.stringify({ a: 1 }), 'utf-8');
    await fs.writeFile(file2, JSON.stringify({ b: 2 }), 'utf-8');

    let state = createState();
    state = await addArtifact(state, 'a', file1);
    state = await addArtifact(state, 'b', file2);
    assert.equal(Object.keys(state.artifacts).length, 2);

    state = await clearArtifacts(state, statePath);
    assert.deepEqual(state.artifacts, {});

    // Verify persisted
    const loaded = await loadState(statePath);
    assert.deepEqual(loaded.artifacts, {});
  });

  it('works on state with no artifacts', async () => {
    let state = createState();
    state = await clearArtifacts(state);
    assert.deepEqual(state.artifacts, {});
  });
});

// ── formatStateReport (artifact section) ──────────────────────────────────────

describe('formatStateReport — artifacts', () => {
  it('shows artifacts when present', async () => {
    const testFile = path.join(tmpDir, 'test-artifact.json');
    await fs.writeFile(testFile, JSON.stringify({ data: true }), 'utf-8');

    let state = createState({ target: 'test', framerUrl: 'https://x.com' });
    state = await addArtifact(state, 'v4-tree', testFile);

    const report = formatStateReport(state);
    assert.ok(report.includes('Artifacts:'));
    assert.ok(report.includes('v4-tree'));
    assert.ok(report.includes('sha256:'));
  });

  it('does not show artifacts section when none exist', () => {
    const state = createState();
    const report = formatStateReport(state);
    assert.ok(!report.includes('Artifacts:'));
  });
});
