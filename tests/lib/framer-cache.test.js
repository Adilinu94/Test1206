/**
 * tests/lib/framer-cache.test.js  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 5.1 — Framer-Cache-Tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  cachedGetProjectXml,
  cachedGetNodeXml,
  cachedGetColorStyles,
  cachedGetTextStyles,
  clearFramerCache,
  getFramerCacheStats,
} from '../../scripts/lib/framer-cache.js';

function makeTmpCache() {
  const dir = join(tmpdir(), 'framer-cache-test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('cachedGetProjectXml: miss → fetcher called, cache written', async () => {
  const cacheRoot = makeTmpCache();
  let calls = 0;
  const fetcher = async () => { calls += 1; return { root: { id: 'abc', children: [1, 2, 3] } }; };

  const r1 = await cachedGetProjectXml({ projectId: 'p1', fetcher, options: { cacheRoot } });
  assert.equal(r1.cached, false);
  assert.equal(calls, 1);
  assert.deepEqual(r1.xml.root, { id: 'abc', children: [1, 2, 3] });
  assert.ok(existsSync(r1.cacheFile));
});

test('cachedGetProjectXml: hit → second call does not invoke fetcher', async () => {
  const cacheRoot = makeTmpCache();
  let calls = 0;
  const fetcher = async () => { calls += 1; return { root: { id: 'a' } }; };

  await cachedGetProjectXml({ projectId: 'p2', fetcher, options: { cacheRoot } });
  const r2 = await cachedGetProjectXml({ projectId: 'p2', fetcher, options: { cacheRoot } });
  assert.equal(r2.cached, true);
  assert.equal(calls, 1);
  assert.deepEqual(r2.xml.root, { id: 'a' });
});

test('cachedGetNodeXml: per-nodeId separate cache', async () => {
  const cacheRoot = makeTmpCache();
  let a1Calls = 0, a2Calls = 0;
  await cachedGetNodeXml({
    projectId: 'p3',
    nodeId: 'n1',
    fetcher: async () => { a1Calls += 1; return { id: 'n1', value: 'X' }; },
    options: { cacheRoot },
  });
  await cachedGetNodeXml({
    projectId: 'p3',
    nodeId: 'n2',
    fetcher: async () => { a2Calls += 1; return { id: 'n2', value: 'Y' }; },
    options: { cacheRoot },
  });
  const r1 = await cachedGetNodeXml({
    projectId: 'p3',
    nodeId: 'n1',
    fetcher: async () => { throw new Error('should not be called'); },
    options: { cacheRoot },
  });
  assert.equal(r1.cached, true);
  assert.equal(a1Calls, 1);
  assert.equal(a2Calls, 1);
});

test('cachedGetColorStyles/TextStyles: single-file cache', async () => {
  const cacheRoot = makeTmpCache();
  let calls = 0;
  const fetcher = async () => { calls += 1; return [{ name: 'Primary', color: '#F00' }]; };

  const r1 = await cachedGetColorStyles({ projectId: 'p4', fetcher, options: { cacheRoot } });
  assert.equal(r1.cached, false);
  const r2 = await cachedGetColorStyles({ projectId: 'p4', fetcher, options: { cacheRoot } });
  assert.equal(r2.cached, true);
  assert.equal(calls, 1);
  assert.deepEqual(r2.styles, [{ name: 'Primary', color: '#F00' }]);
});

test('forceRefresh: bypasses cache', async () => {
  const cacheRoot = makeTmpCache();
  let calls = 0;
  const fetcher = async () => { calls += 1; return { v: calls }; };

  await cachedGetProjectXml({ projectId: 'p5', fetcher, options: { cacheRoot } });
  const r2 = await cachedGetProjectXml({
    projectId: 'p5', fetcher, options: { cacheRoot, forceRefresh: true },
  });
  assert.equal(r2.cached, false);
  assert.equal(calls, 2);
});

test('exportDir mtime invalidates cache', async () => {
  const cacheRoot = makeTmpCache();
  const exportDir = join(cacheRoot, 'export');
  mkdirSync(exportDir, { recursive: true });
  const htmlFile = join(exportDir, 'index.html');
  writeFileSync(htmlFile, '<html></html>');

  let calls = 0;
  const fetcher = async () => { calls += 1; return { v: calls }; };

  await cachedGetProjectXml({ projectId: 'p6', fetcher, options: { cacheRoot, exportDir } });
  const r1 = await cachedGetProjectXml({ projectId: 'p6', fetcher, options: { cacheRoot, exportDir } });
  assert.equal(r1.cached, true, 'first cache should hit');

  // Force exportDir mtime to be strictly greater than cache mtime
  const past = new Date(Date.now() - 10_000);
  const future = new Date(Date.now() + 5_000);
  const { utimesSync } = await import('fs');
  utimesSync(exportDir, past, future);
  utimesSync(htmlFile, past, future);

  const r2 = await cachedGetProjectXml({ projectId: 'p6', fetcher, options: { cacheRoot, exportDir } });
  assert.equal(r2.cached, false);
  assert.equal(calls, 2);
});

test('clearFramerCache: removes project dir', async () => {
  const cacheRoot = makeTmpCache();
  await cachedGetProjectXml({
    projectId: 'p7',
    fetcher: async () => ({ v: 1 }),
    options: { cacheRoot },
  });
  const result = clearFramerCache({ cacheRoot, projectId: 'p7' });
  assert.equal(result.removed, 1);
  assert.equal(getFramerCacheStats({ cacheRoot }).total_files, 0);
});

test('getFramerCacheStats: aggregates per-project', async () => {
  const cacheRoot = makeTmpCache();
  await cachedGetProjectXml({ projectId: 'a', fetcher: async () => ({ a: 1 }), options: { cacheRoot } });
  await cachedGetProjectXml({ projectId: 'b', fetcher: async () => ({ b: 2 }), options: { cacheRoot } });

  const stats = getFramerCacheStats({ cacheRoot });
  assert.equal(stats.exists, true);
  assert.equal(stats.total_files, 2);
  assert.equal(stats.per_project.a.files, 1);
  assert.equal(stats.per_project.b.files, 1);
  assert.ok(stats.total_bytes > 0);
});

test('cachedGetProjectXml: throws without fetcher', async () => {
  await assert.rejects(
    async () => cachedGetProjectXml({ projectId: 'p8', options: {} }),
    /fetcher is required/,
  );
});
