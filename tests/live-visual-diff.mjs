/**
 * tests/live-visual-diff.mjs
 * Live-Test: Visual-Diff-Engine (hashImage, compareImages mit bereits dekodierten Pixels).
 */
import { compareImages, hashImage, decodePng } from '../scripts/lib/visual-diff.js';

function makePixels(w, h, fill) {
  const p = new Uint8Array(w * h * 4);
  for (let i = 0; i < p.length; i += 4) {
    p[i] = fill[0]; p[i+1] = fill[1]; p[i+2] = fill[2]; p[i+3] = fill[3];
  }
  return p;
}

function setPixel(p, w, x, y, rgba) {
  const i = (y * w + x) * 4;
  p[i] = rgba[0]; p[i+1] = rgba[1]; p[i+2] = rgba[2]; p[i+3] = rgba[3];
}

const W = 4, H = 4;

// Test 1: Identische Bilder (schwarz/schwarz)
const blackA = makePixels(W, H, [0, 0, 0, 255]);
const blackB = makePixels(W, H, [0, 0, 0, 255]);
const img = (p) => ({ width: W, height: H, channels: 4, pixels: p });

console.log('=== Compare (identisches Schwarz vs Schwarz) ===');
const r1 = await compareImages({ framer: img(blackA), wp: img(blackB) });
console.log(JSON.stringify(r1, null, 2));
console.log(`expected: score=100, passed=true → ${r1.score === 100 && r1.passed ? 'PASS' : 'FAIL'}`);

// Test 2: Komplett unterschiedlich (schwarz vs weiß)
const whiteB = makePixels(W, H, [255, 255, 255, 255]);
console.log('\n=== Compare (Schwarz vs Weiß, 16/16 anders) ===');
const r2 = await compareImages({ framer: img(blackA), wp: img(whiteB), threshold: 0.1 });
console.log(JSON.stringify(r2, null, 2));
console.log(`expected: score=0, passed=false → ${r2.score === 0 && !r2.passed ? 'PASS' : 'FAIL'}`);

// Test 3: 1 Pixel anders (threshold 0.1 erlaubt kleine Diff)
const almostSame = makePixels(W, H, [0, 0, 0, 255]);
setPixel(almostSame, W, 0, 0, [255, 255, 255, 255]);
console.log('\n=== Compare (Schwarz vs 1 weiß, 15/16 gleich) ===');
const r3 = await compareImages({ framer: img(blackA), wp: img(almostSame), threshold: 0.1 });
console.log(JSON.stringify(r3, null, 2));
console.log(`expected: score=93.75 (15/16), passed=true → ${r3.score === 93.75 && r3.passed ? 'PASS' : 'FAIL'}`);

// Test 4: Hash-Determinismus (mit decoded image, nicht raw buffer)
console.log('\n=== Hash-Determinismus ===');
const h1 = hashImage(img(blackA));
const h2 = hashImage(img(blackA));
const h3 = hashImage(img(whiteB));
console.log(`h1 == h2 (same input): ${h1 === h2 ? 'PASS' : 'FAIL'}`);
console.log(`h1 != h3 (diff input): ${h1 !== h3 ? 'PASS' : 'FAIL'}`);
console.log(`h1 length = 16: ${h1.length === 16 ? 'PASS' : 'FAIL'} (got ${h1.length})`);

// Test 5: Decode-Validate
console.log('\n=== Decode (echter PNG-Buffer) ===');
// Minimal gültiges 1x1 RGBA PNG
const minimalPng = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR length 13
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
  0x08, 0x06, 0x00, 0x00, 0x00, // 8-bit, RGBA
  0x1F, 0x15, 0xC4, 0x89, // CRC
  0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT length 12
  0x08, 0x99, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01, // deflate data
  0x27, 0xDE, 0xDF, 0x5C, // CRC
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND
  0xAE, 0x42, 0x60, 0x82, // CRC
]);
try {
  const decoded = decodePng(minimalPng);
  console.log(`decoded: ${decoded.width}x${decoded.height} channels=${decoded.channels}`);
  console.log(`pixel[0] = [${decoded.pixels[0]}, ${decoded.pixels[1]}, ${decoded.pixels[2]}, ${decoded.pixels[3]}]`);
  console.log('decode PNG: PASS');
} catch (e) {
  console.log(`decode PNG: FAIL (${e.message})`);
}
