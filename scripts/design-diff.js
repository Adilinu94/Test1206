#!/usr/bin/env node
/**
 * design-diff.js — CSS Property & Layout Comparison (No Screenshots)
 *
 * Vergleicht eine Elementor-Seite mit dem Framer-Original auf CSS-Ebene —
 * OHNE Screenshots, OHNE Bilder. Reiner JSON/Text-Report.
 *
 * Extrahiert computed styles von korrespondierenden DOM-Elementen beider
 * Seiten und difft sie auf: Farben, Typografie, Spacing, Layout, visuelle Props.
 *
 * ARCHITEKTUR:
 *   1. Playwright besucht beide Seiten
 *   2. Extrahiert computed styles via page.evaluate()
 *   3. Matcht DOM-Elemente (via data-framer-name / nth-child / selector)
 *   4. Difft auf 5 Kategorien: colors, typography, spacing, layout, visual
 *   5. Produziert JSON-Report mit severity: PASS | WARN | FAIL
 *
 * USAGE:
 *   node scripts/design-diff.js \\
 *     --framer-url https://example.framer.app/ \\
 *     --elementor-url http://rundmund.local/my-page/ \\
 *     --output reports/design-diff.json
 *
 *   # Mit Section-Selectoren:
 *   node scripts/design-diff.js \\
 *     --framer-url ... --elementor-url ... \\
 *     --framer-selector "[data-framer-name*='hero']" \\
 *     --elementor-selector ".e-con:first-child"
 *
 *   # Dry-run (kein Browser):
 *   node scripts/design-diff.js --framer-url ... --elementor-url ... --dry-run
 *
 * EXIT CODES:
 *   0 = alle Kategorien PASS
 *   1 = WARNungen (minor differences)
 *   2 = FAIL (major differences) oder Konfigurationsfehler
 */

'use strict';

import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI ──────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    'framer-url':          { type: 'string' },
    'elementor-url':       { type: 'string' },
    'framer-selector':     { type: 'string' },
    'elementor-selector':  { type: 'string' },
    'nth-section':         { type: 'string' },
    output:                { type: 'string' },
    'dry-run':             { type: 'boolean', default: false },
    timeout:               { type: 'string', default: '45000' },
    'wait-after-load':     { type: 'string', default: '2500' },
    'min-score':           { type: 'string', default: '' },   // Lücke 6 — numerischer Schwellwert (0-100); exit 2 wenn overall_score darunter
    verbose:               { type: 'boolean', default: false },
    help:                  { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help || !args['framer-url'] || !args['elementor-url']) {
  console.log(`
design-diff.js — CSS Property & Layout Comparison (No Screenshots)

USAGE:
  node scripts/design-diff.js --framer-url URL --elementor-url URL [options]

REQUIRED:
  --framer-url URL           Original Framer page
  --elementor-url URL        Converted Elementor page

OPTIONAL:
  --framer-selector CSS      CSS selector on Framer page
  --elementor-selector CSS   CSS selector on Elementor page
  --nth-section N            1-based nth section (both pages)
  --output FILE              JSON report output path
  --dry-run                  No browser, placeholder report
  --timeout MS               Navigation timeout (default: 45000)
  --wait-after-load MS       Wait after load event (default: 2500)
  --min-score N             Numeric threshold (0-100). Exits with 2 if overall_score < N — use as Pipeline-Gate.
  --verbose                  Verbose logging
  --help                     This help

COMPARISON CATEGORIES:
  colors       Palette: used hex colors, count, differences
  typography   Font families, sizes, weights, line-heights
  spacing      Padding, margin, gap values
  layout       Container widths, max-width, positioning
  visual       Backgrounds, borders, shadows, opacity

EXIT: 0=PASS  1=WARN  2=FAIL

EXAMPLE:
  node scripts/design-diff.js \\
    --framer-url https://example.framer.app/ \\
    --elementor-url http://rundmund.local/my-page/ \\
    --framer-selector "[data-framer-name*='hero']" \\
    --elementor-selector ".e-con:first-child" \\
    --output reports/design-diff.json
`);
  process.exit(args.help ? 0 : 2);
}

