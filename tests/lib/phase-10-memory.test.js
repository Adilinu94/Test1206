/**
 * tests/lib/phase-10-memory.test.js
 * UMBAUPLAN v2.0 Phase 10 — Memory-Store + Quarterly-Audit Tests
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createMemoryStore } from '../../scripts/lib/auto-memory-save.js';
import { runQuarterlyAudit } from '../../scripts/quarterly-audit.js';

after(() => {
  // Cleanup is per-test via rmSync in each test
});

function freshCacheDir() {
  return mkdtempSync(join(tmpdir(), 'phase10-'));
}

test('Phase 10.1 saveLesson: persists with id and confidence', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    const lesson = mem.saveLesson({
      content: 'Use __v3Id() for unique style ids',
      concepts: ['v4-builder', 'style-id'],
      confidence: 0.8,
      tags: ['atomic', 'v4'],
    });
    assert.ok(lesson.id);
    assert.equal(lesson.id.length, 12);
    assert.equal(lesson.confidence, 0.8);
    assert.deepEqual(lesson.concepts, ['v4-builder', 'style-id']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 saveLesson: duplicate content strengthens existing', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    const a = mem.saveLesson({ content: 'Always sanitize style ids', confidence: 0.6 });
    const b = mem.saveLesson({ content: 'Always sanitize style ids', confidence: 0.9 });
    // Duplicate → reinforce, not new lesson
    assert.equal(a.id, b.id);
    assert.ok(b.confidence > 0.6, `confidence ${b.confidence} should be > 0.6 after reinforcement`);
    assert.equal(b.reinforced_count, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 findLesson: filter by query (content match)', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    mem.saveLesson({ content: 'Image-src invariant: kein url-Key wenn id gesetzt' });
    mem.saveLesson({ content: 'Always wrap colors in $$type/value' });

    const results = mem.findLesson({ query: 'wrap colors' });
    assert.equal(results.length, 1);
    assert.ok(results[0].content.includes('wrap colors'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 findLesson: filter by query (concepts match)', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    mem.saveLesson({
      content: 'Custom CSS wrap',
      concepts: ['custom-css', 'v3Id'],
    });
    const results = mem.findLesson({ query: 'v3Id' });
    assert.equal(results.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 findLesson: filter by tags', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    mem.saveLesson({ content: 'L1 atomic', tags: ['atomic', 'critical'] });
    mem.saveLesson({ content: 'L2', tags: ['misc'] });
    const r = mem.findLesson({ tags: ['critical'] });
    assert.equal(r.length, 1);
    assert.ok(r[0].content.includes('L1'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 findLesson: filter by minConfidence', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    mem.saveLesson({ content: 'low', confidence: 0.2 });
    mem.saveLesson({ content: 'high', confidence: 0.9 });
    const r = mem.findLesson({ minConfidence: 0.5 });
    assert.equal(r.length, 1);
    assert.equal(r[0].content, 'high');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 findLesson: sort by confidence desc', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    mem.saveLesson({ content: 'A', confidence: 0.5 });
    mem.saveLesson({ content: 'B', confidence: 0.9 });
    mem.saveLesson({ content: 'C', confidence: 0.7 });
    const r = mem.findLesson({});
    assert.equal(r[0].content, 'B');
    assert.equal(r[1].content, 'C');
    assert.equal(r[2].content, 'A');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 reinforce: boosts confidence by 0.05', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    const a = mem.saveLesson({ content: 'X', confidence: 0.5 });
    const reinforced = mem.reinforce(a.id);
    assert.equal(reinforced.confidence, 0.55);
    assert.equal(reinforced.reinforced_count, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 reinforce: caps at MAX_CONFIDENCE 0.95', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    const a = mem.saveLesson({ content: 'X', confidence: 0.94 });
    const reinforced = mem.reinforce(a.id);
    assert.equal(reinforced.confidence, 0.95);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 reinforce: returns null for unknown id', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    const r = mem.reinforce('does-not-exist');
    assert.equal(r, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 decayStale: returns decayed/removed counts', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    mem.saveLesson({ content: 'Y', confidence: 0.5 });
    // No way to backdate in current API, so just call and check structure
    const result = mem.decayStale();
    assert.ok(typeof result.decayed === 'number');
    assert.ok(typeof result.removed === 'number');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 getStats: aggregates by confidence buckets', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    mem.saveLesson({ content: 'h1', confidence: 0.9 });
    mem.saveLesson({ content: 'h2', confidence: 0.7 });
    mem.saveLesson({ content: 'm1', confidence: 0.5 });
    mem.saveLesson({ content: 'l1', confidence: 0.1 });
    const stats = mem.getStats();
    assert.equal(stats.total, 4);
    assert.equal(stats.byConfidence.high, 2);
    assert.equal(stats.byConfidence.medium, 1);
    assert.equal(stats.byConfidence.low, 1);
    assert.ok(stats.avg_confidence > 0.5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 getStats: empty store returns zero stats', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    const stats = mem.getStats();
    assert.equal(stats.total, 0);
    assert.equal(stats.avg_confidence, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.1 saveLesson: throws on missing content', () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    assert.throws(() => mem.saveLesson({ content: '' }));
    assert.throws(() => mem.saveLesson({}));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================
// Phase 10.3 Quarterly-Audit Tests
// ============================================================

test('Phase 10.3 runQuarterlyAudit: returns html and json', async () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    mem.saveLesson({ content: 'Test', confidence: 0.8 });
    const result = await runQuarterlyAudit({
      cacheDir: dir,
      outputDir: join(dir, 'reports'),
      memoryStore: mem,
    });
    assert.ok(result.html);
    assert.ok(result.html.includes('Quarterly Audit'));
    assert.ok(result.json);
    assert.ok(result.json.audit_date);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.3 runQuarterlyAudit: includes bug_regression section', async () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    const result = await runQuarterlyAudit({
      cacheDir: dir,
      outputDir: null,
      memoryStore: mem,
    });
    assert.ok(result.json.sections.bug_regression);
    assert.ok(Array.isArray(result.json.sections.bug_regression));
    assert.ok(result.json.sections.bug_regression.length >= 7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.3 runQuarterlyAudit: action_items generated for low-confidence', async () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    for (let i = 0; i < 6; i++) {
      mem.saveLesson({ content: `low${i}`, confidence: 0.1 });
    }
    const result = await runQuarterlyAudit({
      cacheDir: dir,
      outputDir: null,
      memoryStore: mem,
    });
    assert.ok(result.json.action_items.length > 0);
    assert.ok(
      result.json.action_items.some(i => i.includes('low-confidence')),
      `expected low-confidence action item, got: ${result.json.action_items.join('; ')}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.3 runQuarterlyAudit: writes HTML and JSON to outputDir', async () => {
  const dir = freshCacheDir();
  try {
    const mem = createMemoryStore({ cacheDir: dir });
    const outDir = join(dir, 'reports');
    await runQuarterlyAudit({
      cacheDir: dir,
      outputDir: outDir,
      memoryStore: mem,
    });
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(existsSync(join(outDir, `quarterly-${today}.html`)));
    assert.ok(existsSync(join(outDir, `quarterly-${today}.json`)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.3 runQuarterlyAudit: performance trend regression detection', async () => {
  const dir = freshCacheDir();
  try {
    const metricsDir = join(dir, 'metrics');
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(join(metricsDir, '2026-01-01.json'), JSON.stringify({ total_duration_ms: 1000 }));
    writeFileSync(join(metricsDir, '2026-06-15.json'), JSON.stringify({ total_duration_ms: 1500 }));

    const result = await runQuarterlyAudit({
      cacheDir: dir,
      outputDir: null,
    });
    assert.equal(result.json.sections.performance.trend, 'regression');
    assert.equal(result.json.sections.performance.change_pct, 50);
    assert.ok(
      result.json.action_items.some(i => i.includes('Performance regressed')),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 10.3 runQuarterlyAudit: works without memoryStore', async () => {
  const dir = freshCacheDir();
  try {
    const result = await runQuarterlyAudit({
      cacheDir: dir,
      outputDir: null,
    });
    assert.ok(result.json);
    assert.equal(result.json.sections.memory, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
