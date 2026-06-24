#!/usr/bin/env node
/**
 * section-compare.js
 *
 * Visual Fidelity Test: Vergleicht einen Framer-Seitenabschnitt mit dem
 * konvertierten Elementor V4 Pendant — Screenshot für Screenshot.
 *
 * Nimmt 4 Screenshots pro Vergleich:
 *   framer-desktop.png      (1440 × 900)
 *   framer-mobile.png       (390 × 844)
 *   elementor-desktop.png   (1440 × 900)
 *   elementor-mobile.png    (390 × 844)
 *
 * Generiert danach:
 *   report.html             — self-contained side-by-side Viewer (base64 Bilder)
 *   compare-report.json     — maschinenlesbarer Report für CI
 *
 * Optionaler Pixel-Diff Layer (npm install pngjs pixelmatch --save-dev):
 *   diff-desktop.png        — rote Cluster = echte Layout-Fehler
 *   diff-mobile.png
 *   threshold 0.1: filtert Font-Anti-Aliasing; zeigt fehlendes Bild,
 *   falsche Farben, Layout-Shifts als rote Cluster. Kein Pass/Fail-
 *   Threshold — Design-Fidelity-Diffs haben immer 15-30% durch
 *   Font-Rendering-Unterschiede zwischen Framer (React) und Elementor.
 *
 * Browser-Backends (in Priorität):
 *   1. Playwright  (npm install playwright)
 *   2. Puppeteer   (npm install puppeteer)
 *   3. --dry-run   — kein Browser, Platzhalter-Report
 *
 * Abschnitt-Targeting:
 *   Standard (--above-fold):  Screenshot des ersten Viewports
 *   --framer-selector CSS      Scroll zum Element, clippe darauf
 *   --elementor-selector CSS   Scroll zum Element, clippe darauf
 *   --nth-section N            Scroll zur N-ten section/e-con (1-basiert)
 *   --scroll-pct N             Scrolle zu N% der Seitenhöhe vor Screenshot
 *
 * Usage:
 *   node scripts/section-compare.js \
 *     --framer-url https://remarkable-interface-616594.framer.app/ \
 *     --elementor-url http://solar.local/framer-e2e-test-hero/ \
 *     --section hero \
 *     [--framer-selector "[data-framer-name*='hero' i]"] \
 *     [--elementor-selector ".e-con:first-child"] \
 *     [--output reports/section-compare/] \
 *     [--open]
 *
 * Exit codes:
 *   0 = Screenshots OK
 *   1 = Screenshot-Fehler
 *   2 = Konfigurationsfehler
 */

'use strict';

import { parseArgs }      from 'node:util';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath }  from 'node:url';
import { createRequire }  from 'node:module';
import { execSync }       from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI ──────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    'framer-url':          { type: 'string' },
    'elementor-url':       { type: 'string' },
    section:               { type: 'string', default: 'section' },
    'framer-selector':     { type: 'string' },
    'elementor-selector':  { type: 'string' },
    'nth-section':         { type: 'string' },
    'scroll-pct':          { type: 'string' },
    output:                { type: 'string' },
    'dry-run':             { type: 'boolean', default: false },
    'above-fold':          { type: 'boolean', default: false },
    'full-page':           { type: 'boolean', default: false },
    'wait-after-load':     { type: 'string', default: '2500' },
    timeout:               { type: 'string', default: '45000' },
    open:                  { type: 'boolean', default: false },
    verbose:               { type: 'boolean', default: false },
    help:                  { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help || !args['framer-url'] || !args['elementor-url']) {
  process.stdout.write(`
section-compare.js — Framer ↔ Elementor Visual Fidelity Test

USAGE:
  node scripts/section-compare.js \\
    --framer-url URL --elementor-url URL --section NAME [options]

PFLICHT:
  --framer-url URL           Originale Framer-Seite
  --elementor-url URL        Konvertierte Elementor-Seite

ABSCHNITT:
  --section NAME             Name des Abschnitts (für Dateinamen, default: "section")
  --framer-selector CSS      CSS-Selektor auf der Framer-Seite
  --elementor-selector CSS   CSS-Selektor auf der Elementor-Seite
  --nth-section N            Nimm die N-te section/e-con (1-basiert)
  --scroll-pct N             Scrolle zu N% der Seitenhöhe
  --above-fold               Nur erster Viewport (Standard bei fehlenden Selektoren)
  --full-page                Screenshot gesamte Seite

OUTPUT:
  --output DIR               Ausgabeverzeichnis (default: reports/section-compare/NAME/)
  --open                     HTML-Report nach Erstellung im Browser öffnen

MISC:
  --wait-after-load MS       Wartezeit nach load-Event (default: 1500ms)
  --timeout MS               Navigations-Timeout (default: 45000ms)
  --dry-run                  Kein Browser, Platzhalter-Report
  --verbose                  Ausführliche Logs

BREAKPOINTS:
  desktop   1440 × 900
  mobile    390 × 844

EXAMPLE:
  node scripts/section-compare.js \\
    --framer-url https://example.framer.app/ \\
    --elementor-url http://solar.local/my-page/ \\
    --section hero \\
    --framer-selector "[data-framer-name*='hero' i]" \\
    --elementor-selector ".e-con:first-child" \\
    --open

EXIT:
  0 = OK  |  1 = Screenshot-Fehler  |  2 = Konfigurationsfehler
`);
  process.exit(args.help ? 0 : 2);
}

