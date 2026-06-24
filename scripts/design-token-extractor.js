#!/usr/bin/env node
/**
 * design-token-extractor.js
 *
 * Liest Framer's CSS-Variablen (Custom Properties) und mapped sie auf
 * Elementor V4 e-gv-* IDs. Erstellt token-mapping.json Vorschläge und
 * batch-create-variables MCP-Call Pläne.
 *
 * Unterstützt mehrere Eingabeformate:
 *   - HTML-Dateien (extrahiert CSS aus <style>-Blöcken)
 *   - CSS-Dateien direkt
 *   - extracted-styles.json (von extract-framer-styles.js)
 *   - framer-css-map.json (von framer-html-to-elementor.js)
 *
 * Usage:
 *   node scripts/design-token-extractor.js \
 *     --html ./FramerExport/index.html \
 *     --output ./FramerExport/tokens/token-mapping.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { normalizeHex, rgbToHex } from './lib/framer-utils.js';

const { values: args } = parseArgs({
  options: {
    'html':            { type: 'string' },
    'css':             { type: 'string' },
    'css-dir':         { type: 'string' },
    'styles-json':     { type: 'string' },
    'framer-css-map':  { type: 'string' },
    'design-system':   { type: 'string' },
    'existing-tokens': { type: 'string' },
    'output':          { type: 'string' },
    'variables-plan':  { type: 'string' },
    // P4-D: Live-URL für Playwright-basierte CSS-Extraktion
    'url':             { type: 'string' },
    'verbose':         { type: 'boolean', default: false },
    'help':            { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help || (!args.html && !args.css && !args['css-dir'] && !args['styles-json'] && !args['framer-css-map'] && !args.url)) {
  console.log(`
design-token-extractor.js

Extrahiert CSS Custom Properties (Design Tokens) aus FramerExport
und mapped sie auf Elementor V4 e-gv-* IDs.

EINGABE (mindestens eine):
  --html FILE          HTML-Datei mit <style>-Blöcken
  --css FILE           Einzelne CSS-Datei
  --css-dir DIR        Verzeichnis mit CSS-Dateien (rekursiv)
  --styles-json FILE   extracted-styles.json
  --framer-css-map FILE  framer-css-map.json
  --url URL            Framer-Live-Seite (via Playwright)
                       Ersetzt HTML-Extraktion + CSS-Font-Auflösung
                       Liefert komplette CSS-Variablen + Fonts + Breakpoints

OPTIONEN:
  --design-system FILE    Output von novamira/adrians-export-design-system
                          Löst e-gv-* IDs automatisch auf (by hex + by label).
                          Empfohlen nach Phase 3 (batch-create-variables).
  --existing-tokens FILE  Bestehendes token-mapping.json für Update
  --output FILE           Output: token-mapping.json
  --variables-plan FILE   Output: variables-plan.json mit MCP-Calls
  --verbose               Ausführliche Logs
  --help                  Diese Hilfe

EXIT-CODES:
  0 = Tokens extrahiert (unmapped tokens produce warnings, not errors)
  2 = Keine Eingabedatei gefunden
`);
  if (args.help) process.exit(0);
  process.exit(2);
}

const log  = (...msg) => { if (args.verbose) process.stderr.write('[verbose] ' + msg.join(' ') + '\n'); };
const warn = (...msg) => process.stderr.write('[warn] ' + msg.join(' ') + '\n');
const fatal = (msg, code = 2) => { process.stderr.write('[FATAL] ' + msg + '\n'); process.exit(code); };

function extractCssFromHtml(htmlContent) {
  const blocks = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = styleRe.exec(htmlContent)) !== null) blocks.push(match[1]);
  return blocks.join('\n');
}

function extractCustomProperties(cssContent) {
  const tokens = new Map();
  const declRe = /(--[\w-]+)\s*:\s*([^;!}]+)/g;
  let declMatch;
  while ((declMatch = declRe.exec(cssContent)) !== null) {
    const name = declMatch[1].trim();
    const value = declMatch[2].trim();
    if (!tokens.has(name)) tokens.set(name, { values: new Set(), occurrences: 0 });
    const token = tokens.get(name);
    token.values.add(value);
    token.occurrences++;
  }

  const varRe = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+?))?\s*\)/g;
  let varMatch;
  while ((varMatch = varRe.exec(cssContent)) !== null) {
    const name = varMatch[1].trim();
    const fallback = varMatch[2]?.trim() ?? null;
    if (!tokens.has(name) && fallback) {
      tokens.set(name, { values: new Set([fallback]), occurrences: 0 });
    }
  }
  return tokens;
}

function detectTokenType(name, value) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('-color') || lowerName.includes('-text') && !lowerName.includes('font')) {
    if (looksLikeColor(value)) return 'color';
  }
  if (lowerName.includes('-font') || lowerName.includes('family') || lowerName.includes('typography')) return 'font';
  if (lowerName.includes('-size') || lowerName.includes('-spacing') || lowerName.includes('-width')) return 'size';
  if (looksLikeColor(value)) return 'color';
  if (/^\d/.test(value) && /(px|%|em|rem|vw|vh)$/.test(value)) return 'size';
  return 'unknown';
}

function looksLikeColor(value) {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl');
}

function tokenLabel(name) {
  return name.replace(/^--/, '').replace(/^token-/, 'framer-').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 50);
}

/**
 * Baut einen Lookup-Index aus dem Output von novamira/adrians-export-design-system.
 * Unterstützt beide Schlüssel: byHex (für Farben) und byLabel (für alle Typen).
 * Format: { global_variables: [{id, label, type, value}], global_colors: [{id, label, color}] }
 */
