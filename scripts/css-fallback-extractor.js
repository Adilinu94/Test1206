#!/usr/bin/env node
/**
 * css-fallback-extractor.js  —  Fix #11: Automatischer CSS-Fallback
 *
 * Wird von convert-xml-to-v4.js aufgerufen wenn getProjectXml() keine
 * Style-Daten liefert (Unframer MCP offline oder leere StyleMap).
 *
 * Strategie:
 *   1. Prüft ob ein Framer-Export-HTML vorhanden ist (--html)
 *   2. Oder crawlt die publizierte Framer-URL (--url)
 *   3. Extrahiert CSS-Tokens via extract-framer-css-tokens.js Logik
 *   4. Schreibt token-mapping.json + style-map.json als Fallback
 *
 * Wird intern von pipeline-run-with-fallback.js importiert.
 * Kann auch standalone genutzt werden:
 *   node scripts/css-fallback-extractor.js --url https://foo.framer.app/ --output-dir FramerExport/tokens/
 *
 * Exit-Codes:
 *   0  — Fallback erfolgreich
 *   1  — Kein Fallback verfügbar (weder HTML noch URL)
 *   2  — Fetch-Fehler
 */

import fs   from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    url:          { type: 'string' },   // Publizierte Framer-URL
    html:         { type: 'string' },   // Lokales FramerExport HTML
    'output-dir': { type: 'string', default: 'FramerExport/tokens' },
    'style-map-output': { type: 'string' },  // Pfad für style-map.json
    'token-output':     { type: 'string' },  // Pfad für token-mapping.json
    verbose:      { type: 'boolean', default: false },
    'dry-run':    { type: 'boolean', default: false }, // Nur prüfen ob Fallback nötig
  },
  strict: false,
});

const log  = (...m) => { if (args.verbose) process.stderr.write('[css-fallback] ' + m.join(' ') + '\n'); };
const warn = (m)    => process.stderr.write(`⚠ [css-fallback] ${m}\n`);
const info = (m)    => process.stderr.write(`ℹ [css-fallback] ${m}\n`);

// ─── Prüfe ob Fallback nötig ist ────────────────────────────────────────────

/**
 * Prüft ob eine style-map.json leer ist (0 textStyles, 0 colorStyles).
 * Gibt true zurück wenn Fallback nötig ist.
 */
export function styleMapIsEmpty(styleMapPath) {
  if (!styleMapPath || !fs.existsSync(styleMapPath)) return true;
  try {
    const sm = JSON.parse(fs.readFileSync(styleMapPath, 'utf8'));
    const tsCount = Object.keys(sm.textStyles  || {}).length;
    const csCount = Object.keys(sm.colorStyles || {}).length;
    return tsCount === 0 && csCount === 0;
  } catch {
    return true;
  }
}

/**
 * Crawlt die Framer-URL und extrahiert CSS-Tokens.
 * Gibt { tokenMapping, styleMap } zurück oder null bei Fehler.
 */
async function fetchCssTokens(url) {
  info(`CSS-Fallback: Lade Framer-Seite ${url}`);
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'framer-v4-pipeline/css-fallback' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return parseCssFromHtml(html, url);
  } catch (e) {
    warn(`Fetch fehlgeschlagen: ${e.message}`);
    return null;
  }
}

function loadHtmlTokens(htmlPath) {
  if (!fs.existsSync(htmlPath)) { warn(`HTML nicht gefunden: ${htmlPath}`); return null; }
  const html = fs.readFileSync(htmlPath, 'utf8');
  return parseCssFromHtml(html, htmlPath);
}

/**
 * Extrahiert CSS-Variablen, Farben, TextStyles aus HTML/CSS.
 * Gibt { tokenMapping, styleMap } zurück.
 */
