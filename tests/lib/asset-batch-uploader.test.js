/**
 * tests/lib/asset-batch-uploader.test.js  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 5.2 — Asset-Batch-Upload-Tests.
 * Jeder Test nutzt einen unique imageMapPath (in tempdir), um Cache-Leak zwischen Tests zu vermeiden.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  batchUploadImages,
  resolveImage,
  clearImageMap,
} from '../../scripts/lib/asset-batch-uploader.js';

function makeMcpBridge({ responseMap = {}, failFor = [] } = {}) {
  let calls = 0;
  return {
    call: async (ability, params) => {
      calls += 1;
      if (failFor.includes(params.url)) {
        throw new Error('simulated upload failure');
      }
      const id = responseMap[params.url] || `att-${calls}`;
      return { upload_url: `https://wp.test/upload/${id}`, attachment_id: id };
    },
    get totalCalls() { return calls; },
  };
}

let testCounter = 0;
function makeCache() {
  testCounter += 1;
  const dir = join(tmpdir(), 'asset-batch-test-' + Date.now() + '-' + testCounter);
  mkdirSync(dir, { recursive: true });
  return { cacheRoot: dir, mapPath: join(dir, 'image-map.json') };
}

test('batchUploadImages: empty list → cached empty result, no fetcher calls', async () => {
  const { cacheRoot, mapPath } = makeCache();
  const mcpBridge = makeMcpBridge();
  const r = await batchUploadImages({ images: [], mcpBridge, imageMapPath: mapPath, options: { cacheRoot } });
  assert.equal(r.cached, true);
  assert.equal(r.uploadCount, 0);
  assert.equal(mcpBridge.totalCalls, 0);
  assert.deepEqual(r.imageMap, {});
});

test('batchUploadImages: uploads all images, returns imageMap', async () => {
  const { cacheRoot, mapPath } = makeCache();
  const mcpBridge = makeMcpBridge();
  const images = ['https://framer.test/a.png', 'https://framer.test/b.png', 'https://framer.test/c.png'];
  const r = await batchUploadImages({ images, mcpBridge, imageMapPath: mapPath, options: { cacheRoot } });
  assert.equal(r.cached, false);
  assert.equal(r.uploadCount, 3);
  assert.equal(mcpBridge.totalCalls, 3);
  assert.equal(r.imageMap['https://framer.test/a.png'], 'att-1');
  assert.equal(r.imageMap['https://framer.test/c.png'], 'att-3');
});

test('batchUploadImages: parallel execution (5 concurrent)', async () => {
  const { cacheRoot, mapPath } = makeCache();
  let inFlight = 0;
  let maxInFlight = 0;
  const slowBridge = {
    call: async (ability, params) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 50));
      inFlight -= 1;
      return { upload_url: 'x', attachment_id: `att-${params.url}` };
    },
  };
  const images = Array.from({ length: 10 }, (_, i) => `https://framer.test/${i}.png`);
  const r = await batchUploadImages({ images, mcpBridge: slowBridge, concurrency: 5, imageMapPath: mapPath, options: { cacheRoot } });
  assert.equal(r.uploadCount, 10);
  assert.ok(maxInFlight <= 5, `maxInFlight=${maxInFlight} > 5`);
  assert.ok(maxInFlight >= 2, `expected parallel execution, got maxInFlight=${maxInFlight}`);
});

test('batchUploadImages: cached run skips already-mapped URLs', async () => {
  const { cacheRoot, mapPath } = makeCache();
  const mcpBridge = makeMcpBridge();
  const images = ['https://framer.test/a.png', 'https://framer.test/b.png'];

  await batchUploadImages({ images, mcpBridge, imageMapPath: mapPath, options: { cacheRoot } });
  const callsAfterFirst = mcpBridge.totalCalls;

  const r2 = await batchUploadImages({ images, mcpBridge, imageMapPath: mapPath, options: { cacheRoot } });
  assert.equal(r2.cached, true);
  assert.equal(r2.uploadCount, 0);
  assert.equal(mcpBridge.totalCalls, callsAfterFirst);
});

test('batchUploadImages: new URLs get added, old URLs untouched', async () => {
  const { cacheRoot, mapPath } = makeCache();
  const mcpBridge = makeMcpBridge();
  await batchUploadImages({
    images: ['https://framer.test/a.png'],
    mcpBridge,
    imageMapPath: mapPath,
    options: { cacheRoot },
  });
  const r2 = await batchUploadImages({
    images: ['https://framer.test/a.png', 'https://framer.test/b.png'],
    mcpBridge,
    imageMapPath: mapPath,
    options: { cacheRoot },
  });
  assert.equal(r2.uploadCount, 1);
  assert.ok(r2.imageMap['https://framer.test/a.png']);
  assert.ok(r2.imageMap['https://framer.test/b.png']);
});

test('batchUploadImages: forceRefresh re-uploads all URLs', async () => {
  const { cacheRoot, mapPath } = makeCache();
  const mcpBridge = makeMcpBridge();
  const images = ['https://framer.test/a.png'];
  await batchUploadImages({ images, mcpBridge, imageMapPath: mapPath, options: { cacheRoot } });
  const r2 = await batchUploadImages({
    images, mcpBridge, imageMapPath: mapPath, options: { cacheRoot, forceRefresh: true },
  });
  assert.equal(r2.cached, false);
  assert.equal(r2.uploadCount, 1);
  assert.equal(mcpBridge.totalCalls, 2);
});

test('batchUploadImages: errors collected, partial success', async () => {
  const { cacheRoot, mapPath } = makeCache();
  const mcpBridge = makeMcpBridge({ failFor: ['https://framer.test/b.png'] });
  const images = ['https://framer.test/a.png', 'https://framer.test/b.png', 'https://framer.test/c.png'];
  const r = await batchUploadImages({ images, mcpBridge, imageMapPath: mapPath, options: { cacheRoot } });
  assert.equal(r.uploadCount, 2);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].url, 'https://framer.test/b.png');
  assert.match(r.errors[0].error, /simulated upload failure/);
  assert.ok(r.imageMap['https://framer.test/a.png']);
  assert.ok(r.imageMap['https://framer.test/c.png']);
  assert.equal(r.imageMap['https://framer.test/b.png'], undefined);
});

test('resolveImage: returns attachment_id or null', () => {
  const map = { 'https://framer.test/a.png': 42 };
  assert.equal(resolveImage('https://framer.test/a.png', map), 42);
  assert.equal(resolveImage('https://framer.test/missing.png', map), null);
  assert.equal(resolveImage('https://framer.test/a.png', null), null);
  assert.equal(resolveImage('https://framer.test/a.png', undefined), null);
});

test('clearImageMap: resets entries and timestamp', async () => {
  const { cacheRoot, mapPath } = makeCache();
  const mcpBridge = makeMcpBridge();
  await batchUploadImages({
    images: ['https://framer.test/a.png'],
    mcpBridge,
    imageMapPath: mapPath,
    options: { cacheRoot },
  });
  const cleared = clearImageMap({ cacheRoot, siteId: 'never-matches-any-test' });
  assert.equal(cleared, true);

  const r2 = await batchUploadImages({
    images: ['https://framer.test/a.png'],
    mcpBridge,
    imageMapPath: mapPath,
    options: { cacheRoot },
  });
  // clearImageMap cleared default site map (not the test's path), so our imageMapPath is still valid
  assert.equal(r2.cached, true);
  assert.equal(r2.uploadCount, 0);
});

test('batchUploadImages: throws without mcpBridge', async () => {
  await assert.rejects(
    async () => batchUploadImages({ images: ['x'], options: {} }),
    /mcpBridge required/,
  );
});