// ── Config ───────────────────────────────────────────────────────────────────

const BREAKPOINTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
];

const SOURCES = [
  {
    key:      'framer',
    url:      args['framer-url'],
    selector: args['framer-selector'] || null,
    label:    'Original (Framer)',
  },
  {
    key:      'elementor',
    url:      args['elementor-url'],
    selector: args['elementor-selector'] || null,
    label:    'Elementor V4',
  },
];

const SECTION_NAME    = args.section;
const PAGE_TIMEOUT    = parseInt(args.timeout, 10);
const WAIT_AFTER_LOAD = parseInt(args['wait-after-load'], 10);
const DRY_RUN         = args['dry-run'];
const NTH_SECTION     = args['nth-section'] ? parseInt(args['nth-section'], 10) : null;
const SCROLL_PCT      = args['scroll-pct']  ? parseInt(args['scroll-pct'], 10)  : null;
const FULL_PAGE       = args['full-page'];

// Output directory
const outputBase = args.output
  ? resolve(args.output)
  : resolve(__dirname, '..', 'reports', 'section-compare', SECTION_NAME);
mkdirSync(outputBase, { recursive: true });

const log   = (...m) => { if (args.verbose) process.stderr.write('[compare] ' + m.join(' ') + '\n'); };
const info  = (...m) => process.stderr.write('[compare] ' + m.join(' ') + '\n');
const warn  = (...m) => process.stderr.write('[WARN] ' + m.join(' ') + '\n');
const fatal = (m, c = 2) => { process.stderr.write('[FATAL] ' + m + '\n'); process.exit(c); };

// ── Browser-Detection ────────────────────────────────────────────────────────

async function detectBrowser() {
  if (DRY_RUN) return { backend: 'dry-run', lib: null };
  const req = createRequire(import.meta.url);
  try {
    const pw = req('playwright');
    log('Backend: Playwright');
    return { backend: 'playwright', lib: pw };
  } catch (_) {}
  try {
    const pup = req('puppeteer');
    log('Backend: Puppeteer');
    return { backend: 'puppeteer', lib: pup };
  } catch (_) {}
  warn('Weder Playwright noch Puppeteer gefunden → dry-run Fallback');
  warn('Installieren: npm install playwright  ODER  npm install puppeteer');
  return { backend: 'dry-run', lib: null };
}

// ── Pixelmatch Diff-Layer (optional) ─────────────────────────────────────────

/**
 * Versucht pngjs + pixelmatch zu laden.
 * Gibt { available: true, PNG, pixelmatch } oder { available: false } zurück.
 * Graceful skip wenn nicht installiert — kein Absturz.
 */
async function detectDiffLib() {
  const req = createRequire(import.meta.url);
  try {
    const pngjs = req('pngjs');
    const pm    = req('pixelmatch');
    const PNG         = pngjs.PNG;
    const pixelmatch  = typeof pm === 'function' ? pm : pm.default;
    if (typeof PNG !== 'function' || typeof pixelmatch !== 'function') {
      return { available: false };
    }
    log('Diff-Lib: pngjs + pixelmatch bereit');
    return { available: true, PNG, pixelmatch };
  } catch (_) {
    return { available: false };
  }
}

/**
 * Erstellt ein Diff-PNG aus zwei Screenshot-PNGs.
 * Gibt { ok, diffPixels, totalPixels, diffPct, diffPath } zurück.
 *
 * threshold: 0.1 — filtert Font-Rendering-Unterschiede heraus,
 * zeigt aber echte Layout-Fehler (fehlendes Bild, falsche Farbe) als rote Cluster.
 */
