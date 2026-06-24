#!/usr/bin/env node
/**
 * extract-framer-dark-mode.js  —  Phase 5: Dark Mode CSS Extraction (ENH-10)
 *
 * Extrahiert @media (prefers-color-scheme: dark) CSS-Blöcke aus Framer-HTML
 * und generiert ein Dark-Mode-Variable-Set für Elementor V4 Global Variables.
 *
 * ZWECK:
 *   Framer generiert Dark-Mode-Blöcke mit eigenen Farbwerten. Die Pipeline
 *   ignoriert sie komplett — extract-framer-styles.js liefert nur Light-Tokens.
 *   Dieses Script extrahiert die Dark-Mode-Farb-Overrides und bereitet sie
 *   als V4 Global Variables auf (zweites Variable-Set).
 *
 * EINGABE:
 *   --html <file>            Framer HTML-Export
 *   --css <file>             Alternativ: reine CSS-Datei
 *   --light-tokens <file>    Light-Mode Token-Mapping (output von design-token-extractor.js)
 *   --output <file>          Output: dark-mode-variables.json
 *
 * OPTIONEN:
 *   --format json|markdown   Output-Format (default: json)
 *   --verbose                Detaillierte Logs
 *   --help                   Diese Hilfe
 *
 * BEISPIELE:
 *   # Mit Light-Token-Matching:
 *   node scripts/extract-framer-dark-mode.js \
 *     --html exports/papaya/index.html \
 *     --light-tokens exports/papaya/tokens/token-mapping.json \
 *     --output exports/papaya/tokens/dark-mode-variables.json
 *
 *   # Ohne Light-Tokens (nur Dark-Werte):
 *   node scripts/extract-framer-dark-mode.js \
 *     --css dark-theme.css \
 *     --output dark-vars.json
 *
 * OUTPUT:
 *   JSON mit Dark-Mode-Variable-Set:
 *   {
 *     "generated": "2026-06-13T...",
 *     "mode": "dark",
 *     "variables": [
 *       {
 *         "selector": "body",
 *         "property": "background",
 *         "dark_value": "#1a1a2e",
 *         "dark_hex": "#1a1a2e",
 *         "light_mapping": { "light_value": "#ffffff", "gv_id": "e-gv-abc12345" },
 *         "token_name": "dark-surface-body"
 *       }
 *     ],
 *     "mcpRouting": {
 *       "ability": "novamira-adrianv2/batch-create-variables",
 *       "note": "Dark Mode Variable Set — als zweites Set neben Light-Mode anlegen"
 *     }
 *   }
 *
 * MCP-ROUTING:
 *   Output enthaelt mcpRouting-Objekt. Agent ruft:
 *     novamira-adrianv2/batch-create-variables mit dem variables-Array,
 *     um Dark-Mode-Global-Variables in Elementor V4 anzulegen.
 *
 * EXIT-CODES:
 *   0 = Erfolg (auch wenn keine Dark-Mode-Blöcke gefunden)
 *   2 = Fehlende Eingabe
 */

import fs   from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// ─────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    html:           { type: 'string' },
    css:            { type: 'string' },
    'light-tokens': { type: 'string' },
    output:         { type: 'string' },
    format:         { type: 'string', default: 'json' },
    verbose:        { type: 'boolean', default: false },
    help:           { type: 'boolean', default: false },
  },
  strict: false,
});

// ── HELP ──────────────────────────────────────────────────────────