const FRAMER_URL      = args['framer-url'];
const ELEMENTOR_URL   = args['elementor-url'];
const FRAMER_SELECTOR = args['framer-selector'] || null;
const EL_SELECTOR     = args['elementor-selector'] || null;
const NTH_SECTION     = args['nth-section'] ? parseInt(args['nth-section'], 10) : null;
const PAGE_TIMEOUT    = parseInt(args.timeout, 10);
const WAIT_MS         = parseInt(args['wait-after-load'], 10);
const DRY_RUN         = args['dry-run'];
const MIN_SCORE       = args['min-score'] !== '' && args['min-score'] != null ? parseInt(args['min-score'], 10) : null;
const OUTPUT_PATH     = args.output ? resolve(args.output) : null;

const log  = (...m) => { if (args.verbose) console.error('[design-diff]', ...m); };
const warn = (...m) => console.error('[WARN]', ...m);
const info = (...m) => console.error('[design-diff]', ...m);

// ─── Color helpers ────────────────────────────────────────────────────────────

/** Convert any CSS color to hex (approximate from rgb/rgba) */
function toHex(color) {
  if (!color) return null;
  color = color.trim().toLowerCase();
  if (color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return 'transparent';

  // Already hex
  if (/^#[0-9a-f]{3,8}$/.test(color)) {
    if (color.length === 4) return '#' + color[1]+color[1]+color[2]+color[2]+color[3]+color[3];
    return color.slice(0, 7);
  }

  // rgb(r, g, b) / rgba(r, g, b, a)
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (m) {
    const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (alpha < 0.05) return 'transparent';
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  // Named colors (skip — can't reliably normalize without a lookup table)
  return null;
}

// ─── Browser detection ───────────────────────────────────────────────────────

async function detectBrowser() {
  if (DRY_RUN) return { backend: 'dry-run', lib: null };
  const req = createRequire(import.meta.url);
  try {
    const pw = req('playwright');
    return { backend: 'playwright', lib: pw };
  } catch (_) {}
  try {
    const pup = req('puppeteer');
    return { backend: 'puppeteer', lib: pup };
  } catch (_) {}
  warn('No browser found. Use --dry-run or: npm install playwright');
  return { backend: 'dry-run', lib: null };
}

// ─── DOM element matching ─────────────────────────────────────────────────────

/**
 * Find the target element on a page.
 * Strategy: explicit selector > nth-section > first visible large element.
 */
async function findTargetElement(page, selector, nth) {
  return await page.evaluate(({ sel, n }) => {
    // Explicit selector
    if (sel) {
      const el = document.querySelector(sel);
      if (el) return { found: true, tag: el.tagName, classes: el.className };
      return { found: false };
    }

    // Nth large section
    if (n) {
      const candidates = [...document.querySelectorAll(
        'section, .e-con, .elementor-section, [data-framer-name], [data-framer-section]'
      )].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 100 && r.height > 100;
      });
      const el = candidates[n - 1];
      if (el) return { found: true, tag: el.tagName, classes: el.className, index: n };
      return { found: false, available: candidates.length };
    }

    // Default: first large visible element
    const large = [...document.querySelectorAll('body > *')].find(el => {
      const r = el.getBoundingClientRect();
      return r.width > 200 && r.height > 100;
    });
    if (large) return { found: true, tag: large.tagName, classes: large.className, fallback: true };
    return { found: false };
  }, { sel: selector, n: nth });
}

// ─── Style extraction ─────────────────────────────────────────────────────────

/**
 * Extract a comprehensive style profile from the target area.
 * Collects: colors used, typography, spacing, layout, visual properties.
 */
