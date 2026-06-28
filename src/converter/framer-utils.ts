/**
 * src/converter/framer-utils.ts
 * Gemeinsame Utilities für alle Framer → Elementor V4 Scripts
 *
 * Verschoben von scripts/lib/framer-utils.ts (UMBAUPLAN Phase 1.2)
 */

import { createHash } from 'node:crypto';

// Types are imported from src/types/ to avoid duplication.
// Re-export so the Strangler-Fig proxy in scripts/lib/ still forwards them.
import type { ParsedFontPrefix } from '../types/framer.js';
import type { TokenMapping, StructuralHashOptions } from '../types/common.js';

export type { ParsedFontPrefix, TokenMapping, StructuralHashOptions };

// ─────────────────────────────────────────────
// COLOR UTILITIES
// ─────────────────────────────────────────────

export const WEIGHT_MAP: Record<string, string> = {
  Thin: '100', ExtraLight: '200', Light: '300', Regular: '400',
  Medium: '500', SemiBold: '600', Bold: '700', ExtraBold: '800', Black: '900',
};
export const WEIGHT_NAME_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(WEIGHT_MAP).map(([name, num]) => [num, name])
);

export function normalizeHex(val: unknown): string | null {
  if (!val) return null;
  let v = String(val).trim().toLowerCase().replace(/^#/, '');
  if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
  if (/^[0-9a-f]{6}$/.test(v)) return '#' + v;
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  return null;
}

export function rgbToHex(rgb: unknown): string | null {
  if (!rgb) return null;
  const m = String(rgb).match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return normalizeHex(rgb);
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: unknown): string | null {
  const h = normalizeHex(hex);
  if (!h) return null;
  return `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
}

export function hexDistance(a: unknown, b: unknown): number {
  const ha = normalizeHex(a); const hb = normalizeHex(b);
  if (!ha || !hb) return Infinity;
  const diff = (i: number) => Math.abs(parseInt(ha.slice(i, i + 2), 16) - parseInt(hb.slice(i, i + 2), 16));
  return Math.max(diff(1), diff(3), diff(5));
}

// ─────────────────────────────────────────────
// FONT UTILITIES
// ─────────────────────────────────────────────

export function parseFramerPrefix(prefix: string): ParsedFontPrefix {
  if (!prefix) return { source: 'local', family: '', weight: '400', variant: 'Regular' };
  let source = 'local';
  let rest = prefix;
  if (prefix.startsWith('FR;')) { source = 'FR'; rest = prefix.slice(3); }
  else if (prefix.startsWith('GF;')) { source = 'GF'; rest = prefix.slice(3); }

  const parts = rest.split('-');
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const numW = /^\d{3}$/.test(last);
    const nameW = !!WEIGHT_MAP[last];
    if (numW || nameW) {
      const familyRaw = parts.slice(0, -1).join('');
      const family = familyRaw.replace(/([a-z])([A-Z])/g, '$1 $2');
      const weight = numW ? last : WEIGHT_MAP[last];
      return { source, family, weight, variant: last };
    }
  }
  const family = rest.replace(/([a-z])([A-Z])/g, '$1 $2');
  return { source, family, weight: '400', variant: 'Regular' };
}

export function resolveFontWeight(variant: string): string {
  return WEIGHT_MAP[variant] ?? variant ?? '400';
}

export function generateGoogleFontsUrl(family: string, weight: string): string {
  const fam = encodeURIComponent(family).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${weight}&display=swap`;
}

export function expectedFontFilenames(family: string, weight: string): string[] {
  const fc = family.replace(/\s+/g, '');
  const wName = WEIGHT_NAME_MAP[weight] ?? weight;
  const results = [`${fc}-${wName}.woff2`, `${fc}-${wName}.woff`, `${fc}-${wName}.ttf`];
  if (weight === '400') results.push(`${fc}.woff2`, `${fc}.woff`);
  return results;
}

// ─────────────────────────────────────────────
// STYLE ID GENERATION
// ─────────────────────────────────────────────

export function generateStyleId(name: string): string {
  const clean = String(name).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 17);
  return 'fe' + (clean || 'node');
}