if (args.help || (!args.html && !args.css)) {
  console.log(`extract-framer-dark-mode.js — ENH-10 Dark Mode CSS Extraction

ZWECK:
  Extrahiert @media (prefers-color-scheme: dark) CSS-Blöcke aus Framer-HTML
  und generiert ein Dark-Mode-Variable-Set für Elementor V4 Global Variables.

EINGABE:
  --html <file>            Framer HTML-Export
  --css <file>             Alternativ: reine CSS-Datei
  --light-tokens <file>    Light-Mode Token-Mapping (aus design-token-extractor.js)
  --output <file>          Output: dark-mode-variables.json (default: stdout)

OPTIONEN:
  --format json|markdown   Output-Format (default: json)
  --verbose                Detaillierte Logs
  --help                   Diese Hilfe

BEISPIELE:
  node scripts/extract-framer-dark-mode.js \\
    --html exports/papaya/index.html \\
    --light-tokens exports/papaya/tokens/token-mapping.json \\
    --output exports/papaya/tokens/dark-mode-variables.json

  node scripts/extract-framer-dark-mode.js \\
    --css dark-theme.css \\
    --output dark-vars.json

EXIT-CODES:
  0 = Erfolg (auch wenn keine Dark-Mode-Blöcke gefunden)
  2 = Fehlende Eingabe`);
  process.exit(args.help ? 0 : 2);
}

const log = (...m) => {
  if (args.verbose) process.stderr.write('[dark-mode] ' + m.join(' ') + '\n');
};

// ─────────────────────────────────────────────
// CSS EXTRACTION FROM HTML
// ─────────────────────────────────────────────

/**
 * Extrahiert alle <style>-Block-Inhalte aus HTML.
 *
 * @param {string} html - Vollständiger HTML-Inhalt
 * @returns {string} Alle Style-Block-Inhalte konkateniert
 */
function extractCssFromHtml(html) {
  const blocks = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) {
    blocks.push(m[1]);
  }
  return blocks.join('\n');
}

// ─────────────────────────────────────────────
// DARK MODE BLOCK PARSER
// ─────────────────────────────────────────────

/**
 * Extrahiert @media (prefers-color-scheme: dark) Blöcke aus CSS.
 *
 * Parst CSS-Regeln innerhalb jedes Dark-Mode-Blocks und extrahiert
 * Selector → Declaration-Paare. Unterstützt:
 *   - @media (prefers-color-scheme: dark) { ... }
 *   - @media (prefers-color-scheme:dark) { ... } (ohne Leerzeichen)
 *
 * @param {string} css - CSS-Inhalt
 * @returns {Array<{selector: string, declarations: Array<{property: string, value: string}>}>}
 */
function extractDarkModeBlocks(css) {
  const darkBlocks = [];

  // Find @media (prefers-color-scheme: dark) { ... } blocks
  // Uses brace counting because CSS rules inside @media have their own {}
  const startRe = /@media\s*\(prefers-color-scheme\s*:\s*dark\)\s*\{/gi;
  let startMatch;

  while ((startMatch = startRe.exec(css)) !== null) {
    const openPos = startMatch.index + startMatch[0].length - 1; // Position of the opening {

    // Count braces to find the matching closing }
    let depth = 1;
    let closePos = openPos + 1;

    while (closePos < css.length && depth > 0) {
      const ch = css[closePos];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth > 0) closePos++;
    }

    if (depth !== 0) continue; // Unbalanced braces — skip

    // Extract the block content (between the outer braces)
    const block = css.slice(openPos + 1, closePos);

    // Parse CSS-Regeln innerhalb des Dark-Mode-Blocks
    const ruleRe = /([^{}]+)\{([^}]+)\}/g;
    let ruleMatch;
    while ((ruleMatch = ruleRe.exec(block)) !== null) {
      const selector = ruleMatch[1].trim();
      const body = ruleMatch[2];

      const declarations = [];
      const propRe = /([\w-]+)\s*:\s*([^;!\n]+)/g;
      let propMatch;
      while ((propMatch = propRe.exec(body)) !== null) {
        declarations.push({
          property: propMatch[1].trim(),
          value: propMatch[2].trim(),
        });
      }

      if (declarations.length > 0) {
        darkBlocks.push({ selector, declarations });
      }
    }
  }

  return darkBlocks;
}

// ─────────────────────────────────────────────
// COLOR OVERRIDE EXTRACTION
// ─────────────────────────────────────────────

// CSS-Properties die typischerweise Farbwerte enthalten
const COLOR_PROPS = new Set([
  'color', 'background-color', 'background',
  'border-color', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color',
  'fill', 'stroke', 'outline-color', 'text-decoration-color',
]);

