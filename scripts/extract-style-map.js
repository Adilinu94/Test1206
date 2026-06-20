#!/usr/bin/env node
/**
 * extract-style-map.js  —  Pre-Build Step: getProjectXml() → style-map.json
 *
 * Liest den getProjectXml()-Output (XML-String) und extrahiert alle
 * TextStyles und ColorStyles in eine normalisierte JSON-Map die
 * convert-xml-to-v4.js via --style-map konsumiert.
 *
 * Usage:
 *   node scripts/extract-style-map.js \
 *     --xml FramerExport/project.xml \
 *     --output FramerExport/tokens/style-map.json
 *
 *   # Oder via stdin:
 *   cat project.xml | node scripts/extract-style-map.js --output style-map.json
 *
 * Output-Format:
 * {
 *   "textStyles": {
 *     "/Headings/80": {
 *       "fontSize": "72px",
 *       "fontWeight": "500",
 *       "fontFamily": "Geist",
 *       "lineHeight": "1em",
 *       "letterSpacing": "-0.02em",
 *       "color": null
 *     }
 *   },
 *   "colorStyles": {
 *     "/Neutrals/Neutral 950": "#010004",
 *     "/Primary scale/Primary 500": "#0f5bff"
 *   }
 * }
 */

import fs   from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    xml:     { type: 'string' },
    output:  { type: 'string' },
    verbose: { type: 'boolean', default: false },
  },
  strict: false,
});

const log  = (...m) => { if (args.verbose) process.stderr.write('[extract-style-map] ' + m.join(' ') + '\n'); };
const warn = (m)    => process.stderr.write(`⚠ [extract-style-map] ${m}\n`);

// ─── Load XML ───────────────────────────────────────────────────────────────

let xmlContent;
if (args.xml) {
  if (!fs.existsSync(args.xml)) { process.stderr.write(`Error: --xml nicht gefunden: ${args.xml}\n`); process.exit(2); }
  xmlContent = fs.readFileSync(args.xml, 'utf8');
} else {
  // Read from stdin
  try {
    xmlContent = fs.readFileSync('/dev/stdin', 'utf8');
  } catch {
    process.stderr.write('Error: --xml erforderlich oder XML via stdin übergeben.\n'); process.exit(2);
  }
}

// ─── Fix #4: Format-Detektion (JSON vs XML) ─────────────────────────────────
// getProjectXml() liefert je nach Unframer-Version entweder XML oder JSON.
// Bei JSON-Input produziert der XML-Regex-Parser leere Maps ohne Fehler —
// das wird hier abgefangen und JSON wird direkt in das Ausgabeformat umgewandelt.

function detectFormat(content) {
  const trimmed = content.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('<')) return 'xml';
  return 'unknown';
}

const inputFormat = detectFormat(xmlContent);
log(`Input format detected: ${inputFormat}`);

if (inputFormat === 'json') {
  warn('Input ist JSON (nicht XML) — Framer-JSON-Format erkannt. Extrahiere Styles direkt aus JSON.');
  try {
    const parsed = JSON.parse(xmlContent);
    // Unframer liefert entweder { textStyles: {…}, colorStyles: {…} } direkt
    // oder ein verschachteltes Objekt mit "styles"-Key.
    const raw = parsed.styles || parsed;
    const textStyles = {};
    const colorStyles = {};

    // textStyles: { "/Headings/80": { fontSize, fontWeight, fontFamily, … } }
    for (const [name, val] of Object.entries(raw.textStyles || {})) {
      if (!name || typeof val !== 'object') continue;
      textStyles[name] = {
        fontSize:      val.fontSize      || val['font-size']      || null,
        fontWeight:    val.fontWeight    || val['font-weight']    || null,
        fontFamily:    val.fontFamily    || val['font-family']    || null,
        lineHeight:    val.lineHeight    || val['line-height']    || null,
        letterSpacing: val.letterSpacing || val['letter-spacing'] || null,
        color:         val.color         || null,
      };
    }

    // colorStyles: { "/Neutrals/Neutral 950": "#010004" }
    for (const [name, val] of Object.entries(raw.colorStyles || {})) {
      if (!name) continue;
      colorStyles[name] = typeof val === 'string' ? val : (val.value || val.hex || val.color || null);
    }

    // Framer JSON kann auch eine flache "colors"-Map enthalten
    for (const [name, val] of Object.entries(raw.colors || {})) {
      if (!name || colorStyles[name]) continue;
      colorStyles[name] = typeof val === 'string' ? val : (val.value || val.hex || val.color || null);
    }

    const tsCount = Object.keys(textStyles).length;
    const csCount = Object.keys(colorStyles).length;
    if (tsCount === 0 && csCount === 0) {
      warn('JSON-Input: Keine TextStyles oder ColorStyles gefunden. Prüfe Unframer-Ausgabeformat.');
    }

    const output = JSON.stringify({ textStyles, colorStyles }, null, 2);
    if (args.output) {
      fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
      fs.writeFileSync(args.output, output, 'utf8');
      process.stderr.write(`✓ style-map.json (aus JSON): ${tsCount} text styles, ${csCount} color styles → ${args.output}\n`);
    } else {
      process.stdout.write(output + '\n');
    }
    process.exit(0);
  } catch (e) {
    warn(`JSON-Parsing fehlgeschlagen: ${e.message} — versuche XML-Fallback.`);
    // Fällt durch zum XML-Parser
  }
} else if (inputFormat === 'unknown') {
  warn('Unbekanntes Eingabeformat (weder XML noch JSON). Versuche XML-Parser als Fallback.');
}