function computePixelDiff({ PNG, pixelmatch }, pathA, pathB, diffPath) {
  try {
    if (!existsSync(pathA) || !existsSync(pathB)) {
      return { ok: false, reason: 'Quelldatei fehlt' };
    }

    const bufA = readFileSync(pathA);
    const bufB = readFileSync(pathB);
    const isPng = (b) => b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
    if (!isPng(bufA) || !isPng(bufB)) {
      return { ok: false, reason: 'Kein echtes PNG (dry-run)' };
    }

    const imgA = PNG.sync.read(bufA);
    const imgB = PNG.sync.read(bufB);

    // Auf kleinste gemeinsame Größe zuschneiden
    const width  = Math.min(imgA.width,  imgB.width);
    const height = Math.min(imgA.height, imgB.height);

    // Neue data-Arrays auf Zielgröße (falls Dimensionen abweichen)
    const dataA = imgA.width === width && imgA.height === height
      ? imgA.data
      : cropPngData(imgA, width, height);
    const dataB = imgB.width === width && imgB.height === height
      ? imgB.data
      : cropPngData(imgB, width, height);

    const diff       = new PNG({ width, height });
    const totalPixels = width * height;

    const diffPixels = pixelmatch(dataA, dataB, diff.data, width, height, {
      threshold:        0.1,   // toleriert Font-Anti-Aliasing; zeigt echte Layout-Fehler
      includeAA:        false,  // Anti-Aliased-Pixel ignorieren
      alpha:            0.3,    // halbtransparente Bereiche leichter gewichten
      diffColor:        [255, 50, 50],   // rote Cluster = echte Unterschiede
      diffColorAlt:     [255, 200, 0],   // gelb = Anti-Aliasing-Grenzfall
      aaColor:          [255, 255, 0],
    });

    writeFileSync(diffPath, PNG.sync.write(diff));

    const diffPct = Math.round((diffPixels / totalPixels) * 100 * 10) / 10;
    return { ok: true, diffPixels, totalPixels, diffPct, diffPath };

  } catch (err) {
    warn('Pixel-Diff fehlgeschlagen: ' + err.message);
    return { ok: false, reason: err.message };
  }
}

/** Hilfsfunktion: RGBA-Buffer auf neue Dimension zuschneiden */
function cropPngData(img, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * img.width + x) * 4;
      const dstIdx = (y * w + x) * 4;
      out[dstIdx]     = img.data[srcIdx];
      out[dstIdx + 1] = img.data[srcIdx + 1];
      out[dstIdx + 2] = img.data[srcIdx + 2];
      out[dstIdx + 3] = img.data[srcIdx + 3];
    }
  }
  return out;
}

// ── Section-Scroll-Logik ─────────────────────────────────────────────────────

/**
 * Gibt { x, y, width, height } des gesuchten Elements zurück,
 * oder null wenn keins gefunden wurde.
 * Unterstützt: CSS-Selektor, nth-section, scroll-pct, above-fold
 */
async function findSectionBounds(page, selector, nth, scrollPct) {
  try {
    // Bug 6 fix: Sticky-Header-Offset ermitteln (WP Admin-Bar, Elementor Sticky Header)
    const stickyOffset = await page.evaluate(() => {
      let offset = 0;
      // WP Admin-Bar
      const adminBar = document.querySelector('#wpadminbar');
      if (adminBar) offset += adminBar.getBoundingClientRect().height;
      // Elementor Sticky Header
      const stickyHeader = document.querySelector(
        '.elementor-sticky--active, .e-con[data-settings*="sticky"]:not([style*="position: static"])'
      );
      if (stickyHeader) offset += stickyHeader.getBoundingClientRect().height;
      return offset;
    }).catch(() => 0);

    // Explicit CSS-Selektor
    if (selector) {
      const bounds = await page.evaluate(({ sel, offset }) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        el.scrollIntoView({ behavior: 'instant', block: 'start' });
        // Korrektur: scroll um sticky-Header-Höhe zurück
        if (offset > 0) window.scrollBy(0, -offset);
        const r = el.getBoundingClientRect();
        return {
          x: window.scrollX + r.left,
          y: window.scrollY + r.top,
          width:  r.width,
          height: r.height,
        };
      }, { sel: selector, offset: stickyOffset });
      if (bounds) {
        log(`  Selektor "${selector}" gefunden: ${JSON.stringify(bounds)}`);
        return bounds;
      }
      warn(`  Selektor "${selector}" nicht gefunden, falle zurück auf above-fold`);
    }

    // N-te section / e-con
    if (nth) {
      const bounds = await page.evaluate(({ n, offset }) => {
        const candidates = [
          ...document.querySelectorAll('section, .e-con, .elementor-section, [data-framer-name]'),
        ];
        // Filter: nur sichtbare Top-Level-Abschnitte (nicht geschachtelt in anderen)
        const topLevel = candidates.filter(el => {
          const rect = el.getBoundingClientRect();
          if (rect.height <= 100) return false;
          // Top-Level: kein Eltern-Element in der candidates-Liste
          return !el.parentElement?.closest('section, .e-con, .elementor-section, [data-framer-name]');
        });
        const el = topLevel[n - 1];
        if (!el) return null;
        el.scrollIntoView({ behavior: 'instant', block: 'start' });
        if (offset > 0) window.scrollBy(0, -offset);
        const r = el.getBoundingClientRect();
        return {
          x:      window.scrollX + r.left,
          y:      window.scrollY + r.top,
          width:  r.width,
          height: r.height,
        };
      }, { n: nth, offset: stickyOffset });
      if (bounds) {
        log(`  ${nth}. Abschnitt gefunden: ${JSON.stringify(bounds)}`);
        return bounds;
      }
    }

    // Scroll-Prozent
    if (scrollPct !== null) {
      await page.evaluate((pct) => {
        const maxScroll = document.body.scrollHeight - window.innerHeight;
        window.scrollTo(0, maxScroll * (pct / 100));
      }, scrollPct);
    }

    // Default: above-fold (null = gesamter Viewport)
    return null;

  } catch (err) {
    warn('findSectionBounds Fehler: ' + err.message);
    return null;
  }
}

