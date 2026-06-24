#!/usr/bin/env node
/**
 * analyze-framer-layout.js — Framer-Live-Layout-Analyse (Pre-Build)
 *
 * Besucht eine publizierte Framer-Seite via Playwright und extrahiert
 * die LAYOUT-ARCHITEKTUR: Positionierung (absolute/relative), Flex-Rows,
 * Z-Index, Section-Backgrounds, Border-Radius.
 *
 * Output: layout-map.json — Ground Truth für convert-xml-to-v4.js
 *
 * USAGE:
 *   node scripts/analyze-framer-layout.js \
 *     --url https://meine-seite.framer.app/ \
 *     --output FramerExport/tokens/layout-map.json
 *
 *   # Nur Abschnitt N prüfen (1-based):
 *   node scripts/analyze-framer-layout.js \
 *     --url https://meine-seite.framer.app/ \
 *     --nth-section 1 \
 *     --output layout-map.json
 *
 * EXIT CODES:
 *   0 = Layout analysiert
 *   1 = Warnungen (unvollständige Analyse)
 *   2 = Fehler (kein Playwright, Timeout, etc.)
 */

'use strict';

import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI ──────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    url:             { type: 'string' },
    output:          { type: 'string' },
    'nth-section':   { type: 'string' },
    timeout:         { type: 'string', default: '30000' },
    'wait-after-load': { type: 'string', default: '2000' },
    verbose:         { type: 'boolean', default: false },
    help:            { type: 'boolean', default: false },
    'dry-run':       { type: 'boolean', default: false },
  },
  strict: false,
});

const URL           = args.url;
const OUTPUT_PATH   = args.output;
const NTH_SECTION   = args['nth-section'] ? parseInt(args['nth-section'], 10) : null;
const PAGE_TIMEOUT  = parseInt(args.timeout, 10) || 30000;
const WAIT_MS       = parseInt(args['wait-after-load'], 10) || 2000;
const VERBOSE       = args.verbose || false;
const DRY_RUN       = args['dry-run'] || false;

// ─── Colors for console output ────────────────────────────────────────────────

