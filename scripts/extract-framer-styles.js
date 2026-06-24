#!/usr/bin/env node
/**
 * extract-framer-styles.js  —  Phase 2: Framer CSS Style Extraction
 *
 * Extrahiert CSS-Properties aus dem Framer HTML-Export (<style> Blöcke + Inline-Styles)
 * und strukturiert sie als JSON für V4-Variable/Class-Erstellung.
 *
 * Usage:
 *   node scripts/extract-framer-styles.js \
 *     --html FramerExport/framer-passionate-papaya-042575/index.html \
 *     --output FramerExport/tokens/extracted-styles.json
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
    'element-tree': { type: 'string' },
    output:         { type: 'string' },
    format:         { type: 'string', default: 'json' },
    verbose:        { type: 'boolean', default: false },
  },
  strict: false,
});

// Help
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log('Usage: node scripts/extract-framer-styles.js [--help for options]'); console.log('Run with --help for full usage.'); process.exit(0); }

const log = (...msg) => { if (args.verbose) process.stderr.write('[verbose] ' + msg.join(' ') + '\n'); };

if (!args.html && !args.css) {
  process.stderr.write('Error: --html or --css required\n');
  process.exit(2);
}

// ─────────────────────────────────────────────
// HEX NORMALIZATION
// ─────────────────────────────────────────────

function normalizeHex(val) {
  if (!val) return null;
  val = val.trim().toLowerCase();
  if (val.startsWith('#')) val = val.slice(1);
  if (val.length === 3) val = val[0]+val[0]+val[1]+val[1]+val[2]+val[2];
  if (/^[0-9a-f]{6}$/.test(val)) return '#' + val;
  const m = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  return null;
}

function parseRgba(val) {
  const m = val.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i);
  if (m) return { hex_approx: normalizeHex(val), opacity: parseFloat(m[4]) };
  return null;
}

// ─────────────────────────────────────────────
// CSS EXTRACTION FROM HTML
// ─────────────────────────────────────────────

function extractCssFromHtml(html) {
  const blocks = [];
  // <style ...>...</style>
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) {
    blocks.push(m[1]);
  }
  return blocks.join('\n');
}

// ─────────────────────────────────────────────
// PARSE @font-face
// ─────────────────────────────────────────────

function parseFontFaces(css) {
  const familyMap = new Map(); // family → { family, variants[], source, usage_hint }
  const blockRe   = /@font-face\s*\{([^}]+)\}/gi;
  let block;
  while ((block = blockRe.exec(css)) !== null) {
    const inner   = block[1];
    const familyM = inner.match(/font-family\s*:\s*['"]?([^;'"]+)['"]?/i);
    const weightM = inner.match(/font-weight\s*:\s*([^;]+)/i);
    const styleM  = inner.match(/font-style\s*:\s*([^;]+)/i);
    const srcM    = inner.match(/src\s*:[^;]*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i);
    const fmtM    = inner.match(/format\(['"]?([^'"]+)['"]?\)/i);

    if (!familyM) continue;
    const family  = familyM[1].trim();
    const weight  = weightM ? weightM[1].trim() : '400';
    const style   = styleM  ? styleM[1].trim()  : 'normal';
    const url     = srcM    ? srcM[1].trim()    : null;
    const format  = fmtM    ? fmtM[1].trim()    : null;

    // Detect source
    let source = 'custom-upload';
    if (url && url.includes('fonts.gstatic.com'))  source = 'google-fonts';
    if (url && url.includes('fonts.googleapis.com')) source = 'google-fonts';
    if (url && url.includes('framerusercontent.com')) source = 'framer-cdn';

    const variant = { style, weight };
    if (url) variant.url = url;
    if (format) variant.format = format;

    if (!familyMap.has(family)) {
      familyMap.set(family, { family, variants: [], source, usage_hint: null });
    }
    familyMap.get(family).variants.push(variant);
    // If source is framer-cdn it overrides google-fonts (more specific)
    if (source === 'framer-cdn') familyMap.get(family).source = source;
  }
  return [...familyMap.values()];
}

// ─────────────────────────────────────────────
// INLINE STYLE EXTRACTION
// ─────────────────────────────────────────────

function extractInlineStyles(html) {
  const decls = [];
  const inlineRe = /style=["']([^"']+)["']/gi;
  let m;
  while ((m = inlineRe.exec(html)) !== null) {
    const style = m[1];
    const propRe = /([\w-]+)\s*:\s*([^;!\n]+)/g;
    let pm;
    while ((pm = propRe.exec(style)) !== null) {
      decls.push({
        selector: '[inline]',
        property: pm[1].trim(),
        value:    pm[2].trim(),
        breakpoint: null,
      });
    }
  }
  return decls;
}

// ─────────────────────────────────────────────
// CSS VARIABLE EXTRACTION (Framer Token System)
// ─────────────────────────────────────────────

function extractCssVariables(decls) {
  const vars = new Map(); // varName → { values: Set, occurrences }

  for (const { property, value } of decls) {
    if (!property.startsWith('--')) continue;
    const val = value.trim();
    if (vars.has(property)) {
      const e = vars.get(property);
      e.values.add(val);
      e.occurrences++;
    } else {
      vars.set(property, { values: new Set([val]), occurrences: 1 });
    }
  }

  // Convert to output format
  const result = [];
  for (const [name, data] of vars) {
    // Skip Framer internal vars
    if (name.startsWith('--framer-') && !name.startsWith('--framer-text-color')) continue;
    result.push({
      name,
      values: [...data.values],
      occurrences: data.occurrences,
    });
  }

  return result.sort((a, b) => b.occurrences - a.occurrences);
}

// ─────────────────────────────────────────────
// COLLECT ALL CSS RULE DECLARATIONS
// ─────────────────────────────────────────────

function parseRuleDeclarations(css) {
  // Returns flat array of { selector, property, value, breakpoint }
  const decls = [];

  // Strip @font-face blocks
  const noFontFace = css.replace(/@font-face\s*\{[^}]+\}/gi, '');

  // Handle @media blocks
  const mediaRe = /@media[^{]*\{([\s\S]*?)\}(?=\s*(?:@|\.|#|[a-z*]))/gi;
  const processBlock = (block, breakpoint) => {
    const ruleRe = /([^{}]+)\{([^}]+)\}/g;
    let rm;
    while ((rm = ruleRe.exec(block)) !== null) {
      const selector = rm[1].trim();
      const body     = rm[2];
      const propRe   = /([\w-]+)\s*:\s*([^;!\n]+)/g;
      let pm;
      while ((pm = propRe.exec(body)) !== null) {
        decls.push({ selector, property: pm[1].trim(), value: pm[2].trim(), breakpoint });
      }
    }
  };

  // Extract @media blocks with breakpoint
  let mediaMatch;
  const mediaCopy = noFontFace;
  const mediaRe2 = /@media[^{]*(?:max-width|min-width)\s*:\s*(\d+)px[^{]*\{([\s\S]*?)\}(?=\s*[\r\n]*(?:@|\.|#|[a-zA-Z*]|$))/g;
  let processedRanges = [];
  while ((mediaMatch = mediaRe2.exec(mediaCopy)) !== null) {
    const bpVal = parseInt(mediaMatch[1]);
    const bp = bpVal <= 420 ? 'mobile' : bpVal <= 900 ? 'tablet' : 'desktop';
    processBlock(mediaMatch[2], bp);
    processedRanges.push([mediaMatch.index, mediaMatch.index + mediaMatch[0].length]);
  }

  // Non-media rules (base styles)
  // Simple approach: parse all rules not inside @media
  const noMedia = noFontFace.replace(/@media[^{]*\{[\s\S]*?\}(?=\s*[\r\n]*(?:@|\.|#|[a-zA-Z*]|$))/g, '');
  processBlock(noMedia, null);

  return decls;
}

// ─────────────────────────────────────────────
// COLOR PROPERTIES
// ─────────────────────────────────────────────

const COLOR_PROPS = new Set([
  'color', 'background-color', 'background', 'border-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color', 'fill', 'stroke',
]);

function looksLikeColor(val) {
  const v = val.trim().toLowerCase();
  if (v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl')) return true;
  if (/^[0-9a-f]{3,6}$/.test(v)) return true;
  return false;
}

// Extract color from var() fallback: var(--token-xxx, rgb(4, 51, 51)) → rgb(4, 51, 51)
function extractVarFallback(val) {
  const m = val.match(/var\([^,]+,\s*([^)]+)\)/);
  if (m) return m[1].trim();
  return null;
}

function extractColors(decls) {
  // unique hex → { hex, raw, occurrences, properties[] }
  const colorMap = new Map();
  const semiTransparent = [];

  for (const { property, value } of decls) {
    if (!COLOR_PROPS.has(property) && !property.startsWith('--framer-text-color') && !property.startsWith('--extracted-')) continue;

    let val = value.trim();

    // Handle var() fallback: var(--token-xxx, rgb(4, 51, 51))
    if (val.startsWith('var(')) {
      const fallback = extractVarFallback(val);
      if (fallback) {
        val = fallback;
      } else {
        continue; // No fallback found, skip
      }
    }

    // Semi-transparent rgba
    if (/rgba\s*\(/.test(val)) {
      const parsed = parseRgba(val);
      if (parsed) {
        const key = val.replace(/\s+/g, '');
        const existing = semiTransparent.find(s => s.rgba.replace(/\s+/g, '') === key);
        if (existing) {
          existing.occurrences++;
        } else {
          semiTransparent.push({ rgba: val, hex_approx: parsed.hex_approx, opacity: parsed.opacity, occurrences: 1 });
        }
      }
      continue;
    }

    const hex = normalizeHex(val);
    if (!hex) continue;

    const propName = property.replace('background-color', 'background-color')
                             .replace('background', 'background-color'); // normalize

    if (colorMap.has(hex)) {
      const e = colorMap.get(hex);
      e.occurrences++;
      if (!e.properties.includes(propName)) e.properties.push(propName);
    } else {
      colorMap.set(hex, { hex, raw: val, occurrences: 1, properties: [propName] });
    }
  }

  const unique = [...colorMap.values()].sort((a, b) => b.occurrences - a.occurrences);
  return { unique, semi_transparent: semiTransparent };
}

// ─────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────

function extractTypography(decls) {
  const fontSizes     = new Map();
  const lineHeights   = new Map();
  const letterSpacings = new Map();
  const fontWeights   = new Map();
  const fontFamilies  = new Map();

  for (const { property, value } of decls) {
    let v = value.trim();

    // Handle var() fallback
    if (v.startsWith('var(')) {
      const fallback = extractVarFallback(v);
      if (fallback) v = fallback;
      else continue;
    }

    const inc = (map, key, ctx) => {
      if (map.has(key)) map.get(key).occurrences++;
      else map.set(key, { value: key, occurrences: 1, context: ctx || null });
    };

    switch (property) {
      case 'font-size':     inc(fontSizes,      v, null);   break;
      case 'line-height':   inc(lineHeights,    v, null);   break;
      case 'letter-spacing':inc(letterSpacings, v, null);   break;
      case 'font-weight':   inc(fontWeights,    v, null);   break;
      case 'font-family': {
        const family = v.split(',')[0].replace(/['"]/g, '').trim();
        inc(fontFamilies, family, null);
        break;
      }
    }
  }

  // Add context hints for font-sizes
  const sizeList = [...fontSizes.values()].sort((a, b) => {
    const pa = parseFloat(a.value) || 0;
    const pb = parseFloat(b.value) || 0;
    return pb - pa;
  });
  const contexts = ['H1', 'H2', 'H3', 'H4', 'H5', 'Body', 'Small', 'XSmall'];
  sizeList.forEach((s, i) => { s.context = contexts[i] || null; });

  return {
    font_families:  [...fontFamilies.values()],
    font_sizes:     sizeList,
    line_heights:   [...lineHeights.values()].sort((a, b) => b.occurrences - a.occurrences),
    letter_spacings:[...letterSpacings.values()],
    font_weights:   [...fontWeights.values()].sort((a, b) => b.occurrences - a.occurrences),
  };
}

// ─────────────────────────────────────────────
// SPACING
// ─────────────────────────────────────────────

function expandShorthand4(val) {
  const parts = val.trim().split(/\s+/);
  switch (parts.length) {
    case 1: return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    case 2: return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    case 3: return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    case 4: return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    default:return {};
  }
}

function extractSpacing(decls) {
  const paddings     = new Map();
  const margins      = new Map();
  const gaps         = new Map();
  const borderRadii  = new Map();
  const maxWidths    = new Map();

  const inc = (map, val, extra) => {
    if (map.has(val)) map.get(val).occurrences++;
    else map.set(val, { value: val, occurrences: 1, ...extra });
  };

  for (const { property, value } of decls) {
    let v = value.trim();

    // Handle var() fallback
    if (v.startsWith('var(')) {
      const fallback = extractVarFallback(v);
      if (fallback) v = fallback;
      else continue;
    }

    switch (property) {
      case 'padding': {
        const parts = expandShorthand4(v);
        inc(paddings, v, parts);
        break;
      }
      case 'padding-top': case 'padding-right': case 'padding-bottom': case 'padding-left':
        // record individual as part of "paddings" context
        break;
      case 'margin': {
        const parts = expandShorthand4(v);
        inc(margins, v, parts);
        break;
      }
      case 'gap': case 'row-gap': case 'column-gap':
        inc(gaps, v, {});
        break;
      case 'border-radius':
        inc(borderRadii, v, {});
        break;
      case 'max-width':
        inc(maxWidths, v, {});
        break;
    }
  }

  const sort = map => [...map.values()].sort((a, b) => b.occurrences - a.occurrences);
  return {
    paddings:     sort(paddings),
    margins:      sort(margins),
    gaps:         sort(gaps),
    border_radii: sort(borderRadii),
    max_widths:   sort(maxWidths),
  };
}

// ─────────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────────

function extractLayout(decls) {
  const flexDirs       = new Map();
  const justifyContent = new Map();
  const alignItems     = new Map();
  const displays       = new Map();

  const inc = (map, val) => {
    map.has(val) ? map.get(val).occurrences++ : map.set(val, { value: val, occurrences: 1 });
  };

  for (const { property, value } of decls) {
    let v = value.trim();

    // Handle var() fallback
    if (v.startsWith('var(')) {
      const fallback = extractVarFallback(v);
      if (fallback) v = fallback;
      else continue;
    }
    switch (property) {
      case 'flex-direction':   inc(flexDirs,       v); break;
      case 'justify-content':  inc(justifyContent, v); break;
      case 'align-items':      inc(alignItems,     v); break;
      case 'display':          inc(displays,       v); break;
    }
  }

  const sort = map => [...map.values()].sort((a, b) => b.occurrences - a.occurrences);
  return {
    displays:        sort(displays),
    flex_directions: sort(flexDirs),
    justify_content: sort(justifyContent),
    align_items:     sort(alignItems),
  };
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

let cssContent = '';
let sourcePath = '';

let htmlContent = '';

if (args.html) {
  if (!fs.existsSync(args.html)) {
    process.stderr.write(`Error: HTML file not found: ${args.html}\n`);
    process.exit(2);
  }
  log('Reading HTML:', args.html);
  htmlContent = fs.readFileSync(args.html, 'utf8');
  cssContent = extractCssFromHtml(htmlContent);
  sourcePath = args.html;
  log(`  Extracted ${cssContent.length} chars of CSS from style blocks`);
} else if (args.css) {
  if (!fs.existsSync(args.css)) {
    process.stderr.write(`Error: CSS file not found: ${args.css}\n`);
    process.exit(2);
  }
  log('Reading CSS file:', args.css);
  cssContent = fs.readFileSync(args.css, 'utf8');
  sourcePath = args.css;
}

// Parse font-faces
const fonts = parseFontFaces(cssContent);
log(`  Found ${fonts.length} font families`);

// Parse all rule declarations
let decls = parseRuleDeclarations(cssContent);

// If HTML source, also extract inline styles
if (htmlContent) {
  const inlineDecls = extractInlineStyles(htmlContent);
  log(`  Extracted ${inlineDecls.length} inline style declarations`);
  decls = decls.concat(inlineDecls);
}

log(`  Parsed ${decls.length} CSS declarations total`);

// Extract per category
const colors     = extractColors(decls);
const typography = extractTypography(decls);
const spacing    = extractSpacing(decls);
const layout     = extractLayout(decls);
const cssVars    = extractCssVariables(decls);
log(`  Found ${cssVars.length} CSS variables`);

// Guard: if no colors at all, warn
if (colors.unique.length === 0) {
  process.stderr.write('⚠ Warning: No colors found. CSS may be empty or use only CSS variables.\n');
}
if (fonts.length === 0) {
  process.stderr.write('⚠ Warning: No @font-face declarations found. Fonts may be in a separate file.\n');
}

// Build summary
const totalRules = new Set(decls.map(d => d.selector)).size;
const result = {
  source:       sourcePath,
  extracted_at: new Date().toISOString(),
  fonts,
  colors,
  typography,
  spacing,
  layout,
  css_variables: cssVars,
  summary: {
    total_rules:          totalRules,
    unique_colors:        colors.unique.length,
    semi_transparent:     colors.semi_transparent.length,
    unique_font_families: fonts.length,
    unique_font_sizes:    typography.font_sizes.length,
    unique_spacing_values:
      spacing.paddings.length + spacing.gaps.length + spacing.border_radii.length,
    css_variables:        cssVars.length,
  },
};

// ─────────────────────────────────────────────
// OUTPUT
// ─────────────────────────────────────────────

const output = JSON.stringify(result, null, 2);

if (args.output) {
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, output, 'utf8');
  process.stderr.write(`Saved to ${args.output}\n`);
} else {
  process.stdout.write(output + '\n');
}

const hasErrors   = colors.unique.length === 0;
const hasWarnings = fonts.length === 0;

process.stderr.write([
  `✓ ${fonts.length} font families`,
  `✓ ${colors.unique.length} unique colors`,
  `✓ ${typography.font_sizes.length} font sizes`,
  `✓ ${spacing.paddings.length + spacing.gaps.length + spacing.border_radii.length} spacing values`,
].join(', ') + '\n');

process.exit(hasErrors ? 2 : hasWarnings ? 1 : 0);
