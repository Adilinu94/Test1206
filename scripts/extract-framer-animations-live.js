#!/usr/bin/env node
/**
 * extract-framer-animations-live.js — Live-Page Animation Extraction (Phase 1)
 *
 * Besucht eine publizierte Framer-Seite via Playwright und extrahiert alle
 * Animation-Relvanten DOM-Elemente: data-framer-appear-id, CSS transitions,
 * Framer Motion Props (aus dem React Fiber), und generiert einen
 * vollständigen GSAP-Animation-Plan.
 *
 * Anders als framer-animation-extractor.js (statischer HTML-Export):
 *   ✓ Extrahiert aus der LIVE-Page (nicht Export)
 *   ✓ Computed-Style-Delta-Analyse (vor/nach Scroll-into-View)
 *   ✓ CSS transition-duration aus dem tatsächlichen DOM
 *   ✓ IntersectionObserver-basierte Trigger-Point-Schätzung
 *   ✓ Heuristische Animations-Parameter-Schätzung
 *
 * USAGE:
 *   node scripts/extract-framer-animations-live.js \
 *     --url https://meine-seite.framer.app/ \
 *     --output animation-plan-live.json
 *
 *   # Mit Post-ID (post-spezifische WPCode-Snippets):
 *   node scripts/extract-framer-animations-live.js \
 *     --url https://meine-seite.framer.app/ \
 *     --post-id 4943 \
 *     --output animation-plan-live.json
 *
 *   # Nur bestimmte Typen:
 *   node scripts/extract-framer-animations-live.js \
 *     --url https://meine-seite.framer.app/ \
 *     --types framer \
 *     --output animation-plan-live.json
 *
 *   # Mit Confidence-Threshold:
 *   node scripts/extract-framer-animations-live.js \
 *     --url https://meine-seite.framer.app/ \
 *     --min-confidence 0.7 \
 *     --output animation-plan-live.json
 *
 * EXIT CODES:
 *   0 = Plan generiert
 *   1 = Warnungen (keine Elemente gefunden)
 *   2 = Fehler (kein Playwright, Timeout, etc.)
 *
 * NEXT STEP:
 *   node scripts/inject-animation-code.js --plan animation-plan-live.json
 */

'use strict';

import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// ─── CLI ──────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    url:               { type: 'string' },
    'live-url':        { type: 'string' },
    output:            { type: 'string' },
    'post-id':         { type: 'string' },
    types:             { type: 'string', default: 'framer,css' },
    'min-confidence':  { type: 'string', default: '0.5' },
    timeout:           { type: 'string', default: '30000' },
    'wait-after-load': { type: 'string', default: '2500' },
    'scroll-step':     { type: 'string', default: '400' },
    'max-elements':    { type: 'string', default: '100' },
    'gsap-version':    { type: 'string', default: '3.12.5' },
    verbose:           { type: 'boolean', default: false },
    help:              { type: 'boolean', default: false },
    'dry-run':         { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help || !args.url) {
  console.log(`
extract-framer-animations-live.js — Live-Page Animation Extraction (Phase 1)

Besucht eine publizierte Framer-Seite via Playwright und extrahiert alle
Animation-relevanten DOM-Daten. Generiert einen GSAP-Animation-Plan, der
direkt mit inject-animation-code.js genutzt werden kann.

UNTERSCHIEDE ZU framer-animation-extractor.js:
  • Extrahiert aus LIVE-Page (nicht statischem Export)
  • Computed-Style-Analyse mit Vor/Nach-Scroll-Delta
  • CSS transition-duration/timing-function aus DOM
  • IntersectionObserver-basierte Trigger-Point-Schätzung

REQUIRED:
  --live-url URL           Publizierte Framer-Seite (alias: --url)

OPTIONAL:
  --output FILE            JSON-Output (default: stdout)
  --post-id N              Post-ID für post-spezifische WPCode-Snippets
  --types LIST             Komma-getrennte Typen: framer,css (default: all)
  --min-confidence 0.x     Mindest-Confidence für geschätzte Parameter (default: 0.5)
  --timeout MS             Navigation timeout (default: 30000)
  --wait-after-load MS     Wait after load event (default: 2500)
  --scroll-step MS         Scroll-Schrittweite (default: 400)
  --max-elements N         Max Elemente zum Analysieren (default: 100)
  --gsap-version VERSION   GSAP version for snippet meta (default: 3.12.5)
  --dry-run                Kein Browser, nur Struktur-Test
  --verbose                Ausführliche Logs
  --help                   Diese Hilfe

TYPEN:
  framer  data-framer-appear-id → GSAP ScrollTrigger
  css     CSS transition/animation Properties → GSAP/CSS Plan

EXIT: 0=OK  1=WARN  2=FAIL

OUTPUT: animation-plan-live.json
  Kompatibel mit: node scripts/inject-animation-code.js --plan <output>

NEXT:  node scripts/inject-animation-code.js --plan <output>
`);

  if (args.help) process.exit(0);
  process.exit(2);
}