export function isValidStyleId(id: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(id);
}

export function sanitizeStyleId(name: string): string {
  if (!name) return 'fenode';
  let s = String(name).toLowerCase();
  s = s.replace(/-/g, '_');
  s = s.replace(/[^a-z0-9_]/g, '');
  s = s.replace(/_+/g, '_');
  s = s.replace(/^_+|_+$/g, '');
  if (/^[0-9]/.test(s)) s = 'fe_' + s;
  if (!s) s = 'fenode';
  if (s.length > 24) s = s.slice(0, 24);
  return s;
}

// ─────────────────────────────────────────────
// $$TYPE WRAPPERS  (V4 Typed AST)
// ─────────────────────────────────────────────

export function wrapType(type: string, value: unknown): Record<string, unknown> {
  return { '$$type': type, value };
}

export function isDimensionValue(val: unknown): boolean {
  return /^-?[\d.]+(px|%|em|rem|vw|vh)?$/.test(String(val).trim());
}

export function wrapSize(valStr: unknown): Record<string, unknown> {
  const m = String(valStr).match(/^(-?[\d.]+)(px|%|em|rem|vw|vh)?$/);
  if (m) return { '$$type': 'size', value: { size: parseFloat(m[1]), unit: m[2] || 'px' } };
  return { '$$type': 'string', value: String(valStr) };
}

export function wrapUnitless(value: number | string): Record<string, unknown> {
  const numeric = typeof value === 'number' ? value : parseFloat(String(value));
  return { '$$type': 'size', value: { size: Number.isFinite(numeric) ? numeric : 0, unit: 'custom' } };
}

export function wrapDimensions(shorthand: unknown): Record<string, unknown> {
  const p = String(shorthand).trim().split(/\s+/);
  let [top, right, bottom, left] = ['0px', '0px', '0px', '0px'];
  switch (p.length) {
    case 1: top = right = bottom = left = p[0]; break;
    case 2: top = bottom = p[0]; right = left = p[1]; break;
    case 3: top = p[0]; right = left = p[1]; bottom = p[2]; break;
    case 4: [top, right, bottom, left] = p; break;
  }
  return {
    '$$type': 'dimensions',
    value: {
      'block-start': wrapSize(top),
      'block-end': wrapSize(bottom),
      'inline-start': wrapSize(left),
      'inline-end': wrapSize(right),
    },
  };
}

export function wrapBorderRadius(shorthand: unknown): Record<string, unknown> {
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
      'start-end': wrapSize(se),
      'end-end': wrapSize(ee),
      'end-start': wrapSize(es),
    },
  };
}

export function wrapColor(hex: string): Record<string, unknown> {
  return { '$$type': 'color', value: hex };
}
export function wrapGvColor(gvId: string): Record<string, unknown> {
  return { '$$type': 'global-color-variable', value: gvId };
}
export function wrapGvFont(gvId: string): Record<string, unknown> {
  return { '$$type': 'global-font-variable', value: gvId };
}

export function wrapClasses(classIds: string[]): Record<string, unknown> {
  if (!Array.isArray(classIds)) classIds = [];
  return {
    '$$type': 'classes',
    value: classIds.map((id: string) => isValidStyleId(id) ? id : sanitizeStyleId(id)),
  };
}

export function wrapImageSrc({ id = null, url = null }: { id?: string | null; url?: string | null } = {}): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  if (id !== null && id !== undefined) value.id = id;
  if (url !== null && url !== undefined) value.url = wrapType('url', String(url));
  return { '$$type': 'image-src', value };
}

export function wrapImage(srcValue: Record<string, unknown>): Record<string, unknown> {
  return {
    '$$type': 'image',
    value: {
      src: srcValue,
      size: { '$$type': 'string', value: 'full' },
    },
  };
}