async function extractStyleProfile(page, selector, nth) {
  return await page.evaluate(({ sel, n }) => {
    // Find target container
    let container;
    if (sel) {
      container = document.querySelector(sel);
    } else if (n) {
      const candidates = [...document.querySelectorAll(
        'section, .e-con, .elementor-section, [data-framer-name], [data-framer-section]'
      )].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 100 && r.height > 100;
      });
      container = candidates[n - 1];
    } else {
      container = [...document.querySelectorAll('body > *')].find(el => {
        const r = el.getBoundingClientRect();
        return r.width > 200 && r.height > 100;
      });
    }

    const scope = container || document.body;

    // ── Collect all elements with text or visual presence ──
    const elements = [...scope.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, span, a, button, div, section, img, svg, li, label'
    )].slice(0, 500); // Cap at 500 elements to prevent OOM on large pages

    const colors = new Set();
    const backgrounds = new Set();
    const fonts = {};
    const fontSizes = [];
    const fontWeights = new Set();
    const lineHeights = [];
    const paddings = [];
    const margins = [];
    const borderColors = new Set();
    const opacities = [];
    const widths = [];
    const maxWidths = [];
    const heights = [];
    const borderRadii = [];
    const boxShadows = [];

    for (const el of elements) {
      const cs = window.getComputedStyle(el);

      // Colors
      const c = cs.color;
      if (c && c !== 'rgba(0, 0, 0, 0)') colors.add(c);

      // Background colors
      const bg = cs.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') backgrounds.add(bg);

      // Typography
      const ff = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      if (ff && ff !== 'serif' && ff !== 'sans-serif') {
        fonts[ff] = (fonts[ff] || 0) + 1;
      }
      const fs = parseFloat(cs.fontSize);
      if (fs && fs > 0) fontSizes.push(fs);
      const fw = parseInt(cs.fontWeight);
      if (fw && fw > 0) fontWeights.add(fw);
      const lh = parseFloat(cs.lineHeight);
      if (lh && lh > 0 && lh < 200) lineHeights.push(lh);

      // Spacing
      const pad = parseFloat(cs.paddingTop) || parseFloat(cs.paddingBottom) || parseFloat(cs.paddingLeft);
      if (pad > 0 && pad < 500) paddings.push(pad);
      const mar = parseFloat(cs.marginTop) || parseFloat(cs.marginBottom);
      if (mar > 0 && mar < 500) margins.push(mar);

      // Visual
      const bc = cs.borderColor;
      if (bc && bc !== 'rgba(0, 0, 0, 0)' && bc !== 'rgb(0, 0, 0)') borderColors.add(bc);
      const op = parseFloat(cs.opacity);
      if (op < 1 && op > 0) opacities.push(op);
      const br = parseFloat(cs.borderRadius);
      if (br > 0) borderRadii.push(br);
      const bs = cs.boxShadow;
      if (bs && bs !== 'none') boxShadows.push(bs);

      // Layout
      const w = parseFloat(cs.width);
      if (w > 0) widths.push(w);
      const mw = parseFloat(cs.maxWidth);
      if (mw > 0 && mw < 3000) maxWidths.push(mw);
      const h = parseFloat(cs.height);
      if (h > 0 && h < 5000) heights.push(h);
    }

    // Compute container layout
    const containerStyle = container ? window.getComputedStyle(container) : null;

    function parsePxBrowser(val) {
      if (!val || val === 'auto' || val === 'normal' || val === 'none') return null;
      const num = parseFloat(val);
      return isNaN(num) ? null : num;
    }

    function median(arr) {
      if (!arr.length) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    return {
      // ── Color Palette ──
      unique_colors: colors.size,
      unique_backgrounds: backgrounds.size,
      color_samples: [...colors].slice(0, 30).map(c => c),
      background_samples: [...backgrounds].slice(0, 15).map(c => c),
      border_color_samples: [...borderColors].slice(0, 10).map(c => c),

      // ── Typography ──
      font_families: Object.entries(fonts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([family, count]) => ({ family, usage_count: count })),
      font_size_range: { min: Math.min(...fontSizes) || 0, max: Math.max(...fontSizes) || 0 },
      font_size_median: median(fontSizes),
      font_weights: [...fontWeights].sort(),
      line_height_median: median(lineHeights),

      // ── Spacing ──
      padding_median: median(paddings),
      padding_range: { min: Math.min(...paddings) || 0, max: Math.max(...paddings) || 0 },
      margin_median: median(margins),

      // ── Layout ──
      container_width: containerStyle ? parsePxBrowser(containerStyle.width) : null,
      container_max_width: containerStyle ? parsePxBrowser(containerStyle.maxWidth) : null,
      width_median: median(widths),
      max_width_median: median(maxWidths),
      height_median: median(heights),

      // ── Visual ──
      border_radius_median: median(borderRadii) || 0,
      border_radii_samples: [...new Set(borderRadii)].slice(0, 10),
      opacity_samples: [...new Set(opacities)].slice(0, 5),
      box_shadow_count: boxShadows.length,
      box_shadow_samples: [...new Set(boxShadows)].slice(0, 5),

      // ── Meta ──
      element_count: elements.length,
      container_selector: sel || (n ? `nth-section(${n})` : 'auto'),
    };
  }, { sel: selector, n: nth });
}