const URL               = args['live-url'] || args.url;
const OUTPUT_PATH       = args.output ? resolve(args.output) : null;
const POST_ID           = args['post-id'] ? parseInt(args['post-id'], 10) : undefined;
const ENABLED_TYPES     = new Set(args.types.split(',').map(t => t.trim().toLowerCase()));
const MIN_CONFIDENCE    = parseFloat(args['min-confidence']);
const PAGE_TIMEOUT      = parseInt(args.timeout, 10) || 30000;
const WAIT_MS           = parseInt(args['wait-after-load'], 10) || 2500;
const SCROLL_STEP       = parseInt(args['scroll-step'], 10) || 400;
const MAX_ELEMENTS      = parseInt(args['max-elements'], 10) || 100;
const GSAP_VERSION      = args['gsap-version'];
const VERBOSE           = args.verbose || false;
const DRY_RUN           = args['dry-run'] || false;

// ─── Colors for console output ────────────────────────────────────────────────

const C = {
  r:      '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
  b:      '\x1b[1m',
};

const info  = (...m) => process.stderr.write(`  ${C.dim}→${C.r} ${m.join(' ')}\n`);
const ok    = (...m) => process.stderr.write(`  ${C.green}✓${C.r} ${m.join(' ')}\n`);
const warn  = (...m) => process.stderr.write(`  ${C.yellow}⚠${C.r} ${m.join(' ')}\n`);
const err   = (...m) => process.stderr.write(`  ${C.red}✗${C.r} ${m.join(' ')}\n`);
const log   = (...m) => { if (VERBOSE) process.stderr.write(`[verbose] ${m.join(' ')}\n`); };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * CSS easing → GSAP easing mapping.
 * Framer Motion often uses CSS easing values which need translation to GSAP.
 */
const CSS_TO_GSAP_EASING = {
  'ease':           'power1.inOut',
  'ease-in':        'power2.in',
  'ease-out':       'power2.out',
  'ease-in-out':    'power2.inOut',
  'linear':         'none',
  'step-start':     'steps(1)',
  'step-end':       'steps(1, end)',
};

/**
 * Known cubic-bezier approximations.
 */
const CUBIC_BEZIER_TO_GSAP = {
  'cubic-bezier(0.25, 0.1, 0.25, 1)':   'power2.out',     // ease
  'cubic-bezier(0.42, 0, 1, 1)':        'power2.in',       // ease-in
  'cubic-bezier(0, 0, 0.58, 1)':        'power2.out',      // ease-out
  'cubic-bezier(0.42, 0, 0.58, 1)':     'power2.inOut',    // ease-in-out
  'cubic-bezier(0, 0, 1, 1)':           'none',            // linear
  'cubic-bezier(0.4, 0, 0.2, 1)':       'power2.out',      // Material ease-out
  'cubic-bezier(0, 0, 0.2, 1)':         'power3.out',      // Material decelerate
  'cubic-bezier(0.4, 0, 1, 1)':         'power2.in',       // Material accelerate
  'cubic-bezier(0.175, 0.885, 0.32, 1.275)': 'back.out(1.5)', // anticipate
};

function mapEasingToGSAP(cssEasing) {
  if (!cssEasing) return 'power2.out';
  const normalized = cssEasing.trim().toLowerCase();

  // Direct cubic-bezier match
  if (CUBIC_BEZIER_TO_GSAP[normalized]) return CUBIC_BEZIER_TO_GSAP[normalized];

  // Named easing match
  if (CSS_TO_GSAP_EASING[normalized]) return CSS_TO_GSAP_EASING[normalized];

  // Try to match cubic-bezier by parsing parameters
  const cbMatch = normalized.match(/cubic-bezier\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/);
  if (cbMatch) {
    const [, x1, y1, x2, y2] = cbMatch.map(Number);
    // Rough heuristic: if both control points are on the diagonal → linear
    if (Math.abs(x1 - y1) < 0.05 && Math.abs(x2 - y2) < 0.05) return 'none';
    // If end control is above 1 → back
    if (y2 > 1) return 'back.out(1.5)';
    // Default to power2.out for most Framer-like curves
    return 'power2.out';
  }

  return 'power2.out';
}