export function wrapCssValue(val: unknown): Record<string, unknown> {
  const v = String(val).trim();
  if (/^-?[\d.]+(?:px|%|em|rem|vw|vh)$/.test(v)) return wrapSize(v);
  return wrapType('string', v);
}

export function getWrappedSizeNumber(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v['$$type'] === 'size' && typeof (v.value as Record<string, unknown>)?.size === 'number')
    return (v.value as Record<string, number>).size;
  return null;
}

export function scaleWrappedSize(value: unknown, factor: number): unknown {
  if (!value || typeof value !== 'object' || (value as Record<string, unknown>)['$$type'] !== 'size') return value;
  const v = value as { value: { size?: number } };
  if (typeof v.value?.size !== 'number') return value;
  return {
    ...value as object,
    value: {
      ...v.value,
      size: Math.max(1, Math.round(v.value.size * factor)),
    },
  };
}

// ─────────────────────────────────────────────
// CSS VARIABLE RESOLUTION
// ─────────────────────────────────────────────

export function resolveCssVar(value: string, tokenMapping: TokenMapping | null): { gvId: string | null; hex: string | null } | null {
  if (!value || typeof value !== 'string' || !value.includes('var(')) return null;
  const varMatch = value.match(/var\(\s*(--[\w-]+)/);
  if (!varMatch) return null;
  const tokenKey = varMatch[1];
  if (tokenMapping?.colors?.[tokenKey]) {
    return { gvId: tokenMapping.colors[tokenKey].gv_id ?? null, hex: tokenMapping.colors[tokenKey].hex ?? null };
  }
  if (typeof (tokenMapping as Record<string, string>)?.[tokenKey] === 'string') {
    return { gvId: (tokenMapping as Record<string, string>)[tokenKey], hex: null };
  }
  const fallbackMatch = value.match(/var\([^,]+,\s*([^)]+)\)/);
  const fallback = fallbackMatch ? normalizeHex(fallbackMatch[1].trim()) : null;
  return fallback ? { gvId: null, hex: fallback } : null;
}

// ─────────────────────────────────────────────
// TREE UTILITIES
// ─────────────────────────────────────────────

export function walkTree(node: unknown, callback: (node: Record<string, unknown>) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(n => walkTree(n, callback));
    return;
  }
  const n = node as Record<string, unknown>;
  callback(n);
  const children = n.children ?? n.elements ?? n.items;
  if (Array.isArray(children)) children.forEach(c => walkTree(c, callback));
}

export function findNodesByType(tree: unknown, widgetType: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  walkTree(tree, (n: Record<string, unknown>) => { if (n.widgetType === widgetType) found.push(n); });
  return found;
}

export function extractGvIds(node: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const seen = new WeakSet<object>();
  const scan = (obj: object): void => {
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

export function wrapHtmlContent(content: string): Record<string, unknown> {
  return {
    '$$type': 'html-v3',
    value: { content: { '$$type': 'string', value: String(content ?? '') } },
  };
}

// ─────────────────────────────────────────────
// STRUCTURAL HASHING (A1 + D1 shared)
// ─────────────────────────────────────────────

export function structuralHash(elements: unknown[], options: StructuralHashOptions = {}): string | null {
  const {
    short = true,
    includeTag = false,
    nullOnSmall = false,
  } = options;

  if (!Array.isArray(elements)) return '';
  if (nullOnSmall && elements.length < 2) return null;

  const parts = elements.map((el: unknown) => {
    const e = el as Record<string, unknown>;
    const wt = e.widgetType || e.elType || e.type || 'unknown';
    const kids = ((e.elements || e.children || []) as unknown[]).length;
    const styleKeys = Object.keys((e.styles as object) || {}).sort().join(',');
    const tag = includeTag ? ((e.settings as Record<string, unknown>)?.tag as string || '') : '';
    return tag ? `${wt}|${kids}|${styleKeys}|${tag}` : `${wt}|${kids}|${styleKeys}`;
  });

  const raw = parts.join('::');
  if (!short) return raw;

  const hash = createHash('md5').update(raw).digest('hex').slice(0, 12);
  return hash;
}
