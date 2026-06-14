/**
 * scripts/lib/framer-utils.js
 * Gemeinsame Utilities für alle Framer → Elementor V4 Scripts
 * ESM-Modul — import { normalizeHex, ... } from './lib/framer-utils.js'
 */

import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────
// COLOR UTILITIES
// ─────────────────────────────────────────────

export const WEIGHT_MAP = {
  Thin: '100', ExtraLight: '200', Light: '300', Regular: '400',
  Medium: '500', SemiBold: '600', Bold: '700', ExtraBold: '800', Black: '900',
};
export const WEIGHT_NAME_MAP = Object.fromEntries(
  Object.entries(WEIGHT_MAP).map(([name, num]) => [num, name])
);

/** Normalizes any color value to lowercase #rrggbb, or null. */
export function normalizeHex(val) {
  if (!val) return null;
  let v = String(val).trim().toLowerCase().replace(/^#/, '');
  if (v.length === 3) v = v[0]+v[0]+v[1]+v[1]+v[2]+v[2];
  if (/^[0-9a-f]{6}$/.test(v)) return '#' + v;
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  return null;
}

/** rgb(r,g,b) → #rrggbb */
export function rgbToHex(rgb) {
  if (!rgb) return null;
  const m = String(rgb).match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return normalizeHex(rgb);
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

/** #rrggbb → rgb(r, g, b) */
export function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  return `rgb(${parseInt(h.slice(1,3),16)}, ${parseInt(h.slice(3,5),16)}, ${parseInt(h.slice(5,7),16)})`;
}

/** Hex distance (max channel diff) for near-match detection */
export function hexDistance(a, b) {
  const ha = normalizeHex(a); const hb = normalizeHex(b);
  if (!ha || !hb) return Infinity;
  const diff = (i) => Math.abs(parseInt(ha.slice(i,i+2),16) - parseInt(hb.slice(i,i+2),16));
  return Math.max(diff(1), diff(3), diff(5));
}

// ─────────────────────────────────────────────
// FONT UTILITIES
// ─────────────────────────────────────────────

/**
 * Parses Framer font prefix into { source, family, weight, variant }
 *   "FR;InterDisplay-SemiBold" → { source:"FR",  family:"Inter Display", weight:"600", variant:"SemiBold" }
 *   "GF;Roboto-700"            → { source:"GF",  family:"Roboto",        weight:"700", variant:"700" }
 *   "Inter-SemiBold"           → { source:"local",family:"Inter",        weight:"600", variant:"SemiBold" }
 *   "Inter"                    → { source:"local",family:"Inter",        weight:"400", variant:"Regular" }
 */
export function parseFramerPrefix(prefix) {
  if (!prefix) return { source: 'local', family: '', weight: '400', variant: 'Regular' };
  let source = 'local';
  let rest   = prefix;
  if (prefix.startsWith('FR;')) { source = 'FR'; rest = prefix.slice(3); }
  else if (prefix.startsWith('GF;')) { source = 'GF'; rest = prefix.slice(3); }

  const parts = rest.split('-');
  if (parts.length >= 2) {
    const last  = parts[parts.length - 1];
    const numW  = /^\d{3}$/.test(last);
    const nameW = !!WEIGHT_MAP[last];
    if (numW || nameW) {
      const familyRaw = parts.slice(0, -1).join('');
      const family    = familyRaw.replace(/([a-z])([A-Z])/g, '$1 $2');
      const weight    = numW ? last : WEIGHT_MAP[last];
      return { source, family, weight, variant: last };
    }
  }
  const family = rest.replace(/([a-z])([A-Z])/g, '$1 $2');
  return { source, family, weight: '400', variant: 'Regular' };
}

export function resolveFontWeight(variant) {
  return WEIGHT_MAP[variant] ?? variant ?? '400';
}

export function generateGoogleFontsUrl(family, weight) {
  const fam = encodeURIComponent(family).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${weight}&display=swap`;
}

/** Candidate woff2 filenames for a given family + weight */
export function expectedFontFilenames(family, weight) {
  const fc       = family.replace(/\s+/g, '');
  const wName    = WEIGHT_NAME_MAP[weight] ?? weight;
  const results  = [`${fc}-${wName}.woff2`, `${fc}-${wName}.woff`, `${fc}-${wName}.ttf`];
  if (weight === '400') results.push(`${fc}.woff2`, `${fc}.woff`);
  return results;
}

// ─────────────────────────────────────────────
// STYLE ID GENERATION
// ─────────────────────────────────────────────

// RC-18 Fix: Prefix 'fe' (Framer Export) to avoid CSS namespace collisions
// with Elementor V4 Global Classes (gc-*). The old 's' prefix produced IDs
// like 'snode0' that could collide with V4 internal style IDs.
// No hyphen used — Invariant III requires style IDs without hyphens.
export function generateStyleId(name) {
  const clean = String(name).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 17);
  return 'fe' + (clean || 'node');
}

export function isValidStyleId(id) {
  return /^[a-z][a-z0-9_]*$/.test(id);
}

// ─────────────────────────────────────────────
// $$TYPE WRAPPERS  (V4 Typed AST)
// ─────────────────────────────────────────────

export function wrapType(type, value) {
  return { '$$type': type, value };
}

/** Returns true for numeric CSS values (1200px, 50%) — false for keywords (fit-content, auto, max-content) and 'fr' units (only valid in grid-template-columns). Use before calling wrapSize() to avoid producing $$type:"string" for dimension properties, which Elementor's Style_Parser rejects. */
export function isDimensionValue(val) {
  return /^-?[\d.]+(px|%|em|rem|vw|vh)?$/.test(String(val).trim());
}

/** "68px" → { $$type:"size", value:{ size:68, unit:"px" } }
 * RC-10 Fix: 'fr' unit is rejected for general use. Only grid-template-columns
 * accepts 'fr' — callers must bypass wrapSize for grid contexts. */
export function wrapSize(valStr) {
  const m = String(valStr).match(/^(-?[\d.]+)(px|%|em|rem|vw|vh)?$/);
  if (m) return { '$$type': 'size', value: { size: parseFloat(m[1]), unit: m[2] || 'px' } };
  return { '$$type': 'string', value: String(valStr) };
}

/** Unitless V4 size marker, used for line-height, opacity-like scalars. */
export function wrapUnitless(value) {
  const numeric = typeof value === 'number' ? value : parseFloat(String(value));
  return { '$$type': 'size', value: { size: Number.isFinite(numeric) ? numeric : 0, unit: 'custom' } };
}

/** "70px 60px 70px 60px" → dimensions object with block/inline sides */
export function wrapDimensions(shorthand) {
  const p = String(shorthand).trim().split(/\s+/);
  let [top, right, bottom, left] = ['0px','0px','0px','0px'];
  switch (p.length) {
    case 1: top = right = bottom = left = p[0]; break;
    case 2: top = bottom = p[0]; right = left = p[1]; break;
    case 3: top = p[0]; right = left = p[1]; bottom = p[2]; break;
    case 4: [top, right, bottom, left] = p; break;
  }
  return {
    '$$type': 'dimensions',
    value: {
      'block-start':  wrapSize(top),
      'block-end':    wrapSize(bottom),
      'inline-start': wrapSize(left),
      'inline-end':   wrapSize(right),
    },
  };
}

/** "12px" / "12px 8px" → V4 four-corner border-radius object */
export function wrapBorderRadius(shorthand) {
  const p = String(shorthand).trim().split(/\s+/);
  let [ss, se, ee, es] = ['0px', '0px', '0px', '0px'];
  switch (p.length) {
    case 1: ss = se = ee = es = p[0]; break;
    case 2: ss = ee = p[0]; se = es = p[1]; break;
    case 3: ss = p[0]; se = es = p[1]; ee = p[2]; break;
    case 4: [ss, se, ee, es] = p; break;
  }
  return {
    '$$type': 'border-radius',
    value: {
      'start-start': wrapSize(ss),
      'start-end':   wrapSize(se),
      'end-end':     wrapSize(ee),
      'end-start':   wrapSize(es),
    },
  };
}

export function wrapColor(hex)    { return { '$$type': 'color',                 value: hex   }; }
export function wrapGvColor(gvId) { return { '$$type': 'global-color-variable', value: gvId  }; }
export function wrapGvFont(gvId)  { return { '$$type': 'global-font-variable',  value: gvId  }; }

export function wrapImageSrc({ id = null, url = null } = {}) {
  const value = {};
  if (id !== null && id !== undefined) value.id = id;
  // The URL inside image-src.value MUST be wrapped in $$type:url.
  // el_build_image_shape() on the server wraps url as {$$type:"url",value:"..."}
  // and Elementor's Props_Parser deep validation rejects a bare string.
  if (url !== null && url !== undefined) value.url = wrapType('url', String(url));
  return { '$$type': 'image-src', value };
}

/** Wraps an image-src into the full V4 image prop shape: {$$type:"image", value:{src:{$$type:"image-src", value:{id/url}}, size:{$$type:"string", value:"full"}}} */
export function wrapImage(srcValue) {
  return {
    '$$type': 'image',
    value: {
      src: srcValue,
      size: { '$$type': 'string', value: 'full' },
    },
  };
}

/** Wraps a CSS value intelligently: px/%/em → size, otherwise string */
export function wrapCssValue(val) {
  const v = String(val).trim();
  if (/^-?[\d.]+(?:px|%|em|rem|vw|vh)$/.test(v)) return wrapSize(v);
  return wrapType('string', v);
}

export function getWrappedSizeNumber(value) {
  if (!value || typeof value !== 'object') return null;
  if (value['$$type'] === 'size' && typeof value.value?.size === 'number') return value.value.size;
  return null;
}

export function scaleWrappedSize(value, factor) {
  if (!value || typeof value !== 'object' || value['$$type'] !== 'size') return value;
  if (typeof value.value?.size !== 'number') return value;
  return {
    ...value,
    value: {
      ...value.value,
      size: Math.max(1, Math.round(value.value.size * factor)),
    },
  };
}

// ─────────────────────────────────────────────
// CSS VARIABLE RESOLUTION
// ─────────────────────────────────────────────

/**
 * Resolves "var(--token-d98a4c00, rgb(6,29,19))" against tokenMapping.
 * Returns gv_id if found, else falls back to normalizeHex on the fallback value.
 */
export function resolveCssVar(value, tokenMapping) {
  if (!value || typeof value !== 'string' || !value.includes('var(')) return null;
  const varMatch = value.match(/var\(\s*(--[\w-]+)/);
  if (!varMatch) return null;
  const tokenKey = varMatch[1];
  // Structured mapping: {colors: {'--token': {gv_id, hex}}}
  if (tokenMapping?.colors?.[tokenKey]) {
    return { gvId: tokenMapping.colors[tokenKey].gv_id, hex: tokenMapping.colors[tokenKey].hex };
  }
  // Flat mapping: {'--token': 'e-gv-xxxxxxx'}
  if (typeof tokenMapping?.[tokenKey] === 'string') {
    return { gvId: tokenMapping[tokenKey], hex: null };
  }
  // Fallback: parse fallback value from var()
  const fallbackMatch = value.match(/var\([^,]+,\s*([^)]+)\)/);
  const fallback = fallbackMatch ? normalizeHex(fallbackMatch[1].trim()) : null;
  return fallback ? { gvId: null, hex: fallback } : null;
}

// ─────────────────────────────────────────────
// TREE UTILITIES
// ─────────────────────────────────────────────

export function walkTree(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(n => walkTree(n, callback));
    return;
  }
  callback(node);
  const children = node.children ?? node.elements ?? node.items;
  if (Array.isArray(children)) children.forEach(c => walkTree(c, callback));
}

export function findNodesByType(tree, widgetType) {
  const found = [];
  walkTree(tree, n => { if (n.widgetType === widgetType) found.push(n); });
  return found;
}

export function extractGvIds(node) {
  const ids  = new Set();
  const seen = new WeakSet();
  const scan = (obj) => {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
    seen.add(obj);
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && val.startsWith('e-gv-')) ids.add(val);
      else if (val && typeof val === 'object') scan(val);
    }
  };
  scan(node);
  return [...ids];
}

// ─────────────────────────────────────────────
// HTML CONTENT WRAPPING
// ─────────────────────────────────────────────

/**
 * Wraps text or HTML content in the Elementor V4 html-v3 format.
 * Used by e-heading, e-paragraph, e-button and other text widgets.
 *
 * @param {string} content - Plain text or HTML content
 * @returns {{ '$$type': 'html-v3', value: { content: { '$$type': 'string', value: string } } }}
 */
export function wrapHtmlContent(content) {
  return {
    '$$type': 'html-v3',
    value: { content: { '$$type': 'string', value: String(content ?? '') } },
  };
}

// ─────────────────────────────────────────────
// STRUCTURAL HASHING (A1 + D1 shared)
// ─────────────────────────────────────────────

/**
 * Erzeugt einen strukturierten Hash für eine Liste von V4-Elementen.
 * Verwendet von A1 (Component Extraction) und D1 (Component Reuse Check).
 *
 * @param {Array} elements - Array von V4-Elementen
 * @param {Object} [options]
 * @param {boolean} [options.short=true] - MD5-Hash (12 chars) oder Raw-String
 * @param {boolean} [options.includeTag=false] - settings.tag in Hash einbeziehen
 * @param {boolean} [options.nullOnSmall=false] - null zurückgeben wenn <2 Elemente
 * @returns {string|null}
 */
export function structuralHash(elements, options = {}) {
  const {
    short = true,
    includeTag = false,
    nullOnSmall = false,
  } = options;

  if (!Array.isArray(elements)) return '';
  if (nullOnSmall && elements.length < 2) return null;

  const parts = elements.map(el => {
    const wt = el.widgetType || el.elType || el.type || 'unknown';
    const kids = (el.elements || el.children || []).length;
    const styleKeys = Object.keys(el.styles || {}).sort().join(',');
    const tag = includeTag ? (el.settings?.tag || '') : '';
    return tag ? `${wt}|${kids}|${styleKeys}|${tag}` : `${wt}|${kids}|${styleKeys}`;
  });

  const raw = parts.join('::');
  if (!short) return raw;

  const hash = createHash('md5').update(raw).digest('hex').slice(0, 12);
  return hash;
}