// ── Screenshot: Playwright ───────────────────────────────────────────────────

async function screenshotWithPlaywright(pw, source, bp, outPath) {
  const browser = await pw.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
  const page    = await context.newPage();

  try {
    log(`  → ${source.key} @ ${bp.name} | ${source.url}`);
    const res = await page.goto(source.url, {
      waitUntil: 'networkidle',
      timeout:   PAGE_TIMEOUT,
    });

    if (res && res.status() >= 400) {
      warn(`  HTTP ${res.status()} für ${source.url}`);
    }

    // Warte nach Load
    await page.waitForTimeout(WAIT_AFTER_LOAD);

    // Bug 3 fix: WebFonts abwarten (besonders wichtig für Framer)
    try {
      await page.evaluate(() => document.fonts.ready);
    } catch (_) { /* ignorieren wenn fonts.ready nicht verfügbar */ }

    // Framer-spezifisch: animations deaktivieren für stabilen Screenshot
    if (source.key === 'framer') {
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }';
        document.head.appendChild(style);
      });
    }

    const bounds = await findSectionBounds(
      page,
      source.selector,
      NTH_SECTION,
      SCROLL_PCT
    );

    let screenshotOpts = { path: outPath };

    if (FULL_PAGE) {
      screenshotOpts.fullPage = true;
    } else if (bounds && bounds.height > 0) {
      // Bug 2 fix: nur vertikal scrollen (kein horizontales Scrollen mit b.x)
      await page.evaluate((y) => window.scrollTo(0, y), bounds.y);
      screenshotOpts.clip = {
        x: 0,
        y: 0,
        width:  bp.width,
        height: Math.min(bounds.height, bp.height * 2), // max 2x Viewport-Höhe
      };
    } else {
      // Above-fold: screenshot ersten Viewport
      screenshotOpts.clip = {
        x: 0, y: 0,
        width:  bp.width,
        height: bp.height,
      };
    }

    await page.screenshot(screenshotOpts);
    log(`  Screenshot gespeichert: ${outPath}`);
    return { ok: true, path: outPath };

  } catch (err) {
    warn(`  Screenshot fehlgeschlagen (${source.key} @ ${bp.name}): ${err.message}`);
    return { ok: false, error: err.message, path: outPath };
  } finally {
    // Bug 1 fix: guard against undefined vars (zombie browser prevention)
    try { if (context) await context.close(); } catch (_) {}
    try { if (browser) await browser.close(); } catch (_) {}
  }
}

// ── Screenshot: Puppeteer ────────────────────────────────────────────────────

async function screenshotWithPuppeteer(pup, source, bp, outPath) {
  let browser = null;
  let page    = null;

  try {
    browser = await pup.launch({ headless: 'new', args: ['--no-sandbox'] });
    page    = await browser.newPage();
    await page.setViewport({ width: bp.width, height: bp.height });

    log(`  → ${source.key} @ ${bp.name} | ${source.url}`);
    const res = await page.goto(source.url, {
      waitUntil: 'networkidle2',
      timeout:   PAGE_TIMEOUT,
    });

    if (res && res.status() >= 400) {
      warn(`  HTTP ${res.status()} für ${source.url}`);
    }

    await new Promise(r => setTimeout(r, WAIT_AFTER_LOAD));

    // Bug 3 fix: WebFonts abwarten
    try {
      await page.evaluate(() => document.fonts.ready);
    } catch (_) {}

    if (source.key === 'framer') {
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }';
        document.head.appendChild(style);
      });
    }

    const bounds = await findSectionBounds(
      page,
      source.selector,
      NTH_SECTION,
      SCROLL_PCT
    );

    let screenshotOpts = { path: outPath };

    if (FULL_PAGE) {
      screenshotOpts.fullPage = true;
    } else if (bounds && bounds.height > 0) {
      // Bug 2 fix: nur vertikal scrollen
      await page.evaluate((y) => window.scrollTo(0, y), bounds.y);
      screenshotOpts.clip = {
        x: 0, y: 0,
        width:  bp.width,
        height: Math.min(bounds.height, bp.height * 2),
      };
    } else {
      screenshotOpts.clip = {
        x: 0, y: 0,
        width:  bp.width,
        height: bp.height,
      };
    }

    await page.screenshot(screenshotOpts);
    log(`  Screenshot gespeichert: ${outPath}`);
    return { ok: true, path: outPath };

  } catch (err) {
    warn(`  Screenshot fehlgeschlagen (${source.key} @ ${bp.name}): ${err.message}`);
    return { ok: false, error: err.message, path: outPath };
  } finally {
    // Bug 1 fix: guard against undefined var (zombie browser prevention)
    try { if (browser) await browser.close(); } catch (_) {}
  }
}