// ─── Diff engine ──────────────────────────────────────────────────────────────

function pctDiff(a, b) {
  if (a === null || b === null || a === 0) return b === 0 ? 0 : 100;
  return Math.round(Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) * 100);
}

function colorSetMatch(setA, setB) {
  const hexA = new Set(setA.map(c => toHex(c)).filter(Boolean));
  const hexB = new Set(setB.map(c => toHex(c)).filter(Boolean));
  const intersection = [...hexA].filter(c => hexB.has(c));
  const union = new Set([...hexA, ...hexB]);
  // Exclude transparent from counts (it's a default, not a design choice)
  const meaningfulA = hexA.size - (hexA.has('transparent') ? 1 : 0);
  const meaningfulB = hexB.size - (hexB.has('transparent') ? 1 : 0);
  const meaningfulShared = intersection.filter(c => c !== 'transparent').length;
  const meaningfulUnion = union.size - (union.has('transparent') ? 1 : 0);
  return {
    a_count: meaningfulA,
    b_count: meaningfulB,
    shared: meaningfulShared,
    only_in_a: [...hexA].filter(c => c !== 'transparent' && !hexB.has(c)).slice(0, 10),
    only_in_b: [...hexB].filter(c => c !== 'transparent' && !hexA.has(c)).slice(0, 10),
    match_pct: meaningfulUnion === 0 ? 100 : Math.round(meaningfulShared / meaningfulUnion * 100),
  };
}

function fontFamilyMatch(fontsA, fontsB) {
  const namesA = new Set(fontsA.map(f => f.family.toLowerCase()));
  const namesB = new Set(fontsB.map(f => f.family.toLowerCase()));
  const shared = [...namesA].filter(n => namesB.has(n));
  const onlyA = [...namesA].filter(n => !namesB.has(n));
  const onlyB = [...namesB].filter(n => !namesA.has(n));
  const maxN = Math.max(namesA.size, namesB.size);
  return {
    shared,
    only_in_framer: onlyA,
    only_in_elementor: onlyB,
    match_pct: maxN === 0 ? 100 : Math.round(shared.length / maxN * 100),
  };
}

