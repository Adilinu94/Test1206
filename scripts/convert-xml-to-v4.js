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
  normalizeHex, resolveCssVar, generateStyleId,
  wrapSize, wrapUnitless, wrapDimensions, wrapBorderRadius, wrapGvColor, wrapGvFont,
  wrapColor, wrapType, wrapImageSrc, isDimensionValue, wrapImage, wrapHtmlContent, wrapBackground,
} from './lib/framer-utils.js';

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
    output:         { type: 'string' },
    'output-dir':   { type: 'string' },   // Phase 4: separate output files
    'component-cache': { type: 'string' }, // Phase 4: component cache JSON
    validate:       { type: 'boolean', default: false },
    verbose:        { type: 'boolean', default: false },
    'gc':           { type: 'boolean', default: false },
    'gc-output':    { type: 'string' },
    'gc-min-dups':  { type: 'string', default: '2' },
    'tokens-report': { type: 'boolean', default: false },
  },
  strict: false,
});

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
// PHASE 4: TOKEN-MAP STYLE PATH RESOLUTION
// ─────────────────────────────────────────────

/**
 * Löst einen Framer-Style-Pfad (z.B. "/Heading/Heading 1") gegen
 * tokenMapping.textStyles oder tokenMapping.colors auf.
 *
 * @param {string} stylePath - Framer-Style-Pfad (z.B. "/Heading/Heading 1")
 * @param {object|null} tokenMapping - Token-Mapping mit textStyles + colors
 * @returns {object|null} Aufgelöste Style-Properties oder null
 */