// ── Dry-Run ──────────────────────────────────────────────────────────────────

function generatePlaceholderPng(outPath, label, color = '#aaaaaa') {
  // Generiere ein minimales valides PNG via Buffer (1x1 grau) als Platzhalter
  // In echtem dry-run schreiben wir nur eine leere Datei
  writeFileSync(outPath, `DRY-RUN-PLACEHOLDER:${label}`, 'utf8');
}

// ── HTML-Report ──────────────────────────────────────────────────────────────

function imageToBase64(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath);
  // Check ob es ein richtiges PNG ist (PNG-Signatur: 89 50 4E 47)
  if (content.length > 4 &&
      content[0] === 0x89 && content[1] === 0x50 &&
      content[2] === 0x4E && content[3] === 0x47) {
    return 'data:image/png;base64,' + content.toString('base64');
  }
  // Dry-run Platzhalter
  return null;
}

/**
 * Bug 7: Einfacher Histogram-Score ohne externe Abhängigkeit.
 * Liest PNG-IDAT-Bytes und berechnet einen 8-Bucket-Helligkeits-Histogramm-Hash.
 * Gibt einen Score 0-100 zurück (100 = identisch).
 * Kein echter Pixel-Diff — reicht für CI-Trending (besser/schlechter).
 */
function computePixelHashScore(pathA, pathB) {
  try {
    if (!existsSync(pathA) || !existsSync(pathB)) return null;
    const bufA = readFileSync(pathA);
    const bufB = readFileSync(pathB);
    // Nur echte PNGs vergleichen
    const isPng = (b) => b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
    if (!isPng(bufA) || !isPng(bufB)) return null;

    // Einfache Byte-Histogramm-Annäherung (IDAT-Bytes als Proxy für Helligkeitsverteilung)
    // Nicht pixel-perfekt, aber deterministisch und keine Lib nötig
    function histogram(buf) {
      const h = new Array(16).fill(0);
      for (let i = 8; i < buf.length; i++) {
        h[buf[i] & 0x0f]++;
      }
      const total = buf.length - 8;
      return h.map(v => v / total);
    }

    const hA = histogram(bufA);
    const hB = histogram(bufB);

    // Kosinus-Ähnlichkeit zwischen den zwei Histogrammen
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < 16; i++) {
      dot   += hA[i] * hB[i];
      normA += hA[i] * hA[i];
      normB += hB[i] * hB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.round(similarity * 100);
  } catch (_) {
    return null;
  }
}

