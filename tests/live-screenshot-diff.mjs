// tests/live-screenshot-diff.mjs
// Verifiziert Visual-Diff mit echten test4-Screenshots

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareImages, decodePng } from '../scripts/lib/visual-diff.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'tests', 'live-screenshots');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('https://test4.nick-webdesign.de/', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const shot1 = path.join(OUT, 'live-diff-1.png');
const shot2 = path.join(OUT, 'live-diff-2.png');
const mutated = path.join(OUT, 'live-diff-mutated.png');

await page.screenshot({ path: shot1 });
await page.screenshot({ path: shot2 });

// Mutate 5% of pixels (simulate a real diff)
import { readFile, writeFile } from 'node:fs/promises';
const buf = await readFile(shot1);
const img = decodePng(buf);
const { width, height, pixels } = img;
const numMutate = Math.floor(width * height * 0.05);
for (let i = 0; i < numMutate; i++) {
  const idx = Math.floor(Math.random() * width * height) * (pixels.length / (width * height));
  pixels[idx] = 255;
  pixels[idx + 1] = 0;
  pixels[idx + 2] = 0;
}

// Re-encode the mutated pixels back as PNG via re-screenshot + manual mutation
// For simplicity, save as new image and load back
// PNG encoding is not exposed, so use Playwright to do a clipped screenshot with red overlay
await page.evaluate(() => {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:100px;left:100px;width:300px;height:300px;background:red;z-index:99999';
  div.id = 'mutated-overlay';
  document.body.appendChild(div);
});
await page.screenshot({ path: mutated });

await browser.close();

// Now compare: 1 vs 2 (should be ~100% match) and 1 vs mutated (should drop to ~85-95%)
const buf1 = await readFile(shot1);
const buf2 = await readFile(shot2);
const bufM = await readFile(mutated);

const r1 = compareImages({ framer: buf1, wp: buf2, passScore: 95 });
const r2 = compareImages({ framer: buf1, wp: bufM, passScore: 95 });

console.log(`[i] Identical reloads:   score=${r1.score}%, passed=${r1.passed}, diff=${r1.diffPixels}/${r1.totalPixels}px`);
console.log(`[i] With red overlay:    score=${r2.score}%, passed=${r2.passed}, diff=${r2.diffPixels}/${r2.totalPixels}px`);

if (r1.passed && !r2.passed) {
  console.log('[ok] Visual-Diff reagiert korrekt: gleiche Bilder = high score, Mutation = low score');
  process.exit(0);
} else {
  console.log('[FAIL] Erwartet: r1.passed=true && r2.passed=false');
  process.exit(1);
}