function compareProfiles(framer, elementor) {
  const diffs = [];

  // ── 1. COLORS ──
  const colorMatch = colorSetMatch(framer.color_samples, elementor.color_samples);
  const bgMatch    = colorSetMatch(framer.background_samples, elementor.background_samples);

  diffs.push({
    category: 'colors',
    severity: colorMatch.match_pct >= 70 && bgMatch.match_pct >= 50 ? 'PASS' : 'WARN',
    text_colors: {
      framer_count: colorMatch.a_count,
      elementor_count: colorMatch.b_count,
      shared: colorMatch.shared,
      only_in_framer: colorMatch.only_in_a,
      only_in_elementor: colorMatch.only_in_b,
      match_pct: colorMatch.match_pct,
    },
    background_colors: {
      framer_count: bgMatch.a_count,
      elementor_count: bgMatch.b_count,
      shared: bgMatch.shared,
      only_in_framer: bgMatch.only_in_a,
      only_in_elementor: bgMatch.only_in_b,
      match_pct: bgMatch.match_pct,
    },
  });

  // ── 2. TYPOGRAPHY ──
  const fontMatch = fontFamilyMatch(framer.font_families, elementor.font_families);
  const fontSizeDiff = pctDiff(framer.font_size_median, elementor.font_size_median);
  const lineHeightDiff = pctDiff(framer.line_height_median, elementor.line_height_median);
  // Font-weight: check that all Framer weights exist in Elementor (not exact equality)
  const framerWeights = new Set(framer.font_weights);
  const elWeights = new Set(elementor.font_weights);
  const missingWeights = [...framerWeights].filter(w => !elWeights.has(w));
  const weightMatch = missingWeights.length === 0;

  diffs.push({
    category: 'typography',
    severity: fontMatch.match_pct >= 75 && fontSizeDiff <= 15 && weightMatch ? 'PASS' : 'WARN',
    fonts: {
      framer_count: framer.font_families.length,
      elementor_count: elementor.font_families.length,
      shared: fontMatch.shared,
      only_in_framer: fontMatch.only_in_framer,
      only_in_elementor: fontMatch.only_in_elementor,
      match_pct: fontMatch.match_pct,
    },
    font_size: {
      framer_median: framer.font_size_median,
      elementor_median: elementor.font_size_median,
      diff_pct: fontSizeDiff,
    },
    font_weight: {
      framer: framer.font_weights,
      elementor: elementor.font_weights,
      missing_in_elementor: missingWeights,
      match: weightMatch,
    },
    line_height: {
      framer_median: framer.line_height_median,
      elementor_median: elementor.line_height_median,
      diff_pct: lineHeightDiff,
    },
  });

  // ── 3. SPACING ──
  const padDiff  = pctDiff(framer.padding_median, elementor.padding_median);
  const margDiff = pctDiff(framer.margin_median, elementor.margin_median);

  diffs.push({
    category: 'spacing',
    severity: padDiff <= 25 && margDiff <= 35 ? 'PASS' : 'WARN',
    padding: {
      framer_median: framer.padding_median,
      elementor_median: elementor.padding_median,
      diff_pct: padDiff,
    },
    margin: {
      framer_median: framer.margin_median,
      elementor_median: elementor.margin_median,
      diff_pct: margDiff,
    },
  });

  // ── 4. LAYOUT ──
  const containerWidthDiff = pctDiff(framer.container_width, elementor.container_width);
  const maxWidthDiff       = pctDiff(framer.container_max_width, elementor.container_max_width);

  diffs.push({
    category: 'layout',
    severity: containerWidthDiff <= 20 && maxWidthDiff <= 20 ? 'PASS' : 'WARN',
    container: {
      framer_width: framer.container_width,
      elementor_width: elementor.container_width,
      width_diff_pct: containerWidthDiff,
      framer_max_width: framer.container_max_width,
      elementor_max_width: elementor.container_max_width,
      max_width_diff_pct: maxWidthDiff,
    },
    element_count: {
      framer: framer.element_count,
      elementor: elementor.element_count,
    },
  });

  // ── 5. VISUAL ──
  const borderMatch  = colorSetMatch(framer.border_color_samples, elementor.border_color_samples);
  const radiusDiff   = pctDiff(framer.border_radius_median, elementor.border_radius_median);
  const shadowDiff   = Math.abs(framer.box_shadow_count - elementor.box_shadow_count) > 3;

  diffs.push({
    category: 'visual',
    severity: borderMatch.match_pct >= 50 && radiusDiff <= 40 && !shadowDiff ? 'PASS' : 'WARN',
    border_colors: {
      shared: borderMatch.shared,
      only_in_framer: borderMatch.only_in_a,
      only_in_elementor: borderMatch.only_in_b,
      match_pct: borderMatch.match_pct,
    },
    border_radius: {
      framer_median: framer.border_radius_median,
      elementor_median: elementor.border_radius_median,
      diff_pct: radiusDiff,
    },
    shadows: {
      framer_count: framer.box_shadow_count,
      elementor_count: elementor.box_shadow_count,
    },
  });

  return diffs;
}