// ─── Attribute extractor (minimal, no full parse needed) ────────────────────

/**
 * Extrahiert alle Attribute eines einzelnen XML-Tags als Key→Value Map.
 * Unterstützt einfache und doppelte Anführungszeichen.
 */
function parseAttrs(tagStr) {
  const attrs = {};
  // Remove tag name at start
  const body = tagStr.replace(/^\s*\w[\w.-]*\s*/, '');
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    attrs[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return attrs;
}

/**
 * Findet alle Self-Closing- und Open-Tags mit einem bestimmten Tag-Namen.
 * Gibt Array von Attribut-Objects zurück.
 */
function findAllTags(xml, tagName) {
  const results = [];
  // Match both self-closing <Tag .../> and open <Tag ...>
  const re = new RegExp(`<${tagName}(\\s[^>]*?)(?:\\/>|>)`, 'gs');
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(parseAttrs(tagName + (m[1] || '')));
  }
  return results;
}

// ─── Extract TextStyles ──────────────────────────────────────────────────────

/**
 * Normalisiert einen Framer-Pixel- oder em-Wert zu einem CSS-String.
 * Framer speichert Werte oft als reine Zahl (z.B. "72") → "72px"
 */
function normalizeUnit(val, defaultUnit = 'px') {
  if (!val) return null;
  const s = String(val).trim();
  if (/^-?[\d.]+$/.test(s)) return `${s}${defaultUnit}`;
  return s;
}

const textStyleMap = {};
const textStyleTags = findAllTags(xmlContent, 'TextStyle');
log(`Found ${textStyleTags.length} TextStyle nodes`);

for (const attrs of textStyleTags) {
  const name = attrs.name || attrs.id;
  if (!name) continue;

  // Framer uses both camelCase and hyphenated attribute names
  const fontSize      = normalizeUnit(attrs.fontSize     || attrs['font-size']);
  const fontWeight    = attrs.fontWeight   || attrs['font-weight']   || null;
  const fontFamily    = attrs.fontFamily   || attrs['font-family']   || null;
  const lineHeight    = normalizeUnit(attrs.lineHeight   || attrs['line-height'],  'em');
  const letterSpacing = normalizeUnit(attrs.letterSpacing || attrs['letter-spacing'], 'em');
  const color         = attrs.color || null;

  textStyleMap[name] = {
    fontSize,
    fontWeight,
    fontFamily,
    lineHeight,
    letterSpacing,
    color,
  };
  log(`  TextStyle "${name}": ${fontSize} / ${fontWeight} / ${fontFamily}`);
}

// ─── Extract ColorStyles ─────────────────────────────────────────────────────

const colorStyleMap = {};
const colorStyleTags = findAllTags(xmlContent, 'ColorStyle');
log(`Found ${colorStyleTags.length} ColorStyle nodes`);

for (const attrs of colorStyleTags) {
  const name  = attrs.name || attrs.id;
  const value = attrs.value || attrs.color || attrs.hex || null;
  if (!name || !value) continue;
  colorStyleMap[name] = value;
  log(`  ColorStyle "${name}": ${value}`);
}

// ─── Also check for <Color> nodes used as named tokens ───────────────────────
// Framer sometimes stores color tokens as <Color name="..." value="..."/>

const colorTags = findAllTags(xmlContent, 'Color');
for (const attrs of colorTags) {
  const name  = attrs.name;
  const value = attrs.value || attrs.color || attrs.hex;
  if (!name || !value) continue;
  if (!colorStyleMap[name]) {
    colorStyleMap[name] = value;
    log(`  Color token "${name}": ${value}`);
  }
}

// ─── Output ──────────────────────────────────────────────────────────────────

const styleMap = {
  textStyles:  textStyleMap,
  colorStyles: colorStyleMap,
};

const tsCount = Object.keys(textStyleMap).length;
const csCount = Object.keys(colorStyleMap).length;

if (tsCount === 0 && csCount === 0) {
  warn('Keine TextStyles oder ColorStyles gefunden. Prüfe ob --xml den getProjectXml() Output enthält.');
}

const output = JSON.stringify(styleMap, null, 2);

if (args.output) {
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, output, 'utf8');
  process.stderr.write(`✓ style-map.json: ${tsCount} text styles, ${csCount} color styles → ${args.output}\n`);
} else {
  process.stdout.write(output + '\n');
}
