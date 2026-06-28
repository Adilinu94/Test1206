/**
 * tests/lib/phase-7-monitoring.test.js
 * UMBAUPLAN v2.0 Phase 7 — Monitoring Tests
 *   7.2 error-tracker (wrap, classify, write, summary)
 *   7.3 health (cache-stats, last-build, error-count, workaround-count)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createErrorTracker, CATEGORIES, classifyAbility } from '../../scripts/lib/error-tracker.js';
import { getHealthStatus } from '../../scripts/wizard/health.js';

// ─────────────────────────────────────────────
// Phase 7.2 — Error Tracker
// ─────────────────────────────────────────────

test('Phase 7.2 classifyAbility: maps prefixes to categories', () => {
  assert.equal(classifyAbility('mcp__framer__getProjectXml'), 'mcp-framer');
  assert.equal(classifyAbility('novamira/elementor-check-setup'), 'mcp-elementor');
  assert.equal(classifyAbility('novamira-adrianv2/version'), 'mcp-novamira');
  assert.equal(classifyAbility('wp_update_post'), 'wp-plugin');
  assert.equal(classifyAbility('unknown'), 'pipeline-internal');
});

test('Phase 7.2 CATEGORIES: contains 5 known categories', () => {
  assert.equal(CATEGORIES.length, 5);
  assert.ok(CATEGORIES.includes('mcp-framer'));
  assert.ok(CATEGORIES.includes('mcp-novamira'));
});

test('Phase 7.2 createErrorTracker: starts with empty session', () => {
  const dir = mkdtempSync(join(tmpdir(), 'error-tracker-'));
  try {
    const tracker = createErrorTracker({ cacheDir: dir });
    const summary = tracker.getSummary();
    assert.equal(summary.total, 0);
    assert.equal(summary.sessionId.length > 0, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.2 createErrorTracker: wraps mcpBridge and tracks errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'error-tracker-'));
  try {
    const bridge = {
      call: async (ability) => {
        if (ability === 'good') return { ok: true };
        throw new Error('Test failure');
      },
    };
    const tracker = createErrorTracker({ cacheDir: dir });
    const wrapped = tracker.wrapMcpBridge(bridge);

    await wrapped.call('good');
    await assert.rejects(wrapped.call('bad'));

    const summary = tracker.getSummary();
    assert.equal(summary.total, 1);
    assert.equal(summary.byCategory['pipeline-internal'], 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.2 createErrorTracker: classifies by ability name', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'error-tracker-'));
  try {
    const bridge = { call: async () => { throw new Error('x'); } };
    const tracker = createErrorTracker({ cacheDir: dir });
    const wrapped = tracker.wrapMcpBridge(bridge);

    await wrapped.call('mcp__framer__getProjectXml').catch(() => null);
    await wrapped.call('novamira/elementor-check-setup').catch(() => null);

    const summary = tracker.getSummary();
    assert.equal(summary.byCategory['mcp-framer'], 1);
    assert.equal(summary.byCategory['mcp-elementor'], 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.2 createErrorTracker: writeError creates file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'error-tracker-'));
  try {
    const tracker = createErrorTracker({ cacheDir: dir });
    tracker.writeError('pipeline-internal', new Error('Test'));
    const errFile = join(dir, 'errors-current.jsonl');
    assert.ok(existsSync(errFile));
    const content = readFileSync(errFile, 'utf8');
    assert.ok(content.includes('Test'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.2 createErrorTracker: getRecentErrors returns last N', () => {
  const dir = mkdtempSync(join(tmpdir(), 'error-tracker-'));
  try {
    const tracker = createErrorTracker({ cacheDir: dir });
    for (let i = 0; i < 5; i++) {
      tracker.writeError('pipeline-internal', new Error(`Error ${i}`));
    }
    const recent = tracker.getRecentErrors(3);
    assert.equal(recent.length, 3);
    assert.equal(recent[recent.length - 1].message, 'Error 4');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.2 createErrorTracker: rotateLog moves file to date-stamped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'error-tracker-'));
  try {
    const tracker = createErrorTracker({ cacheDir: dir });
    tracker.writeError('pipeline-internal', new Error('Test'));
    tracker.rotateLog();
    const date = new Date().toISOString().slice(0, 10);
    const rotated = join(dir, `errors-${date}.jsonl`);
    assert.ok(existsSync(rotated), 'rotated file should exist');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.2 createErrorTracker: wrapMcpBridge unwrap returns original', () => {
  const dir = mkdtempSync(join(tmpdir(), 'error-tracker-'));
  try {
    const bridge = { call: async () => ({}) };
    const tracker = createErrorTracker({ cacheDir: dir });
    const wrapped = tracker.wrapMcpBridge(bridge);
    assert.equal(wrapped.unwrap(), bridge);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────
// Phase 7.3 — Health Endpoint
// ─────────────────────────────────────────────

test('Phase 7.3 getHealthStatus: empty cache → ok status', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'health-'));
  try {
    const status = await getHealthStatus({ cacheDir: dir });
    assert.equal(status.status, 'ok');
    assert.ok(status.timestamp);
    assert.equal(status.cache_hit_rate, 0);
    assert.equal(status.error_count_last_24h, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.3 getHealthStatus: with replay file → last_build set', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'health-'));
  try {
    writeFileSync(join(dir, 'replay-123.json'), '{"post_id": 123}');
    const status = await getHealthStatus({ cacheDir: dir });
    assert.equal(status.last_build.post_id, 123);
    assert.ok(status.last_build.age_ms < 10000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.3 getHealthStatus: error_count counts entries in window', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'health-'));
  try {
    const errFile = join(dir, 'errors-current.jsonl');
    const now = new Date().toISOString();
    writeFileSync(errFile, JSON.stringify({ timestamp: now, message: 'x' }) + '\n');
    const status = await getHealthStatus({ cacheDir: dir });
    assert.equal(status.error_count_last_24h, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.3 getHealthStatus: workarounds_active counts fallback files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'health-'));
  try {
    writeFileSync(join(dir, 'foundation-fallback-solar.json'), '{}');
    writeFileSync(join(dir, 'image-map-solar.json'), '{}');
    const status = await getHealthStatus({ cacheDir: dir });
    assert.equal(status.workarounds_active, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.3 getHealthStatus: mcp failure → degraded status', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'health-'));
  try {
    const bridge = { call: async () => { throw new Error('Connection refused'); } };
    const status = await getHealthStatus({ cacheDir: dir, mcpBridge: bridge });
    assert.equal(status.status, 'degraded');
    assert.equal(status.mcp_connection.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.3 getHealthStatus: no bridge → mcp_connection.ok=null', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'health-'));
  try {
    const status = await getHealthStatus({ cacheDir: dir });
    assert.equal(status.mcp_connection.ok, null);
    assert.equal(status.elementor_version, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 7.3 getHealthStatus: cache stats with framer-source files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'health-'));
  try {
    const fsDir = join(dir, 'framer-source', 'proj-1');
    mkdirSync(fsDir, { recursive: true });
    // Write >1KB so size_kb > 0
    writeFileSync(join(fsDir, 'cache.json'), JSON.stringify({ data: 'x'.repeat(2000) }));
    const status = await getHealthStatus({ cacheDir: dir });
    assert.ok(status.checks.cache.files >= 1, `expected files >= 1, got ${status.checks.cache.files}`);
    assert.ok(status.checks.cache.size_kb >= 1, `expected size_kb >= 1, got ${status.checks.cache.size_kb}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