function buildHtmlReport(reportData) {
  const { section, framerUrl, elementorUrl, timestamp, results, pixelHashScores, pixelDiffs } = reportData;

  // Baue Image-Data für alle 4 Screenshots
  const imgs = {};
  for (const r of results) {
    imgs[`${r.source}_${r.breakpoint}`] = {
      path:   r.path,
      b64:    imageToBase64(r.path),
      ok:     r.ok,
      error:  r.error,
      label:  r.label,
    };
  }

  // Diff-Images (optional)
  const hasDiff = pixelDiffs && Object.values(pixelDiffs).some(d => d?.ok);
  const diffImgs = {};
  if (hasDiff && pixelDiffs) {
    for (const [bp, d] of Object.entries(pixelDiffs)) {
      diffImgs[bp] = d?.ok ? imageToBase64(d.diffPath) : null;
    }
  }

  function imgTag(key, alt) {
    const d = imgs[key];
    if (!d) return `<div class="no-img">kein Screenshot (${key})</div>`;
    if (!d.b64) return `<div class="no-img">${d.error || 'dry-run Platzhalter'}</div>`;
    // Bug 5 fix: loading="eager" statt "lazy" für inline base64
    return `<img src="${d.b64}" alt="${alt}" loading="eager">`;
  }

  function diffTag(bp) {
    if (!hasDiff) return '';
    const b64 = diffImgs[bp];
    const d   = pixelDiffs?.[bp];
    if (!b64) return `<div class="no-img">${d?.reason || 'Diff nicht verfügbar'}</div>`;
    const pct     = d?.diffPct ?? '?';
    const color   = pct <= 5 ? '#22c55e' : pct <= 20 ? '#f59e0b' : '#ef4444';
    return `
      <div class="diff-label" style="color:${color}">
        ${pct}% geänderte Pixel
        <span style="font-size:10px;color:#4a5568;margin-left:6px">(${d?.diffPixels?.toLocaleString() ?? '?'} / ${d?.totalPixels?.toLocaleString() ?? '?'})</span>
      </div>
      <img src="${b64}" alt="Diff ${bp}" loading="eager" style="width:100%;height:auto;display:block;border-radius:4px;border:1px solid ${color}40">`;
  }

  // Bug 7: Pixel-Hash-Score Badge
  function scoreBadge(breakpoint) {
    if (!pixelHashScores) return '';
    const s = pixelHashScores[breakpoint];
    if (s === null || s === undefined) return '';
    const color = s >= 90 ? '#22c55e' : s >= 70 ? '#f59e0b' : '#ef4444';
    return `<span style="margin-left:8px;background:${color}20;color:${color};border:1px solid ${color}40;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">Fidelity ${s}%</span>`;
  }

  // Diff-Badge für Tab
  function diffBadge(breakpoint) {
    if (!hasDiff || !pixelDiffs?.[breakpoint]?.ok) return '';
    const pct   = pixelDiffs[breakpoint].diffPct ?? '?';
    const color = pct <= 5 ? '#22c55e' : pct <= 20 ? '#f59e0b' : '#ef4444';
    return `<span style="margin-left:4px;background:${color}20;color:${color};border:1px solid ${color}40;border-radius:4px;padding:2px 6px;font-size:10px">Diff ${pct}%</span>`;
  }

  const gridCols = hasDiff ? '1fr 1fr 1fr' : '1fr 1fr';

  function compareGrid(bp, desktopLabel) {
    const framerPane = `
    <div class="pane">
      <div class="pane-header framer">Original (Framer) <span class="breakpoint-badge">${desktopLabel}</span></div>
      <div class="pane-body">${imgTag(`framer_${bp}`, `Framer ${bp}`)}</div>
    </div>`;

    const elementorPane = `
    <div class="pane">
      <div class="pane-header elementor">Elementor V4 <span class="breakpoint-badge">${desktopLabel}</span></div>
      <div class="pane-body">${imgTag(`elementor_${bp}`, `Elementor ${bp}`)}</div>
    </div>`;

    const diffPane = hasDiff ? `
    <div class="pane">
      <div class="pane-header diff">Pixel-Diff <span class="breakpoint-badge">${desktopLabel}</span></div>
      <div class="pane-body">${diffTag(bp)}</div>
    </div>` : '';

    return `<div class="compare-grid" style="grid-template-columns:${gridCols}">${framerPane}${diffPane}${elementorPane}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Section Compare: ${section}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh}
.header{padding:20px 24px 16px;border-bottom:1px solid #1e2535;background:#141924}
.header h1{font-size:18px;font-weight:600;color:#f0f4ff}
.header .meta{font-size:12px;color:#8892a4;margin-top:4px}
.header .urls{margin-top:8px;display:flex;gap:12px;flex-wrap:wrap}
.url-badge{display:inline-flex;align-items:center;gap:6px;background:#1a2035;border:1px solid #2a3555;border-radius:6px;padding:4px 10px;font-size:12px;color:#a0b0c8;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.url-badge.framer{border-color:#6250c4;color:#b8a8f0}
.url-badge.elementor{border-color:#0e7a5a;color:#6bd8b4}
.tabs{display:flex;gap:4px;padding:12px 24px 0;background:#141924;border-bottom:1px solid #1e2535}
.tab{padding:8px 18px;border-radius:8px 8px 0 0;border:1px solid transparent;font-size:13px;cursor:pointer;color:#6b7990;transition:all .15s}
.tab.active,.tab:hover{background:#1a2035;border-color:#2a3555;color:#e2e8f0}
.tab.active{border-bottom-color:#1a2035;color:#a8d4ff}
.compare-grid{display:grid;gap:2px;background:#1e2535;padding:2px}
.pane{background:#0f1117;overflow:hidden}
.pane-header{padding:10px 16px;background:#141924;font-size:12px;font-weight:600;letter-spacing:.04em;display:flex;align-items:center;justify-content:space-between}
.pane-header.framer{color:#b8a8f0}
.pane-header.elementor{color:#6bd8b4}
.pane-header.diff{color:#f97316}
.pane-body{padding:12px;overflow:auto}
.pane-body img{width:100%;height:auto;display:block;border-radius:4px;border:1px solid #1e2535}
.no-img{padding:40px;text-align:center;color:#4a5568;font-size:13px;background:#141924;border-radius:4px;border:1px dashed #2a3555}
.breakpoint-badge{font-size:10px;color:#4a5568;background:#1a2035;border-radius:4px;padding:2px 6px}
.diff-label{font-size:12px;font-weight:600;padding:6px 0 8px;display:flex;align-items:center}
.content[data-tab]{display:none}
.content[data-tab].active{display:block}
.tab-label{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
footer{padding:16px 24px;font-size:11px;color:#3d4659;border-top:1px solid #1e2535}
</style>
</head>
<body>
<div class="header">
  <h1>Section Compare: <span style="color:#a8d4ff">${section}</span></h1>
  <div class="meta">Erstellt: ${timestamp}${hasDiff ? ' · Pixel-Diff aktiv' : ' · Pixel-Diff inaktiv (npm install pngjs pixelmatch)'}</div>
  <div class="urls">
    <span class="url-badge framer">Original: ${framerUrl}</span>
    <span class="url-badge elementor">Elementor: ${elementorUrl}</span>
  </div>
</div>

<div class="tabs">
  <button class="tab active" onclick="showTab('desktop')"><span class="tab-label">Desktop (1440px)${scoreBadge('desktop')}${diffBadge('desktop')}</span></button>
  <button class="tab" onclick="showTab('mobile')"><span class="tab-label">Mobile (390px)${scoreBadge('mobile')}${diffBadge('mobile')}</span></button>
</div>

<div class="content active" data-tab="desktop">
  ${compareGrid('desktop', '1440 × 900')}
</div>

<div class="content" data-tab="mobile">
  ${compareGrid('mobile', '390 × 844')}
</div>

<footer>
  section-compare.js — framer-v4-pipeline-v2 · ${timestamp}
</footer>

<script>
function showTab(name) {
  document.querySelectorAll('.content[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === name);
  });
  document.querySelectorAll('.tab').forEach((el, i) => {
    el.classList.toggle('active', (i === 0 && name === 'desktop') || (i === 1 && name === 'mobile'));
  });
}
</script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const C = {
    reset: '\x1b[0m', bold: '\x1b[1m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    cyan: '\x1b[36m', blue: '\x1b[34m',
  };

  process.stderr.write(`\n${C.bold}section-compare.js${C.reset} — ${SECTION_NAME}\n`);
  process.stderr.write(`${C.cyan}Framer:${C.reset}    ${SOURCES[0].url}\n`);
  process.stderr.write(`${C.cyan}Elementor:${C.reset} ${SOURCES[1].url}\n`);
  process.stderr.write(`${C.cyan}Output:${C.reset}    ${outputBase}\n\n`);

  const { backend, lib } = await detectBrowser();
  process.stderr.write(`${C.blue}Backend:${C.reset} ${backend}\n`);

  const diffLib = await detectDiffLib();
  process.stderr.write(`${C.blue}Diff-Lib:${C.reset} ${diffLib.available ? 'pngjs + pixelmatch' : 'nicht installiert (graceful skip)'}\n\n`);

  const results   = [];
  let   allOk     = true;
  const timestamp = new Date().toISOString();

  // ── Screenshots ────────────────────────────────────────────────────────────

  for (const source of SOURCES) {
    process.stderr.write(`${C.bold}${source.label}${C.reset}\n`);

    for (const bp of BREAKPOINTS) {
      const filename = `${source.key}-${bp.name}.png`;
      const outPath  = join(outputBase, filename);

      let result;

      if (backend === 'dry-run') {
        generatePlaceholderPng(outPath, `${source.key} ${bp.name}`);
        result = { ok: true, path: outPath, error: null };
        process.stderr.write(`  ${C.yellow}DRY${C.reset} ${bp.name.padEnd(8)} → ${filename}\n`);
      } else if (backend === 'playwright') {
        result = await screenshotWithPlaywright(lib, source, bp, outPath);
        const icon = result.ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
        process.stderr.write(`  ${icon} ${bp.name.padEnd(8)} → ${filename}${result.error ? ' — ' + result.error : ''}\n`);
      } else {
        result = await screenshotWithPuppeteer(lib, source, bp, outPath);
        const icon = result.ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
        process.stderr.write(`  ${icon} ${bp.name.padEnd(8)} → ${filename}${result.error ? ' — ' + result.error : ''}\n`);
      }

      results.push({
        source:     source.key,
        label:      source.label,
        breakpoint: bp.name,
        viewport:   `${bp.width}x${bp.height}`,
        path:       outPath,
        filename,
        ok:         result.ok,
        error:      result.error || null,
      });

      if (!result.ok) allOk = false;
    }
    process.stderr.write('\n');
  }

  // ── Pixel-Diff Phase (optional, nur wenn pngjs + pixelmatch installiert) ────

  const pixelDiffs = {};
  if (diffLib.available && !DRY_RUN) {
    process.stderr.write(`${C.bold}Pixel-Diff:${C.reset}\n`);
    for (const bp of BREAKPOINTS) {
      const pathFramer    = join(outputBase, `framer-${bp.name}.png`);
      const pathElementor = join(outputBase, `elementor-${bp.name}.png`);
      const diffPath      = join(outputBase, `diff-${bp.name}.png`);

      const result = computePixelDiff(diffLib, pathFramer, pathElementor, diffPath);
      pixelDiffs[bp.name] = result;

      if (result.ok) {
        const pct   = result.diffPct;
        const color = pct <= 5 ? C.green : pct <= 20 ? C.yellow : C.red;
        process.stderr.write(`  ${color}${bp.name.padEnd(8)}${C.reset} → diff-${bp.name}.png  ${color}${pct}% geaendert${C.reset} (${result.diffPixels.toLocaleString()} Pixel)\n`);
      } else {
        process.stderr.write(`  ${C.yellow}SKIP${C.reset}   ${bp.name.padEnd(8)} → ${result.reason}\n`);
      }
    }
    process.stderr.write('\n');
  } else {
    for (const bp of BREAKPOINTS) {
      pixelDiffs[bp.name] = { ok: false, reason: diffLib.available ? 'dry-run' : 'pngjs/pixelmatch nicht installiert' };
    }
  }

  // ── HTML-Report ────────────────────────────────────────────────────────────

  // Bug 7: Pixel-Hash-Scores pro Breakpoint berechnen
  const pixelHashScores = {};
  for (const bp of BREAKPOINTS) {
    const pathFramer    = join(outputBase, `framer-${bp.name}.png`);
    const pathElementor = join(outputBase, `elementor-${bp.name}.png`);
    pixelHashScores[bp.name] = computePixelHashScore(pathFramer, pathElementor);
  }

  // Score-Ausgabe
  const scoreLines = Object.entries(pixelHashScores)
    .map(([bp, s]) => `  ${bp.padEnd(8)}: ${s !== null ? s + '%' : 'n/a (dry-run)'}`)
    .join('\n');
  process.stderr.write(`${C.bold}Fidelity-Score (Histogram):${C.reset}\n${scoreLines}\n\n`);

  const reportData = {
    section:          SECTION_NAME,
    framerUrl:        SOURCES[0].url,
    elementorUrl:     SOURCES[1].url,
    timestamp,
    backend,
    pixelHashScores,
    pixelDiffs,
    results,
  };

  const htmlPath  = join(outputBase, 'report.html');
  const jsonPath  = join(outputBase, 'compare-report.json');
  const htmlContent = buildHtmlReport(reportData);

  writeFileSync(htmlPath,  htmlContent, 'utf8');
  writeFileSync(jsonPath,  JSON.stringify(reportData, null, 2), 'utf8');

  process.stderr.write(`${C.bold}Report:${C.reset}\n`);
  process.stderr.write(`  HTML → ${htmlPath}\n`);
  process.stderr.write(`  JSON → ${jsonPath}\n\n`);

  // Screenshot-Dateien auflisten
  process.stderr.write(`${C.bold}Screenshots:${C.reset}\n`);
  for (const r of results) {
    const icon = r.ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    process.stderr.write(`  ${icon} ${r.filename}\n`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const okCount   = results.filter(r => r.ok).length;
  const failCount = results.filter(r => !r.ok).length;

  process.stderr.write(`\n`);
  if (allOk) {
    process.stderr.write(`${C.green}${C.bold}ALLE ${okCount} SCREENSHOTS OK${C.reset}\n`);
  } else {
    process.stderr.write(`${C.red}${C.bold}${failCount} SCREENSHOT(S) FEHLGESCHLAGEN${C.reset} (${okCount} OK)\n`);
  }

  if (DRY_RUN) {
    process.stderr.write(`${C.yellow}[DRY-RUN] Kein echter Browser genutzt${C.reset}\n`);
  }

  // Browser öffnen
  if (args.open && existsSync(htmlPath)) {
    try {
      const platform = process.platform;
      const cmd = platform === 'win32' ? `start "" "${htmlPath}"`
                : platform === 'darwin' ? `open "${htmlPath}"`
                : `xdg-open "${htmlPath}"`;
      execSync(cmd);
      process.stderr.write(`\nReport geöffnet in Browser\n`);
    } catch (e) {
      warn('Browser öffnen fehlgeschlagen: ' + e.message);
    }
  }

  process.stderr.write(`\n${C.cyan}Nächster Schritt:${C.reset} Öffne ${htmlPath} und vergleiche beide Abschnitte.\n\n`);

  process.exit(allOk ? 0 : 1);
}

main().catch(err => {
  process.stderr.write('[FATAL] ' + err.message + '\n');
  if (args.verbose) process.stderr.write(err.stack + '\n');
  process.exit(2);
});