/**
 * Compute an overall 0-100 score from the per-category diff data.
 * Each of the 5 categories is weighted equally.
 * For match_pct-based metrics: higher = better (already 0-100).
 * For diff_pct-based metrics: invert so higher = better (100 - diff).
 *
 * @param {Array} diffs - output from compareProfiles()
 * @returns {{ overall_score: number, category_scores: Record<string, number> }}
 */
function computeOverallScore(diffs) {
  const catScores = {};

  for (const d of diffs) {
    let score = 0;
    let count = 0;

    switch (d.category) {
      case 'colors': {
        const cMatch = d.text_colors?.match_pct;
        const bgMatch = d.background_colors?.match_pct;
        if (typeof cMatch === 'number') { score += cMatch; count++; }
        if (typeof bgMatch === 'number') { score += bgMatch; count++; }
        break;
      }
      case 'typography': {
        const fMatch = d.fonts?.match_pct;
        const fsDiff = d.font_size?.diff_pct;
        const fwMatch = d.font_weight?.match;
        const lhDiff = d.line_height?.diff_pct;
        if (typeof fMatch === 'number') { score += fMatch; count++; }
        if (typeof fsDiff === 'number') { score += Math.max(0, 100 - fsDiff); count++; }
        if (fwMatch === true)           { score += 100; count++; }
        else if (fwMatch === false)     { score += 0; count++; }
        if (typeof lhDiff === 'number') { score += Math.max(0, 100 - lhDiff); count++; }
        break;
      }
      case 'spacing': {
        const pDiff = d.padding?.diff_pct;
        const mDiff = d.margin?.diff_pct;
        if (typeof pDiff === 'number') { score += Math.max(0, 100 - pDiff); count++; }
        if (typeof mDiff === 'number') { score += Math.max(0, 100 - mDiff); count++; }
        break;
      }
      case 'layout': {
        const wDiff  = d.container?.width_diff_pct;
        const mwDiff = d.container?.max_width_diff_pct;
        if (typeof wDiff === 'number')  { score += Math.max(0, 100 - wDiff); count++; }
        if (typeof mwDiff === 'number') { score += Math.max(0, 100 - mwDiff); count++; }
        break;
      }
      case 'visual': {
        const bMatch  = d.border_colors?.match_pct;
        const rDiff   = d.border_radius?.diff_pct;
        const sCount  = d.shadows?.framer_count;
        const elCount = d.shadows?.elementor_count;
        if (typeof bMatch === 'number') { score += bMatch; count++; }
        if (typeof rDiff === 'number')  { score += Math.max(0, 100 - rDiff); count++; }
        if (typeof sCount === 'number' && typeof elCount === 'number') {
          score += (Math.abs(sCount - elCount) <= 3 ? 100 : 0);
          count++;
        }
        break;
      }
    }

    catScores[d.category] = count > 0 ? Math.round(score / count) : 100;
  }

  const catValues = Object.values(catScores);
  const overall = catValues.length > 0
    ? Math.round(catValues.reduce((a, b) => a + b, 0) / catValues.length)
    : 100;

  return { overall_score: overall, category_scores: catScores };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const C = { r: '\x1b[0m', b: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };

  info(`${C.b}design-diff.js${C.r} — CSS Property & Layout Comparison`);
  info(`${C.cyan}Framer:${C.r}    ${FRAMER_URL}`);
  info(`${C.cyan}Elementor:${C.r} ${ELEMENTOR_URL}`);
  info('');

  const { backend, lib } = await detectBrowser();
  info(`${C.cyan}Backend:${C.r} ${backend}`);

  if (backend === 'dry-run') {
    const dryReport = {
      meta: { framer_url: FRAMER_URL, elementor_url: ELEMENTOR_URL, backend: 'dry-run', timestamp: new Date().toISOString() },
      results: [{ category: 'dry-run', severity: 'SKIP', note: 'Browser not available. Install Playwright: npm install playwright' }],
    };
    const json = JSON.stringify(dryReport, null, 2);
    if (OUTPUT_PATH) {
      mkdirSync(resolve(OUTPUT_PATH, '..'), { recursive: true });
      writeFileSync(OUTPUT_PATH, json, 'utf8');
      info(`Report → ${OUTPUT_PATH}`);
    } else {
      console.log(json);
    }
    process.exit(0);
  }

  // ── Browser launch ──────────────────────────────────────────────────────────
  let browser;
  if (backend === 'playwright') {
    browser = await lib.chromium.launch({ headless: true });
  } else {
    browser = await lib.launch({ headless: 'new', args: ['--no-sandbox'] });
  }

  try {
    // ── Extract Framer styles ─────────────────────────────────────────────
    info(`Extracting Framer styles...`);
    const framerCtx = backend === 'playwright'
      ? await browser.newContext({ viewport: { width: 1440, height: 900 } })
      : null;
    const framerPage = backend === 'playwright'
      ? await framerCtx.newPage()
      : await browser.newPage();

    if (backend === 'puppeteer') await framerPage.setViewport({ width: 1440, height: 900 });

    await framerPage.goto(FRAMER_URL, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });
    await framerPage.waitForTimeout(WAIT_MS);

    // Disable animations for stable extraction
    await framerPage.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}';
      document.head.appendChild(s);
    });

    const framerTarget = await findTargetElement(framerPage, FRAMER_SELECTOR, NTH_SECTION);
    if (!framerTarget.found) {
      warn(`Framer: target not found. Selector="${FRAMER_SELECTOR || 'auto'}", nth=${NTH_SECTION}, available=${framerTarget.available || 0}`);
      if (FRAMER_SELECTOR || NTH_SECTION) {
        warn('  → Aborting: explicit selector/nth-section did not match. Check your CSS selector.');
        await framerPage.close().catch(() => {});
        process.exit(2);
      }
    }

    const framerProfile = await extractStyleProfile(framerPage, FRAMER_SELECTOR, NTH_SECTION);
    info(`  Framer: ${framerProfile.element_count} elements, ${framerProfile.unique_colors} colors, ${framerProfile.font_families.length} font families`);

    if (backend === 'playwright') await framerCtx.close();
    else await framerPage.close();

    // ── Extract Elementor styles ───────────────────────────────────────────
    info(`Extracting Elementor styles...`);
    const elCtx = backend === 'playwright'
      ? await browser.newContext({ viewport: { width: 1440, height: 900 } })
      : null;
    const elPage = backend === 'playwright'
      ? await elCtx.newPage()
      : await browser.newPage();

    if (backend === 'puppeteer') await elPage.setViewport({ width: 1440, height: 900 });

    await elPage.goto(ELEMENTOR_URL, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });
    await elPage.waitForTimeout(WAIT_MS);

    const elTarget = await findTargetElement(elPage, EL_SELECTOR, NTH_SECTION);
    if (!elTarget.found) {
      warn(`Elementor: target not found. Selector="${EL_SELECTOR || 'auto'}", nth=${NTH_SECTION}`);
      if (EL_SELECTOR || NTH_SECTION) {
        warn('  → Aborting: explicit selector/nth-section did not match. Check your CSS selector.');
        await elPage.close().catch(() => {});
        process.exit(2);
      }
    }

    const elementorProfile = await extractStyleProfile(elPage, EL_SELECTOR, NTH_SECTION);
    info(`  Elementor: ${elementorProfile.element_count} elements, ${elementorProfile.unique_colors} colors, ${elementorProfile.font_families.length} font families`);

    if (backend === 'playwright') await elCtx.close();
    else await elPage.close();

    // ── Diff ────────────────────────────────────────────────────────────────
    info(`Computing diff...`);
    const diffs = compareProfiles(framerProfile, elementorProfile);

    const severityScore = { PASS: 0, WARN: 1, FAIL: 2 };
    let maxSeverity = 0;
    for (const d of diffs) {
      const s = severityScore[d.severity] || 0;
      if (s > maxSeverity) maxSeverity = s;
    }

    // ── Overall score ──────────────────────────────────────────────────────
    const { overall_score, category_scores } = computeOverallScore(diffs);

    // ── Report ──────────────────────────────────────────────────────────────
    const report = {
      meta: {
        framer_url: FRAMER_URL,
        elementor_url: ELEMENTOR_URL,
        backend,
        timestamp: new Date().toISOString(),
        max_severity: ['PASS', 'WARN', 'FAIL'][maxSeverity],
        categories_tested: diffs.length,
        overall_score,
        category_scores,
      },
      diff: diffs,
      raw: {
        framer: {
          selector: FRAMER_SELECTOR || `nth-section(${NTH_SECTION || 1})`,
          target_found: framerTarget.found,
          colors_count: framerProfile.unique_colors,
          element_count: framerProfile.element_count,
        },
        elementor: {
          selector: EL_SELECTOR || `nth-section(${NTH_SECTION || 1})`,
          target_found: elTarget.found,
          colors_count: elementorProfile.unique_colors,
          element_count: elementorProfile.element_count,
        },
      },
    };

    const json = JSON.stringify(report, null, 2);
    if (OUTPUT_PATH) {
      mkdirSync(resolve(OUTPUT_PATH, '..'), { recursive: true });
      writeFileSync(OUTPUT_PATH, json, 'utf8');
      info(`Report → ${OUTPUT_PATH}`);
    } else {
      console.log(json);
    }

    // ── Console summary ────────────────────────────────────────────────────
    info('');
    for (const d of diffs) {
      const icon = d.severity === 'PASS' ? `${C.green}✓${C.r}` : d.severity === 'WARN' ? `${C.yellow}⚠${C.r}` : `${C.red}✗${C.r}`;
      info(`  ${icon} ${d.category.padEnd(12)} ${d.severity}`);
    }
    info(`  ${C.b}Overall Score:${C.r} ${overall_score}/100`);
    info('');

    // Lücke 6: Numeric threshold gate (always wins over category severity when set).
    // If --min-score N is provided and overall_score < N → force exit 2 (FAIL).
    let exitCode = maxSeverity;
    let exitLabel = ['PASS', 'WARN', 'FAIL'][maxSeverity];
    if (MIN_SCORE != null && Number.isFinite(MIN_SCORE) && overall_score < MIN_SCORE) {
      const scoreMsg = `Score ${overall_score}/100 < --min-score ${MIN_SCORE}/100`;
      info(`${C.red}${C.b}GATE FAIL — ${scoreMsg}${C.r}`);
      exitCode = 2;
      exitLabel = 'FAIL';
      // Attach gate-fail note to last report entry so callers can read it
      report.meta.min_score_threshold = MIN_SCORE;
      report.meta.gate_fail_reason = scoreMsg;
      // Re-write report with gate metadata
      if (OUTPUT_PATH) {
        writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf8');
      }
    }

    const exitColor = exitLabel === 'PASS' ? C.green : exitLabel === 'WARN' ? C.yellow : C.red;
    info(`${exitColor}${C.b}${exitLabel}${C.r}`);
    info('');

    process.exit(exitCode);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  if (args.verbose) console.error(err.stack);
  process.exit(2);
});