function parseCssFromHtml(html, source) {
  // Alle <style>-Blöcke + inline style-Attribute zusammenführen
  const styleBlocks = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) styleBlocks.push(m[1]);
  const css = styleBlocks.join('\n');

  // ── Farb-Tokens (CSS Custom Properties) ────────────────────────────────────
  const colorMap = {};
  const colorVarRe = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g;
  let cv;
  while ((cv = colorVarRe.exec(css)) !== null) {
    const hex = normalizeHex(cv[2]);
    if (hex) colorMap[`--${cv[1]}`] = hex;
  }
  log(`CSS-Fallback: ${Object.keys(colorMap).length} Farb-Tokens gefunden`);

  // ── TextStyles aus CSS-Klassen ──────────────────────────────────────────────
  // Framer rendert TextStyles als .framer-text-* Klassen
  const textStyles = {};
  const classRe = /\.(framer-[\w-]+)\s*\{([^}]+)\}/g;
  let cr;
  while ((cr = classRe.exec(css)) !== null) {
    const className = cr[1];
    const body = cr[2];
    if (!body.includes('font-size') && !body.includes('font-family')) continue;

    const get = (prop) => {
      const r = new RegExp(`${prop}\\s*:\\s*([^;]+)`);
      const match = r.exec(body);
      return match ? match[1].trim() : null;
    };

    textStyles[`/${className}`] = {
      fontSize:      get('font-size'),
      fontWeight:    get('font-weight'),
      fontFamily:    get('font-family')?.replace(/['"]/g, ''),
      lineHeight:    get('line-height'),
      letterSpacing: get('letter-spacing'),
      color:         null,
    };
  }
  log(`CSS-Fallback: ${Object.keys(textStyles).length} TextStyle-Klassen gefunden`);

  // ── Breakpoints ─────────────────────────────────────────────────────────────
  const breakpoints = [];
  const bpRe = /@media[^{]*\(max-width\s*:\s*(\d+)px\)/g;
  let bp;
  while ((bp = bpRe.exec(css)) !== null) {
    const px = parseInt(bp[1]);
    if (!breakpoints.includes(px)) breakpoints.push(px);
  }
  breakpoints.sort((a, b) => b - a);

  const tokenMapping = {
    meta: { source, source_type: 'css-fallback', generated_at: new Date().toISOString() },
    colors: colorMap,
    textStyles: {},
    fonts: [],
    breakpoints: breakpoints.map(px => ({ px, label: px <= 480 ? 'mobile' : 'tablet' })),
  };

  const styleMap = { textStyles, colorStyles: colorMap };

  return { tokenMapping, styleMap };
}

function normalizeHex(val) {
  if (!val) return null;
  val = val.trim();
  if (val.startsWith('#')) {
    const hex = val.slice(1);
    if (hex.length === 3) return '#' + hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    if (hex.length === 6) return val.toLowerCase();
    if (hex.length === 8) return ('#' + hex.slice(0, 6)).toLowerCase();
  }
  const m = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!args.url && !args.html) {
    process.stderr.write('Nutzung: node scripts/css-fallback-extractor.js --url <framer-url> | --html <export.html>\n');
    process.stderr.write('Options: --output-dir, --style-map-output, --token-output, --verbose, --dry-run\n');
    process.exit(1);
  }

  let result = null;
  if (args.html) {
    result = loadHtmlTokens(args.html);
  } else if (args.url) {
    result = await fetchCssTokens(args.url);
  }

  if (!result) {
    process.stderr.write('[css-fallback] Kein CSS-Fallback verfügbar.\n');
    process.exit(2);
  }

  if (args['dry-run']) {
    process.stderr.write(`[css-fallback] Dry-run: ${Object.keys(result.styleMap.textStyles).length} TextStyles, ${Object.keys(result.styleMap.colorStyles).length} Colors würden extrahiert.\n`);
    process.exit(0);
  }

  const outDir = args['output-dir'];
  fs.mkdirSync(outDir, { recursive: true });

  const styleMapPath  = args['style-map-output']  || path.join(outDir, 'style-map.json');
  const tokenMapPath  = args['token-output']       || path.join(outDir, 'token-mapping-css-fallback.json');

  fs.writeFileSync(styleMapPath, JSON.stringify(result.styleMap, null, 2), 'utf8');
  fs.writeFileSync(tokenMapPath, JSON.stringify(result.tokenMapping, null, 2), 'utf8');

  const tsCount = Object.keys(result.styleMap.textStyles).length;
  const csCount = Object.keys(result.styleMap.colorStyles).length;
  process.stderr.write(`✓ CSS-Fallback: ${tsCount} TextStyles, ${csCount} Farben → ${styleMapPath}\n`);
  process.stderr.write(`✓ Token-Mapping → ${tokenMapPath}\n`);
}

// Nur ausführen wenn direkt aufgerufen (nicht wenn importiert)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => {
    process.stderr.write(`FATAL [css-fallback]: ${e.message}\n`);
    process.exit(2);
  });
}