function resolveStylePathFromTokenMap(stylePath, tokenMapping) {
  if (!stylePath || !tokenMapping) return null;

  // Prüfe ob es ein Style-Pfad ist (beginnt mit "/")
  const path = String(stylePath).trim();
  if (!path.startsWith('/')) return null;

  // Suche in textStyles
  if (tokenMapping.textStyles?.[path]) {
    return { source: 'textStyles', data: tokenMapping.textStyles[path], path };
  }
  // Suche in colors
  if (tokenMapping.colors?.[path]) {
    return { source: 'colors', data: tokenMapping.colors[path], path };
  }

  // Versuche Normalisierung (z.B. "/Heading / Heading 1" → "/Heading/Heading 1")
  const normalized = path.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');
  if (tokenMapping.textStyles?.[normalized]) {
    return { source: 'textStyles', data: tokenMapping.textStyles[normalized], path: normalized };
  }
  if (tokenMapping.colors?.[normalized]) {
    return { source: 'colors', data: tokenMapping.colors[normalized], path: normalized };
  }

  return null;
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
  // Bug 6 Fix: line-height immer mit unit:'custom', nie 'px'
  if (/^-?[\d.]+$/.test(raw)) return wrapUnitless(raw);
  if (/^-?[\d.]+%$/.test(raw)) return wrapUnitless(parseFloat(raw) / 100);
  // px-Werte: Groesse uebernehmen, aber unit:'custom' (keine px unit)
  const pxMatch = raw.match(/^(-?[\d.]+)px$/);
  if (pxMatch) return wrapUnitless(parseFloat(pxMatch[1]));
  // Fallback: unbekanntes Format — warnen
  warn(`resolveLineHeight: unbekanntes Format '${raw}' — parseFloat als custom verwendet.`);
  return { '$$type': 'size', value: { size: parseFloat(raw) || 0, unit: 'custom' } };
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

// RC-11 (UMBAUPLAN §1.3): Style-Pfad-Fallback-Tabelle.
// Wenn `inlineTextStyle="/Heading/Heading 1"` nicht in der token-mapping.json
// aufgeloest werden kann, wird der letzte Pfad-Segment ("Heading 1") hier
// nachgeschlagen. Lookup erfolgt lowercased, damit "Heading 1" === "heading 1".
const TEXT_STYLE_FALLBACKS_BY_NAME = {
  'heading 1':        { size: '68px', weight: '700', color: '#111111' },
  'heading 2':        { size: '48px', weight: '600', color: '#111111' },
  'heading 3':        { size: '32px', weight: '600', color: '#111111' },
  'heading 4':        { size: '24px', weight: '600', color: '#111111' },
  'heading 5':        { size: '20px', weight: '600', color: '#111111' },
  'heading 6':        { size: '16px', weight: '600', color: '#111111' },
  'body':             { size: '16px', weight: '400', color: '#444444' },
  'body-20px-medium': { size: '20px', weight: '500', color: '#222222' },
  'body-16px-medium': { size: '16px', weight: '500', color: '#222222' },
  'body s':           { size: '14px', weight: '400', color: '#666666' },
  'body xs':          { size: '12px', weight: '400', color: '#666666' },
  'caption':          { size: '12px', weight: '400', color: '#888888' },
};

/**
 * Baut das V4-Style-Props-Objekt aus Framer-Attributen.
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
function buildStyleProps(attrs, widgetType, tokenMapping, fontResolution, imageMap, xmlNode = null) {
  const props  = {};
  const { stackDirection, stackGap, padding, maxWidth, width, height,
          backgroundColor, 'background-color': bgColor,
          borderRadius, 'border-radius': borderRadiusAlt,
          position, top, right, bottom, left,
          color, 'font-family': fontFamily, 'font-size': fontSize,
          'font-weight': fontWeight, 'line-height': lineHeight,
          'letter-spacing': letterSpacing, opacity,
          inlineTextStyle } = attrs;  // Bug 8 Fix: inlineTextStyle gelesen

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
      // Phase 4: backgroundColor als Style-Pfad via Token-Map auflösen
      let resolved;
      if (String(bgVal).startsWith('/')) {
        const styleResolved = resolveStylePathFromTokenMap(bgVal, tokenMapping);
        if (styleResolved?.source === 'colors' && styleResolved.data.hex) {
          resolved = resolveColor(styleResolved.data.hex, tokenMapping);
          log(`  Resolved backgroundColor='${bgVal}' → ${styleResolved.data.hex}`);
        } else {
          warn(`backgroundColor='${bgVal}' ist Style-Pfad aber nicht in tokenMapping.colors gefunden.`);
        }
      }
      if (!resolved) resolved = resolveColor(bgVal, tokenMapping);
      if (resolved) {
        // Bug 3 Fix: background als Objekt-Format emittieren (nicht skippen)
        props['background'] = wrapBackground(resolved);
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
      // Phase 4: backgroundColor als Style-Pfad via Token-Map auflösen
      let resolved;
      if (String(bgVal).startsWith('/')) {
        const styleResolved = resolveStylePathFromTokenMap(bgVal, tokenMapping);
        if (styleResolved?.source === 'colors' && styleResolved.data.hex) {
          resolved = resolveColor(styleResolved.data.hex, tokenMapping);
          log(`  Resolved backgroundColor='${bgVal}' → ${styleResolved.data.hex}`);
        } else {
          warn(`backgroundColor='${bgVal}' ist Style-Pfad aber nicht in tokenMapping.colors gefunden.`);
        }
      }
      if (!resolved) resolved = resolveColor(bgVal, tokenMapping);
      if (resolved) {
        // Bug 3 Fix: background als Objekt-Format emittieren (nicht skippen)
        props['background'] = wrapBackground(resolved);
      }
    }
  }

  // ── Typography (heading / text) ──
  if (widgetType === 'e-heading' || widgetType === 'e-paragraph') {
    // Phase 4: inlineTextStyle via Token-Map auflösen
    let textStyleProps = null;
    if (inlineTextStyle) {
      const resolved = resolveStylePathFromTokenMap(inlineTextStyle, tokenMapping);
      if (resolved?.source === 'textStyles') {
        const td = resolved.data;
        textStyleProps = td;
        log(`  Resolved inlineTextStyle='${inlineTextStyle}' → size:${td.size} weight:${td.weight} color:${td.color}`);
      } else {
        warn(`inlineTextStyle='${inlineTextStyle}' nicht in tokenMapping.textStyles gefunden.`);
      }
    }

    // Token-Map Werte haben Vorrang vor XML-Attributen
    if (textStyleProps?.size)   props['font-size']   = wrapSize(textStyleProps.size);
    else if (fontSize)           props['font-size']   = wrapSize(fontSize);

    if (textStyleProps?.weight) props['font-weight'] = wrapType('string', textStyleProps.weight);
    else if (fontWeight)         props['font-weight'] = wrapType('string', fontWeight);

    if (textStyleProps?.lineHeight) props['line-height'] = resolveLineHeight(textStyleProps.lineHeight);
    else if (lineHeight)             props['line-height'] = resolveLineHeight(lineHeight);

    if (letterSpacing) props['letter-spacing'] = wrapSize(letterSpacing);

    if (textStyleProps?.fontFamily) {
      const resolved = resolveFont(textStyleProps.fontFamily, tokenMapping, fontResolution);
      if (resolved) props['font-family'] = resolved;
    } else if (fontFamily) {
      const resolved = resolveFont(fontFamily.split(',')[0].trim().replace(/['"]/g,''), tokenMapping, fontResolution);
      if (resolved) props['font-family'] = resolved;
    }

    if (textStyleProps?.color) {
      const resolved = resolveColor(textStyleProps.color, tokenMapping);
      if (resolved) props['color'] = resolved;
    } else if (color) {
      const resolved = resolveColor(color, tokenMapping);
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
  // Widgets with {} props render with browser defaults (Times New Roman, no sizing).
  // Set sane fallbacks that match typical Framer designs.
  // Bug 8/RC-11 Fix: Wenn inlineTextStyle gesetzt ist, KEINE Generic-Fallbacks —
  // die Style-Referenz wird in Phase 2 (Dual-Source) aufgeloest.
  // NEU: Style-Pfad-Fallback (UMBAUPLAN §1.3). Wenn der Style-Pfad NICHT in der
  // token-mapping.json aufgeloest werden konnte, leiten wir eine sinnvolle
  // Default-Groesse aus dem Pfad-Namen ab ("Heading 1" → 68px etc.).
  if (Object.keys(props).length === 0) {
    if (inlineTextStyle) {
      const fallback = TEXT_STYLE_FALLBACKS_BY_NAME[inlineTextStyle.split('/').pop().toLowerCase()];
      if (fallback) {
        warn(`RC-11: inlineTextStyle='${inlineTextStyle}' nicht aufgeloest, Style-Pfad-Fallback (size=${fallback.size}, weight=${fallback.weight}).`);
        if (fallback.size)   props['font-size']   = wrapSize(fallback.size);
        if (fallback.weight) props['font-weight'] = wrapType('string', fallback.weight);
        if (fallback.color)  props['color']       = wrapColor(fallback.color);
      } else {
        warn(`RC-11: inlineTextStyle='${inlineTextStyle}' gefunden, kein Style-Pfad-Fallback bekannt. Keine Fallbacks gesetzt.`);
      }
    } else {
      if (widgetType === 'e-heading') {
        warn('RC-11 Fallback: e-heading ohne inlineTextStyle — Inter/32px/#111 gesetzt.');
        props['font-family'] = wrapType('string', 'Inter');
        props['font-size'] = wrapSize('32px');
        props['font-weight'] = wrapType('string', '600');
        props['color'] = wrapColor('#111111');
      } else if (widgetType === 'e-paragraph') {
        warn('RC-11 Fallback: e-paragraph ohne inlineTextStyle — Inter/16px/#444 gesetzt.');
        props['font-family'] = wrapType('string', 'Inter');
        props['font-size'] = wrapSize('16px');
        props['line-height'] = wrapUnitless(1.6);
        props['color'] = wrapColor('#444444');
      } else if (widgetType === 'e-button') {
        warn('RC-11 Fallback: e-button ohne inlineTextStyle — #fff gesetzt.');
        props['color'] = wrapColor('#ffffff');
      }
    }
  }

  // Bug 7 Fix: Browser-Defaults skippen (font-weight:400, font-style:normal, etc.)
  if (props['font-weight']?.value === '400') delete props['font-weight'];
  if (props['font-style']?.value === 'normal') delete props['font-style'];
  if (props['text-decoration']?.value === 'none') delete props['text-decoration'];
  if (props['text-transform']?.value === 'none') delete props['text-transform'];

  return props;
}

// ─────────────────────────────────────────────
// NODE → V4 CONVERTER  (recursive)
// ─────────────────────────────────────────────

const usedStyleIds  = new Map(); // base-id → count
const usedWidgetIds = new Map(); // base-id → count  (Bug 5 Fix)

function uniqueStyleId(name) {
  const base = generateStyleId(name);
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

  // Bug 8 Fix (UMBAUPLAN §1.4): NUR BEKANNTE Style-Attribut-Keys filtern.
  // Vorher: skip alle `^[A-Z]`-Keys → CamelCase Property-Overrides (z.B. `ycw27fUKm`)
  // gingen als Text verloren. Jetzt: nur echte Framer-Style-Properties rausfiltern,
  // der Rest sind Property-Overrides und zaehlen als Text-Kandidaten.
  const STYLE_ATTR_KEYS = new Set([
    'backgroundColor', 'backgroundImage', 'borderRadius',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'opacity', 'stackDirection', 'stackGap', 'stackDistribution', 'stackAlignment',
    'position', 'top', 'right', 'bottom', 'left',
    'width', 'height', 'maxWidth', 'minWidth', 'overflow', 'display',
    'gridTemplateColumns', 'padding', 'tag', 'href', 'target',
  ]);

  let bestText = undefined;

  for (const [key, val] of Object.entries(attrs)) {
    // Skip known system/meta keys
    if (['componentId', 'variant', 'name', 'id', 'nodeId', 'tag', 'href',
          'target', 'layout', 'overflow', 'position', 'opacity'].includes(key)) continue;
    // Skip known Framer style-attribute keys (CamelCase)
    if (STYLE_ATTR_KEYS.has(key)) continue;

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
 * @returns {object} V4-Element mit type, elType, widgetType, id, settings, styles, elements
 */
function convertNode(xmlNode, tokenMapping, fontResolution, imageMap, depth = 0) {
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
  const props = buildStyleProps(enrichedAttrs, widgetType, tokenMapping, fontResolution, imageMap, xmlNode);



  // ── Settings ──
  const settings = {
    classes: { '$$type': 'classes', value: [styleId] },
  };

  if (widgetType === 'e-flexbox') {
    settings.tag = attrs.tag || (depth === 0 ? 'section' : 'div');
  }

  if (widgetType === 'e-div-block') {
    settings.tag = attrs.tag || 'div';
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
    // Auto-generate alt text from node name for accessibility (UMBAUPLAN Score-Fix)
    settings['alt'] = wrapType('string', attrs.name || attrs.alt || 'Image');
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
    // Bug 8 Fix (UMBAUPLAN §1.4): Text aus Property-Override-Attrs in Settings
    // uebernehmen, damit V4-Komponenten mit Text-Literalen nicht leer rendern.
    // extractComponentText liefert den laengsten lesbaren Kandidaten (z.B. "See how we work"
    // aus dem Framer-Internal-Attr `ycw27fUKm="See how we work"`).
    if (textContent !== undefined) {
      settings['component-text'] = wrapType('string', String(textContent));
    }
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
  const baseVariant = {
    meta:  { breakpoint: null, state: null },  // Bug 4 Fix: desktop → null
    props: Object.keys(props).length > 0 ? props : {},
    custom_css: null,
  };

  const styles = {
    [styleId]: {
      id: styleId,
      type: 'class',
      label: 'local',
      variants: [baseVariant],
    },
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
      const converted = convertNode(r.node, tokenMapping, fontResolution, imageMap, r.depth);
      if (converted) v4Children.push(converted);
    }
  }

  // ── Determine elType (required by elementor-set-content) ──
  // Atomic containers (e-flexbox, e-div-block) and components are Elementor element types.
  // Atomic widgets (e-heading, e-paragraph, ...) use elType:"widget" + widgetType.
  const ATOMIC_ELEMENT_TYPES = new Set(['e-flexbox', 'e-div-block', 'e-component']);
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
// PHASE 4: COMPONENT RECURSION (e-component → widget tree)
// ─────────────────────────────────────────────

/**
 * Löst e-component-Nodes im V4-Tree auf.
 *
 * Strategie: e-component wird zu e-flexbox downgegradet mit:
 *   - Dem componentId als Label
 *   - Text aus Property-Overrides als e-heading inline
 *   - Dem gelösten Component-Tree aus der Cache wenn verfügbar
 *
 * In der Vollversion (Wizard): getNodeXml(componentId) via Unframer MCP
 * aufrufen und den komponenten-Tree rekursiv einbetten.
 *
 * @param {object} node - V4-Node
 * @param {object|null} componentCache - { componentId: v4Tree } Cache
 * @returns {object} Aufgelöster Node
 */
function resolveComponentNode(node, componentCache) {
  if (node.widgetType !== 'e-component') return node;

  const componentId = node.settings?.['component-id']?.value;
  log(`  Resolving component: ${componentId || 'unknown'}`);

  // Wenn kein Cache vorhanden: e-component unverändert lassen
  // (Komponenten-Rekursion erfordert Unframer MCP — Phase 5/Wizard)
  if (!componentCache) {
    warn(`Component '${componentId}' — kein Component-Cache geladen. e-component bleibt erhalten.`);
    return node;
  }

  // Wenn Component-Tree gecached ist → einbetten
  if (componentId && componentCache[componentId]) {
    const cached = componentCache[componentId];
    // Preserve text overrides from the component instance
    const overrides = {};
    for (const [key, val] of Object.entries(node.settings || {})) {
      if (key.startsWith('property-')) overrides[key.replace('property-', '')] = val;
    }
    // Deep-clone cached tree and apply overrides
    const resolved = JSON.parse(JSON.stringify(cached));
    if (Object.keys(overrides).length > 0) {
      applyComponentOverrides(resolved, overrides);
    }
    log(`    → Embedded from cache (${componentId})`);
    return resolved;
  }

  // Fallback: Downgrade to e-flexbox with inline text
  warn(`Component '${componentId}' nicht im Cache — downgrade zu e-flexbox mit Text.`);
  return downgradeComponentToFlexbox(node);
}

function applyComponentOverrides(node, overrides) {
  // Apply text overrides to the first e-heading or e-paragraph in the tree
  if (!node) return;
  if (node.widgetType === 'e-heading' && overrides.text) {
    node.settings.title = wrapHtmlContent(String(overrides.text.value || overrides.text));
  }
  if (node.widgetType === 'e-paragraph' && overrides.text) {
    node.settings.paragraph = wrapHtmlContent(String(overrides.text.value || overrides.text));
  }
  if (node.elements) {
    for (const child of node.elements) applyComponentOverrides(child, overrides);
  }
}

function downgradeComponentToFlexbox(node) {
  const name = node.settings?.['component-id']?.value || 'component';
  const props = { display: wrapType('string', 'flex'), 'flex-direction': 'column' };
  const styleId = 'fe' + name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 17);

  const settings = {
    classes: { '$$type': 'classes', value: [styleId] },
    tag: 'div',
  };

  // Extract text from property overrides
  const overrides = {};
  for (const [key, val] of Object.entries(node.settings || {})) {
    if (key.startsWith('property-')) overrides[key.replace('property-', '')] = val;
  }

  const children = [];
  if (overrides.text || overrides.content || overrides.title) {
    const text = String((overrides.text || overrides.content || overrides.title).value || overrides.text || overrides.content || overrides.title || '');
    children.push({
      type: 'e-heading', elType: 'widget', widgetType: 'e-heading',
      id: `comp-${name}-text`,
      settings: { classes: { '$$type': 'classes', value: ['fecomptext'] }, tag: 'h2', title: wrapHtmlContent(text) },
      styles: { fecomptext: { id: 'fecomptext', type: 'class', label: 'local', variants: [{ meta: { breakpoint: null, state: null }, props: {} }] } },
    });
  }

  return {
    type: 'e-flexbox', elType: 'e-flexbox', widgetType: 'e-flexbox',
    id: node.id,
    settings,
    styles: { [styleId]: { id: styleId, type: 'class', label: 'local', variants: [{ meta: { breakpoint: null, state: null }, props }] } },
    elements: children.length > 0 ? children : undefined,
  };
}

/**
 * Rekursiv alle e-component-Nodes im Tree auflösen.
 *
 * @param {object|Array} tree - V4-Tree
 * @param {object|null} componentCache - { componentId: v4Tree }
 * @returns {object|Array} Aufgelöster Tree
 */
function resolveComponents(tree, componentCache) {
  if (Array.isArray(tree)) return tree.map(n => resolveComponents(n, componentCache));
  if (!tree || typeof tree !== 'object') return tree;

  // Resolve this node if it's a component
  let resolved = tree;
  if (tree.widgetType === 'e-component') {
    resolved = resolveComponentNode(tree, componentCache);
  }

  // Recurse into children
  if (resolved.elements) {
    resolved.elements = resolved.elements.map(c => resolveComponents(c, componentCache));
  }

  return resolved;
}

// ─────────────────────────────────────────────
// PHASE 4: RESPONSIVE VARIANTS
// ─────────────────────────────────────────────

/**
 * Fügt responsive Variants (tablet, mobile) zu allen Styles im Tree hinzu.
 *
 * Heuristik: Skaliert font-size, padding, gap, margin um Faktoren:
 *   - Tablet: 0.75x
 *   - Mobile: 0.6x
 *
 * Nur Props die sich vom Desktop-Wert unterscheiden werden gesetzt
 * (Invariante 5: Variant Isolation / Delta-Only).
 *
 * @param {object|Array} tree - V4-Tree
 * @param {Array} breakpoints - [{label:'tablet', width:'810px'}, {label:'mobile', width:'390px'}]
 * @returns {object|Array} Tree mit responsiven Variants
 */
function addResponsiveVariants(tree, breakpoints) {
  if (!breakpoints || breakpoints.length === 0) return tree;
  if (Array.isArray(tree)) return tree.map(n => addResponsiveVariants(n, breakpoints));

  if (tree.styles) {
    for (const [styleId, styleDef] of Object.entries(tree.styles)) {
      if (!styleDef.variants || styleDef.variants.length === 0) continue;

      const desktopProps = styleDef.variants[0].props || {};
      const existingBreakpoints = new Set(styleDef.variants.map(v => v.meta?.breakpoint));

      for (const bp of breakpoints) {
        if (bp.label === 'desktop') continue;
        if (existingBreakpoints.has(bp.label)) continue;

        // Delta: nur Props die sich ändern (Invariante 5)
        const bpProps = {};
        const SCALE = bp.label === 'tablet' ? 0.75 : bp.label === 'mobile' ? 0.6 : 0.8;

        for (const [prop, value] of Object.entries(desktopProps)) {
          if (!value || typeof value !== 'object') continue;

          // Scale size values
          if (value['$$type'] === 'size') {
            const size = value.value?.size;
            if (typeof size === 'number' && size > 0) {
              const scaled = Math.round(size * SCALE);
              if (scaled !== size) {
                bpProps[prop] = { ...value, value: { ...value.value, size: scaled } };
              }
            }
          }
          // Scale dimension values
          if (value['$$type'] === 'dimensions') {
            const scaled = {};
            let changed = false;
            for (const [side, sv] of Object.entries(value.value || {})) {
              if (sv?.['$$type'] === 'size' && typeof sv.value?.size === 'number' && sv.value.size > 0) {
                const newSize = Math.round(sv.value.size * SCALE);
                if (newSize !== sv.value.size) {
                  scaled[side] = { ...sv, value: { ...sv.value, size: newSize } };
                  changed = true;
                } else {
                  scaled[side] = sv;
                }
              } else {
                scaled[side] = sv;
              }
            }
            if (changed) bpProps[prop] = { ...value, value: scaled };
          }
          // Scale gap values
          if (prop === 'gap' && value['$$type'] === 'size') {
            const size = value.value?.size;
            if (typeof size === 'number') {
              const scaled = Math.round(size * SCALE);
              if (scaled !== size && scaled > 0) {
                bpProps[prop] = { ...value, value: { ...value.value, size: scaled } };
              }
            }
          }
        }

        if (Object.keys(bpProps).length > 0) {
          styleDef.variants.push({
            meta: { breakpoint: bp.label, state: null },
            props: bpProps,
          });
          log(`  Added ${bp.label} variant to ${styleId} (${Object.keys(bpProps).length} scaled props)`);
        }
      }
    }
  }

  if (tree.elements) tree.elements = tree.elements.map(c => addResponsiveVariants(c, breakpoints));
  return tree;
}

// ─────────────────────────────────────────────
// PHASE 4: PYTHON SPEC INVARIANTEN VALIDATION
// ─────────────────────────────────────────────

/**
 * Validiert die 5 architektonischen Invarianten aus der Python SPEC.
 *
 * I1 (Rendering-Gate): Jedes Property muss $$type haben
 * I2 (Typed AST): Keine rohen Strings/Numbers als Property-Values
 * I3 (Token Indirection): Keine hardcoded Hex-Werte wenn tokenMapping vorhanden
 * I4 (Namespace-Trennung): settings vs styles strikt getrennt
 * I5 (Variant Isolation): Responsive Variants nur mit Delta-Props
 *
 * @param {object|Array} tree - V4-Tree
 * @param {object|null} tokenMapping - Token-Mapping (für I3)
 * @returns {{ passed: boolean, violations: Array }}
 */
function validateInvariants(tree, tokenMapping) {
  const violations = [];

  function walk(node, path) {
    if (!node || typeof node !== 'object') return;

    // I1/I2: Typed AST — alle settings und style props müssen $$type haben
    if (node.settings) {
      for (const [key, value] of Object.entries(node.settings)) {
        // Skip settings that are plain values by design (not $$type-wrapped)
        if (key === 'classes') continue;
        if (key === 'elements') continue;
        if (key === 'tag') continue;       // plain string like 'div', 'section'
        if (key === 'type') continue;      // plain string like 'container'
        if (value && typeof value === 'object' && !value['$$type']) {
          violations.push({ invariant: 'I1-Rendering-Gate', path: `${path}.settings.${key}`, message: `Property ohne $$type: ${JSON.stringify(value).slice(0,80)}` });
        }
      }
    }

    // I3: Token Indirection — keine hardcoded Hex wenn tokenMapping geladen
    if (tokenMapping && node.styles) {
      for (const [styleId, styleDef] of Object.entries(node.styles)) {
        for (const variant of (styleDef.variants || [])) {
          for (const [prop, value] of Object.entries(variant.props || {})) {
            if (value?.['$$type'] === 'color' && typeof value.value === 'string' && value.value.startsWith('#')) {
              violations.push({ invariant: 'I3-TokenIndirection', path: `${path}.styles.${styleId}.${prop}`, message: `Hardcoded color ${value.value} — sollte GV-Referenz sein.` });
            }
          }
        }
      }
    }

    // I4: Namespace-Trennung — font-size/color/etc. dürfen nicht in settings sein
    const STYLE_ONLY_PROPS = new Set(['font-size', 'font-family', 'font-weight', 'color', 'background', 'background-color', 'padding', 'margin', 'width', 'height', 'display', 'flex-direction', 'gap', 'border-radius', 'line-height', 'letter-spacing']);
    if (node.settings) {
      for (const key of Object.keys(node.settings)) {
        if (STYLE_ONLY_PROPS.has(key)) {
          violations.push({ invariant: 'I4-NamespaceTrennung', path: `${path}.settings.${key}`, message: `Style-Property '${key}' in settings statt styles.` });
        }
      }
    }

    // I5: Variant Isolation — responsive variants nur mit Delta
    if (node.styles) {
      for (const [styleId, styleDef] of Object.entries(node.styles)) {
        const variants = styleDef.variants || [];
        if (variants.length > 1) {
          const desktopProps = variants[0].props || {};
          for (let i = 1; i < variants.length; i++) {
            for (const [prop, value] of Object.entries(variants[i].props || {})) {
              if (JSON.stringify(value) === JSON.stringify(desktopProps[prop])) {
                violations.push({ invariant: 'I5-VariantIsolation', path: `${path}.styles.${styleId}.variants[${i}].${prop}`, message: `Responsive prop gleicht Desktop-Wert — Delta-Only verletzt.` });
              }
            }
          }
        }
      }
    }

    // Recurse
    const children = node.elements || [];
    for (let i = 0; i < children.length; i++) {
      walk(children[i], `${path}.elements[${i}]`);
    }
  }

  const roots = Array.isArray(tree) ? tree : [tree];
  for (let i = 0; i < roots.length; i++) {
    walk(roots[i], `root[${i}]`);
  }

  return { passed: violations.length === 0, violations };
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
 * Phase 12 Fix: Rekursiert in nested objects (z.B. background.value.color)
 * um auch Farbwerte innerhalb von Wrapper-Typen zu substituieren.
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

  /**
   * Rekursiv in einem beliebigen Value-Objekt nach $$type:"color" Werten suchen
   * und diese durch GV-Referenzen ersetzen.
   *
   * Deckt ab: direkte color-Props, background.value.color, border-Color-Props, etc.
   *
   * @param {*} obj - Beliebiges Objekt/Array/Value
   * @returns {*} Objekt mit substituierten Farbwerten
   */
  function substituteColorsDeep(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(substituteColorsDeep);

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Wenn es ein $$type:"color" mit Hex-Wert ist → GV-Substitution
        if (value['$$type'] === 'color') {
          const hex = typeof value.value === 'string' ? value.value : null;
          if (hex && hex.startsWith('#')) {
            const gvId = findGvIdForHex(hex, tokenMapping);
            if (gvId) {
              result[key] = wrapGvColor(gvId);
              substitutions++;
              continue;
            }
          }
        }
        // Rekursiv in nested objects (z.B. background.value, border)
        result[key] = substituteColorsDeep(value);
      } else if (Array.isArray(value)) {
        result[key] = value.map(substituteColorsDeep);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;

    if (node.styles) {
      for (const [styleId, styleDef] of Object.entries(node.styles)) {
        for (const variant of (styleDef.variants || [])) {
          if (!variant.props) continue;
          // Phase 12 Fix: Recurse into nested color values (background, border, etc.)
          variant.props = substituteColorsDeep(variant.props);

          // Font → GV (top-level only, fonts don't nest)
          for (const [prop, value] of Object.entries(variant.props)) {
            if (!value || typeof value !== 'object') continue;
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

// Helper: flat list of all node IDs for counting
function countNodes(node) {
  if (!node || typeof node !== 'object') return [];
  const nodes = [node.id || node.widgetType || '?'];
  if (node.elements) for (const c of node.elements) nodes.push(...countNodes(c));
  return nodes;
}

// Convert each root node
let v4Tree = xmlRoots
  .filter(n => n.tagName && n.tagName !== '_root')
  .map(n => convertNode(n, tokenMapping, fontResolution, imageMap, 0));

// ── Phase 4: Component Recursion ──
let componentCache = null;
if (args['component-cache']) {
  if (fs.existsSync(args['component-cache'])) {
    componentCache = JSON.parse(fs.readFileSync(args['component-cache'], 'utf8'));
    log(`Component cache loaded: ${Object.keys(componentCache).length} components`);
  }
}
const beforeComponents = v4Tree.flatMap(n => countNodes(n));
v4Tree = v4Tree.map(n => resolveComponents(n, componentCache));
const afterComponents = v4Tree.flatMap(n => countNodes(n));
log(`Component resolution: ${beforeComponents.length} → ${afterComponents.length} nodes`);

// ── Phase 4: Responsive Variants ──
if (tokenMapping?.breakpoints && tokenMapping.breakpoints.length > 0) {
  v4Tree = v4Tree.map(n => addResponsiveVariants(n, tokenMapping.breakpoints));
  log(`Responsive variants added for ${tokenMapping.breakpoints.length} breakpoints`);
}

// ── Phase 4: Invarianten-Validation ──
const invResult = validateInvariants(v4Tree, tokenMapping);
if (!invResult.passed) {
  warn(`${invResult.violations.length} Invarianten-Verletzungen gefunden:`);
  for (const v of invResult.violations.slice(0, 10)) {
    warn(`  [${v.invariant}] ${v.path}: ${v.message}`);
  }
  if (invResult.violations.length > 10) warn(`  ... und ${invResult.violations.length - 10} weitere.`);
}

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

// Phase 4: Separate output files (when --output-dir is set)
if (args['output-dir']) {
  const outDir = path.resolve(args['output-dir']);
  fs.mkdirSync(outDir, { recursive: true });

  // elements.json — the V4 widget tree
  const elementsPath = path.join(outDir, 'elements.json');
  fs.writeFileSync(elementsPath, output, 'utf8');
  process.stderr.write(`✓ elements.json → ${elementsPath}\n`);

  // variables.json — extract GV references
  if (tokenMapping) {
    const gvIds = new Set();
    // Reuse extractGvIds from framer-utils if available, else use inline scan
    const scan = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(scan); return; }
      for (const val of Object.values(obj)) {
        if (typeof val === 'string' && val.startsWith('e-gv-')) gvIds.add(val);
        else if (val && typeof val === 'object') scan(val);
      }
    };
    scan(result);
    const varPath = path.join(outDir, 'variables.json');
    fs.writeFileSync(varPath, JSON.stringify({ meta: { total: gvIds.size }, gv_ids: [...gvIds] }, null, 2), 'utf8');
    process.stderr.write(`✓ variables.json → ${varPath} (${gvIds.size} GV-IDs)\n`);

    // token-mapping.json — copy enriched with gv_ids
    const tmPath = path.join(outDir, 'token-mapping.json');
    fs.writeFileSync(tmPath, JSON.stringify(tokenMapping, null, 2), 'utf8');
    process.stderr.write(`✓ token-mapping.json → ${tmPath}\n`);
  }

  // fonts.json — font resolution
  if (fontResolution) {
    const fp = path.join(outDir, 'font-resolution.json');
    fs.writeFileSync(fp, JSON.stringify(fontResolution, null, 2), 'utf8');
    process.stderr.write(`✓ font-resolution.json → ${fp}\n`);
  }

  // asset-manifest.json — image map
  if (imageMap) {
    const ap = path.join(outDir, 'asset-manifest.json');
    fs.writeFileSync(ap, JSON.stringify(imageMap, null, 2), 'utf8');
    process.stderr.write(`✓ asset-manifest.json → ${ap}\n`);
  }
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