/**
 * Filtert Dark-Mode-Declarations auf Farbeigenschaften.
 * Normalisiert Farbwerte (hex, rgb, rgba) für konsistenten Output.
 *
 * @param {Array<{selector: string, declarations: Array}>} darkBlocks
 * @returns {Array<{selector: string, property: string, value: string, hex: string|null}>}
 */
function extractColorOverrides(darkBlocks) {
  const overrides = [];

  for (const block of darkBlocks) {
    for (const decl of block.declarations) {
      // Nur Color-Properties oder CSS-Variablen
      const prop = decl.property.replace(/^--/, '');
      if (!COLOR_PROPS.has(prop) && !decl.property.startsWith('--')) continue;

      let value = decl.value.trim();
      let hex = null;

      if (value.startsWith('#')) {
        hex = normalizeHex(value);
      } else if (value.startsWith('rgb')) {
        hex = rgbaToHex(value);
      } else if (value.startsWith('var(')) {
        // CSS-Variable — Value aus Fallback extrahieren
        const fb = value.match(/var\([^,]+,\s*([^)]+)\)/);
        if (fb) {
          value = fb[1].trim();
          hex = normalizeHex(value) || rgbaToHex(value);
        }
      }

      overrides.push({
        selector: block.selector,
        property: decl.property,
        value,
        hex,
      });
    }
  }

  return overrides;
}

// ─────────────────────────────────────────────
// LIGHT-MODE TOKEN MATCHING
// ─────────────────────────────────────────────

/**
 * Matcht Dark-Mode-Overrides mit Light-Mode-Tokens.
 *
 * Liest das token-mapping.json (Output von design-token-extractor.js)
 * und findet das Light-Mode-Äquivalent für jeden Dark-Mode-Farbwert.
 *
 * @param {Array} overrides - Dark-Mode Farb-Overrides
 * @param {object} lightTokens - Light-Mode Token-Mapping aus token-mapping.json
 * @returns {Array<{selector: string, property: string, dark_value: string, dark_hex: string|null, light_value: string|null, light_hex: string|null, gv_id: string|null, token_name: string}>}
 */
function matchLightTokens(overrides, lightTokens) {
  const lightColors = lightTokens?.colors?.unique || [];
  const hexToLight = new Map();

  for (const entry of lightColors) {
    if (entry.hex) hexToLight.set(entry.hex, entry);
  }

  const variables = [];

  for (const override of overrides) {
    if (!override.hex) {
      // Non-color override — trotzdem aufnehmen
      variables.push({
        selector: override.selector,
        property: override.property,
        dark_value: override.value,
        dark_hex: null,
        light_value: null,
        light_hex: null,
        gv_id: null,
        token_name: suggestDarkTokenName(override.property, override.selector),
      });
      continue;
    }

    const lightMatch = hexToLight.get(override.hex);
    variables.push({
      selector: override.selector,
      property: override.property,
      dark_value: override.value,
      dark_hex: override.hex,
      light_value: lightMatch?.raw || null,
      light_hex: lightMatch?.hex || null,
      gv_id: lightMatch?.gv_id || null,
      token_name: suggestDarkTokenName(override.property, override.selector),
    });
  }

  return variables;
}

/**
 * Schlägt einen semantischen Dark-Mode-Token-Namen vor.
 *
 * Pattern: dark-{type}-{selector}
 *   type = surface (background), text (color), color (andere)
 *
 * @param {string} property - CSS-Property
 * @param {string} selector - CSS-Selector
 * @returns {string} Semantischer Token-Name
 */
