#!/usr/bin/env node
/**
 * generate-color-token-mapping.ts — Phase 11: Color Token Mapping
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
 *   # Project-agnostic (no color map):
 *   node --import tsx scripts/generate-color-token-mapping.ts \
 *     --token-map tokens/token-mapping.json \
 *     --output tokens/token-mapping.json
 *
 *   # With project-specific color map:
 *   node --import tsx scripts/generate-color-token-mapping.ts \
 *     --token-map tokens/token-mapping.json \
 *     --color-map exports/my-project/color-map.json \
 *     --output tokens/token-mapping.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface UnmappedToken {
  hex?: string;
  token?: string;
  [key: string]: unknown;
}

interface ColorEntry {
  hex: string;
  gv_id: string;
  source: string;
  token?: string;
  token_hex?: string;
}

interface TokenMappingMeta {
  [key: string]: unknown;
  generated_at?: string;
  color_mapping?: {
    total: number;
    mapped_from_css: number;
    mapped_from_heuristic: number;
    unmapped_remaining: number;
  };
}

interface TokenMapping {
  [key: string]: unknown;
  unmapped_tokens?: UnmappedToken[];
  colors?: Record<string, ColorEntry>;
  gv_color_map?: Record<string, string>;
  meta?: TokenMappingMeta;
  critical_paths?: string[];
}

// ─── CLI ARGS ───────────────────────────────────────────────────────────────

const { values: raw } = parseArgs({
  options: {
    'token-map': { type: 'string' },
    'color-map': { type: 'string' },
    output:      { type: 'string' },
    verbose:     { type: 'boolean', default: false },
    'dry-run':   { type: 'boolean', default: false },
  },
  strict: false,
});

const tokenMapPath = raw['token-map'] as string | undefined;
const colorMapPath = raw['color-map'] as string | undefined;
const outputArg    = raw.output as string | undefined;
const verbose      = (raw.verbose as boolean) ?? false;
const dryRun       = (raw['dry-run'] as boolean) ?? false;

if (!tokenMapPath) {
  console.error('Error: --token-map required');
  process.exit(2);
}

const log  = (...m: string[]) => { if (verbose) process.stderr.write('[color-map] ' + m.join(' ') + '\n'); };
const warn = (...m: string[]) => process.stderr.write('\u26a0 ' + m.join(' ') + '\n');

const tokenMap: TokenMapping = JSON.parse(fs.readFileSync(tokenMapPath, 'utf8'));

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function normalizeHex(hex: string): string {
  if (!hex || typeof hex !== 'string') return '#000000';
  if (!hex.startsWith('#')) hex = '#' + hex;
  hex = hex.toLowerCase();
  if (hex.length === 4) {
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

function generateGvId(hex: string, label: string): string {
  const hash = createHash('sha256').update(label + hex).digest('hex').slice(0, 8);
  return `e-gv-${hash}`;
}

// ── Step 1: Load project-specific color map (optional) ─────────────

let HEX_TO_FRAMER_PATH: Record<string, string> = {};
if (colorMapPath) {
  if (fs.existsSync(colorMapPath)) {
    HEX_TO_FRAMER_PATH = JSON.parse(fs.readFileSync(colorMapPath, 'utf8'));
    log(`Loaded ${Object.keys(HEX_TO_FRAMER_PATH).length} color mappings from ${colorMapPath}`);
  } else {
    warn(`Color map not found: ${colorMapPath}. Using generic paths.`);
  }
} else {
  log('No --color-map provided. Using generic /Custom Color/ paths for all unmapped colors.');
}

// ── Step 2: Process unmapped tokens → Framer paths + GV-IDs ─────────

const colors: Record<string, ColorEntry> = {};
const gvMap = new Map<string, string>(); // hex → gvId

const unmappedColors: UnmappedToken[] = [];
const unmappedOthers: UnmappedToken[] = [];

const skipHexes = new Set(['#550000', '#660000', '#770000']);

for (const token of tokenMap.unmapped_tokens || []) {
  const hex = token.hex || '';
  if (!hex || !hex.startsWith('#') || skipHexes.has(hex)) {
    unmappedOthers.push(token);
    continue;
  }

  unmappedColors.push(token);
}

log(`${unmappedColors.length} color tokens to map, ${unmappedOthers.length} non-color tokens to skip`);

for (const token of unmappedColors) {
  const hex = (token.hex || '').toLowerCase();
  const normalizedHex = normalizeHex(hex);
  const framerPath = HEX_TO_FRAMER_PATH[normalizedHex] || HEX_TO_FRAMER_PATH[hex] || null;

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
    const genericPath = `/Custom Color/${(token.token || '').replace(/^--token-/, '').slice(0, 12) || 'unknown'}`;
    colors[genericPath] = {
      hex: normalizedHex,
      gv_id: gvId,
      source: 'css-variable-unnamed',
      token: token.token,
    };
    log(`  ${genericPath} → ${normalizedHex} → ${gvId} (no Framer path match)`);
  }
}

// ── Step 3: Auto-detect critical unmapped Framer paths ──

const criticalPaths: string[] = [];
if (tokenMap.critical_paths) {
  criticalPaths.push(...tokenMap.critical_paths);
}

for (const criticalPath of criticalPaths) {
  if (!colors[criticalPath]) {
    if (criticalPath.startsWith('/Heading/') || criticalPath.startsWith('/Body/')) continue;
    if (criticalPath.startsWith('/White/')) {
      const whiteHex = '#ffffff';
      if (!gvMap.has(whiteHex)) {
        gvMap.set(whiteHex, 'e-gv-' + createHash('sha256').update('white').digest('hex').slice(0, 8));
      }
      colors[criticalPath] = {
        hex: whiteHex,
        gv_id: gvMap.get(whiteHex)!,
        source: 'heuristic-match',
      };
      log(`  ${criticalPath} → ${whiteHex} (heuristic: White path)`);
    }
  }
}

// ── Step 4: Build enriched token-mapping ────────────────────────────

const enriched: TokenMapping = {
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
  } as TokenMappingMeta,
  unmapped_tokens: unmappedOthers.length > 0 ? unmappedOthers : undefined,
};

// ── Step 5: Write output ────────────────────────────────────────────

const outputPath = outputArg || tokenMapPath;
if (dryRun) {
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
console.log(`  Source: CSS variables   ${enriched.meta!.color_mapping!.mapped_from_css}`);
console.log(`  Source: heuristic       ${enriched.meta!.color_mapping!.mapped_from_heuristic}`);
console.log(`  Skipped (non-color):    ${enriched.meta!.color_mapping!.unmapped_remaining}`);
console.log(`\nGV Color IDs:`);
for (const [hex, gvId] of gvMap) {
  const pathEntry = Object.entries(colors).find(([, v]) => v.gv_id === gvId)?.[0] || '(no path)';
  console.log(`  ${gvId.padEnd(18)} ${hex.padEnd(10)} ${pathEntry}`);
}
