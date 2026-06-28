// tests/screenshot-test4.mjs
// Phase 9.3: Screenshot test4.nick-webdesign.de Hero + Full-Page

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'tests', 'live-screenshots');

await fs.mkdir(OUT, { recursive: true });

const URL = 'https://test4.nick-webdesign.de/';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (compatible; V4PipelineVisualDiff/1.0)',
});
const page = await ctx.newPage();

console.log(`[i] Navigating to ${URL}`);
const t0 = Date.now();
const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
console.log(`[i] HTTP ${resp.status()} in ${Date.now() - t0}ms`);

// Wait for fonts
await page.evaluate(() => document.fonts.ready);

// Hero screenshot (1440x900 viewport)
const hero = path.join(OUT, 'test4-hero-1440x900.png');
await page.screenshot({ path: hero, fullPage: false });
const heroStat = await fs.stat(hero);
console.log(`[i] Hero: ${hero} (${heroStat.size} bytes)`);

// Full-page screenshot
const full = path.join(OUT, 'test4-fullpage.png');
await page.screenshot({ path: full, fullPage: true });
const fullStat = await fs.stat(full);
console.log(`[i] Full: ${full} (${fullStat.size} bytes)`);

// Title + meta
const title = await page.title();
const h1 = await page.locator('h1').first().textContent().catch(() => null);
console.log(`[i] <title>: ${title}`);
console.log(`[i] <h1>: ${h1?.slice(0, 100) || '(none)'}`);

await browser.close();
console.log('[ok] Screenshots saved');