function suggestDarkTokenName(property, selector) {
  const isBg = property.includes('background');
  const isText = property === 'color';
  const base = isBg ? 'surface' : isText ? 'text' : 'color';
  const cleanSelector = selector
    .replace(/[.#\[\]:>\s,]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  const cleanProperty = property
    .replace(/^--/, '')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .slice(0, 20);
  return `dark-${base}-${cleanSelector}-${cleanProperty}`;
}

// ─────────────────────────────────────────────
// V4 DARK MODE VARIABLE SET GENERATOR
// ─────────────────────────────────────────────

/**
 * Generiert das V4 Dark-Mode-Variable-Set JSON.
 *
 * Format kompatibel mit Elementor V4 Global Variables (zweites Variable-Set
 * für Dark Mode, das neben dem Light-Mode-Set existiert).
 *
 * @param {Array} variables - Gematchte Dark-Mode-Variablen
 * @returns {object} V4-kompatibles Dark-Mode-Variable-Set
 */
function buildDarkModeVariableSet(variables) {
  const uniqueSelectors = new Set(variables.map(v => v.selector));
  const uniqueProperties = new Set(variables.map(v => v.property));

  return {
    generated: new Date().toISOString(),
    mode: 'dark',
    version: '1.0',
    variables: variables.map(v => ({
      token_name: v.token_name,
      selector: v.selector,
      property: v.property,
      dark_value: v.dark_value,
      dark_hex: v.dark_hex,
      light_mapping: {
        light_value: v.light_value,
        light_hex: v.light_hex,
        gv_id: v.gv_id,
      },
    })),
    mcpRouting: {
      ability: 'novamira-adrianv2/batch-create-variables',
      note: 'Dark Mode Variable Set — als zusätzliches Set neben Light-Mode anlegen',
    },
    summary: {
      total_variables: variables.length,
      unique_selectors: uniqueSelectors.size,
      unique_properties: uniqueProperties.size,
      matched_with_light_tokens: variables.filter(v => v.gv_id).length,
    },
  };
}

// ─────────────────────────────────────────────
// COLOR NORMALIZATION HELPERS
// ─────────────────────────────────────────────

/**
 * Normalisiert einen Hex-Farbwert.
 *
 * @param {string} val - CSS-Farbwert
 * @returns {string|null} Normalisierter Hex-Wert (z.B. "#a1b2c3") oder null
 */
function normalizeHex(val) {
  if (!val) return null;
  val = val.trim().toLowerCase();
  if (val.startsWith('#')) val = val.slice(1);
  if (val.length === 3) val = val[0] + val[0] + val[1] + val[1] + val[2] + val[2];
  if (/^[0-9a-f]{6}$/.test(val)) return '#' + val;
  return null;
}

/**
 * Konvertiert rgb/rgba in Hex.
 *
 * @param {string} val - CSS rgb/rgba-Wert
 * @returns {string|null} Hex-Wert oder null
 */
function rgbaToHex(val) {
  const m = val.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    return '#' + [m[1], m[2], m[3]]
      .map(n => parseInt(n).toString(16).padStart(2, '0'))
      .join('');
  }
  return null;
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

let cssContent = '';

if (args.html) {
  if (!fs.existsSync(args.html)) {
    process.stderr.write(`Error: HTML file not found: ${args.html}\n`);
    process.exit(2);
  }
  const html = fs.readFileSync(args.html, 'utf8');
  cssContent = extractCssFromHtml(html);
  log(`Extracted ${cssContent.length} chars of CSS from ${args.html}`);
} else if (args.css) {
  if (!fs.existsSync(args.css)) {
    process.stderr.write(`Error: CSS file not found: ${args.css}\n`);
    process.exit(2);
  }
  cssContent = fs.readFileSync(args.css, 'utf8');
}

// 1. Extrahiere Dark-Mode-Blöcke
const darkBlocks = extractDarkModeBlocks(cssContent);
log(`Found ${darkBlocks.length} dark-mode CSS blocks`);

if (darkBlocks.length === 0) {
  const output = {
    generated: new Date().toISOString(),
    mode: 'dark',
    version: '1.0',
    variables: [],
    summary: {
      total_variables: 0,
      note: 'No @media (prefers-color-scheme: dark) blocks found in CSS',
    },
  };
  writeOutput(output);
  process.exit(0);
}

// 2. Extrahiere Farb-Overrides
const overrides = extractColorOverrides(darkBlocks);
log(`Extracted ${overrides.length} color overrides`);

// 3. Match mit Light-Mode-Tokens (wenn verfügbar)
let variables;

if (args['light-tokens'] && fs.existsSync(args['light-tokens'])) {
  const lightTokens = JSON.parse(fs.readFileSync(args['light-tokens'], 'utf8'));
  variables = matchLightTokens(overrides, lightTokens);
  const matched = variables.filter(v => v.gv_id).length;
  log(`Matched ${matched}/${variables.length} with light tokens`);
} else {
  // Kein Light-Token-Mapping — generiere nur Dark-Werte
  variables = overrides.map(o => ({
    selector: o.selector,
    property: o.property,
    dark_value: o.value,
    dark_hex: o.hex,
    light_value: null,
    light_hex: null,
    gv_id: null,
    token_name: suggestDarkTokenName(o.property, o.selector),
  }));
}

// 4. Generiere V4 Dark Mode Variable-Set
const result = buildDarkModeVariableSet(variables);

writeOutput(result);
process.exit(0);

// ─────────────────────────────────────────────
// OUTPUT HELPER
// ─────────────────────────────────────────────

/**
 * Formatiert das Dark-Mode-Variable-Set als Markdown-Tabelle.
 *
 * @param {object} data - Variable-Set JSON
 * @returns {string} Markdown-formatierter Output
 */
function formatMarkdown(data) {
  const lines = [];
  lines.push('# Dark Mode Variables');
  lines.push('');
  lines.push(`> Generated: ${data.generated}`);
  lines.push(`> Mode: ${data.mode}`);
  lines.push(`> Variables: ${data.summary?.total_variables || 0}`);
  if (data.summary?.matched_with_light_tokens !== undefined) {
    lines.push(`> Matched with Light: ${data.summary.matched_with_light_tokens}`);
  }
  if (data.summary?.note) {
    lines.push(`> Note: ${data.summary.note}`);
  }
  lines.push('');

  if (!data.variables || data.variables.length === 0) {
    lines.push('_No dark mode variables found._');
    return lines.join('\n');
  }

  lines.push('| token_name | selector | property | dark_value | dark_hex | light_value | gv_id |');
  lines.push('|------------|----------|----------|------------|----------|-------------|-------|');

  for (const v of data.variables) {
    const token = (v.token_name || '-').replace(/\|/g, '\\|');
    const sel = (v.selector || '-').replace(/\|/g, '\\|');
    const prop = (v.property || '-').replace(/\|/g, '\\|');
    const darkVal = (v.dark_value || '-').replace(/\|/g, '\\|');
    const darkHex = v.dark_hex || '-';
    const lightVal = (v.light_mapping?.light_value || '-').replace(/\|/g, '\\|');
    const gvId = v.light_mapping?.gv_id || '-';
    lines.push(`| ${token} | ${sel} | ${prop} | ${darkVal} | ${darkHex} | ${lightVal} | ${gvId} |`);
  }

  lines.push('');
  if (data.mcpRouting) {
    lines.push('## MCP Routing');
    lines.push('');
    lines.push(`- **Ability:** \`${data.mcpRouting.ability || 'N/A'}\``);
    lines.push(`- **Note:** ${data.mcpRouting.note || 'N/A'}`);
  }

  return lines.join('\n');
}

/**
 * Schreibt das Ergebnis als JSON oder Markdown in die Output-Datei oder stdout.
 *
 * @param {object} data - Ergebnis-JSON
 */
function writeOutput(data) {
  const fmt = (args.format || 'json').toLowerCase();
  let output;

  if (fmt === 'markdown' || fmt === 'md') {
    output = formatMarkdown(data);
  } else {
    output = JSON.stringify(data, null, 2);
  }

  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, output, 'utf8');
    process.stderr.write(
      `[dark-mode] Saved ${data.summary?.total_variables || 0} dark-mode variables to ${args.output}\n`
    );
  } else {
    process.stdout.write(output + '\n');
  }
}
