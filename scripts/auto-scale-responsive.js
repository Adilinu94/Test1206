#!/usr/bin/env node
/**
 * Intelligent Responsive Auto-Scaling (Anti-Slop)
 * 
 * Injiziert automatisch Mobile/Tablet-Varianten für Typography und Spacing,
 * wenn Desktop-Werte bestimmte Schwellenwerte überschreiten.
 * Verhindert, dass mobile Ansichten standardmäßig zerbrechen (Browser skaliert px nicht automatisch).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWrappedSizeNumber, scaleWrappedSize } from './lib/framer-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// RC-19 + RC-14 Fix: Extended thresholds and properties for comprehensive responsive scaling.
// V4 enforces strict breakpoint management; Framer's absolute px values must be
// scaled to avoid broken mobile layouts. RC-14 adds gap, grid-columns, and border-radius.
const THRESHOLDS = {
  fontSize: 28,     // px
  padding: 20,      // px
  margin: 20,       // px
  widthPx: 300,     // px -- wide desktop elements break mobile viewports
  heightPx: 200,    // px -- tall desktop sections need mobile scaling
  minHeightPx: 200, // px
  letterSpacing: 2, // px
  gap: 24,          // px -- RC-14: large gaps break mobile layouts
  borderRadius: 12, // px -- RC-14: large border radii look out of place on mobile
};

// C5: Skalierungsfaktoren — werden aus breakpoints.json geladen wenn verfuegbar
// Fallback: Pauschalfaktoren fuer den Fall ohne breakpoints.json
const DEFAULT_SCALE_FACTORS = {
  tablet: 0.75,
  mobile: 0.6,
};

let breakpointsData = null;

function getPxValue(wrapped) {
  return getWrappedSizeNumber(wrapped) ?? NaN;
}

function getElementScaleFactors(elementId, styleId) {
  if (!breakpointsData) return { ...DEFAULT_SCALE_FACTORS };

  const node = (breakpointsData.nodes || []).find(n =>
    (n.selector && (n.selector.includes(elementId) || n.selector.includes(styleId))) ||
    (n.name && (n.name.includes(elementId) || n.name.includes(styleId)))
  );

  if (!node?.variants) return { ...DEFAULT_SCALE_FACTORS };

  const base = node.variants.find(v => !v.meta?.breakpoint || v.meta?.breakpoint === null)?.props || {};
  const tabletV = node.variants.find(v => v.meta?.breakpoint === 'tablet')?.props || {};
  const mobileV = node.variants.find(v => v.meta?.breakpoint === 'mobile')?.props || {};

  const baseFs = getPxValue(base['font-size']);
  if (baseFs && baseFs > 0) {
    const tabletPx = getPxValue(tabletV['font-size']);
    const mobilePx = getPxValue(mobileV['font-size']);
    return {
      tablet: isNaN(tabletPx) ? DEFAULT_SCALE_FACTORS.tablet : tabletPx / baseFs,
      mobile: isNaN(mobilePx) ? DEFAULT_SCALE_FACTORS.mobile : mobilePx / baseFs,
    };
  }

  return { ...DEFAULT_SCALE_FACTORS };
}

function walkTree(obj, callback) {
  if (typeof obj !== 'object' || obj === null) return;
  callback(obj);
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      walkTree(obj[key], callback);
    }
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function scaleDimensions(dimensions, factor) {
  if (!dimensions || dimensions['$$type'] !== 'dimensions') return dimensions;
  const value = {};
  for (const [side, wrapped] of Object.entries(dimensions.value || {})) {
    value[side] = scaleWrappedSize(wrapped, factor);
  }
  return { ...dimensions, value };
}

function scaleProp(prop, value, factor) {
  if (prop === 'font-size') return scaleWrappedSize(value, factor);
  if (prop === 'padding' || prop === 'margin') return scaleDimensions(value, factor);
  if (prop.includes('padding') || prop.includes('margin') || prop === 'gap') return scaleWrappedSize(value, factor);
  // RC-19 Fix: Scale width/height/min-height/letter-spacing for responsive breakpoints
  if (prop === 'width' || prop === 'height' || prop === 'min-height' || prop === 'letter-spacing') {
    return scaleWrappedSize(value, factor);
  }
  // RC-14 Fix: Scale border-radius for responsive breakpoints
  if (prop === 'border-radius') return scaleWrappedSize(value, factor);
  // RC-14 Fix: Handle grid-template-columns — collapse multi-column grids responsively.
  // Tablet (factor ~0.75): half columns. Mobile (factor ~0.6): single column.
  if (prop === 'grid-template-columns') {
    if (value && value['$$type'] === 'string') {
      const cols = String(value.value || '').trim();
      const parts = cols.split(/\s+/);
      if (parts.length >= 2) {
        // Tablet: half the columns (min 1). Mobile: full collapse to 1fr.
        const targetCols = factor > 0.65 ? Math.max(1, Math.floor(parts.length / 2)) : 1;
        const newValue = targetCols === 1 ? '1fr' : Array(targetCols).fill('1fr').join(' ');
        return { ...value, value: newValue };
      }
    }
    return cloneJson(value);
  }
  return cloneJson(value);
}

function propNeedsScaling(prop, value) {
  // RC-19 Fix: Extended responsive scaling for all dimension properties
  if (prop === 'font-size' || prop === 'letter-spacing') {
    const size = getWrappedSizeNumber(value);
    if (prop === 'font-size') return size !== null && size > THRESHOLDS.fontSize;
    if (prop === 'letter-spacing') return size !== null && size > THRESHOLDS.letterSpacing;
  }
  if (prop === 'padding' || prop === 'margin') {
    const sides = Object.values(value?.value || {});
    return sides.some(side => {
      const size = getWrappedSizeNumber(side);
      return size !== null && size > THRESHOLDS.padding;
    });
  }
  if (prop.includes('padding') || prop.includes('margin') || prop === 'gap') {
    const size = getWrappedSizeNumber(value);
    if (prop === 'gap') return size !== null && size > THRESHOLDS.gap;
    return size !== null && size > THRESHOLDS.padding;
  }
  // RC-19: Auto-scale width/height/min-height for responsive breakpoints
  if (prop === 'width' || prop === 'height' || prop === 'min-height') {
    const size = getWrappedSizeNumber(value);
    if (size === null) return false;
    if (prop === 'width') return size > THRESHOLDS.widthPx;
    if (prop === 'height') return size > THRESHOLDS.heightPx;
    if (prop === 'min-height') return size > THRESHOLDS.minHeightPx;
  }
  // RC-14: Auto-scale border-radius for responsive breakpoints
  if (prop === 'border-radius') {
    const size = getWrappedSizeNumber(value);
    return size !== null && size > THRESHOLDS.borderRadius;
  }
  // RC-14: Grid-template-columns always need responsive scaling.
  // Tablet: only trigger for 3+ columns. Mobile: trigger for 2+ columns.
  if (prop === 'grid-template-columns') {
    if (value && value['$$type'] === 'string') {
      const cols = String(value.value || '').trim().split(/\s+/);
      // Tablet (factor ~0.75): scale 3+ column grids. Mobile (~0.6): scale 2+ column grids.
      return cols.length >= (factor > 0.65 ? 3 : 2);
    }
    return false;
  }
  return false;
}

function findBaseVariant(style) {
  if (Array.isArray(style.variants)) {
    return style.variants.find(v => v?.meta?.breakpoint === null) || style.variants[0];
  }
  if (style.props) {
    return { meta: { breakpoint: null, state: null }, props: style.props };
  }
  return null;
}

function hasBreakpoint(style, breakpoint) {
  return (style.variants || []).some(v => v?.meta?.breakpoint === breakpoint);
}

function buildScaledVariant(baseVariant, breakpoint, factor) {
  const props = {};
  for (const [prop, value] of Object.entries(baseVariant.props || {})) {
    if (propNeedsScaling(prop, value)) props[prop] = scaleProp(prop, value, factor);
  }
  if (Object.keys(props).length === 0) return null;
  return { meta: { breakpoint, state: baseVariant.meta?.state ?? null }, props };
}

function autoScaleResponsive(tree) {
  let modifiedCount = 0;

  walkTree(tree, (node) => {
    if (node && node.styles && typeof node.styles === 'object') {
      for (const styleId in node.styles) {
        const style = node.styles[styleId];
        const baseVariant = findBaseVariant(style);
        if (!baseVariant?.props) continue;

        // C5: Element-spezifische Breakpoint-Faktoren
        const factors = getElementScaleFactors(node.id || styleId, styleId);

        const newVariants = [];

        if (!hasBreakpoint(style, 'tablet')) {
          const tablet = buildScaledVariant(baseVariant, 'tablet', factors.tablet);
          if (tablet) newVariants.push(tablet);
        }
        if (!hasBreakpoint(style, 'mobile')) {
          const mobile = buildScaledVariant(baseVariant, 'mobile', factors.mobile);
          if (mobile) newVariants.push(mobile);
        }

        if (newVariants.length > 0) {
          style.variants = [...(style.variants || []), ...newVariants];
          modifiedCount++;
        }
      }
    }
  });

  return { tree, modifiedCount };
}

async function main() {
  const cliArgs = (() => {
    const a = { tree: null, output: null, breakpoints: null };
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--tree'   && argv[i+1]) { a.tree   = argv[++i]; }
      else if (argv[i] === '--output' && argv[i+1]) { a.output = argv[++i]; }
      else if (argv[i] === '--breakpoints' && argv[i+1]) { a.breakpoints = argv[++i]; }
      else if (!argv[i].startsWith('--') && !a.tree)   { a.tree   = argv[i]; }
      else if (!argv[i].startsWith('--') && !a.output) { a.output = argv[i]; }
    }
    return a;
  })();
  const treePath   = cliArgs.tree   || path.join(rootDir, 'v4-tree.json');
  const outputPath = cliArgs.output || treePath;

  // C5: Load breakpoints.json for element-specific scale factors
  if (cliArgs.breakpoints && fs.existsSync(cliArgs.breakpoints)) {
    breakpointsData = JSON.parse(fs.readFileSync(cliArgs.breakpoints, 'utf8'));
    console.log(`📐 Breakpoint-Daten geladen: ${(breakpointsData.nodes || []).length} Selectoren`);
  }

  if (!fs.existsSync(treePath)) {
    console.error(`Datei nicht gefunden: ${treePath}`);
    process.exit(1);
  }

  console.log(`▶️  Lade Tree von: ${treePath}`);
  const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));

  console.log('▶️  Führe intelligente Responsive Auto-Skalierung durch...');
  const result = autoScaleResponsive(tree);

  console.log(`✅ ${result.modifiedCount} Style-Blöcke mit automatischen Mobile/Tablet-Varianten erweitert.`);
  
  fs.writeFileSync(outputPath, JSON.stringify(result.tree, null, 2), 'utf8');
  console.log(`💾 Gespeichert unter: ${outputPath}`);
}

main();
