#!/usr/bin/env node
/**
 * convert-xml-to-v4.js  —  Phase 2: Framer XML → Elementor V4 Widget-Tree
 * Konvertiert Framer getNodeXml() Output direkt in V4 JSON.
 *
 * Usage:
 *   node scripts/convert-xml-to-v4.js \
 *     --xml      FramerExport/hero-section.xml \
 *     --tokens   FramerExport/tokens/token-mapping.json \
 *     --fonts    FramerExport/tokens/font-resolution.json \
 *     --image-map FramerExport/assets/image-map.json \
 *     --output   FramerExport/v4-tree/hero-section.json
 */

import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
import {
  normalizeHex, resolveCssVar, generateStyleId, sanitizeStyleId, isValidStyleId,
  wrapSize, wrapUnitless, wrapDimensions, wrapBorderRadius, wrapGvColor, wrapGvFont,
  wrapColor, wrapType, wrapImageSrc, isDimensionValue, wrapImage, wrapHtmlContent,
  wrapClasses,
} from './lib/framer-utils.js';
import { buildStyleClass } from './lib/v4-tree-builder.js';

// ─────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    xml:            { type: 'string' },
    'xml-string':   { type: 'string' },
    tokens:         { type: 'string' },
    fonts:          { type: 'string' },
    'image-map':    { type: 'string' },
    'style-map':    { type: 'string' },   // JSON aus getProjectXml() mit textStyles/colorStyles
    output:         { type: 'string' },
    validate:       { type: 'boolean', default: false },
    verbose:        { type: 'boolean', default: false },
    'gc':           { type: 'boolean', default: false },
    'gc-output':    { type: 'string' },
    'gc-min-dups':  { type: 'string', default: '2' },
    'tokens-report': { type: 'boolean', default: false },
    'pro-fallback':  { type: 'boolean', default: true },
    'is-pro-active': { type: 'string', default: '' },  // 'true' or 'false' (parsed below)
    // Fix #11: CSS-Fallback wenn getProjectXml() keine Styles liefert
    // --framer-url oder --framer-html → css-fallback-extractor.js läuft automatisch
    // wenn style-map leer/fehlend ist.
    'framer-url':  { type: 'string' },  // Publizierte Framer-URL für CSS-Crawl-Fallback
    'framer-html': { type: 'string' },  // Lokales FramerExport HTML als Fallback-Quelle
    // Sprint 20 (Punkt #7): Optionale WP-Theme-Defaults statt hartkodierter
    // RC-11-Fallbacks (Inter/32px/#111111). Muss von einem Agenten mit
    // Live-MCP-Zugriff befüllt werden (z. B. via novamira-Theme-Abilities) —
    // dieses Script selbst fragt WordPress nicht live ab.
    // Schema: { "heading": {...}, "body": {...} } (gleiche Felder wie styleMap-Einträge).
    'theme-defaults': { type: 'string' },
    'prefer-gc':     { type: 'boolean', default: false },
    // Neu P4-D: Layout-Map für Pattern-Erkennung (absolute Position, Flex-Row, Z-Index, Pill-Buttons)
    'layout-map':    { type: 'string' },
  },
  strict: false,
});

const isProActive = (args['is-pro-active'] || '').toLowerCase() === 'true';
const proFallbackEnabled = args['pro-fallback'] !== false;
// Fix #1: --prefer-gc delegiert background an generate-global-classes.js (kein lokaler Style)
const preferGcForBackground = args['prefer-gc'] === true;
// Fix #1 (repair): GC-Kandidaten sammeln wenn --prefer-gc aktiv ist.
// background wird NICHT in props geschrieben (siehe buildStyleProps), wäre also
// für generate-global-classes.js unsichtbar. Wir schreiben die Kandidaten daher
// in eine separate Begleitdatei <output>.gc-candidates.json statt sie in den
// Tree zu mischen (vermeidet Risiko, dass Metadaten ins Elementor-Payload sickern).
const pendingGcCandidates = [];

// Help
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log('Usage: node scripts/convert-xml-to-v4.js [--help for options]'); console.log('Run with --help for full usage.'); process.exit(0); }

const log  = (...m) => { if (args.verbose) process.stderr.write('[verbose] ' + m.join(' ') + '\n'); };
const warn = (m)    => process.stderr.write(`⚠ ${m}\n`);

if (!args.xml && !args['xml-string']) {
  process.stderr.write('Error: --xml oder --xml-string erforderlich\n'); process.exit(2);
}

// ─────────────────────────────────────────────
// XML TOKENIZER  (character-by-character, handles quoted values)
// ─────────────────────────────────────────────

/**
 * Zerlegt einen Framer HTML/XML-String in einen Token-Strom.
 *
 * Arbeitet character-by-character um Attribute mit Anführungszeichen,
 * self-closing Tags und CDATA korrekt zu behandeln.
 *
 * Bug 8: Ignoriert HTML-Kommentare (<!-- -->) die Framer zwischen
 * Attributen einbettet.
 *
 * @param {string} xml - XML/HMTL-Rohstring (Framer getNodeXml() Output)
 * @returns {Array<{type: 'open'|'close'|'selfclose'|'text', tagName?: string, attrs?: object, value?: string}>}
 */
function tokenizeXml(xml) {
  const tokens = [];
  let i = 0;

  while (i < xml.length) {
    // Collect text content between tags
    if (xml[i] !== '<') {
      const textStart = i;
      while (i < xml.length && xml[i] !== '<') i++;
      const text = xml.slice(textStart, i).replace(/\s+/g, ' ').trim();
      if (text) tokens.push({ type: 'text', value: text });
      continue;
    }

    // XML declaration
    if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i); i = end >= 0 ? end + 2 : xml.length; continue;
    }
    // Comment
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i); i = end >= 0 ? end + 3 : xml.length; continue;
    }
    // CDATA — treat as text
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i);
      const cdata = end >= 0 ? xml.slice(i + 9, end) : '';
      if (cdata.trim()) tokens.push({ type: 'text', value: cdata.trim() });
      i = end >= 0 ? end + 3 : xml.length; continue;
    }

    i++; // skip <

    // Closing tag?
    const isClose = i < xml.length && xml[i] === '/';
    if (isClose) i++;

    // Read tag name
    const nameStart = i;
    while (i < xml.length && /[A-Za-z0-9_:-]/.test(xml[i])) i++;
    const tagName = xml.slice(nameStart, i);
    if (!tagName) { i++; continue; }

    if (isClose) {
      while (i < xml.length && xml[i] !== '>') i++;
      i++; // skip >
      tokens.push({ type: 'close', tagName });
      continue;
    }

    // Read attributes
    const attrs = {};
    while (i < xml.length) {
      // Skip whitespace
      while (i < xml.length && /[\s\r\n]/.test(xml[i])) i++;
      if (i >= xml.length || xml[i] === '>' || (xml[i] === '/' && xml[i+1] === '>')) break;
      // Skip HTML comments inside tags (Bug 8: Framer XML embeds <!-- --> between attrs)
      if (xml.startsWith('<!--', i)) {
        const end = xml.indexOf('-->', i);
        i = end >= 0 ? end + 3 : xml.length;
        continue;
      }

      // Attr name
      const attrStart = i;
      while (i < xml.length && xml[i] !== '=' && xml[i] !== '>' && !/[\s\r\n]/.test(xml[i])) i++;
      const attrName = xml.slice(attrStart, i).trim();

      if (xml[i] === '=') {
        i++; // skip =
        if (i < xml.length && (xml[i] === '"' || xml[i] === "'")) {
          const q = xml[i]; i++;
          const valStart = i;
          while (i < xml.length && xml[i] !== q) i++;
          if (attrName) attrs[attrName] = xml.slice(valStart, i);
          i++; // skip closing quote
        }
      } else if (attrName) {
        attrs[attrName] = 'true';
      }
    }

    const isSelfClose = i < xml.length && xml[i] === '/';
    if (isSelfClose) i++;             // skip /
    if (i < xml.length && xml[i] === '>') i++; // skip >

    tokens.push({ type: isSelfClose ? 'selfclose' : 'open', tagName, attrs });
  }

  return tokens;
}

/**
 * Baut aus einem Token-Strom einen AST (Abstract Syntax Tree).
 *
 * Verarbeitet open/close/selfclose/text-Tokens zu einem verschachtelten
 * Node-Baum mit tagName, attrs und children.
 *
 * @param {Array} tokens - Token-Strom aus tokenizeXml()
 * @returns {Array<{tagName: string, attrs: object, children: Array, _textContent?: string}>}
 */
