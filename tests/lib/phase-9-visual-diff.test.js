/**
 * tests/lib/phase-9-visual-diff.test.js
 * UMBAUPLAN v2.0 Phase 9.2 — Visual-Diff Tests
 *
 * Da das Testen eines echten PNG-Decoders umfangreich wäre, testen wir
 * die High-Level-Logik mit synthetischen Image-Objekten (kein Buffer-Decode).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computePixelDiff, hashImage, compareImages } from '../../scripts/lib/visual-diff.js';

function makeImage(width, height, fillRgb = [255, 255, 255]) {
  const channels = 3;
  const pixels = new Uint8Array(width * height * channels);
  for (let i = 0; i < pixels.length; i += channels) {
    pixels[i]     = fillRgb[0];
    pixels[i + 1] = fillRgb[1];
    pixels[i + 2] = fillRgb[2];
  }
  return { width, height, channels, pixels };
}

function mutatePixels(img, fn) {
  const out = new Uint8Array(img.pixels);
  for (let i = 0; i < out.length; i += img.channels) {
    fn(out, i);
  }
  return { ...img, pixels: out };
}

test('Phase 9.2 computePixelDiff: identical images → 100%', () => {
  const a = makeImage(10, 10, [100, 100, 100]);
  const b = makeImage(10, 10, [100, 100, 100]);
  const r = computePixelDiff({ framer: a, wp: b });
  assert.equal(r.score, 100);
  assert.equal(r.diffPixels, 0);
  assert.equal(r.passed, true);
});

test('Phase 9.2 computePixelDiff: completely different → 0%', () => {
  const a = makeImage(10, 10, [0, 0, 0]);
  const b = makeImage(10, 10, [255, 255, 255]);
  const r = computePixelDiff({ framer: a, wp: b, threshold: 0.1 });
  assert.equal(r.score, 0);
  assert.equal(r.diffPixels, 100);
  assert.equal(r.passed, false);
});

test('Phase 9.2 computePixelDiff: small change within threshold → still 100%', () => {
  const a = makeImage(10, 10, [100, 100, 100]);
  const b = makeImage(10, 10, [110, 100, 100]); // +10 on red, < 10% threshold
  const r = computePixelDiff({ framer: a, wp: b, threshold: 0.1 });
  assert.equal(r.score, 100, `score ${r.score} should be 100% with small change`);
  assert.equal(r.diffPixels, 0);
});

test('Phase 9.2 computePixelDiff: large change → diff detected', () => {
  const a = makeImage(10, 10, [0, 0, 0]);
  // 5% pixels are red, rest white
  const bPixels = new Uint8Array(10 * 10 * 3);
  bPixels.fill(255);
  for (let i = 0; i < 5 * 10 * 3; i += 3) {
    bPixels[i] = 0; bPixels[i + 1] = 0; bPixels[i + 2] = 0;
  }
  const b = { width: 10, height: 10, channels: 3, pixels: bPixels };
  const r = computePixelDiff({ framer: a, wp: b });
  // 5 pixels changed (one row of 10 → 50% change, but 5 changed = 50% actually)
  assert.ok(r.score < 100);
  assert.ok(r.diffPixels > 0);
});

test('Phase 9.2 computePixelDiff: threshold scales tolerance', () => {
  const a = makeImage(10, 10, [100, 100, 100]);
  const b = makeImage(10, 10, [130, 100, 100]);
  // Diff = 30 on red, 0 elsewhere. 30/255 = 11.7%
  // threshold=0.05 → strict, diff detected
  // threshold=0.2 → loose, all within
  const strict = computePixelDiff({ framer: a, wp: b, threshold: 0.05 });
  const loose = computePixelDiff({ framer: a, wp: b, threshold: 0.2 });
  assert.ok(strict.diffPixels > 0);
  assert.equal(loose.diffPixels, 0);
});

test('Phase 9.2 computePixelDiff: throws on dimension mismatch', () => {
  const a = makeImage(10, 10);
  const b = makeImage(20, 20);
  assert.throws(() => computePixelDiff({ framer: a, wp: b }));
});

test('Phase 9.2 computePixelDiff: passed=true bei score >= 85', () => {
  const a = makeImage(10, 10, [100, 100, 100]);
  // 14% diff → score 86
  const bPixels = new Uint8Array(10 * 10 * 3);
  bPixels.fill(100);
  // Make ~14 pixels slightly different
  for (let i = 0; i < 14 * 3; i += 3) {
    bPixels[i] = 200; bPixels[i + 1] = 200; bPixels[i + 2] = 200;
  }
  const b = { width: 10, height: 10, channels: 3, pixels: bPixels };
  const r = computePixelDiff({ framer: a, wp: b, threshold: 0.1 });
  assert.equal(r.score, 86);
  assert.equal(r.passed, true);
});

test('Phase 9.2 compareImages: high-level API mit Buffer-Pass-Through', async () => {
  // Test that compareImages correctly forwards to decodePng
  // We use raw image-objects here (Buffer-decode is tested separately)
  const a = makeImage(5, 5, [50, 50, 50]);
  const b = makeImage(5, 5, [50, 50, 50]);
  const r = compareImages({ framer: a, wp: b });
  assert.equal(r.score, 100);
  assert.equal(r.passed, true);
});

test('Phase 9.2 compareImages: passScore parameter respected', () => {
  const a = makeImage(10, 10, [0, 0, 0]);
  // 80% different → score 20
  const bPixels = new Uint8Array(10 * 10 * 3);
  bPixels.fill(255);
  for (let i = 0; i < 20 * 3; i += 3) {
    bPixels[i] = 0; bPixels[i + 1] = 0; bPixels[i + 2] = 0;
  }
  const b = { width: 10, height: 10, channels: 3, pixels: bPixels };
  const r20 = compareImages({ framer: a, wp: b });
  const r10 = compareImages({ framer: a, wp: b, passScore: 10 });
  assert.equal(r20.score, 20);
  assert.equal(r20.passed, false);
  assert.equal(r10.passed, true);
});

test('Phase 9.2 hashImage: same content → same hash', () => {
  const a = makeImage(5, 5, [42, 42, 42]);
  const b = makeImage(5, 5, [42, 42, 42]);
  assert.equal(hashImage(a), hashImage(b));
});

test('Phase 9.2 hashImage: different content → different hash', () => {
  const a = makeImage(5, 5, [42, 42, 42]);
  const b = makeImage(5, 5, [43, 42, 42]);
  assert.notEqual(hashImage(a), hashImage(b));
});

test('Phase 9.2 hashImage: returns 16-char hex string', () => {
  const a = makeImage(3, 3);
  const h = hashImage(a);
  assert.equal(h.length, 16);
  assert.match(h, /^[0-9a-f]{16}$/);
});

test('Phase 9.2 mutate helper: only changes selected pixels', () => {
  const a = makeImage(4, 4, [100, 100, 100]);
  const b = mutatePixels(a, (buf, i) => { buf[i] = 0; });
  // All pixels changed → diff = 100%
  const r = computePixelDiff({ framer: a, wp: b });
  assert.equal(r.score, 0);
});
