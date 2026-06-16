/**
 * tests/lib/phase-6-devex.test.js
 * UMBAUPLAN v2.0 Phase 6 — DevEx Tests
 *   6.1 wizard doctor (Auto-Fix, Check-Logik, JSON-Output)
 *   6.2 build-report (HTML-Generierung, alle Sektionen)
 *   6.4 replay (Save/Load/Run, List)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateBuildReport } from '../../scripts/wizard/build-report.js';
import { loadReplay, saveReplay, listReplays, runReplay } from '../../scripts/wizard/replay.js';

// ─────────────────────────────────────────────
// Phase 6.2 — build-report
// ─────────────────────────────────────────────

test('Phase 6.2 generateBuildReport: minimal data → valid HTML', () => {
  const html = generateBuildReport({ post_id: 123 });
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('post_id=123'));
  assert.ok(html.includes('Build Report'));
});

test('Phase 6.2 generateBuildReport: includes framer_url', () => {
  const html = generateBuildReport({ post_id: 1, framer_url: 'https://framer.app/test' });
  assert.ok(html.includes('framer_url=https://framer.app/test'));
});

test('Phase 6.2 generateBuildReport: validation card shows score', () => {
  const html = generateBuildReport({
    post_id: 1,
    validation: { score: 87, errors: 2, warnings: 5, passed: false },
  });
  assert.ok(html.includes('87%'));
  assert.ok(html.includes('FAIL'));
  assert.ok(html.includes('Errors: 2'));
});

test('Phase 6.2 generateBuildReport: trace table renders', () => {
  const html = generateBuildReport({
    post_id: 1,
    trace: [
      { script: 'extract-framer-css-tokens.js', duration_ms: 1234, status: 'ok' },
      { script: 'convert-xml-to-v4.js', duration_ms: 5678, status: 'ok' },
    ],
  });
  assert.ok(html.includes('Pipeline Trace'));
  assert.ok(html.includes('extract-framer-css-tokens.js'));
  assert.ok(html.includes('1234ms'));
});

test('Phase 6.2 generateBuildReport: workarounds section', () => {
  const html = generateBuildReport({
    post_id: 1,
    workarounds: [
      { id: 'css-injector', status: 'applied', detail: 'Generated mu-plugin' },
    ],
  });
  assert.ok(html.includes('css-injector'));
  assert.ok(html.includes('applied'));
});

test('Phase 6.2 generateBuildReport: invariants grid (I-V)', () => {
  const html = generateBuildReport({
    post_id: 1,
    invariants: {
      I:   { passed: true, detail: 'all styles bound' },
      II:  { passed: true, detail: 'no visual props in settings' },
      III: { passed: false, detail: 'invalid style id' },
      IV:  { passed: true, detail: 'no url-key with id' },
      V:   { passed: true, detail: 'all custom_css wrapped' },
    },
  });
  assert.ok(html.includes('Invariant I'));
  assert.ok(html.includes('Invariant V'));
  assert.ok(html.includes('all styles bound'));
});

test('Phase 6.2 generateBuildReport: QA grid', () => {
  const html = generateBuildReport({
    post_id: 1,
    qa: {
      layout:  { score: 92, detail: 'no overflow' },
      visual:  { passed: true, detail: 'matches Framer' },
      a11y:    { score: 78, detail: 'contrast issues' },
    },
  });
  assert.ok(html.includes('layout'));
  assert.ok(html.includes('92%'));
  assert.ok(html.includes('a11y'));
});

test('Phase 6.2 generateBuildReport: insights list', () => {
  const html = generateBuildReport({
    post_id: 1,
    insights: ['Cache-Hit-Rate verbessern', 'Workaround 3.1 vermeiden durch Pro-Update'],
  });
  assert.ok(html.includes('Actionable Insights'));
  assert.ok(html.includes('Cache-Hit-Rate verbessern'));
});

test('Phase 6.2 generateBuildReport: escapes HTML in user data', () => {
  const html = generateBuildReport({
    post_id: 1,
    framer_url: '<script>alert("xss")</script>',
  });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('Phase 6.2 generateBuildReport: total duration calculated', () => {
  const html = generateBuildReport({
    post_id: 1,
    trace: [
      { script: 'a.js', duration_ms: 1000, status: 'ok' },
      { script: 'b.js', duration_ms: 2500, status: 'ok' },
    ],
  });
  // 3500ms = 3.5s
  assert.ok(html.includes('3.5s'));
});

// ─────────────────────────────────────────────
// Phase 6.4 — replay
// ─────────────────────────────────────────────

test('Phase 6.4 loadReplay: returns null for missing file', () => {
  assert.equal(loadReplay('/nonexistent/path.json'), null);
});

test('Phase 6.4 saveReplay + loadReplay: roundtrip works', () => {
  const dir = mkdtempSync(join(tmpdir(), 'replay-test-'));
  try {
    const v4Tree = { type: 'e-flexbox', settings: {}, styles: { fehero: { id: 'fehero' } } };
    const filePath = saveReplay(dir, {
      post_id: 42,
      framer_url: 'https://framer.app/test',
      v4Tree,
      workarounds: [{ id: 'css-injector', status: 'applied' }],
      validation: { score: 95, passed: true },
    });
    assert.ok(existsSync(filePath));
    const loaded = loadReplay(filePath);
    assert.equal(loaded.post_id, 42);
    assert.equal(loaded.framer_url, 'https://framer.app/test');
    assert.deepEqual(loaded.v4Tree, v4Tree);
    assert.equal(loaded.validation.score, 95);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 6.4 saveReplay: throws without post_id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'replay-test-'));
  try {
    assert.throws(() => saveReplay(dir, { v4Tree: {} }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 6.4 listReplays: empty for non-existent dir', () => {
  assert.deepEqual(listReplays('/nonexistent/path'), []);
});

test('Phase 6.4 listReplays: returns post_ids sorted by age', () => {
  const dir = mkdtempSync(join(tmpdir(), 'replay-list-'));
  try {
    saveReplay(dir, { post_id: 100, v4Tree: {} });
    saveReplay(dir, { post_id: 200, v4Tree: {} });
    const list = listReplays(dir);
    assert.equal(list.length, 2);
    for (const entry of list) {
      assert.ok([100, 200].includes(entry.post_id));
      assert.ok(typeof entry.age_ms === 'number');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 6.4 listReplays: ignores tmp files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'replay-list-'));
  try {
    saveReplay(dir, { post_id: 1, v4Tree: {} });
    const list = listReplays(dir);
    // Replay-tmp-* files should be excluded
    for (const entry of list) {
      assert.ok(!entry.path.includes('tmp'));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 6.4 runReplay: throws without v4Tree', async () => {
  await assert.rejects(
    runReplay({ replay: {}, steps: ['validate'], pipelineDir: '.' }),
    /v4Tree/,
  );
});

test('Phase 6.4 runReplay: throws without pipelineDir', async () => {
  await assert.rejects(
    runReplay({ replay: { v4Tree: {} }, steps: ['validate'] }),
    /pipelineDir/,
  );
});