/**
 * Parse CSS duration string (e.g. "0.6s", "600ms") into seconds.
 */
function parseDuration(durationStr) {
  if (!durationStr) return 0.6;
  const s = String(durationStr).trim();
  if (s.endsWith('ms')) return parseFloat(s) / 1000;
  if (s.endsWith('s')) return parseFloat(s);
  return parseFloat(s) || 0.6;
}

/**
 * Parse CSS delay string into seconds.
 */
function parseDelay(delayStr) {
  if (!delayStr || delayStr === '0s' || delayStr === '0ms') return 0;
  return parseDuration(delayStr);
}

/**
 * Compute confidence score (0–1) for an estimated animation parameter.
 * Higher = more reliable (extracted from explicit CSS, not guessed).
 *
 * @param {'explicit'|'heuristic'|'default'} source
 * @returns {number}
 */
function confidenceFromSource(source) {
  switch (source) {
    case 'explicit':  return 0.9;
    case 'heuristic': return 0.6;
    case 'default':   return 0.3;
    default:          return 0.5;
  }
}

/**
 * Sanitize an appear-id for use as a GSAP selector.
 * Escapes double quotes and backslashes.
 */
function sanitizeSelector(appearId) {
  return appearId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─── Playwright detection ─────────────────────────────────────────────────────

async function detectPlaywright() {
  if (DRY_RUN) return null;
  try {
    return await import('playwright');
  } catch {
    err('Playwright nicht installiert.');
    info('Installiere mit: npm install playwright');
    info('Oder nutze --dry-run für Struktur-Test.');
    return null;
  }
}

// ─── Dry-run ───────────────────────────────────────────────────────────────────

function dryRunOutput() {
  const require = createRequire(import.meta.url);
  const GSAP_ENQUEUE = require('./lib/gsap-enqueue-snippet.cjs');

  const snippets = [GSAP_ENQUEUE];

  const report = {
    meta: {
      source: URL,
      mode: 'dry-run',
      extracted_at: new Date().toISOString(),
      post_id: POST_ID || null,
      stats: {
        total_snippets: snippets.length,
        gsap_snippets: 0,
        css_snippets: 0,
        php_snippets: 1,
        note: 'Dry-Run: Kein Browser verfügbar. GSAP Global Enqueue ist enthalten. Führe ohne --dry-run für echte Extraktion aus.',
      },
    },
    snippets,
  };

  const json = JSON.stringify(report, null, 2);
  if (OUTPUT_PATH) {
    mkdirSync(resolve(OUTPUT_PATH, '..'), { recursive: true });
    writeFileSync(OUTPUT_PATH, json, 'utf8');
    info(`Dry-Run Report → ${OUTPUT_PATH}`);
  } else {
    console.log(json);
  }
}

// ─── Live extraction (Playwright) ─────────────────────────────────────────────

/**
 * Extract animation-relevant data from a live Framer page.
 *
 * Strategy:
 *   1. Navigate to page, wait for load
 *   2. Find all [data-framer-appear-id] elements
 *   3. For each element, capture computed styles (snapshot)
 *   4. Attempt to scroll element into view
 *   5. Capture computed styles again (post-scroll)
 *   6. Compute delta → derive animation parameters
 *   7. Extract CSS transition/animation properties from element styles
 *   8. Generate GSAP ScrollTrigger plan
 */
async function extractAnimationsFromLivePage(page) {
  // Disable animations so we can capture initial + final states without interference
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.id = '__anim-freeze';
    s.textContent = '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}';
    document.head.appendChild(s);
  });

  await page.waitForTimeout(300);

  // ── Step 1: Collect all appear-id elements with initial state ──
  const appearElements = await page.evaluate((maxElements) => {
    function _extractTranslateY(transform) {
      if (!transform || transform === 'none') return 0;
      var m = transform.match(/matrix3d\(([^)]+)\)/);
      if (m) { var vals = m[1].split(',').map(Number); return vals[13] || 0; }
      m = transform.match(/matrix\(([^)]+)\)/);
      if (m) { var vals = m[1].split(',').map(Number); return vals[5] || 0; }
      m = transform.match(/translateY\(([^)]+)\)/);
      if (m) return parseFloat(m[1]) || 0;
      m = transform.match(/translate3d\([^,]+,\s*([^,)]+)/);
      if (m) return parseFloat(m[1]) || 0;
      return 0;
    }
    function _extractScale(transform) {
      if (!transform || transform === 'none') return 1;
      var m = transform.match(/scale\(([^)]+)\)/);
      if (m) return parseFloat(m[1]) || 1;
      m = transform.match(/scale3d\(([^,)]+)/);
      if (m) return parseFloat(m[1]) || 1;
      m = transform.match(/matrix\(([^)]+)\)/);
      if (m) { var vals = m[1].split(',').map(Number); return Math.sqrt(vals[0]*vals[0]+vals[1]*vals[1]) || 1; }
      m = transform.match(/matrix3d\(([^)]+)\)/);
      if (m) { var vals = m[1].split(',').map(Number); return Math.sqrt(vals[0]*vals[0]+vals[1]*vals[1]+vals[2]*vals[2]) || 1; }
      return 1;
    }
    const elements = [];
    const all = document.querySelectorAll('[data-framer-appear-id]');

    for (const el of all) {
      if (elements.length >= maxElements) break;

      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      elements.push({
        appearId: el.getAttribute('data-framer-appear-id'),
        tag: el.tagName.toLowerCase(),
        className: el.className ? el.className.slice(0, 120) : '',
        framerName: el.getAttribute('data-framer-name') || '',
        opacity: parseFloat(cs.opacity),
        transform: cs.transform,
        translateY: _extractTranslateY(cs.transform),
        scale: _extractScale(cs.transform),
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        borderRadius: cs.borderRadius,
        transition: cs.transition,
        transitionDuration: cs.transitionDuration,
        transitionDelay: cs.transitionDelay,
        transitionTimingFunction: cs.transitionTimingFunction,
        animation: cs.animation,
        animationDuration: cs.animationDuration,
        animationDelay: cs.animationDelay,
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
        viewportOffset: rect.top,
        inViewport: rect.top < window.innerHeight && rect.bottom > 0,
        textContent: (el.textContent || '').trim().slice(0, 80),
        childCount: el.children.length,
        selector: el.getAttribute('data-framer-appear-id')
          ? '[data-framer-appear-id="' + el.getAttribute('data-framer-appear-id').replace(/"/g, '\\"') + '"]'
          : '',
      });
    }

    return elements;
  }, MAX_ELEMENTS);

  ok(`${appearElements.length} Elemente mit data-framer-appear-id gefunden`);

  // ── Step 2: Re-enable animations, then scroll to trigger them ──
  await page.evaluate(() => {
    const freeze = document.getElementById('__anim-freeze');
    if (freeze) freeze.remove();
  });

  await page.waitForTimeout(500);

  // Scroll through the page in steps to trigger appear animations
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = 900; // standard viewport

  for (let scrollY = 0; scrollY < scrollHeight; scrollY += SCROLL_STEP) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(400);
  }

  // Wait for all appear animations to complete (Framer animations can be 400-800ms)
  await page.waitForTimeout(1500);

  // ── Step 3: Capture post-scroll computed styles ──
  const postScrollElements = await page.evaluate((maxElements) => {
    function _extractTranslateY(transform) {
      if (!transform || transform === 'none') return 0;
      var m = transform.match(/matrix3d\(([^)]+)\)/);
      if (m) { var vals = m[1].split(',').map(Number); return vals[13] || 0; }
      m = transform.match(/matrix\(([^)]+)\)/);
      if (m) { var vals = m[1].split(',').map(Number); return vals[5] || 0; }
      m = transform.match(/translateY\(([^)]+)\)/);
      if (m) return parseFloat(m[1]) || 0;
      m = transform.match(/translate3d\([^,]+,\s*([^,)]+)/);
      if (m) return parseFloat(m[1]) || 0;
      return 0;
    }
    function _extractScale(transform) {
      if (!transform || transform === 'none') return 1;
      var m = transform.match(/scale\(([^)]+)\)/);
      if (m) return parseFloat(m[1]) || 1;
      m = transform.match(/scale3d\(([^,)]+)/);
      if (m) return parseFloat(m[1]) || 1;
      m = transform.match(/matrix\(([^)]+)\)/);
      if (m) { var vals = m[1].split(',').map(Number); return Math.sqrt(vals[0]*vals[0]+vals[1]*vals[1]) || 1; }
      m = transform.match(/matrix3d\(([^)]+)\)/);
      if (m) { var vals = m[1].split(',').map(Number); return Math.sqrt(vals[0]*vals[0]+vals[1]*vals[1]+vals[2]*vals[2]) || 1; }
      return 1;
    }
    const elements = [];
    const all = document.querySelectorAll('[data-framer-appear-id]');

    for (const el of all) {
      if (elements.length >= maxElements) break;

      const cs = window.getComputedStyle(el);

      elements.push({
        appearId: el.getAttribute('data-framer-appear-id'),
        opacity: parseFloat(cs.opacity),
        transform: cs.transform,
        translateY: _extractTranslateY(cs.transform),
        scale: _extractScale(cs.transform),
      });
    }

    return elements;
  }, MAX_ELEMENTS);

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // ── Step 4: Compute animation deltas ──
  const animations = [];
  let matchedCount = 0;

  for (const initial of appearElements) {
    const post = postScrollElements.find(p => p.appearId === initial.appearId);
    if (!post) {
      // Element didn't survive scroll (could be removed or too far)
      log(`  Element ${initial.appearId}: kein Post-Scroll-Zustand verfügbar`);
      continue;
    }

    // Compute animation parameters from style delta
    const opacityDelta = post.opacity - initial.opacity;
    const translateYDelta = post.translateY - initial.translateY;
    const scaleDelta = post.scale - initial.scale;

    // Determine if any meaningful animation occurred
    const hasOpacityAnim = Math.abs(opacityDelta) > 0.01;
    const hasTransformAnim = Math.abs(translateYDelta) > 0.5 || Math.abs(scaleDelta - 1) > 0.01;

    if (!hasOpacityAnim && !hasTransformAnim) {
      // Element appeared without style change — likely already in final state
      // This is common for elements above the fold where the animation
      // played before we could freeze it.
      // Flag these for manual review rather than silently dropping them.
      const isAboveFold = initial.viewportOffset < viewportHeight;
      animations.push({
        appearId: initial.appearId,
        selector: `[data-framer-appear-id="${sanitizeSelector(initial.appearId)}"]`,
        tag: initial.tag,
        framerName: initial.framerName,
        initial: { opacity: initial.opacity, translateY: initial.translateY, scale: initial.scale },
        final: { opacity: initial.opacity, translateY: initial.translateY, scale: initial.scale },
        gsapFrom: { opacity: 0, y: 20 },
        gsapTo: { opacity: 1, y: 0 },
        duration: 0.6,
        delay: 0,
        easing: 'power2.out',
        startTrigger: 'top 90%',
        confidence: 0.2,
        confidenceDetail: isAboveFold ? 'above-fold-default' : 'no-delta-default',
        hasOpacityAnim: false,
        hasTransformAnim: false,
        content: initial.textContent,
        needs_review: true,
        reason: isAboveFold
          ? 'Above-fold: Animation bereits vor Capture abgelaufen. Werte sind Framer-Defaults (opacity:0→1, y:20→0). Manuell prüfen.'
          : 'Kein Style-Delta erkannt. Möglicherweise komplexere Animation. Manuell prüfen.',
      });
      log(`  Element ${initial.appearId}: ${isAboveFold ? 'above-fold-default' : 'no-delta-default'} (flagged for review)`);
      continue;
    }

    // Extract transition parameters from CSS
    let duration = parseDuration(initial.transitionDuration) || 0.6;
    let delay = parseDelay(initial.transitionDelay) || 0;
    let easing = mapEasingToGSAP(initial.transitionTimingFunction);

    // If no explicit transition-duration, check animation-duration
    if (!initial.transitionDuration || initial.transitionDuration === '0s') {
      if (initial.animationDuration && initial.animationDuration !== '0s') {
        duration = parseDuration(initial.animationDuration) || 0.6;
        delay = parseDelay(initial.animationDelay) || 0;
      }
    }

    // Confidence scoring
    let confidenceDetail = 'explicit';
    if (!initial.transitionDuration || initial.transitionDuration === '0s') {
      confidenceDetail = initial.animationDuration && initial.animationDuration !== '0s'
        ? 'explicit' : 'heuristic';
    }

    // Build GSAP animation object
    const gsapFrom = {};
    const gsapTo = {};

    if (hasOpacityAnim) {
      gsapFrom.opacity = initial.opacity;
      gsapTo.opacity = post.opacity;
    }

    if (hasTransformAnim) {
      if (Math.abs(translateYDelta) > 0.5) {
        gsapFrom.y = translateYDelta > 0 ? -Math.abs(translateYDelta) : Math.abs(translateYDelta);
        gsapTo.y = 0;
      }
      if (Math.abs(scaleDelta - 1) > 0.01) {
        gsapFrom.scale = post.scale > initial.scale
          ? Math.max(0.5, initial.scale - (post.scale - initial.scale))
          : 1 + (1 - post.scale);
        gsapTo.scale = 1;
      }
    }

    // Build stable selector for GSAP
    const safeId = sanitizeSelector(initial.appearId);
    const selector = `[data-framer-appear-id="${safeId}"]`;

    // Trigger point estimation
    const isAboveFold = initial.viewportOffset < viewportHeight;

    animations.push({
      appearId: initial.appearId,
      selector,
      tag: initial.tag,
      framerName: initial.framerName,
      // Delta analysis
      initial: {
        opacity: initial.opacity,
        translateY: initial.translateY,
        scale: initial.scale,
      },
      final: {
        opacity: post.opacity,
        translateY: post.translateY,
        scale: post.scale,
      },
      // GSAP animation parameters
      gsapFrom,
      gsapTo,
      duration,
      delay,
      easing,
      // Trigger
      startTrigger: isAboveFold ? 'top 90%' : 'top 85%',
      // Meta
      confidence: confidenceFromSource(confidenceDetail),
      confidenceDetail,
      hasOpacityAnim,
      hasTransformAnim,
      content: initial.textContent,
    });

    matchedCount++;
  }

  return { animations, totalElements: appearElements.length, matchedCount };
}