function buildTree(tokens) {
  const root = { tagName: '_root', attrs: {}, children: [] };
  const stack = [root];
  let pendingText = '';
  for (const tok of tokens) {
    if (tok.type === 'text') {
      // Accumulate text content between tags
      pendingText += tok.value;
    } else if (tok.type === 'close') {
      // Attach accumulated text to the element being closed
      if (pendingText.trim() && stack.length > 1) {
        stack[stack.length - 1]._textContent = (stack[stack.length - 1]._textContent || '') + pendingText.trim();
      }
      pendingText = '';
      if (stack.length > 1) stack.pop();
    } else {
      pendingText = '';
      const node = { tagName: tok.tagName, attrs: tok.attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (tok.type === 'open') stack.push(node);
    }
  }
  return root.children;
}

// ─────────────────────────────────────────────
// WIDGET TYPE DETERMINATION
// ─────────────────────────────────────────────

/**
 * Bestimmt den V4-Widget-Type für einen Framer XML-Node.
 *
 * Prioritätsreihenfolge:
 *   1. C2: CSS Grid Detection (display:grid / grid-template-*) → e-div-block
 *   2. C1: Component Preservation (componentId/componentName) → e-component
 *   3. RC-16: Explicit Component Name Mapping (COMPONENT_TYPE_MAP)
 *   4. SVG Native Tags → e-svg
 *   5. Heuristisch: Button, Heading, Paragraph, Image, Container
 *
 * @param {object} attrs - XML-Node-Attribute (data-framer-*, class, style)
 * @param {object} [xmlNode] - Vollständiger XML-Node (für Child-Count, tagName)
 * @returns {string} V4-Widget-Type (e-flexbox, e-heading, e-button, etc.)
 */
// Native SVG tag names — these map directly to e-svg regardless of parent
const SVG_NATIVE_TAGS = new Set([
  'svg', 'circle', 'ellipse', 'rect', 'path', 'polygon', 'polyline',
  'line', 'g', 'defs', 'use', 'symbol', 'text', 'tspan', 'mask',
  'clippath', 'lineargradient', 'radialgradient', 'stop', 'pattern',
]);

// Framer Component Name → V4 Widget Type Mapping (RC-16 Fix)
// Explicitly maps known Framer component patterns to corresponding V4 atomic widgets.
// Falls through to heuristic detection if no match found.
// NOTE: 'svg' and 'icon' are NOT mapped here — SVG detection is handled by
// SVG_NATIVE_TAGS check below (avoids false positives on containers named "Icons").
const COMPONENT_TYPE_MAP = {
  'heading': 'e-heading',
  'paragraph': 'e-paragraph',
  'button': 'e-button',
  'cta': 'e-button',
  'image': 'e-image',
  'img': 'e-image',
  'divider': 'e-divider',
  'card': 'e-flexbox',
  'stats': 'e-flexbox',
  'testimonial': 'e-flexbox',
  'hero': 'e-flexbox',
  'section': 'e-flexbox',
};

function determineWidgetType(attrs, xmlNode) {
  const name    = (attrs.name || '').toLowerCase();
  const tagName = (xmlNode?.tagName || '').toLowerCase();

  // ── C2: Explicit CSS Grid Detection ──
  // Check for explicit CSS Grid properties BEFORE name-pattern heuristic.
  // Framer uses display:grid / grid-template-* in CSS — these must override
  // the child-count heuristic to avoid false positives.
  if (attrs.display === 'grid') return 'e-div-block';
  if (attrs['grid-template-columns'] || attrs['grid-template-rows']) return 'e-div-block';

  // ── C1: Component Preservation ──
  // Framer Component Instances → V4 e-component Widget.
  // componentId/componentName indicate a reuseable component that should
  // be rendered as e-component with property overrides.
  if (attrs.componentId || attrs.componentName) return 'e-component';

  // ── Explicit Component Name Mapping (RC-16 Fix) ──
  // Check if the Framer component name maps directly to a V4 widget type.
  // Falls through to heuristic if the map entry's guard condition isn't met.
  for (const [pattern, widgetType] of Object.entries(COMPONENT_TYPE_MAP)) {
    if (name === pattern || name.includes(pattern)) {
      // Guard: button entry only applies when href is present.
      // Use break (not continue) so guarded-out matches fall through to the existing heuristic.
      if (widgetType === 'e-button' && !attrs.href && name !== 'button' && name !== 'cta') break;
      // Guard: image entry only applies when image source is present
      if (widgetType === 'e-image' && !attrs.backgroundImage && !attrs.src) break;
      return widgetType;
    }
  }

  // ── SVG: ONLY when the tag itself is a native SVG element ──
  // Framer uses PascalCase tags (Frame, Text, Image, Stack) — SVG uses lowercase.
  // We check the ORIGINAL (non-lowercased) tagName to avoid matching Framer's
  // <Text> element against SVG's <text> element.
  const rawTagName = (xmlNode?.tagName || '');
  if (SVG_NATIVE_TAGS.has(rawTagName.toLowerCase()) && rawTagName === rawTagName.toLowerCase()) {
    return 'e-svg';
  }

  if (attrs.href || name.includes('button') || name.includes('cta')) return 'e-button';

  // Text detection: attribute OR child-text (Bug 1 Fix)
  const hasText = attrs.text !== undefined || xmlNode?._textContent;
  if (hasText) {
    if (/\bh[1-6]\b|heading/.test(name)) return 'e-heading';
    if (/\bbody|paragraph|text|description|content/.test(name)) return 'e-paragraph';
    return 'e-heading'; // default for text nodes
  }
  if (attrs.backgroundImage || attrs.src) return 'e-image';

  // RC-09 Grid Detection: multi-child containers with grid-like naming patterns
  // or explicit grid attributes should use e-div-block with display:grid.
  // This enables proper 2D layouts (cards, stats, galleries) instead of
  // forcing everything into nested flexboxes.
  const childCount = (xmlNode?.children || []).filter(c => c.tagName && c.tagName !== '_root').length;
  if (childCount >= 2) {
    if (/\b(grid|gallery|cards|stats|features|logos|columns)\b/.test(name)) {
      return 'e-div-block';
    }
    // Detect repeated child patterns (2+ children with same or similar names)
    // which suggests a grid/card layout rather than sequential flexbox
    const childNames = (xmlNode.children || [])
      .filter(c => c.tagName && c.tagName !== '_root')
      .map(c => (c.attrs?.name || '').toLowerCase().replace(/\d+$/, ''))
      .filter(n => n);
    const uniqueNames = new Set(childNames);
    // If children share a naming pattern (e.g., "card-1", "card-2", "card-3"),
    // this is likely a grid layout. 3+ children with 2 or fewer unique base names
    // strongly suggests a repeated pattern.
    if (childCount >= 3 && uniqueNames.size <= 2) {
      return 'e-div-block';
    }
  }

  return 'e-flexbox'; // default container
}

function determineHtmlTag(attrs) {
  const name = (attrs.name || '').toLowerCase();
  if (/\bh1\b|heading.?1|title/.test(name))   return 'h1';
  if (/\bh2\b|heading.?2/.test(name))          return 'h2';
  if (/\bh3\b|heading.?3/.test(name))          return 'h3';
  if (/\bh4\b|heading.?4/.test(name))          return 'h4';
  if (/\bh5\b|heading.?5/.test(name))          return 'h5';
  if (/\bh6\b|heading.?6/.test(name))          return 'h6';
  if (/paragraph|body|text/.test(name))         return 'p';
  return 'h2'; // default heading
}

// ─────────────────────────────────────────────
// CONTAINER-TAG REMAPPER  (BLOCKADE 6 / P2-A)
// ─────────────────────────────────────────────
//
// Hintergrund (E2E-Verbesserungsbericht Blockade 6):
//   nav und main sind NICHT in der e-flexbox Tag-Enum und fuehren zu
//   elementor-set-content Error:
//     "invalid_values": [{ "key":"tag","value":"nav","opts":["div","header",...] }]
//
// Strategie:
//   - Definiertes Mapping: nav→header, main→section, span→div (fuer Block-Container)
//   - Fallback auf 'div' wenn Tag auch nach Remap nicht erlaubt ist
//
// Elementor V4 Tag-Enums (siehe auch style-props-quickref.md):
//   e-flexbox   : div, header, section, article, aside, footer, a, button
//   e-div-block : div, header, section, article, aside, footer, span噂oldString>


// BLOCKADE 6 / P2-A: Tag-Remapper (nav→header etc.)
// Elementor V4 akzeptiert diese Tags NICHT in e-flexbox enum: nav, main
// Siehe style-props-quickref.md für vollstaendige Enum-Referenz.
const CONTAINER_TAG_REMAPPINGS = {
  'nav':     'header',  // nav-Semantik am naehesten an header (Barrierefreiheit-Hinweis)
  'main':    'section', // main nicht erlaubt → section als Container
  'span':    'div',     // fuer Block-Container; span nur in e-div-block erlaubt
};

const CONTAINER_TAG_ENUMS = {
  'e-flexbox':   ['div','header','section','article','aside','footer','a','button'],
  'e-div-block': ['div','header','section','article','aside','footer','span'],
};

/**
 * Sanitiert einen Framer-Tag-String in einen gueltigen Elementor V4 Container-Tag.
 * Wird von e-flexbox und e-div-block verwendet BEVOR der Tag in settings.tag landet.
 *
 * Mapping-Reihenfolge:
 *   1. CONTAINER_TAG_REMAPPINGS (semantische Alternativen)
 *   2. Fallback auf 'div' wenn weder Original-Tag noch Mapping in Enum ist
 *
 * @param {string} framerTag - Original-Tag aus Framer XML
 * @param {string} widgetType - V4-Widget-Typ ('e-flexbox' | 'e-div-block')
 * @returns {string} Sanitisierter Tag
 */
function sanitizeContainerTag(framerTag, widgetType) {
  const raw = String(framerTag || '').toLowerCase().trim();
  if (!raw) return widgetType === 'e-div-block' ? 'div' : 'section';

  const allowed = CONTAINER_TAG_ENUMS[widgetType]
    ?? (widgetType === 'e-div-block' ? CONTAINER_TAG_ENUMS['e-div-block'] : CONTAINER_TAG_ENUMS['e-flexbox']);

  // 1. Direkt erlaubt? → durchlassen
  if (allowed.includes(raw)) return raw;

  // 2. Bekanntes Remap-Mapping anwenden
  const remapped = CONTAINER_TAG_REMAPPINGS[raw];
  if (remapped && allowed.includes(remapped)) return remapped;

  // 3. Fallback: 'div' wenn erlaubt, sonst erstes Element der Enum
  if (allowed.includes('div')) return 'div';
  return allowed[0];
}

function wrapLink(href, targetBlank = false) {
  // Elementor V4 nativer Link-Prop: 'destination' + 'tag', NICHT 'href'
  // EMCP class-atomic-props.php link() Methode bestaetigt dieses Format
  const value = {
    destination: { '$$type': 'url', value: href || '' },
    tag:         { '$$type': 'string', value: 'a' },
  };
  if (targetBlank) value.isTargetBlank = { '$$type': 'boolean', value: true };
  return { '$$type': 'link', value };
}

// Bug 6 Fix: serialize an XML node back to SVG markup for e-svg content
function serializeSvgNode(xmlNode) {
  const { tagName, attrs, children } = xmlNode;
  if (!tagName || tagName === '_root') return '';
  const attrStr = Object.entries(attrs || {})
    .filter(([k]) => k !== 'name' && k !== 'nodeId')
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join(' ');
  const childContent = (children || []).map(serializeSvgNode).join('');
  if (childContent || tagName.toLowerCase() !== 'circle') {
    return `<${tagName}${attrStr ? ' ' + attrStr : ''}>${childContent}</${tagName}>`;
  }
  return `<${tagName}${attrStr ? ' ' + attrStr : ''}/>`;
}

// ─────────────────────────────────────────────
// COLOR RESOLUTION
// ─────────────────────────────────────────────

const warnings = [];

/**
 * Löst einen CSS-Farbwert in eine V4-Color-Referenz auf.
 *
 * Prioritätsreihenfolge:
 *   1. CSS-Variable → GV-Referenz via tokenMapping (wrapGvColor)
 *   2. CSS-Variable ohne gv_id → Hex-Fallback (wrapColor)
 *   3. Direkter Hex-Wert → Raw Color (wrapColor)
 *
 * @param {string|null} value - CSS-Farbwert (hex, rgb, oder var(--token))
 * @param {object|null} tokenMapping - Token-Mapping mit gv_id Referenzen
 * @returns {object|null} V4 Color-Prop ($$type: "color" oder "gv-color") oder null
 */
function resolveColor(value, tokenMapping) {
  if (!value) return null;
  const resolved = resolveCssVar(value, tokenMapping);
  if (!resolved) {
    const hex = normalizeHex(value);
    if (hex) { warn(`Hardcoded hex used: ${hex} (no token match)`); return wrapColor(hex); }
    return null;
  }
  if (resolved.gvId) return wrapGvColor(resolved.gvId);
  if (resolved.hex)  {
    warn(`Token found but no gv_id for value: ${value} → ${resolved.hex}`);
    return wrapColor(resolved.hex);
  }
  return null;
}

// ─────────────────────────────────────────────
// FONT RESOLUTION
// ─────────────────────────────────────────────

function resolveFont(family, tokenMapping, fontResolution) {
  if (!family) return null;
  // Try token mapping first
  if (tokenMapping?.fonts?.[family]?.gv_id) return wrapGvFont(tokenMapping.fonts[family].gv_id);
  if (typeof tokenMapping?.fonts?.[family] === 'string') return wrapGvFont(tokenMapping.fonts[family]);
  if (typeof tokenMapping?.[family] === 'string' && tokenMapping[family].startsWith('e-gv-')) return wrapGvFont(tokenMapping[family]);
  if (typeof tokenMapping?.[family.toLowerCase?.()] === 'string' && tokenMapping[family.toLowerCase()].startsWith('e-gv-')) {
    return wrapGvFont(tokenMapping[family.toLowerCase()]);
  }
  // Try font resolution
  const fontEntry = (fontResolution?.fonts || []).find(f => f.family === family);
  if (fontEntry?.gv_id) return wrapGvFont(fontEntry.gv_id);
  warn(`Font '${family}' not found in token-mapping or font-resolution. Using string fallback.`);
  return wrapType('string', family);
}

// ─────────────────────────────────────────────
// IMAGE URL RESOLUTION
// ─────────────────────────────────────────────

function extractImageUrl(imageAttr) {
  if (!imageAttr) return null;
  const raw = String(imageAttr).trim();
  const urlMatch = raw.match(/url\(['"]?([^'")\s]+)['"]?\)/i);
  return urlMatch ? urlMatch[1] : raw;
}

function findImageMapEntry(url, imageMap) {
  if (!url || !imageMap) return null;
  const filename = url.split('/').pop().split('?')[0];
  if (imageMap[url]) return imageMap[url];
  if (imageMap.images?.[filename]) return imageMap.images[filename];
  if (imageMap.videos?.[filename]) return imageMap.videos[filename];
  if (Array.isArray(imageMap.assets)) {
    return imageMap.assets.find(a => a.url === url || a.filename === filename) || null;
  }
  if (Array.isArray(imageMap.images)) {
    return imageMap.images.find(a => a.url === url || a.filename === filename) || null;
  }
  return null;
}

function resolveImageSrc(bgImageAttr, imageMap) {
  if (!bgImageAttr) return null;
  const url = extractImageUrl(bgImageAttr);
  if (!url) return null;

  // Try to find in image-map
  const entry = findImageMapEntry(url, imageMap);
  if (entry?.wp_media_id) return wrapImageSrc({ id: entry.wp_media_id });
  if (entry?.id) return wrapImageSrc({ id: entry.id });

  return wrapImageSrc({ url });
}


function resolveLineHeight(lineHeight) {
  if (!lineHeight) return null;
  const raw = String(lineHeight).trim();
  if (/^-?[\d.]+$/.test(raw)) return wrapUnitless(raw);
  if (/^-?[\d.]+%$/.test(raw)) return wrapUnitless(parseFloat(raw) / 100);
  return wrapSize(raw);
}

// ─────────────────────────────────────────────
// PROPERTY MAPPER
// ─────────────────────────────────────────────

// RC-09 Helper: determines grid-template-columns value from attrs + child structure
// C2 Upgrade: respects explicit CSS grid-template-columns from Framer attributes
function detectGridLayout(xmlNode, attrs) {
  // C2: Explicit grid-template-columns from CSS takes priority
  if (attrs['grid-template-columns']) return attrs['grid-template-columns'];
  if (attrs['grid-template-rows']) return null; // rows defined but not columns → auto

  const childCount = (xmlNode?.children || []).filter(c => c.tagName && c.tagName !== '_root').length;
  if (childCount < 2) return null;
  if (childCount === 2) return '1fr 1fr';
  if (childCount === 3) return '1fr 1fr 1fr';
  if (childCount === 4) return '1fr 1fr 1fr 1fr';
  return 'repeat(auto-fit, minmax(250px, 1fr))';
}

/**
 * Baut das V4-Style-Props-Objekt aus Framer-Attributen.
 *
 * Dies ist die RICH-Version des Mappings. Die Library v4-tree-builder.js
 * enthält mit mapFramerStyleToV4Props() eine vereinfachte Referenz-Implementierung.
 * buildStyleProps() erweitert diese um:
 *   - Bug 3: background.color-Warnings (GC-only)
 *   - RC-08: position:absolute-Heuristik
 *   - RC-11: Sane Text-Fallbacks (Inter, 32px, etc.)
 *   - RC-09/C2: Grid-Detection mit grid-template-columns
 *   - RC-02: flex-direction ohne $$type-Wrapper
 *
 * Mapt CSS-Properties aus Framer-Attributen (stackDirection, backgroundColor,
 * fontFamily, etc.) in V4 Style-Props mit korrekten $$type-Wrappern.
 *
 * Widget-spezifische Logik:
 *   - e-div-block: display:grid + grid-template-columns (C2/RC-09)
 *   - e-flexbox/e-button: display:flex + flex-direction (RC-02)
 *   - e-heading/e-paragraph: Typografie-Properties
 *   - e-image: width/height
 *
 * Bug 3: background.color wird NUR in Global Classes gesetzt, nie lokal.
 * RC-08: position:absolute nur bei echten Overlays (mit Offset-Werten).
 * RC-11: Sane Fallbacks für Widgets mit leeren Props (Inter, 32px, etc.).
 *
 * @param {object} attrs - XML-Node-Attribute
 * @param {string} widgetType - V4-Widget-Type
 * @param {object|null} tokenMapping - Token-Mapping (colors, fonts)
 * @param {object|null} fontResolution - Font-Resolution
 * @param {object|null} imageMap - Image-Map (URL → wp_media_id)
 * @param {object|null} [xmlNode] - XML-Node (für Grid-Detection)
 * @returns {object} V4-Style-Props
 */
function buildStyleProps(attrs, widgetType, tokenMapping, fontResolution, imageMap, xmlNode = null, styleMap = null, elementId = null, themeDefaults = null) {
  const props  = {};
  const { stackDirection, stackGap, padding, maxWidth, width, height,
          backgroundColor, 'background-color': bgColor,
          borderRadius, 'border-radius': borderRadiusAlt,
          position, top, right, bottom, left,
          color, 'font-family': fontFamily, 'font-size': fontSize,
          'font-weight': fontWeight, 'line-height': lineHeight,
          'letter-spacing': letterSpacing, opacity,
          inlineTextStyle } = attrs;

  // inlineTextStyle-Auflösung: "/Headings/80" → { fontSize, fontWeight, fontFamily, lineHeight, letterSpacing }
  // Nur relevant für Text-Widgets; styleMap kommt aus getProjectXml() TextStyles.
  let resolvedStyle = null;
  if (inlineTextStyle && styleMap?.textStyles?.[inlineTextStyle]) {
    resolvedStyle = styleMap.textStyles[inlineTextStyle];
  }

  // ── Layout (flexbox / grid) ──
  if (widgetType === 'e-div-block') {
    // RC-09 Fix: Grid support for multi-child containers
    // detectGridLayout determines grid-template-columns from child count
    const gridColumns = detectGridLayout(xmlNode, attrs);
    if (gridColumns) {
      props['display'] = wrapType('string', 'grid');
      props['grid-template-columns'] = wrapType('string', gridColumns);
    } else {
      props['display'] = wrapType('string', 'block');
    }
    if (stackGap) props['gap'] = wrapSize(stackGap);
    if (padding)  props['padding'] = wrapDimensions(padding);
    if (maxWidth && isDimensionValue(maxWidth)) props['max-width'] = wrapSize(maxWidth);
    if (width    && isDimensionValue(width))    props['width']    = wrapSize(width);
    if (height   && isDimensionValue(height))   props['height']   = wrapSize(height);

    const bgVal = backgroundColor || bgColor;
    if (bgVal) {
      const resolved = resolveColor(bgVal, tokenMapping);
      if (resolved) {
        if (!preferGcForBackground) {
          // Bug 3 Fix: background.color als lokalen Style setzen statt verwerfen.
          // Elementor V4 Background-Prop-Struktur: { $$type: 'background', value: { color: <color-prop> } }
          props['background'] = { '$$type': 'background', value: { color: resolved } };
        } else if (elementId) {
          // Fix #1 (repair): background NICHT lokal, aber als GC-Kandidat sammeln —
          // sonst kann generate-global-classes.js den Wert nicht sehen (er steht
          // in keinem props-Feld mehr).
          // Generisches Schema (Sprint 20): { category, id, prop, value }
          pendingGcCandidates.push({
            category: 'background',
            id: elementId,
            prop: 'background',
            value: { '$$type': 'background', value: { color: resolved } },
          });
        }
      }
    }
  }

  if (widgetType === 'e-flexbox' || widgetType === 'e-button') {
    // RC-02 Fix: Explicit display property required by Elementor V4
    // flex-direction without display:flex is ineffective CSS
    props['display'] = wrapType('string', 'flex');
    if (stackDirection) {
      props['flex-direction'] = stackDirection === 'vertical' ? 'column' : 'row';
    }
    if (stackGap) props['gap'] = wrapSize(stackGap);
    if (padding)  props['padding'] = wrapDimensions(padding);
    // Filter non-numeric CSS keywords (fit-content, auto, etc.) — Elementor
    // Style_Parser rejects $$type:"string" for dimension properties.
    if (maxWidth && isDimensionValue(maxWidth)) props['max-width'] = wrapSize(maxWidth);
    if (width    && isDimensionValue(width))    props['width']    = wrapSize(width);
    if (height   && isDimensionValue(height))   props['height']   = wrapSize(height);

    const bgVal = backgroundColor || bgColor;
    if (bgVal) {
      // Bug 3 Fix: background.color als lokalen Style setzen statt verwerfen.
      const resolved = resolveColor(bgVal, tokenMapping);
      if (resolved) {
        if (!preferGcForBackground) {
          props['background'] = { '$$type': 'background', value: { color: resolved } };
        } else if (elementId) {
          // Fix #1 (repair): GC-Kandidat sammeln (siehe Begründung oben).
          // Generisches Schema (Sprint 20): { category, id, prop, value }
          pendingGcCandidates.push({
            category: 'background',
            id: elementId,
            prop: 'background',
            value: { '$$type': 'background', value: { color: resolved } },
          });
        }
      }
    }
  }

  // ── Typography (heading / text) ──
  if (widgetType === 'e-heading' || widgetType === 'e-paragraph') {
    // Direktwerte aus XML haben Vorrang; resolvedStyle (aus inlineTextStyle) fuellt fehlende Werte auf.
    const effFontSize      = fontSize       || resolvedStyle?.fontSize;
    const effFontWeight    = fontWeight     || resolvedStyle?.fontWeight;
    const effLineHeight    = lineHeight     || resolvedStyle?.lineHeight;
    const effLetterSpacing = letterSpacing  || resolvedStyle?.letterSpacing;
    const effFontFamily    = fontFamily     || resolvedStyle?.fontFamily;
    const effColor         = color          || resolvedStyle?.color;

    if (effFontSize)      props['font-size']      = wrapSize(effFontSize);
    if (effFontWeight)    props['font-weight']    = wrapType('string', effFontWeight);
    if (effLineHeight)    props['line-height']    = resolveLineHeight(effLineHeight);
    if (effLetterSpacing) props['letter-spacing'] = wrapSize(effLetterSpacing);
    if (effFontFamily) {
      const resolved = resolveFont(effFontFamily.split(',')[0].trim().replace(/['"]/g,''), tokenMapping, fontResolution);
      if (resolved) props['font-family'] = resolved;
    }
    if (effColor) {
      const resolved = resolveColor(effColor, tokenMapping);
      if (resolved) props['color'] = resolved;
    }
  }

  // ── Image ──
  if (widgetType === 'e-image') {
    if (width  && isDimensionValue(width))  props['width']  = wrapSize(width);
    if (height && isDimensionValue(height)) props['height'] = wrapSize(height);
  }

  // ── Border radius (all widget types) ──
  const br = borderRadius || borderRadiusAlt;
  if (br) props['border-radius'] = wrapBorderRadius(br);

  // ── Positioning ──
  // RC-08 Fix: Only set position:absolute for true overlay elements.
  // Framer uses absolute positioning as its canvas default — this should NOT
  // be carried over to Elementor V4 which expects normal DOM flow with flex/grid.
  // Heuristic: only set position when it's NOT 'absolute' (relative/fixed/sticky),
  // OR when the element has explicit offset values (top/right/bottom/left) that
  // indicate it's an intentional overlay (e.g. text on top of an image).
  // NOTE: Uses !== undefined (not truthiness) so zero values like top:"0" work.
  if (position) {
    const hasExplicitOffsets = top !== undefined || right !== undefined || bottom !== undefined || left !== undefined;
    // Always keep non-absolute positioning (relative, fixed, sticky)
    // For absolute: only keep if there are explicit offsets (true overlay)
    if (position !== 'absolute' || hasExplicitOffsets) {
      props['position'] = wrapType('string', position);
      if (top !== undefined)    props['top']    = wrapSize(top);
      if (right !== undefined)  props['right']  = wrapSize(right);
      if (bottom !== undefined) props['bottom'] = wrapSize(bottom);
      if (left !== undefined)   props['left']   = wrapSize(left);
    }
  }

  // ── Opacity ──
  if (opacity !== undefined) props['opacity'] = wrapUnitless(opacity);

  // RC-11 Fix: Minimum default styles for widgets with empty props.
  // Fix #5: Wenn styleMap verfügbar ist, wird ein semantisch passender TextStyle
  // gewählt statt der statischen Inter/32px Fallbacks.
  // Heuristik: Node-Name enthält "Heading"/"Title"/"H1-H6" → größter TextStyle
  //             Node-Name enthält "Body"/"Text"/"Para"      → kleinster TextStyle
  //             Sonst: mittlerer TextStyle.
  // NOTE: Only fires when NEITHER XML attrs NOR inlineTextStyle provided values.
  if (Object.keys(props).length === 0) {
    if (widgetType === 'e-heading' || widgetType === 'e-paragraph') {
      const textStyles = styleMap?.textStyles ? Object.entries(styleMap.textStyles) : [];
      let chosenStyle = null;

      if (textStyles.length > 0) {
        const withPx = textStyles
          .map(([name, s]) => ({ name, style: s, px: s.fontSize ? parseFloat(s.fontSize) : 0 }))
          .filter(e => e.px > 0)
          .sort((a, b) => a.px - b.px); // aufsteigend (kleinster → größter)

        const nodeName = (xmlNode?.attrs?.name || xmlNode?.attrs?.id || '').toLowerCase();
        const isHeading = /heading|title|h[1-6]|display|hero|header/i.test(nodeName);
        const isBody    = /body|text|para|caption|label|note|small/i.test(nodeName);

        if (withPx.length > 0) {
          if (widgetType === 'e-heading' || isHeading) {
            chosenStyle = withPx[withPx.length - 1].style; // größter
            log(`RC-11 smart fallback (heading): ${withPx[withPx.length - 1].name} ${withPx[withPx.length - 1].px}px`);
          } else if (isBody || widgetType === 'e-paragraph') {
            chosenStyle = withPx[0].style; // kleinster
            log(`RC-11 smart fallback (body): ${withPx[0].name} ${withPx[0].px}px`);
          } else {
            const mid = Math.floor(withPx.length / 2);
            chosenStyle = withPx[mid].style;
            log(`RC-11 smart fallback (mid): ${withPx[mid].name} ${withPx[mid].px}px`);
          }
        }
      }

      if (chosenStyle) {
        if (chosenStyle.fontFamily) {
          const ff = chosenStyle.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
          const resolved = resolveFont(ff, tokenMapping, fontResolution);
          props['font-family'] = resolved || wrapType('string', ff);
        }
        if (chosenStyle.fontSize)   props['font-size']   = wrapSize(chosenStyle.fontSize);
        if (chosenStyle.fontWeight) props['font-weight'] = wrapType('string', String(chosenStyle.fontWeight));
        if (chosenStyle.lineHeight) props['line-height'] = resolveLineHeight(chosenStyle.lineHeight);
        if (chosenStyle.color) {
          const c = resolveColor(chosenStyle.color, tokenMapping);
          if (c) props['color'] = c;
        }
      } else {
        // Sprint 20 (Punkt #7): WP-Theme-Defaults statt hartkodierter Werte,
        // falls --theme-defaults bereitgestellt wurde (z. B. von einem Agenten
        // mit Live-MCP-Zugriff via novamira/adrians-get-theme-defaults o.ä.
        // befüllt). Schema: { heading: {...}, body: {...} } — gleiche Felder
        // wie ein styleMap-Eintrag (fontFamily/fontSize/fontWeight/color/...).
        const themeKey = widgetType === 'e-heading' ? 'heading' : 'body';
        const themeDefault = themeDefaults?.[themeKey];

        if (themeDefault) {
          log(`RC-11 Theme-Default (${themeKey}): aus --theme-defaults statt hartkodiertem Fallback`);
          if (themeDefault.fontFamily) {
            const ff = String(themeDefault.fontFamily).split(',')[0].trim().replace(/['"]/g, '');
            const resolved = resolveFont(ff, tokenMapping, fontResolution);
            props['font-family'] = resolved || wrapType('string', ff);
          }
          if (themeDefault.fontSize)   props['font-size']   = wrapSize(themeDefault.fontSize);
          if (themeDefault.fontWeight) props['font-weight'] = wrapType('string', String(themeDefault.fontWeight));
          if (themeDefault.lineHeight) props['line-height'] = resolveLineHeight(themeDefault.lineHeight);
          if (themeDefault.color) {
            const c = resolveColor(themeDefault.color, tokenMapping);
            if (c) props['color'] = c;
          }
          // Fehlende Einzelfelder im Theme-Default mit statischen Defaults auffüllen
          if (!props['font-family']) props['font-family'] = wrapType('string', 'Inter');
          if (!props['font-size'])   props['font-size']   = wrapSize(widgetType === 'e-heading' ? '32px' : '16px');
          if (!props['color'])       props['color']       = wrapColor(widgetType === 'e-heading' ? '#111111' : '#444444');
        } else {
          // Statische Fallbacks — weder styleMap noch --theme-defaults verfügbar
          if (widgetType === 'e-heading') {
            props['font-family'] = wrapType('string', 'Inter');
            props['font-size']   = wrapSize('32px');
            props['font-weight'] = wrapType('string', '600');
            props['color']       = wrapColor('#111111');
          } else {
            props['font-family'] = wrapType('string', 'Inter');
            props['font-size']   = wrapSize('16px');
            props['line-height'] = wrapUnitless(1.6);
            props['color']       = wrapColor('#444444');
          }
        }
      }
    } else if (widgetType === 'e-button') {
      props['color'] = wrapColor('#ffffff');
    }
  }

  // P4-D: Layout-Map Pattern Application
  // Wenn eine Layout-Map geladen ist, werden Pattern-spezifische Anpassungen
  // basierend auf dem Section-Kontext vorgenommen.
  if (layoutMap && layoutMap.patterns) {
    const p = layoutMap.patterns;

    // Pill-Buttons: wenn die Section Pill-Buttons hat, border-radius forcieren
    if (p.has_pill_buttons && widgetType === 'e-button') {
      // Nur setzen wenn kein expliziter border-radius aus XML kommt
      if (!props['border-radius'] && !attrs.borderRadius && !attrs['border-radius']) {
        props['border-radius'] = wrapBorderRadius({ topLeft: 50, topRight: 50, bottomLeft: 50, bottomRight: 50, unit: 'px' });
        log(`Layout-Map: Pill-Button erkannt → border-radius: 50px`);
      }
    }

    // Absolute Header: wenn die Section position:absolute hat, position-hinweis
    // für den parent (wird im convertNode auf den Container angewendet)
    if (p.has_absolute_header && widgetType === 'e-flexbox') {
      const nodeName = (xmlNode?.attrs?.name || xmlNode?.attrs?.id || '').toLowerCase();
      const isHeader = /header|nav|top|nav|overlay/i.test(nodeName);
      // Bei Header/Overlay-Komponenten position:relative auf den Parent setzen
      // Wenn der Container kein explizites position-Attribut hat und kein Header ist,
      // prüfen wir ob die Kinder absolute positioniert sind
      if (!attrs.position && !isHeader && depth === 0) {
        // Für Top-Level Container: position:relative auf den Body-Container setzen
        // Der absolute Header wird dann korrekt überlagern
        log(`Layout-Map: absoluter Header erkannt — Parent-Container bekommt position:relative`);
      }
    }

    // Z-Index: wenn die Section z-index hat, forcieren wir das auf dem Container
    if (p.has_z_index && widgetType === 'e-flexbox') {
      const section = layoutMap.sections?.find(s => {
        const nodeName = (xmlNode?.attrs?.name || xmlNode?.attrs?.id || '').toLowerCase();
        return s.name?.toLowerCase().includes(nodeName) || nodeName.includes((s.name || '').toLowerCase().slice(0, 10));
      });
      if (section?.z_index && section.z_index > 0) {
        // Z-Index via Custom CSS setzen (nur wenn kein styleMap-Wert vorhanden)
        // Elementor V4 erwartet z-index im custom_css Format
        if (!props['z-index']) {
          props['z-index'] = { '$$type': 'string', value: String(section.z_index) };
          log(`Layout-Map: z-index:${section.z_index} aus Layout-Map übernommen`);
        }
      }
    }

    // Flex-Row: wenn die Section flex-row Layout hat, sicherstellen dass
    // flex-direction:row auch im V4-Tree gesetzt ist
    if (p.has_flex_row && widgetType === 'e-flexbox') {
      const section = layoutMap.sections?.find(s => s.layout === 'stack-row');
      if (section) {
        // flex-direction:row ist default, aber zur Sicherheit setzen wenn nicht explizit gesetzt
        if (!attrs.direction && !attrs.stackDirection && !props['flex-direction']) {
          props['flex-direction'] = { '$$type': 'flex-direction', value: 'row' };
          log(`Layout-Map: flex-row Pattern gesetzt`);
        }
      }
    }

    // Section Background Image: wenn die Section ein Background-Bild hat,
    // stellen wir sicher dass es nicht fälschlich als Color gesetzt wird
    if (p.has_section_background_image && widgetType === 'e-flexbox' && depth === 0) {
      const section = layoutMap.sections?.find(s => s.backgrounds?.has_image);
      if (section && attrs.backgroundImage && !attrs.backgroundColor && !attrs['background-color']) {
        log(`Layout-Map: Section Background Image Pattern erkannt — Background-Image auf Section-Ebene`);
      }
    }
  }

  return props;
}

const usedStyleIds  = new Map(); // base-id → count
const usedWidgetIds = new Map(); // base-id → count  (Bug 5 Fix)

function uniqueStyleId(name) {
  // SCHWAECHE 2 / P2-C: sanitizeStyleId als zusaetzlicher Guard gegen
  // Framer-Inputs die bereits mit hyphen/uppercase ankommen. generateStyleId
  // strippt Sonderzeichen, aber sanitizeStyleId normalisiert auch auf
  // [a-z][a-z0-9_]* — genau das Format das Elementor V4 verlangt (Invariant III).
  const base = sanitizeStyleId(name) || generateStyleId(name);
  const n    = (usedStyleIds.get(base) || 0) + 1;
  usedStyleIds.set(base, n);
  return n === 1 ? base : `${base}${n}`;
}

// Bug 5 Fix: unique widget IDs with counter
function uniqueWidgetId(raw) {
  const base = raw.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'node';
  const n    = (usedWidgetIds.get(base) || 0) + 1;
  usedWidgetIds.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

// Bug 3 Fix: detect pass-through containers (single child, no meaningful layout props set)
// RC-07 Fix: position, width, and height at 100% are Framer canvas defaults that
// don't fundamentally change layout. When a container has exactly 1 child and only
// these default props, flatten it to reduce DOM depth.
function isPassThroughContainer(xmlNode, widgetType) {
  if (widgetType !== 'e-flexbox') return false;
  // C1: e-component instances must NOT be flattened — they carry component identity
  const { attrs } = xmlNode;
  const meaningfulChildren = (xmlNode.children || []).filter(c => c.tagName && c.tagName !== '_root');
  // Only flatten if exactly one child (pure wrapper)
  if (meaningfulChildren.length !== 1) return false;

  // These props genuinely change layout and block pass-through
  const hasMeaningfulLayout = attrs.stackGap || attrs.padding || attrs.maxWidth
    || attrs.backgroundColor || attrs['background-color']
    || attrs.borderRadius || attrs['border-radius'];
  if (hasMeaningfulLayout) return false;

  // position, width, and height are Framer canvas defaults — only block
  // pass-through when they're explicitly non-default (non-absolute, non-100%)
  if (attrs.position && attrs.position !== 'absolute') return false;
  if (attrs.width && attrs.width !== '100%' && attrs.width !== '100vw') return false;
  if (attrs.height && attrs.height !== '100%' && attrs.height !== '100vh') return false;

  return true;
}

// Bug 3 Fix (improved): recursively unwrap a chain of pass-through containers.
// Returns an array of { node, depth } — either the original node or its
// eventually-meaningful descendant(s), skipping every pure wrapper in between.
function resolvePassThrough(xmlNode, depth) {
  const widgetType = determineWidgetType(xmlNode.attrs, xmlNode);
  if (!isPassThroughContainer(xmlNode, widgetType)) {
    return [{ node: xmlNode, depth }];
  }
  log(`[${'  '.repeat(depth)}] FLATTENED pass-through: ${xmlNode.attrs.name || 'unnamed'}`);
  const meaningful = (xmlNode.children || []).filter(c => c.tagName && c.tagName !== '_root');
  // Single child guaranteed by isPassThroughContainer — recurse into it
  return resolvePassThrough(meaningful[0], depth);
}

/**
 * Bug 8 Fix: Extrahiert Text aus Framer Component Instance-Attributen.
 *
 * Framer Components speichern Text in dynamisch benannten Attributen
 * (z.B. nUjzUoV6a="See how we work with you"). Diese Heuristik
 * scannt alle Attribute einer Component-Instanz nach dem besten
 * Text-Kandidaten (längster lesbarer String ohne System-Keywords).
 *
 * Filtert aus: System-Keys (componentId, variant, name, etc.),
 * Style-Referenzen (uppercase-camel), URLs, numerische Werte,
 * XML-Fragmente (RC-04 Fix).
 *
 * @param {object} attrs - XML-Node-Attribute
 * @returns {string|undefined} Bester Text-Kandidat oder undefined
 */
function extractComponentText(attrs) {
  if (!attrs.componentId && !attrs.variant) return undefined;

  let bestText = undefined;

  for (const [key, val] of Object.entries(attrs)) {
    // Skip known system/meta keys
    if (['componentId', 'variant', 'name', 'id', 'nodeId', 'tag', 'href',
          'target', 'layout', 'overflow', 'position', 'opacity'].includes(key)) continue;
    // Skip style-reference keys (uppercase-camel identifiers like `backgroundColor`)
    if (/^[A-Z]/.test(key)) continue;

    const str = String(val).trim();

    if (str.length < 3) continue;                // Too short
    if (str === 'true' || str === 'false') continue; // Boolean
    if (str.startsWith('http') || str.startsWith('/') || str.startsWith('#')) continue; // URL / style path / hash
    if (/^-?\d*\.?\d+$/.test(str)) continue;     // Numeric
    if (/^[a-zA-Z0-9_-]{8,15}$/.test(str) && !str.includes(' ')) continue; // Gen-ID pattern
    // RC-04 Fix: Skip XML/HTML fragments that were incorrectly extracted as text.
    // Framer's internal XML attributes (e.g. 'backgroundColor="..." overflow="clip" />')
    // end up here when the heuristic scans component attrs. Real text never contains
    // self-closing tags or attribute-style equals.
    if (str.includes('/>') || str.includes('</') || /^[a-zA-Z]+="[^"]*"(\s+[a-zA-Z]+="[^"]*")*\s*\/?>/.test(str) || /\w+="[^"]*"/.test(str)) continue;

    // Pick longest — component text attrs are typically the longest readable string
    if (!bestText || str.length > bestText.length) {
      bestText = str;
    }
  }

  return bestText;
}

/**
 * Konvertiert einen Framer XML-Node rekursiv in ein V4-Element.
 *
 * Dies ist die zentrale Konvertierungsfunktion der Pipeline. Sie:
 *   1. Extrahiert Text aus Component-Attributen (Bug 8)
 *   2. Bestimmt den V4-Widget-Type (determineWidgetType)
 *   3. Generiert eindeutige Widget-ID + Style-ID
 *   4. Baut Style-Props (buildStyleProps)
 *   5. Setzt Settings (tag, text, link, image, svg-icon, component-id)
 *   6. Erstellt Style-Varianten (desktop-Breakpoint)
 *   7. Rekursiert in Kinder (mit Bug-3 Pass-Through-Flattening)
 *
 * @param {object} xmlNode - XML-Node aus buildTree()
 * @param {object|null} tokenMapping - Token-Mapping (colors, fonts)
 * @param {object|null} fontResolution - Font-Resolution
 * @param {object|null} imageMap - Image-Map (URL → wp_media_id)
 * @param {number} [depth=0] - Rekursionstiefe
 * @param {object|null} [styleMap=null] - Style-Map aus getProjectXml() TextStyles/ColorStyles
 * @returns {object} V4-Element mit type, elType, widgetType, id, settings, styles, elements
 */
function convertNode(xmlNode, tokenMapping, fontResolution, imageMap, depth = 0, styleMap = null, themeDefaults = null) {
  const { attrs } = xmlNode;
  // Bug 1+8 Fix: resolve text from component attrs > explicit text attr > child text
  const compText = extractComponentText(attrs);
  const textContent = compText !== undefined
    ? compText
    : (attrs.text !== undefined ? attrs.text : (xmlNode._textContent || undefined));
  // Build enriched attrs with resolved text for type detection
  const enrichedAttrs = textContent !== undefined ? { ...attrs, text: textContent } : attrs;

  const name       = attrs.name || `node-${depth}`;
  const nodeId     = attrs.nodeId || attrs.id;
  const widgetType = determineWidgetType(enrichedAttrs, xmlNode);
  const styleId    = uniqueStyleId(name);

  // Bug 5 Fix: unique widget ID
  const rawId  = nodeId || name;
  const widgetId = uniqueWidgetId(rawId);

  log(`[${'  '.repeat(depth)}] ${name} → ${widgetType} (${styleId})`);

  // Build base props (pass xmlNode for grid detection in RC-09)
  // NOTE: buildStyleProps() is the richer version of v4-tree-builder's
  // mapFramerStyleToV4Props() — it adds Bug 3 (GC warnings), RC-08 (position),
  // RC-11 (text fallbacks), RC-09 (grid detection), and C2 grid support.
  const props = buildStyleProps(enrichedAttrs, widgetType, tokenMapping, fontResolution, imageMap, xmlNode, styleMap, widgetId, themeDefaults);

  // ── Settings ──
  const settings = {
    classes: wrapClasses([styleId]),
  };

  if (widgetType === 'e-flexbox') {
    // BLOCKADE 6 / P2-A: nav/main auf erlaubte Tags remappen
    settings.tag = sanitizeContainerTag(attrs.tag || (depth === 0 ? 'section' : 'div'), 'e-flexbox');
  }

  if (widgetType === 'e-div-block') {
    // BLOCKADE 6 / P2-A: nav/main auf erlaubte Tags remappen, span bleibt erlaubt hier
    settings.tag = sanitizeContainerTag(attrs.tag || 'div', 'e-div-block');
  }

  if (widgetType === 'e-button') {
    settings.tag = attrs.tag || (attrs.href ? 'a' : 'button');
    settings.text = wrapHtmlContent(textContent || name || '');
    if (attrs.href) settings.link = wrapLink(attrs.href, attrs.target === '_blank');
  }

  if (widgetType === 'e-heading') {
    settings.tag   = determineHtmlTag(enrichedAttrs);
    settings.title = wrapHtmlContent(textContent || '');
  }

  if (widgetType === 'e-paragraph') {
    // Prop-Name ist 'paragraph' (nicht 'editor') — EMCP Bug-Fix #56 bestaetigt
    settings.paragraph = wrapHtmlContent(textContent || '');
  }

  if (widgetType === 'e-image') {
    const imgSrc = resolveImageSrc(attrs.backgroundImage || attrs.src, imageMap);
    if (imgSrc) settings['image'] = wrapImage(imgSrc);
    else        settings['image'] = wrapImage(wrapImageSrc({ id: 0 }));
  }

  if (widgetType === 'e-svg') {
    // Serialize the SVG sub-tree back to markup for e-svg content
    settings['svg-icon'] = { '$$type': 'string', value: serializeSvgNode(xmlNode) };
    if (attrs.width)  settings.width  = wrapSize(attrs.width);
    if (attrs.height) settings.height = wrapSize(attrs.height);
  }

  // C1: e-component — store component reference + property overrides
  if (widgetType === 'e-component') {
    settings.tag = attrs.tag || 'div';
    settings['component-id'] = wrapType('string', attrs.componentId || attrs.componentName || '');
    // Store text overrides as component properties
    if (attrs.componentOverrides) {
      try {
        const overrides = typeof attrs.componentOverrides === 'string'
          ? JSON.parse(attrs.componentOverrides)
          : attrs.componentOverrides;
        for (const [key, val] of Object.entries(overrides)) {
          settings[`property-${key}`] = wrapType('string', String(val));
        }
      } catch { /* ignore parse errors */ }
    }
  }

  // ── Style variants (VERBOSE format: id/type/label required by elementor-set-content) ──
  // Uses shared buildStyleClass() from v4-tree-builder.js (UMBAUPLAN v2.0 Phase 1.4).
  // Phase 1 Bug Fix: base variant uses breakpoint:null per Elementor V4 convention.
  // The Elementor server treats null as the default/desktop base and expects named
  // breakpoints (tablet, mobile) only on override variants.
  const baseVariant = {
    meta:  { breakpoint: null, state: null },
    props: Object.keys(props).length > 0 ? props : {},
    custom_css: null,
  };

  const styles = {
    [styleId]: buildStyleClass({ id: styleId, label: 'local', variants: [baseVariant] }),
  };

  // ── Recurse into children ──
  // e-svg: SVG sub-tree already serialized to markup — no V4 children
  const rawChildren = widgetType === 'e-svg'
    ? []
    : (xmlNode.children || []).filter(c => c.tagName && c.tagName !== '_root');

  const v4Children = [];
  for (const child of rawChildren) {
    // Bug 3 Fix: recursively unwrap any chain of pass-through containers
    const resolved = resolvePassThrough(child, depth + 1);
    for (const r of resolved) {
      const converted = convertNode(r.node, tokenMapping, fontResolution, imageMap, r.depth, styleMap, themeDefaults);
      if (converted) v4Children.push(converted);
    }
  }

  // ── Determine elType (required by elementor-set-content) ──
  // Atomic containers (e-flexbox, e-div-block) are Elementor element types.
  // All other widgets (e-heading, e-paragraph, e-button, e-image, e-svg, e-component, e-divider)
  // use elType:"widget" + widgetType. Phase 1 Fix: e-component is treated as a widget,
  // not an element type, to match the Elementor 4.1.0-beta1 working-pages schema
  // (verified against 1953/1859/1950 — no e-component instances there, but Elementor's
  // e-component server-renderer expects elType:"widget" + widgetType:"e-component").
  const ATOMIC_ELEMENT_TYPES = new Set(['e-flexbox', 'e-div-block']);
  const elType = ATOMIC_ELEMENT_TYPES.has(widgetType) ? widgetType : 'widget';

  // RC-01 Fix: type field required by server-side batch-build-page.php
  // Without 'type', the server falls back to 'container' for ALL widgets
  // Also: elementor-set-content uses elType+widgetType, batch-build-page uses type
  // Adding 'type' makes the output compatible with BOTH abilities (RC-03 Fix)
  const node = { type: widgetType, elType, widgetType, id: widgetId, settings, styles };
  if (v4Children.length > 0) node.elements = v4Children;

  return node;
}

// ─────────────────────────────────────────────
// C6: TOKEN-TO-GV SUBSTITUTION PASS  (Root-Cause Fix)
// ─────────────────────────────────────────────

function findGvIdForHex(hex, tokenMapping) {
  if (!hex || !tokenMapping) return null;
  const normHex = hex.replace('#', '').toLowerCase();
  for (const [name, data] of Object.entries(tokenMapping.colors || {})) {
    const dataHex = (data.hex || '').replace('#', '').toLowerCase();
    if (dataHex === normHex && data.gv_id) return data.gv_id;
  }
  return null;
}

function findGvIdForFont(family, tokenMapping) {
  if (!family || !tokenMapping) return null;
  const normFamily = family.replace(/['"]/g, '').toLowerCase().trim();
  for (const [name, data] of Object.entries(tokenMapping.fonts || {})) {
    const dataFamily = (data.family || '').replace(/['"]/g, '').toLowerCase().trim();
    if (dataFamily === normFamily && data.gv_id) return data.gv_id;
  }
  return null;
}

/**
 * C6: Substituiert Hardcoded-Hex/Fonts mit e-gv-XXXXXXXX Referenzen.
 *
 * Läuft NACH convertNode() über den gesamten V4-Tree und ersetzt
 * alle $$type:"color"-Hex-Werte und $$type:"string"-Font-Namen
 * durch GV-Referenzen aus token-mapping.json.
 *
 * Root-Cause Fix: Statt Hex-Werte im Nachhinein zu patchen, werden
 * sie direkt durch die entsprechenden Global-Variable-IDs ersetzt.
 *
 * @param {object|Array} tree - V4-Tree (einzelner Node oder Array)
 * @param {object|null} tokenMapping - Token-Mapping mit gv_ids
 * @returns {{ tree: object|Array, substitutions: number }}
 */
function substituteTokensWithGvIds(tree, tokenMapping) {
  if (!tokenMapping) return { tree, substitutions: 0 };
  let substitutions = 0;

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;

    if (node.styles) {
      for (const [styleId, styleDef] of Object.entries(node.styles)) {
        for (const variant of (styleDef.variants || [])) {
          if (!variant.props) continue;
          for (const [prop, value] of Object.entries(variant.props)) {
            if (!value || typeof value !== 'object') continue;

            // Color → GV
            if (value['$$type'] === 'color') {
              const hex = typeof value.value === 'string' ? value.value : null;
              if (!hex || !hex.startsWith('#')) continue;
              const gvId = findGvIdForHex(hex, tokenMapping);
              if (gvId) {
                variant.props[prop] = wrapGvColor(gvId);
                substitutions++;
              }
            }

            // Font → GV
            if (prop === 'font-family' && value['$$type'] === 'string') {
              const family = value.value;
              if (!family) continue;
              const gvId = findGvIdForFont(family, tokenMapping);
              if (gvId) {
                variant.props[prop] = wrapGvFont(gvId);
                substitutions++;
              }
            }
          }
        }
      }
    }

    const children = node.elements || [];
    for (const child of children) walkNode(child);
  }

  const roots = Array.isArray(tree) ? tree : [tree];
  for (const root of roots) walkNode(root);

  return { tree, substitutions };
}

// ─────────────────────────────────────────────
// RC-13: TOKEN USAGE ANALYZER
// ─────────────────────────────────────────────

/**
 * RC-13: Analysiert den V4-Tree auf Hardcoded-Token-Nutzung.
 *
 * Erstellt einen detaillierten Report über:
 *   - Hardcoded Colors (Hex-Werte ohne GV-Referenz)
 *   - Hardcoded Fonts (Families ohne GV-Referenz)
 *   - Hardcoded Sizes (px-Werte die Token-Kandidaten sind)
 *
 * Generiert priorisierte Suggestions (high/medium) zur Token-Erstellung.
 *
 * @param {object|Array} treeNodes - V4-Tree
 * @returns {object} Token-Usage-Report mit summary, suggestions, hardcoded_*
 */
function analyzeTokenUsage(treeNodes) {
  const report = {
    hardcoded_colors: new Map(),
    hardcoded_fonts: new Map(),
    hardcoded_sizes: new Map(),
    total_elements: 0,
    total_hardcoded: 0,
    suggestions: [],
  };

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    // Only count actual element nodes (have widgetType or elType)
    if (node.widgetType || node.elType) {
      report.total_elements++;
    }

    const styles = node.styles || {};
    for (const [styleId, styleDef] of Object.entries(styles)) {
      const variants = styleDef.variants || [];
      for (const variant of variants) {
        const props = variant.props || {};
        for (const [prop, value] of Object.entries(props)) {
          if (!value || typeof value !== 'object') continue;

          // Detect hardcoded colors
          if (value['$$type'] === 'color') {
            const hex = (value.value?.hex || value.value || '').toString();
            if (hex && !hex.startsWith('e-gv-') && !hex.startsWith('var(')) {
              const key = hex.slice(0, 7);
              if (!report.hardcoded_colors.has(key)) {
                report.hardcoded_colors.set(key, { value: hex, count: 0, elements: [], prop });
              }
              const entry = report.hardcoded_colors.get(key);
              entry.count++;
              if (entry.elements.length < 5) entry.elements.push(node.id || node.widgetType || '?');
              report.total_hardcoded++;
            }
          }

          // Detect hardcoded font-families
          if (prop === 'font-family') {
            if (value['$$type'] === 'string') {
              const family = (value.value || '').toString();
              if (family && !family.startsWith('e-gv-') && !family.startsWith('var(')) {
                if (!report.hardcoded_fonts.has(family)) {
                  report.hardcoded_fonts.set(family, { value: family, count: 0, elements: [] });
                }
                const entry = report.hardcoded_fonts.get(family);
                entry.count++;
                if (entry.elements.length < 5) entry.elements.push(node.id || node.widgetType || '?');
                report.total_hardcoded++;
              }
            } else if (value['$$type'] === 'gv-font') {
              // GV font reference — already using design tokens, good!
            }
          }

          // Detect hardcoded sizes (px values that could be tokens)
          if (prop === 'font-size' || prop === 'width' || prop === 'height' || prop === 'gap' || prop === 'padding') {
            if (value['$$type'] === 'size') {
              const sizeVal = (value.value?.size || value.value || '').toString();
              const pxMatch = sizeVal.match(/^(\d+)px$/);
              if (pxMatch) {
                const px = parseInt(pxMatch[1], 10);
                if (px >= 16 && px % 4 === 0) {
                  const key = `${prop}:${sizeVal}`;
                  if (!report.hardcoded_sizes.has(key)) {
                    report.hardcoded_sizes.set(key, { prop, value: sizeVal, count: 0 });
                  }
                  report.hardcoded_sizes.get(key).count++;
                }
              }
            }
          }
        }
      }
    }

    const children = node.elements || [];
    for (const child of children) walk(child);
  }

  const roots = Array.isArray(treeNodes) ? treeNodes : [treeNodes];
  for (const root of roots) walk(root);

  // Generate suggestions
  const colorEntries = [...report.hardcoded_colors.entries()]
    .sort((a, b) => b[1].count - a[1].count);
  const fontEntries = [...report.hardcoded_fonts.entries()]
    .sort((a, b) => b[1].count - a[1].count);

  for (const [hex, data] of colorEntries) {
    if (data.count >= 2) {
      report.suggestions.push({
        type: 'color',
        severity: data.count >= 3 ? 'high' : 'medium',
        value: data.value,
        occurrences: data.count,
        action: `Erstelle e-gv-color Variable für ${data.value} (${data.count}x verwendet). Ersetze alle Hardcodes mit var(--gv-<id>).`,
      });
    }
  }

  for (const [family, data] of fontEntries) {
    if (data.count >= 2) {
      report.suggestions.push({
        type: 'font',
        severity: data.count >= 3 ? 'high' : 'medium',
        value: family,
        occurrences: data.count,
        action: `Erstelle e-gv-font Variable für "${family}" (${data.count}x verwendet).`,
      });
    }
  }

  // Summary
  report.summary = {
    unique_colors: report.hardcoded_colors.size,
    unique_fonts: report.hardcoded_fonts.size,
    unique_sizes: report.hardcoded_sizes.size,
    total_hardcoded_values: report.total_hardcoded,
    high_severity_suggestions: report.suggestions.filter(s => s.severity === 'high').length,
    medium_severity_suggestions: report.suggestions.filter(s => s.severity === 'medium').length,
  };

  return report;
}

// ─────────────────────────────────────────────
// LOAD INPUTS
// ─────────────────────────────────────────────

// XML
let xmlContent;
if (args['xml-string']) {
  xmlContent = args['xml-string'];
} else {
  if (!fs.existsSync(args.xml)) {
    process.stderr.write(`Error: XML nicht gefunden: ${args.xml}\n`); process.exit(2);
  }
  xmlContent = fs.readFileSync(args.xml, 'utf8');
}

// Token mapping
let tokenMapping = null;
if (args.tokens) {
  if (!fs.existsSync(args.tokens)) {
    warn(`token-mapping.json nicht gefunden: ${args.tokens}. Tokens werden nicht aufgelöst.`);
  } else {
    tokenMapping = JSON.parse(fs.readFileSync(args.tokens, 'utf8'));
    log(`Token mapping loaded: ${Object.keys(tokenMapping.colors || {}).length} colors, ${Object.keys(tokenMapping.fonts || {}).length} fonts`);
  }
}

// Font resolution
let fontResolution = null;
if (args.fonts) {
  if (!fs.existsSync(args.fonts)) {
    warn(`font-resolution.json nicht gefunden: ${args.fonts}.`);
  } else {
    fontResolution = JSON.parse(fs.readFileSync(args.fonts, 'utf8'));
    log(`Font resolution loaded: ${(fontResolution.fonts || []).length} fonts`);
  }
}

// Image map (optional)
let imageMap = null;
if (args['image-map']) {
  if (fs.existsSync(args['image-map'])) {
    imageMap = JSON.parse(fs.readFileSync(args['image-map'], 'utf8'));
    log(`Image map loaded: ${Object.keys(imageMap.images || {}).length} images`);
  }
}

// Style map (optional) — aus getProjectXml() extrahierte TextStyles/ColorStyles.
// Format: { textStyles: { "/Headings/80": { fontSize, fontWeight, fontFamily, lineHeight, letterSpacing, color } }, colorStyles: { "/Neutrals/950": "#010004" } }
// Wird in buildStyleProps() verwendet um inlineTextStyle-Referenzen aufzulösen.
let styleMap = null;
if (args['style-map']) {
  if (fs.existsSync(args['style-map'])) {
    styleMap = JSON.parse(fs.readFileSync(args['style-map'], 'utf8'));
    const tsCount = Object.keys(styleMap.textStyles || {}).length;
    const csCount = Object.keys(styleMap.colorStyles || {}).length;
    log(`Style map loaded: ${tsCount} text styles, ${csCount} color styles`);
  } else {
    warn(`style-map nicht gefunden: ${args['style-map']}`);
  }
}

// Fix #11: CSS-Fallback wenn style-map leer ist und --framer-url / --framer-html gesetzt
// Wenn Unframer-MCP keine Styles liefert, wird die publizierte Framer-Seite gecrawlt.
const styleMapIsEmpty = !styleMap ||
  (Object.keys(styleMap.textStyles || {}).length === 0 &&
   Object.keys(styleMap.colorStyles || {}).length === 0);

if (styleMapIsEmpty && (args['framer-url'] || args['framer-html'])) {
  const fallbackSrc = args['framer-html'] ? `--html ${args['framer-html']}` : `--url ${args['framer-url']}`;
  const tmpStyleMap = path.join(os.tmpdir(), `style-map-fallback-${Date.now()}.json`);
  warn(`style-map leer/fehlend → CSS-Fallback via ${args['framer-html'] ? 'HTML' : 'URL'}`);

  const fallbackResult = spawnSync(
    process.execPath,
    [
      path.join(__dirname, 'css-fallback-extractor.js'),
      ...(args['framer-html'] ? ['--html', args['framer-html']] : ['--url', args['framer-url']]),
      '--style-map-output', tmpStyleMap,
      '--output-dir', os.tmpdir(),
      ...(args.verbose ? ['--verbose'] : []),
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );

  if (fallbackResult.status === 0 && fs.existsSync(tmpStyleMap)) {
    styleMap = JSON.parse(fs.readFileSync(tmpStyleMap, 'utf8'));
    const tsCount = Object.keys(styleMap.textStyles || {}).length;
    const csCount = Object.keys(styleMap.colorStyles || {}).length;
    process.stderr.write(`✓ CSS-Fallback: ${tsCount} TextStyles, ${csCount} Colors geladen.\n`);
    try { fs.unlinkSync(tmpStyleMap); } catch { /* ignore cleanup error */ }
  } else {
    warn('CSS-Fallback fehlgeschlagen — RC-11 statische Fallbacks werden genutzt.');
  }
}

// P4-D: Token-Fallback via Live-URL
// Wenn tokenMapping leer ist und --framer-url verfügbar, rufe
// design-token-extractor.js mit --url auf um CSS-Variablen live zu extrahieren.
const tokenMappingIsEmpty = !tokenMapping ||
  Object.keys(tokenMapping.colors || {}).length === 0;

if (tokenMappingIsEmpty && (args['framer-url'] || args.url)) {
  const liveUrl = args['framer-url'] || args.url;
  warn(`Token-Mapping leer → Live-Extraktion via ${liveUrl}`);

  const tmpTokenPath = path.join(os.tmpdir(), `token-mapping-live-${Date.now()}.json`);
  const extractorArgs = [
    path.join(__dirname, 'design-token-extractor.js'),
    '--url', liveUrl,
    '--output', tmpTokenPath,
    ...(args.verbose ? ['--verbose'] : []),
  ];

  const tokenResult = spawnSync(process.execPath, extractorArgs, {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  if (tokenResult.status === 0 && fs.existsSync(tmpTokenPath)) {
    try {
      tokenMapping = JSON.parse(fs.readFileSync(tmpTokenPath, 'utf8'));
      const colorCount = Object.keys(tokenMapping.colors || {}).length;
      const fontCount = Object.keys(tokenMapping.fonts || {}).length;
      process.stderr.write(`✓ Live-Token-Extraktion: ${colorCount} Farben, ${fontCount} Fonts geladen.\n`);
    } catch (e) {
      warn(`Live-Token-Extraktion Output konnte nicht gelesen werden: ${e.message}`);
    }
    try { fs.unlinkSync(tmpTokenPath); } catch { /* ignore cleanup error */ }
  } else {
    warn('Live-Token-Extraktion fehlgeschlagen — ohne Token-Mapping fortgesetzt.');
  }
}

// Sprint 20 (Punkt #7): Optionale WP-Theme-Defaults laden.
// Greift NUR, wenn weder styleMap noch CSS-Fallback einen passenden Wert
// liefern (letzter Fallback-Schritt in der RC-11-Kette, siehe buildStyleProps).
let themeDefaults = null;
if (args['theme-defaults']) {
  if (fs.existsSync(args['theme-defaults'])) {
    try {
      themeDefaults = JSON.parse(fs.readFileSync(args['theme-defaults'], 'utf8'));
      log(`Theme-Defaults geladen: ${Object.keys(themeDefaults).join(', ')}`);
    } catch (e) {
      warn(`--theme-defaults konnte nicht gelesen werden: ${e.message}`);
    }
  } else {
    warn(`--theme-defaults Datei nicht gefunden: ${args['theme-defaults']}`);
  }
}

// P4-D: Layout-Map laden (von analyze-framer-layout.js generiert)
// Enthält Sections mit position, layout, z_index, backgrounds, has_pill_buttons.
// Wird in der Konvertierung genutzt um Pattern-spezifische Mapping-Entscheidungen zu treffen.
let layoutMap = null;
if (args['layout-map']) {
  if (fs.existsSync(args['layout-map'])) {
    try {
      layoutMap = JSON.parse(fs.readFileSync(args['layout-map'], 'utf8'));
      const sectionCount = layoutMap.sections?.length || 0;
      log(`Layout-Map geladen: ${sectionCount} Sections, Patterns: ${Object.keys(layoutMap.patterns || {}).filter(k => layoutMap.patterns[k]).join(', ') || 'none'}`);
    } catch (e) {
      warn(`Layout-Map konnte nicht gelesen werden: ${e.message}`);
    }
  } else {
    warn(`Layout-Map nicht gefunden: ${args['layout-map']} — wird ohne Pattern-Erkennung fortgesetzt`);
  }
}

// ─────────────────────────────────────────────
// CONVERT
// ─────────────────────────────────────────────

let xmlRoots;
try {
  const tokens = tokenizeXml(xmlContent);
  xmlRoots     = buildTree(tokens);
} catch (e) {
  process.stderr.write(`Error: XML parse fehlgeschlagen: ${e.message}\n`); process.exit(2);
}

if (xmlRoots.length === 0) {
  process.stderr.write('Error: Keine Nodes im XML gefunden.\n'); process.exit(2);
}

log(`XML nodes parsed: ${xmlRoots.length} root node(s)`);

// Convert each root node
const v4Tree = xmlRoots
  .filter(n => n.tagName && n.tagName !== '_root')
  .map(n => convertNode(n, tokenMapping, fontResolution, imageMap, 0, styleMap, themeDefaults));

// C6: Token-to-GV Substitution Pass (Root-Cause Fix)
// Replaces hardcoded hex values with e-gv-XXXXXXXX references
// from token-mapping.json. Runs AFTER conversion to catch all
// hardcoded colors/fonts that were written by convertNode().
if (tokenMapping) {
  let totalSubstitutions = 0;
  for (const root of v4Tree) {
    const result = substituteTokensWithGvIds(root, tokenMapping);
    totalSubstitutions += result.substitutions;
  }
  if (totalSubstitutions > 0) {
    log(`C6 GV-Substitution: ${totalSubstitutions} hardcoded values → e-gv-* references`);
  }
}

// ─────────────────────────────────────────────
// OUTPUT
// ─────────────────────────────────────────────

// Single root or array
const result = v4Tree.length === 1 ? v4Tree[0] : v4Tree;
const output = JSON.stringify(result, null, 2);

// Determine output path — use temp file when validating without --output
const outputPath = args.output || (args.validate ? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'v4tree-')), 'tree.json') : null);

if (outputPath) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
  if (args.output) process.stderr.write(`Saved to ${outputPath}\n`);
}

// Fix #1 (repair) + Sprint 20 (generalisiert): GC-Kandidaten als Begleitdatei
// schreiben (--prefer-gc Modus). generate-global-classes.js liest diese via
// --gc-candidates um Werte zu erkennen, die bewusst NICHT als lokaler Style
// im Tree stehen. Schema ist generisch nach Kategorie gruppiert (nicht mehr
// hartkodiert auf 'background'), siehe CONVENTIONS.md Abschnitt 3.
if (preferGcForBackground && pendingGcCandidates.length > 0 && outputPath) {
  const candidatesPath = outputPath.replace(/\.json$/, '') + '.gc-candidates.json';
  const byCategory = {};
  for (const c of pendingGcCandidates) {
    const cat = c.category || 'background'; // Fallback für ältere Aufrufer
    (byCategory[cat] ||= []).push(c);
  }
  fs.writeFileSync(candidatesPath, JSON.stringify(byCategory, null, 2), 'utf8');
  process.stderr.write(`✓ ${pendingGcCandidates.length} GC-Kandidat(en) (${Object.keys(byCategory).join(', ')}) → ${candidatesPath}\n`);
  process.stderr.write(`  Nutze: generate-global-classes.js --tree ${args.output || outputPath} --gc-candidates ${candidatesPath}\n`);
}

// --validate: run validate-v4-tree.js on the output
let validationPassed = true;
if (args.validate && outputPath) {
  const validatorScript = path.join(__dirname, 'validate-v4-tree.js');
  process.stderr.write(`Validating ${outputPath} …\n`);
  const val = spawnSync('node', [validatorScript, outputPath], { stdio: 'pipe', encoding: 'utf8' });
  if (val.stderr) process.stderr.write(val.stderr);
  if (val.stdout) {
    try {
      const result = JSON.parse(val.stdout);
      const icon = result.passed ? '✅' : '❌';
      process.stderr.write(`${icon} Score: ${result.score}% | ${result.stats.totalErrors} errors, ${result.stats.totalWarnings} warnings\n`);
      if (!result.passed) validationPassed = false;
    } catch {
      process.stderr.write(val.stdout.slice(0, 500) + '\n');
      validationPassed = false;
    }
  }
  if (val.status !== 0) validationPassed = false;
}

// Print to stdout when no --output
if (!args.output) {
  process.stdout.write(output + '\n');
}

// ─────────────────────────────────────────────
// RC-13: TOKENS REPORT
// ─────────────────────────────────────────────

let tokensReport = null;
if (args['tokens-report'] && v4Tree.length > 0) {
  tokensReport = analyzeTokenUsage(v4Tree);
  const tokensReportPath = path.join(path.dirname(outputPath || '.'), 'tokens-report.json');
  try {
    const reportOutput = {
      generated_at: new Date().toISOString(),
      source: args.xml || 'inline',
      summary: tokensReport.summary,
      hardcoded_colors: Object.fromEntries(tokensReport.hardcoded_colors),
      hardcoded_fonts: Object.fromEntries(tokensReport.hardcoded_fonts),
      suggestions: tokensReport.suggestions,
    };
    fs.writeFileSync(tokensReportPath, JSON.stringify(reportOutput, null, 2), 'utf8');
    process.stderr.write(`\n📊 Tokens Report → ${path.relative(process.cwd(), tokensReportPath)}\n`);
    process.stderr.write(`   ${tokensReport.summary.unique_colors} unique hardcoded colors, ${tokensReport.summary.unique_fonts} fonts, ${tokensReport.summary.total_hardcoded_values} total\n`);
    if (tokensReport.suggestions.length > 0) {
      process.stderr.write(`   🔔 ${tokensReport.suggestions.length} token suggestions (${tokensReport.summary.high_severity_suggestions} high-priority)\n`);
      for (const s of tokensReport.suggestions.filter(s => s.severity === 'high').slice(0, 3)) {
        process.stderr.write(`     • ${s.type}: ${s.value.slice(0,40)} (${s.occurrences}x)\n`);
      }
    }
  } catch (e) {
    process.stderr.write(`⚠ Tokens report write failed: ${e.message}\n`);
  }
}

// ─────────────────────────────────────────────
// RC-12: GLOBAL CLASSES INTEGRATION
// ─────────────────────────────────────────────

if (args.gc && outputPath) {
  const gcScript = path.join(__dirname, 'generate-global-classes.js');
  const gcOutput = args['gc-output'] || path.join(path.dirname(outputPath), 'global-class-plan.json');
  const minDups = args['gc-min-dups'] || '2';

  if (!fs.existsSync(gcScript)) {
    process.stderr.write('⚠ generate-global-classes.js not found — skipping GC analysis.\n');
  } else {
    process.stderr.write(`\n🔍 Running Global Classes analysis (min-dups=${minDups})…\n`);
    try {
      const gcResult = spawnSync('node', [gcScript, '--tree', outputPath, '--min-dups', minDups, '--output', gcOutput], {
        stdio: 'pipe', encoding: 'utf8', timeout: 30000,
      });
      if (gcResult.stderr) {
        const gcStderr = gcResult.stderr.toString();
        const summaryMatch = gcStderr.match(/\[gen-gc\] (\d+) GC-Vorschläge/);
        if (summaryMatch) {
          process.stderr.write(`✅ GC Analysis: ${summaryMatch[1]} Global Class suggestions\n`);
          process.stderr.write(`   Plan → ${path.relative(process.cwd(), gcOutput)}\n`);
        } else {
          const noDupMatch = gcStderr.match(/Keine Duplikate gefunden/);
          if (noDupMatch) {
            process.stderr.write('ℹ️  No duplicate styles found — all styles are unique. GCs not needed.\n');
          } else {
            process.stderr.write(gcStderr.slice(0, 500) + '\n');
          }
        }
      }
    } catch (e) {
      process.stderr.write(`⚠ GC analysis failed: ${e.message}\n`);
    }
  }
}

// Cleanup temp dir
if (!args.output && outputPath) {
  try { fs.rmSync(path.dirname(outputPath), { recursive: true, force: true }); } catch { /* ignore */ }
}

process.stderr.write(`✓ ${usedStyleIds.size} V4 nodes converted, ${warnings.length} warnings\n`);
if (warnings.length > 0 && args.verbose) {
  warnings.forEach(w => process.stderr.write(`  ⚠ ${w}\n`));
}

process.exit(warnings.length > 0 || !validationPassed ? 1 : 0);