function resolveGvIdsFromDesignSystem(dsExport) {
  const byHex   = new Map(); // hex → e-gv-ID
  const byLabel = new Map(); // label.toLowerCase() → e-gv-ID
  const sources = [
    ...(dsExport?.global_variables ?? dsExport?.variables ?? []),
    ...(dsExport?.global_colors    ?? dsExport?.colors    ?? []),
  ];
  for (const v of sources) {
    const id = v.id ?? v._id;
    if (!id || !id.startsWith('e-gv-')) continue;
    const label = (v.label ?? v.title ?? '').toLowerCase().replace(/\s+/g, '-');
    if (label) byLabel.set(label, id);
    const raw = v.value ?? v.color ?? v.hex ?? '';
    const hex = normalizeHex(raw) ?? rgbToHex(raw);
    if (hex) byHex.set(hex, id);
  }
  return { byHex, byLabel, total: sources.length };
}

function generateTokenMapping(allTokens, existingMapping = null, dsIndex = null) {
  const mapping = {
    meta: { generatedAt: new Date().toISOString(), totalTokens: 0 },
    colors: {}, fonts: {}, sizes: {}, unknown: {},
  };
  const existingColors = existingMapping?.colors ?? {};
  const existingFonts  = existingMapping?.fonts ?? {};
  const existingSizes  = existingMapping?.sizes ?? {};

  for (const [name, token] of allTokens) {
    const values = [...token.values];
    const primaryValue = values[0] ?? '';

    if (token.type === 'color') {
      const hex = normalizeHex(primaryValue) ?? rgbToHex(primaryValue) ?? primaryValue;
      // Versuche GV-ID aus live Design-System aufzulösen: byHex > byLabel > existing > null
      const autoGvId = dsIndex
        ? (dsIndex.byHex.get(hex) ?? dsIndex.byLabel.get(tokenLabel(name)) ?? null)
        : null;
      mapping.colors[name] = {
        hex, raw: primaryValue,
        gv_id: autoGvId ?? existingColors[name]?.gv_id ?? null,
        label: tokenLabel(name),
        occurrences: token.occurrences, allValues: values,
      };
    } else if (token.type === 'font') {
      const family = primaryValue.replace(/['"]/g, '').split(',')[0].trim();
      mapping.fonts[name] = {
        family, raw: primaryValue,
        gv_id: existingFonts[name]?.gv_id ?? null,
        label: tokenLabel(name),
        occurrences: token.occurrences, allValues: values,
      };
    } else if (token.type === 'size') {
      mapping.sizes[name] = {
        value: primaryValue,
        gv_id: existingSizes[name]?.gv_id ?? null,
        label: tokenLabel(name),
        occurrences: token.occurrences, allValues: values,
      };
    } else {
      mapping.unknown[name] = { value: primaryValue, label: tokenLabel(name), occurrences: token.occurrences };
    }
    mapping.meta.totalTokens++;
  }

  mapping.meta.colorCount = Object.keys(mapping.colors).length;
  mapping.meta.fontCount  = Object.keys(mapping.fonts).length;
  mapping.meta.sizeCount  = Object.keys(mapping.sizes).length;
  mapping.meta.mappedCount = [...Object.values(mapping.colors), ...Object.values(mapping.fonts), ...Object.values(mapping.sizes)]
    .filter(e => e.gv_id !== null).length;
  mapping.meta.unmappedCount = mapping.meta.totalTokens - mapping.meta.mappedCount;
  return mapping;
}

function buildVariablesPlan(tokenMapping) {
  const variables = [];
  for (const entry of Object.values(tokenMapping.colors)) {
    if (entry.gv_id) continue;
    variables.push({ label: entry.label, type: 'color', value: entry.hex });
  }
  for (const entry of Object.values(tokenMapping.fonts)) {
    if (entry.gv_id) continue;
    variables.push({ label: entry.label, type: 'font', value: entry.family });
  }
  for (const entry of Object.values(tokenMapping.sizes)) {
    if (entry.gv_id) continue;
    variables.push({ label: entry.label, type: 'size', value: entry.value });
  }
  return {
    meta: { totalVariables: variables.length, generatedAt: new Date().toISOString() },
    mcpCall: {
      ability_name: 'novamira/adrians-batch-create-variables',
      parameters: { variables: variables.map(v => ({ label: v.label, type: v.type, value: v.value })), strategy: 'skip' },
    },
    variables,
    instructions: [
      '1. novamira/adrians-setup-v4-foundation aufrufen → base classes + variable IDs zurücklesen',
      '2. variables-plan.json mcpCall ausführen: novamira/adrians-batch-create-variables',
      '3. adrians-export-design-system what=all → e-gv-* IDs der erstellten Variablen holen',
      '4. e-gv-* IDs in token-mapping.json eintragen (gv_id Felder)',
      '5. convert-xml-to-v4.js mit --tokens token-mapping.json ausführen',
      '6. Nach Build: novamira/adrians-visual-qa post_id=<ID> zur Server-seitigen QA',
      '7. novamira/adrians-responsive-audit post_id=<ID> für Breakpoint-Analyse',
    ],
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

let allCssContent = '';

if (args.html) {
  if (!fs.existsSync(args.html)) fatal(`HTML nicht gefunden: ${args.html}`);
  allCssContent += extractCssFromHtml(fs.readFileSync(args.html, 'utf8')) + '\n';
  log(`CSS aus HTML extrahiert`);
}
if (args.css) {
  if (!fs.existsSync(args.css)) fatal(`CSS nicht gefunden: ${args.css}`);
  allCssContent += fs.readFileSync(args.css, 'utf8') + '\n';
}
if (args['css-dir']) {
  if (!fs.existsSync(args['css-dir'])) fatal(`CSS-Verzeichnis nicht gefunden: ${args['css-dir']}`);
  const scanDir = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scanDir(full);
      else if (entry.name.endsWith('.css')) allCssContent += fs.readFileSync(full, 'utf8') + '\n';
    }
  };
  scanDir(args['css-dir']);
}
if (args['styles-json']) {
  if (!fs.existsSync(args['styles-json'])) fatal(`styles-json nicht gefunden: ${args['styles-json']}`);
  const stylesData = JSON.parse(fs.readFileSync(args['styles-json'], 'utf8'));
  if (stylesData.colors?.unique) for (const c of stylesData.colors.unique) allCssContent += `--extracted-${c.hex.replace('#','')}: ${c.hex};\n`;
  if (stylesData.fonts) for (const f of stylesData.fonts) if (f.family) allCssContent += `--extracted-font: "${f.family}";\n`;
}
if (args['framer-css-map']) {
  if (!fs.existsSync(args['framer-css-map'])) fatal(`framer-css-map nicht gefunden: ${args['framer-css-map']}`);
  const cssMap = JSON.parse(fs.readFileSync(args['framer-css-map'], 'utf8'));
  if (cssMap.designTokens) for (const [name, val] of Object.entries(cssMap.designTokens)) allCssContent += `${name}: ${val};\n`;
}

// P4-D: Live-URL — Playwright-basierte CSS-Extraktion von einer Framer-Seite
// Ergänzt oder ersetzt die lokale HTML/CSS-Extraktion mit Live-Daten.
if (args.url) {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    warn(`Playwright nicht installiert — URL-Extraktion nicht verfügbar. Installiere mit: npm install playwright`);
    if (!allCssContent.trim()) fatal('Keine Eingaben (weder HTML/CSS noch Playwright) verfügbar.', 2);
  }

  if (playwright) {
    log(`URL-Extraktion: ${args.url}`);
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      // Extrahiere alle CSS-Variablen aus dem computed style des <html>-Elements
      const cssVars = await page.evaluate(() => {
        const html = document.documentElement;
        const styles = window.getComputedStyle(html);
        const vars = [];
        // Alle Custom Properties aus dem StyleSheet sammeln
        for (let i = 0; i < document.styleSheets.length; i++) {
          try {
            const sheet = document.styleSheets[i];
            if (!sheet.cssRules) continue;
            for (const rule of sheet.cssRules) {
              if (rule instanceof CSSStyleDeclaration && rule.style) {
                for (let j = 0; j < rule.style.length; j++) {
                  const prop = rule.style[j];
                  if (prop.startsWith('--')) {
                    vars.push({ name: prop, value: rule.style.getPropertyValue(prop).trim() });
                  }
                }
              }
              // :root rules
              if (rule.selectorText === ':root' && rule.style) {
                for (let j = 0; j < rule.style.length; j++) {
                  const prop = rule.style[j];
                  if (prop.startsWith('--')) {
                    vars.push({ name: prop, value: rule.style.getPropertyValue(prop).trim() });
                  }
                }
              }
            }
          } catch (e) {
            // Cross-origin stylesheets ignorieren
          }
        }
        // Fallback: alle definierten Custom Properties via getPropertyValue
        const htmlStyles = window.getComputedStyle(html);
        const knownProps = [
          '--token-very-dark-green', '--brand-primary', '--color-primary',
          '--color-secondary', '--text-primary', '--text-secondary',
          '--background-primary', '--background-secondary',
          '--font-heading', '--font-body', '--font-size-h1',
          '--spacing-xs', '--spacing-sm', '--spacing-md', '--spacing-lg',
        ];
        for (const prop of knownProps) {
          const val = htmlStyles.getPropertyValue(prop).trim();
          if (val) vars.push({ name: prop, value: val });
        }
        return vars;
      });

      // Extrahiere Font-Familien aus genutzten Text-Elementen
      const fontFamilies = await page.evaluate(() => {
        const fonts = new Set();
        const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button, li');
        for (const el of elements) {
          const ff = window.getComputedStyle(el).fontFamily;
          if (ff) {
            ff.split(',').forEach(f => {
              const clean = f.trim().replace(/["']/g, '');
              if (clean && clean !== 'sans-serif' && clean !== 'serif' && clean !== 'monospace') {
                fonts.add(clean);
              }
            });
          }
        }
        return Array.from(fonts);
      });

      // Extrahiere Breakpoints aus Media Queries
      const breakpoints = await page.evaluate(() => {
        const bps = [];
        for (let i = 0; i < document.styleSheets.length; i++) {
          try {
            const sheet = document.styleSheets[i];
            if (!sheet.cssRules) continue;
            for (const rule of sheet.cssRules) {
              if (rule instanceof CSSMediaRule) {
                const match = rule.conditionText.match(/(\d+)\s*px/);
                if (match) bps.push(parseInt(match[1], 10));
              }
            }
          } catch (e) {}
        }
        return [...new Set(bps)].sort((a, b) => a - b);
      });

      // CSS-Variablen in allCssContent schreiben
      for (const v of cssVars) {
        allCssContent += `${v.name}: ${v.value};\n`;
      }
      // Font-Familien als CSS-Variablen hinzufügen
      for (const ff of fontFamilies) {
        allCssContent += `--extracted-font: "${ff}";\n`;
      }
      // Breakpoints notieren
      if (breakpoints.length > 0) {
        allCssContent += `/* breakpoints: ${breakpoints.join(', ')}px */\n`;
      }

      log(`URL-Extraktion: ${cssVars.length} CSS-Variablen, ${fontFamilies.length} Fonts, ${breakpoints.length} Breakpoints`);
      await browser.close();
    } catch (e) {
      warn(`URL-Extraktion fehlgeschlagen: ${e.message}`);
      await browser.close().catch(() => {});
    }
  }
}

if (!allCssContent.trim()) fatal('Keine CSS-Inhalte aus Eingaben extrahiert.', 2);

const tokens = extractCustomProperties(allCssContent);
for (const [name, token] of tokens) token.type = detectTokenType(name, [...token.values][0] ?? '');

const existingMapping = (args['existing-tokens'] && fs.existsSync(args['existing-tokens']))
  ? JSON.parse(fs.readFileSync(args['existing-tokens'], 'utf8')) : null;

// Design-System für automatische GV-ID-Auflösung laden
// (Output von: novamira/adrians-export-design-system { what: "all" })
let dsIndex = null;
if (args['design-system']) {
  if (!fs.existsSync(args['design-system'])) {
    warn(`--design-system Datei nicht gefunden: ${args['design-system']}`);
  } else {
    try {
      const dsRaw = JSON.parse(fs.readFileSync(args['design-system'], 'utf8'));
      dsIndex = resolveGvIdsFromDesignSystem(dsRaw);
      log(`Design-System geladen: ${dsIndex.byHex.size} Farb-IDs, ${dsIndex.byLabel.size} Label-IDs (${dsIndex.total} Einträge gesamt)`);
    } catch (e) {
      warn(`Design-System konnte nicht geparst werden: ${e.message}`);
    }
  }
}

const tokenMapping = generateTokenMapping(tokens, existingMapping, dsIndex);

const outputJson = JSON.stringify(tokenMapping, null, 2);
if (args.output) {
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(path.resolve(args.output), outputJson, 'utf8');
  process.stderr.write(`token-mapping.json → ${args.output}\n`);
} else {
  process.stdout.write(outputJson + '\n');
}

if (args['variables-plan']) {
  const plan = buildVariablesPlan(tokenMapping);
  fs.mkdirSync(path.dirname(path.resolve(args['variables-plan'])), { recursive: true });
  fs.writeFileSync(path.resolve(args['variables-plan']), JSON.stringify(plan, null, 2), 'utf8');
  process.stderr.write(`variables-plan.json → ${args['variables-plan']}\n`);
}

process.stderr.write(`${tokenMapping.meta.mappedCount} mapped, ${tokenMapping.meta.unmappedCount} need e-gv-* IDs\n`);
process.exit(0);
// NB: unmapped tokens are normal on first run — they need e-gv-* IDs
//     assigned via batch-create-variables. The variables-plan.json
//     includes the MCP call to do this.