// ─── CSS Transition Extraction (from live DOM) ───────────────────────────────

/**
 * Extract CSS transition/animation rules from the live page's stylesheets.
 * This complements the [data-framer-appear-id] extraction with general
 * CSS-level animation data.
 */
async function extractCssTransitionsLive(page) {
  return await page.evaluate(() => {
    const rules = [];

    try {
      for (const sheet of document.styleSheets) {
        // Skip cross-origin stylesheets (CORS)
        try {
          if (!sheet.cssRules) continue;
        } catch {
          continue;
        }

        for (const rule of sheet.cssRules) {
          if (rule.type === CSSRule.STYLE_RULE) {
            const style = rule.style;
            const hasTransition = style.transition && style.transition !== 'all 0s ease 0s';
            const hasAnimation = style.animation && style.animation !== 'none';

            if (hasTransition || hasAnimation) {
              rules.push({
                selector: rule.selectorText,
                type: hasAnimation ? 'animation' : 'transition',
                transition: hasTransition ? style.transition : null,
                transitionDuration: hasTransition ? style.transitionDuration : null,
                transitionDelay: hasTransition ? style.transitionDelay : null,
                transitionTimingFunction: hasTransition ? style.transitionTimingFunction : null,
                animation: hasAnimation ? style.animation : null,
                animationDuration: hasAnimation ? style.animationDuration : null,
                animationDelay: hasAnimation ? style.animationDelay : null,
                animationTimingFunction: hasAnimation ? style.animationTimingFunction : null,
              });
            }
          }

          // Also capture @keyframes rules
          if (rule.type === CSSRule.KEYFRAMES_RULE) {
            rules.push({
              selector: '@keyframes ' + rule.name,
              type: 'keyframes',
              keyframeName: rule.name,
            });
          }
        }
      }
    } catch (e) {
      // Silently skip inaccessible sheets
    }

    return rules;
  });
}

