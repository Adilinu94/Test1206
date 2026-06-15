#!/usr/bin/env node
/**
 * generate-color-token-mapping.js — Phase 11: Color Token Mapping
 *
 * Mappt unmapped CSS-Color-Tokens zu Framer-Style-Pfaden und weist
 * deterministische e-gv-* GV-IDs zu. Ohne Unframer MCP werden die
 * Hex-Werte aus den CSS-Variablen der live Framer-Seite verwendet.
 *
 * Strategy:
 *   1. Liest die 22 unmapped tokens (haben bereits hex-Werte)
 *   2. Mappt Framer-Style-Pfade (z.B. /Theme Color/Very Dark Green)
 *      auf die passenden Hex-Werte mittels Name→Hex Heuristik
 *   3. Weist jedem Hex-Wert eine deterministische e-gv-* ID zu
 *   4. Generiert ein enriched token-mapping.json
 *
 * Usage:
 *   node scripts/generate-color-token-mapping.js \
 *     --token-map tokens/token-mapping.json \
 *     --output tokens/token-mapping.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';

const { values: args } = parseArgs({
  options: {
    'token-map': { type: 'string' },
    output:      { type: 'string' },
    verbose:     { type: 'boolean', default: false },
    'dry-run':   { type: 'boolean', default: false },
  },
  strict: false,
});

if (!args['token-map']) {
  console.error('Error: --token-map required');
  process.exit(2);
}

const log = (...m) => { if (args.verbose) process.stderr.write('[color-map] ' + m.join(' ') + '\n'); };

const tokenMap = JSON.parse(fs.readFileSync(args['token-map'], 'utf8'));

// ── Step 1: Build hex → semantic color name mapping ──────────────────

// Color names detected on the live page (from brand/theme analysis)
// These map hex values to Framer theme color names
const HEX_TO_FRAMER_PATH = {
  '#061d13': '/Theme Color/Very Dark Green',
  '#0e2a3b': '/Theme Color/Dark Blue', 
  '#dfffa3': '/Theme Color/Light Lime Green',
  '#ffffff': '/Theme Color/White',
  '#fff':     '/Theme Color/White',
  '#0b0b0b': '/Theme Color/Black',
  '#f3f3f3': '/Theme Color/Light Gray',
  '#1a3127': '/Theme Color/Dark Green',
  '#ffde26': '/Theme Color/Yellow',
  '#c2c2c2': '/Theme Color/Gray',
  '#505050': '/Theme Color/Medium Gray',
  '#3e3e3e': '/Theme Color/Dark Gray',
  '#6f6f6f': '/Theme Color/Text Gray',
  '#edfdf6': '/Theme Color/Mint',
  '#d4e3dd': '/Theme Color/Sage',
  '#efefef': '/Theme Color/Off White',
  '#ff2244': '/Theme Color/Red',
  '#000000': '/Theme Color/Black',
  '#0099ff': '/Theme Color/Link Blue',
  '#f8f8f8': '/Theme Color/Near White',
};

// ── Step 2: Process unmapped tokens → Framer paths + GV-IDs ─────────

const colors = {};
const gvMap = new Map(); // hex → gvId

function generateGvId(hex, label) {
  // Deterministic: hash the label to get a stable 8-char ID
  const hash = createHash('sha256').update(label + hex).digest('hex').slice(0, 8);
  return `e-gv-${hash}`;
}

const unmappedColors = [];
const unmappedOthers = [];

// Process unmapped tokens
for (const token of tokenMap.unmapped_tokens || []) {
  const hex = token.hex || '';
  if (!hex || !hex.startsWith('#') || hex === '#550000' || hex === '#660000' || hex === '#770000') {
    // Skip non-color tokens (font-weight numericals got mis-identified as hex)
    unmappedOthers.push(token);
    continue;
  }
  
  unmappedColors.push(token);
}

log(`${unmappedColors.length} color tokens to map, ${unmappedOthers.length} non-color tokens to skip`);

// Map each color token
for (const token of unmappedColors) {
  const hex = (token.hex || '').toLowerCase();
  const normalizedHex = normalizeHex(hex);
  const framerPath = HEX_TO_FRAMER_PATH[normalizedHex] || HEX_TO_FRAMER_PATH[hex] || null;
  
  // Generate GV-ID from the hex value (deterministic)
  const gvId = generateGvId(normalizedHex, framerPath || token.token || 'color');
  gvMap.set(normalizedHex, gvId);
  
  if (framerPath) {
    colors[framerPath] = {
      hex: normalizedHex,
      gv_id: gvId,
      source: 'css-variable',
      token: token.token,
      token_hex: hex,
    };
    log(`  ${framerPath} → ${normalizedHex} → ${gvId}`);
  } else {
    // Unmapped color with no known Framer path → assign a generic path
    const genericPath = `/Custom Color/${token.token?.replace(/^--token-/, '').slice(0, 12) || 'unknown'}`;
    colors[genericPath] = {
      hex: normalizedHex,
      gv_id: gvId,
      source: 'css-variable-unnamed',
      token: token.token,
    };
    log(`  ${genericPath} → ${normalizedHex} → ${gvId} (no Framer path match)`);
  }
}

// ── Step 3: Add critical paths that were mentioned in converter warnings ──

const CRITICAL_PATHS_FROM_WARNINGS = [
  '/Theme Color/Very Dark Green',
  '/Theme Color/White', 
  '/Theme Color/Black',
  '/Theme Color/Dark Green',
  '/Theme Color/Light Lime Green',
  '/White/White',
  '/Heading/Heading 1 b',
  '/Body/Body-14px-Semibold',
  '/Body/Body-20px-Regular',
  '/Body/Body-18px-Medium',
];

// Ensure critical paths are mapped (even if not from CSS vars)
for (const criticalPath of CRITICAL_PATHS_FROM_WARNINGS) {
  if (!colors[criticalPath]) {
    // These are textStyle paths, not colors — skip non-color paths
    if (criticalPath.startsWith('/Heading/') || criticalPath.startsWith('/Body/')) continue;
    if (criticalPath.startsWith('/White/')) {
      // White color reference
      const whiteHex = '#ffffff';
      if (!gvMap.has(whiteHex)) {
        gvMap.set(whiteHex, 'e-gv-' + createHash('sha256').update('white').digest('hex').slice(0, 8));
      }
      colors[criticalPath] = {
        hex: whiteHex,
        gv_id: gvMap.get(whiteHex),
        source: 'heuristic-match',
      };
      log(`  ${criticalPath} → ${whiteHex} (heuristic: White path)`);
    }
  }
}

// ── Step 4: Build enriched token-mapping ────────────────────────────

const enriched = {
  ...tokenMap,
  colors,
  gv_color_map: Object.fromEntries(gvMap),
  meta: {
    ...tokenMap.meta,
    generated_at: new Date().toISOString(),
    color_mapping: {
      total: Object.keys(colors).length,
      mapped_from_css: unmappedColors.length,
      mapped_from_heuristic: Object.values(colors).filter(c => c.source === 'heuristic-match').length,
      unmapped_remaining: unmappedOthers.length,
    },
  },
  // Remove the unmapped_tokens that were color tokens (keep non-color ones)
  unmapped_tokens: unmappedOthers.length > 0 ? unmappedOthers : undefined,
};

// ── Step 5: Write output ────────────────────────────────────────────

const outputPath = args.output || args['token-map'];
if (args['dry-run']) {
  console.log(JSON.stringify(enriched, null, 2));
} else {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2), 'utf8');
  log(`Enriched token-mapping written: ${outputPath}`);
}

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\nColor Token Mapping Summary:`);
console.log(`  Colors mapped:          ${Object.keys(colors).length}`);
console.log(`  GV-IDs assigned:        ${gvMap.size}`);
console.log(`  Source: CSS variables   ${enriched.meta.color_mapping.mapped_from_css}`);
console.log(`  Source: heuristic       ${enriched.meta.color_mapping.mapped_from_heuristic}`);
console.log(`  Skipped (non-color):    ${enriched.meta.color_mapping.unmapped_remaining}`);
console.log(`\nGV Color IDs:`);
for (const [hex, gvId] of gvMap) {
  const path = Object.entries(colors).find(([, v]) => v.gv_id === gvId)?.[0] || '(no path)';
  console.log(`  ${gvId.padEnd(18)} ${hex.padEnd(10)} ${path}`);
}

// ── Helpers ──────────────────────────────────────────────────────────

function normalizeHex(hex) {
  if (!hex || typeof hex !== 'string') return '#000000';
  if (!hex.startsWith('#')) hex = '#' + hex;
  hex = hex.toLowerCase();
  // Expand 3-digit hex to 6-digit
  if (hex.length === 4) {
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}