const C = {
  r:      '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  dim:    '\x1b[2m',
  b:      '\x1b[1m',
};

const info  = (...m) => process.stderr.write(`  ${C.dim}→${C.r} ${m.join(' ')}\n`);
const ok    = (...m) => process.stderr.write(`  ${C.green}✓${C.r} ${m.join(' ')}\n`);
const warn  = (...m) => process.stderr.write(`  ${C.yellow}⚠${C.r} ${m.join(' ')}\n`);
const log   = (...m) => { if (VERBOSE) process.stderr.write(`[verbose] ${m.join(' ')}\n`); };

// ─── Help ─────────────────────────────────────────────────────────────────────

if (args.help || !URL) {
  console.log(`
analyze-framer-layout.js — Framer-Live-Layout-Analyse (Pre-Build)

Besucht eine Framer-Seite via Playwright und extrahiert die
Layout-Architektur für die Elementor-Konvertierung.

USAGE:
  node scripts/analyze-framer-layout.js --url URL [options]

REQUIRED:
  --url URL          Publizierte Framer-Seite

OPTIONAL:
  --output FILE      JSON-Output (default: stdout)
  --nth-section N    1-based: nur diesen Abschnitt analysieren
  --timeout MS       Navigation timeout (default: 30000)
  --wait-after-load MS Wait after load event (default: 2000)
  --dry-run          Kein Browser, Platzhalter-Report
  --verbose          Ausführliche Logs
  --help             Diese Hilfe

EXIT: 0=OK  1=WARN  2=FAIL

OUTPUT: layout-map.json
  sections[]: {
    index:      1-based index
    position:   "absolute" | "relative" | "static"
    layout:     "stack-row" | "stack-column" | "default"
    z_index:    number > 0 (nur wenn explizit gesetzt)
    elements:   Anzahl der Kinder
    backgrounds: {
      has_image:   boolean
      has_color:   boolean
    }
    border_radius: number (max px)
    fonts:       Liste der Font-Familien
  }
`);

  if (args.help) process.exit(0);
  process.exit(2);
}

// ─── Playwright check ─────────────────────────────────────────────────────────

let playwright;
try {
  playwright = await import('playwright');
} catch {
  warn('Playwright nicht installiert. Installiere mit: npm install playwright');
  if (DRY_RUN) {
    warn('Dry-Run: Erstelle Platzhalter-Report ohne Browser-Daten.');
  } else {
    process.exit(2);
  }
}

// ─── Dry-Run / Live ───────────────────────────────────────────────────────────

if (DRY_RUN) {
  warn('DRY-RUN: Erzeuge Platzhalter-Report.');
  const placeholderReport = {
    meta: {
      url: URL,
      dry_run: true,
      timestamp: new Date().toISOString(),
      sections_analyzed: 0,
      note: 'Platzhalter — führe ohne --dry-run für echte Analyse aus',
    },
    sections: [],
  };
  if (OUTPUT_PATH) {
    mkdirSync(resolve(OUTPUT_PATH, '..'), { recursive: true });
    writeFileSync(OUTPUT_PATH, JSON.stringify(placeholderReport, null, 2), 'utf8');
    info(`Platzhalter-Report → ${OUTPUT_PATH}`);
  } else {
    console.log(JSON.stringify(placeholderReport, null, 2));
  }
  process.exit(0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function analyzeFramerLayout(pageUrl) {
  const browser = await playwright.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  try {
    info(`Navigating to ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });
    await page.waitForTimeout(WAIT_MS);

    // ── Extrahiere Layout-Architektur der Haupt-Sections ──
    const layoutData = await page.evaluate((nthSection) => {
      // Finde Haupt-Sections: Direkte Kinder von body oder main container
      const containers = document.querySelectorAll('body > div, body > section, [class*="section"], [class*="hero"], [data-framer-name]');
      const sections = [];

      // Wenn nthSection gesetzt, filtere auf diesen Index
      const targets = nthSection
        ? [containers[Math.min(nthSection - 1, containers.length - 1)]].filter(Boolean)
        : Array.from(containers).slice(0, 10); // Max 10 Sections

      for (const el of targets) {
        const style = window.getComputedStyle(el);

        // Position
        const position = style.position;

        // Layout-Typ: Prüfe Flex-Direction
        let layout = 'default';
        const display = style.display;
        if (display === 'flex' || display === 'inline-flex') {
          layout = style.flexDirection === 'column' ? 'stack-column' : 'stack-row';
        }

        // Z-Index (nur wenn > 0)
        const zIndex = parseInt(style.zIndex, 10);
        const zIndexValue = (!isNaN(zIndex) && zIndex > 0) ? zIndex : null;

        // Background
        const bgImage = style.backgroundImage;
        const bgColor = style.backgroundColor;
        const hasImage = bgImage && bgImage !== 'none' && !bgImage.includes('gradient');
        const hasColor = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
        const hasGradient = bgImage && bgImage.includes('gradient');

        // Border-Radius (höchsten Wert finden)
        const br = [
          parseFloat(style.borderTopLeftRadius) || 0,
          parseFloat(style.borderTopRightRadius) || 0,
          parseFloat(style.borderBottomLeftRadius) || 0,
          parseFloat(style.borderBottomRightRadius) || 0,
        ];
        const maxBorderRadius = Math.max(...br);

        // Font-Families (sammle unique)
        const fonts = new Set();
        const textNodes = el.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button');
        for (const node of textNodes) {
          const ff = window.getComputedStyle(node).fontFamily;
          if (ff) {
            ff.split(',').forEach(f => fonts.add(f.trim().replace(/["']/g, '')));
          }
        }

        // Buttons im Section (Pill check)
        const buttons = el.querySelectorAll('button, a[class*="button"], [class*="btn"]');
        let hasPillButtons = false;
        for (const btn of buttons) {
          const btnBr = parseFloat(window.getComputedStyle(btn).borderRadius);
          if (btnBr >= 40) { hasPillButtons = true; break; }
        }

        // Element-Name (Framer data-framer-name)
        const framerName = el.getAttribute('data-framer-name') || el.className.slice(0, 60);

        sections.push({
          name: framerName,
          tag: el.tagName.toLowerCase(),
          display,
          position,
          layout,
          z_index: zIndexValue,
          element_count: el.querySelectorAll('*').length,
          backgrounds: {
            has_image: hasImage,
            has_color: hasColor,
            has_gradient: hasGradient,
          },
          border_radius_max: maxBorderRadius,
          has_pill_buttons: hasPillButtons,
          fonts: Array.from(fonts).slice(0, 10), // Max 10
        });
      }

      return sections;
    }, NTH_SECTION);

    ok(`${layoutData.length} Sections analysiert`);
    for (const sec of layoutData) {
      const posIcon = sec.position === 'absolute' ? `${C.yellow}absolute${C.r}` : sec.position;
      const layoutIcon = sec.layout === 'stack-row' ? `${C.yellow}flex-row${C.r}` : sec.layout;
      info(`${sec.name}: pos=${posIcon} layout=${layoutIcon} z=${sec.z_index || '-'} bg-img=${sec.backgrounds.has_image} pill=${sec.has_pill_buttons}`);
    }

    // ── Report ──
    const report = {
      meta: {
        url: pageUrl,
        timestamp: new Date().toISOString(),
        sections_analyzed: layoutData.length,
        nth_section: NTH_SECTION || null,
      },
      sections: layoutData,
      // Zusammenfassung: Welche Layout-Muster wurden gefunden?
      patterns: {
        has_absolute_header: layoutData.some(s => s.position === 'absolute'),
        has_flex_row: layoutData.some(s => s.layout === 'stack-row'),
        has_z_index: layoutData.some(s => s.z_index !== null),
        has_pill_buttons: layoutData.some(s => s.has_pill_buttons),
        has_section_background_image: layoutData.some(s => s.backgrounds.has_image),
        has_section_background_color: layoutData.some(s => s.backgrounds.has_color),
      },
    };

    const json = JSON.stringify(report, null, 2);
    if (OUTPUT_PATH) {
      mkdirSync(resolve(OUTPUT_PATH, '..'), { recursive: true });
      writeFileSync(OUTPUT_PATH, json, 'utf8');
      ok(`Layout-Map → ${OUTPUT_PATH}`);
    } else {
      console.log(json);
    }

    info('');
    const patterns = report.patterns;
    const activePatterns = Object.entries(patterns).filter(([, v]) => v).map(([k]) => k);
    if (activePatterns.length > 0) {
      warn(`Gefundene Patterns: ${activePatterns.join(', ')}`);
      warn('→ FRAMER-VS-ELEMENTOR-PATTERNS.md konsultieren für korrekte Konvertierung.');
    } else {
      ok('Keine speziellen Layout-Patterns gefunden (einfaches Stack-Layout).');
    }
    info('');

    process.exit(0);
  } finally {
    await browser.close();
  }
}

analyzeFramerLayout(URL).catch(err => {
  console.error(`[FATAL] ${err.message}`);
  if (VERBOSE) console.error(err.stack);
  process.exit(2);
});