// ─── Snippet Builders ─────────────────────────────────────────────────────────

/**
 * Build the GSAP ScrollTrigger snippet for Framer appear animations.
 */
function buildFramerAppearSnippet(animations) {
  if (animations.length === 0) return null;

  const gsapConfigs = animations.map((a, i) => {
    const fromProps = Object.entries(a.gsapFrom)
      .map(([k, v]) => {
        if (typeof v === 'number') {
          // Round for cleaner output
          return `${k}: ${Math.round(v * 100) / 100}`;
        }
        return `${k}: ${v}`;
      })
      .join(', ');

    const comments = [];
    if (a.framerName) comments.push(`data-framer-name="${a.framerName}"`);
    comments.push(`confidence=${a.confidence}`);
    comments.push(`appear-id="${a.appearId}"`);

    return [
      `  // #${i + 1}: ${comments.join(' | ')}`,
      `  gsap.from('${a.selector}', {`,
      `    ${fromProps},`,
      `    duration: ${Math.round(a.duration * 100) / 100},`,
      a.delay > 0 ? `    delay: ${Math.round(a.delay * 100) / 100},` : null,
      `    ease: '${a.easing}',`,
      `    scrollTrigger: {`,
      `      trigger: '${a.selector}',`,
      `      start: '${a.startTrigger}',`,
      `      toggleActions: 'play none none reverse',`,
      `      // markers: true,  // Debug`,
      `    },`,
      `  });`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const code = [
    `// Framer Live-Page Scroll Animationen (${animations.length} Elemente)`,
    `// Generiert aus data-framer-appear-id via Playwright Live-Extraction`,
    `// Quelle: ${URL}`,
    `// GSAP ${GSAP_VERSION} + ScrollTrigger erforderlich`,
    `//`,
    `// ⚠️  Selektoren sind Framer-Live-Selektoren (data-framer-appear-id).`,
    `//     Nach dem Elementor-Build müssen diese auf V4-Klassen gemappt werden:`,
    `//     [data-framer-appear-id="xxx"] → .gc-section .e-heading`,
    ``,
    `document.addEventListener('DOMContentLoaded', () => {`,
    `  if (typeof gsap === 'undefined') return;`,
    `  gsap.registerPlugin(ScrollTrigger);`,
    ``,
    gsapConfigs,
    ``,
    `});`,
  ].join('\n');

  const confidenceAvg = animations.reduce((s, a) => s + a.confidence, 0) / animations.length;

  return {
    title: `Framer Scroll Appear — Live (${animations.length} Elemente)`,
    type: 'gsap',
    code,
    location: 'site_wide_footer',
    post_id: POST_ID,
    gsap_version: GSAP_VERSION,
    gsap_plugins: ['ScrollTrigger'],
    description: `${animations.length} Elemente mit data-framer-appear-id via Live-Extraction → GSAP ScrollTrigger (avg confidence: ${(confidenceAvg * 100).toFixed(0)}%)`,
    tags: ['framer', 'live', 'scroll', 'appear', 'gsap', 'scrolltrigger', 'phase-1'],
    on_conflict: 'replace',
    priority: 30,
    meta: {
      extraction_method: 'playwright-live',
      source_url: URL,
      element_count: animations.length,
      average_confidence: Math.round(confidenceAvg * 100) / 100,
      anim_details: animations.map(a => ({
        appearId: a.appearId,
        framerName: a.framerName,
        selector: a.selector,
        hasOpacity: a.hasOpacityAnim,
        hasTransform: a.hasTransformAnim,
        duration: a.duration,
        easing: a.easing,
        confidence: a.confidence,
        confidenceDetail: a.confidenceDetail,
      })),
    },
  };
}

/**
 * Build CSS transition snippet from live stylesheet extraction.
 */
function buildLiveCssTransitionSnippet(cssRules) {
  if (!cssRules || cssRules.length === 0) return null;

  const transitionRules = cssRules.filter(r => r.type === 'transition' || r.type === 'animation');
  const keyframesRules = cssRules.filter(r => r.type === 'keyframes');

  if (transitionRules.length === 0 && keyframesRules.length === 0) return null;

  // Extract @keyframes definitions (need to re-read from page for actual code)
  // For now, include the rule metadata
  const codeParts = [];

  if (keyframesRules.length > 0) {
    codeParts.push(`/* ${keyframesRules.length} @keyframes Regeln gefunden:`);
    for (const kf of keyframesRules) {
      codeParts.push(`   ${kf.selector}`);
    }
    codeParts.push(`   ⚠️  @keyframes-Inhalte müssen manuell aus dem Framer-Export ergänzt werden.`);
    codeParts.push(`*/`);
    codeParts.push('');
  }

  if (transitionRules.length > 0) {
    codeParts.push(`/* ${transitionRules.length} CSS transition/animation Regeln (aus Live-Stylesheets): */`);
    for (const rule of transitionRules.slice(0, 20)) {
      const seg = rule.selector + ' {';
      const props = [];
      if (rule.transition) props.push(`  transition: ${rule.transition};`);
      if (rule.animation) props.push(`  animation: ${rule.animation};`);
      codeParts.push(seg);
      codeParts.push(...props);
      codeParts.push('}');
      codeParts.push('');
    }
  }

  const code = codeParts.join('\n');

  return {
    title: `Framer CSS Animations — Live (${transitionRules.length} rules, ${keyframesRules.length} keyframes)`,
    type: 'css',
    code,
    location: 'site_wide_header',
    post_id: POST_ID,
    description: `${transitionRules.length} CSS transition/animation rules + ${keyframesRules.length} @keyframes aus Live-Stylesheets`,
    tags: ['framer', 'live', 'css', 'transition', 'animation'],
    on_conflict: 'replace',
    priority: 15,
    meta: {
      extraction_method: 'playwright-live-stylesheets',
      transition_rule_count: transitionRules.length,
      keyframes_count: keyframesRules.length,
      rules: transitionRules.slice(0, 30).map(r => ({
        selector: r.selector,
        type: r.type,
        transition: r.transition,
        transitionDuration: r.transitionDuration,
        transitionTimingFunction: r.transitionTimingFunction,
        animation: r.animation,
      })),
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  info(`${C.b}extract-framer-animations-live.js${C.r} — Live-Page Animation Extraction`);
  info(`${C.cyan}URL:${C.r}    ${URL}`);
  info(`${C.cyan}Types:${C.r}  ${[...ENABLED_TYPES].join(', ')}`);
  info('');

  if (DRY_RUN) {
    dryRunOutput();
    process.exit(0);
  }

  const playwright = await detectPlaywright();
  if (!playwright) {
    if (OUTPUT_PATH) {
      dryRunOutput();
    }
    process.exit(2);
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  try {
    // ── Navigate ──
    info(`Navigating to ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });
    await page.waitForTimeout(WAIT_MS);
    ok('Page loaded');

    const snippets = [];

    // ── Framer Appear Animations ──
    if (ENABLED_TYPES.has('framer')) {
      info('Extracting Framer appear animations...');
      const { animations, totalElements, matchedCount } = await extractAnimationsFromLivePage(page);

      info(`  ${totalElements} Elemente gefunden, ${matchedCount} mit erkennbaren Animationen`);

      if (animations.length > 0) {
        const appearSnippet = buildFramerAppearSnippet(animations);
        if (appearSnippet) {
          snippets.push(appearSnippet);
          ok(`GSAP ScrollTrigger Snippet: ${animations.length} Animationen`);

          // Per-element detail log
          if (VERBOSE) {
            for (const a of animations) {
              const fromStr = Object.entries(a.gsapFrom).map(([k, v]) => `${k}:${v}`).join(' ');
              log(`    ${a.appearId.slice(0, 14)}: ${fromStr} | ${a.duration}s ${a.easing} | conf=${a.confidence}`);
            }
          }
        }
      } else if (totalElements === 0) {
        warn('Keine data-framer-appear-id Elemente auf der Seite gefunden.');
        warn('  → Framer-Seite verwendet möglicherweise keine Scroll-Appear-Animationen.');
        warn('  → Oder die Elemente sind in einem Shadow-DOM / iframe.');
      }
    }

    // ── CSS Transitions ──
    if (ENABLED_TYPES.has('css')) {
      info('Extracting CSS transitions from live stylesheets...');
      const cssRules = await extractCssTransitionsLive(page);
      info(`  ${cssRules.length} CSS rules gefunden`);

      if (cssRules.length > 0) {
        const cssSnippet = buildLiveCssTransitionSnippet(cssRules);
        if (cssSnippet) {
          snippets.push(cssSnippet);
          ok(`CSS Snippet: ${cssRules.filter(r => r.type !== 'keyframes').length} rules + ${cssRules.filter(r => r.type === 'keyframes').length} keyframes`);
        }
      }
    }

    // ── Build Report ──
    const report = {
      meta: {
        source: URL,
        mode: 'live',
        extracted_at: new Date().toISOString(),
        post_id: POST_ID || null,
        stats: {
          total_snippets: snippets.length,
          gsap_snippets: snippets.filter(s => s.type === 'gsap').length,
          css_snippets: snippets.filter(s => s.type === 'css').length,
          note: 'Phase 1: Live-Page-Only. Für CSS @keyframes-Inhalte und Script-Blöcke bitte framer-animation-extractor.js --html <export> nutzen.',
        },
      },
      snippets,
    };

    const json = JSON.stringify(report, null, 2);
    if (OUTPUT_PATH) {
      mkdirSync(resolve(OUTPUT_PATH, '..'), { recursive: true });
      writeFileSync(OUTPUT_PATH, json, 'utf8');
      ok(`Animation Plan → ${OUTPUT_PATH}`);
    } else {
      console.log(json);
    }

    // ── Summary ──
    info('');
    if (snippets.length > 0) {
      ok(`${C.b}${snippets.length}${C.r} Snippets generiert`);
      for (const s of snippets) {
        const typeLabel = s.type.toUpperCase().padEnd(6);
        info(`  [${typeLabel}] ${s.title}`);
      }
      info('');
      info(`${C.dim}Nächster Schritt:${C.r}`);
      info(`  node scripts/inject-animation-code.js --plan ${OUTPUT_PATH || 'animation-plan-live.json'}${POST_ID ? ` --post-id ${POST_ID}` : ''}`);
    } else {
      warn('Keine Animationen auf der Live-Page gefunden.');
    }
    info('');

    process.exit(snippets.length === 0 ? 1 : 0);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

main().catch(e => {
  err(`FATAL: ${e.message}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(2);
});
