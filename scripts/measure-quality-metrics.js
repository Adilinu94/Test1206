#!/usr/bin/env node
/**
 * measure-quality-metrics.js  —  Sprint 8: Quality Metrics Measurement (ENH-13)
 *
 * Misst DOM-Tiefe, GC-Coverage, GV-Substitution, Grid-Nutzung und Component-Count
 * aus einem V4 Widget Tree und vergleicht mit den ROADMAP-Zielwerten.
 *
 * USAGE:
 *   node scripts/measure-quality-metrics.js <v4-tree.json> [--output report.json]
 *   node scripts/measure-quality-metrics.js <v4-tree.json> --compare
 *
 * METRICS:
 *   DOM-Tiefe          Max Nesting-Tiefe (Ziel: ≤3)
 *   GC-Coverage        % der Styles mit gc- Prefix (Ziel: ≥90%)
 *   GV-Substitution    % der Farben/Schriften als GV-Referenz (Ziel: ≥95%)
 *   Grid-Nutzung       % der Container als e-div-block (Ziel: ≥35%)
 *   Components         Anzahl e-component Widgets (Ziel: ≥10)
 *   Total Elements     Gesamtzahl V4-Elemente im Tree
 */

import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values: args, positionals } = parseArgs({
  options: {
    output:  { type: 'string' },
    compare: { type: 'boolean', default: false },
    help:    { type: 'boolean', default: false },
  },
  allowPositionals: true,
  strict: false,
});

// ── HELP ──────────────────────────────────────────────────────────
if (args.help || positionals.length < 1) {
  console.log(`measure-quality-metrics.js — ENH-13 Quality Metrics

USAGE:
  node scripts/measure-quality-metrics.js <v4-tree.json> [--output report.json]
  node scripts/measure-quality-metrics.js <v4-tree.json> --compare

METRICS:
  DOM-Tiefe          Max Nesting-Tiefe (Ziel: ≤3)
  GC-Coverage        % der Styles mit gc- Prefix (Ziel: ≥90%)
  GV-Substitution    % der Farben/Schriften als GV-Referenz (Ziel: ≥95%)
  Grid-Nutzung       % der Container als e-div-block (Ziel: ≥35%)
  Components         Anzahl e-component Widgets (Ziel: ≥10)
  Total Elements     Gesamtzahl V4-Elemente im Tree
`);
  process.exit(args.help ? 0 : 2);
}

const treePath = positionals[0];
if (!fs.existsSync(treePath)) {
  console.error(`Error: File not found: ${treePath}`);
  process.exit(2);
}

let tree;
try {
  tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
} catch (e) {
  console.error(`Error: Could not parse ${treePath}: ${e.message}`);
  process.exit(2);
}

// ── METRIC CALCULATION ────────────────────────────────────────────

/**
 * Calculate maximum nesting depth in the widget tree.
 * @param {object} node - Tree node
 * @param {number} depth - Current depth
 * @returns {number} Max depth found
 */
function calcMaxDepth(node, depth = 0) {
  let max = depth;
  for (const child of (node.elements || node.children || [])) {
    max = Math.max(max, calcMaxDepth(child, depth + 1));
  }
  return max;
}

/**
 * Count all elements and analyze style properties.
 * @param {object} node - Tree node
 * @param {object} counter - Accumulator
 * @returns {object} Updated counter
 */
function countAll(node, counter = { total: 0, grid: 0, gcStyles: 0, totalStyles: 0, gvColors: 0, totalColors: 0, gvFonts: 0, totalFonts: 0, components: 0 }) {
  counter.total++;

  if (node.widgetType === 'e-div-block') counter.grid++;
  if (node.widgetType === 'e-component') counter.components++;

  // Style analysis
  for (const [key, style] of Object.entries(node.styles || {})) {
    counter.totalStyles++;
    if (key.startsWith('gc-')) counter.gcStyles++;

    for (const variant of (style.variants || [])) {
      for (const [prop, val] of Object.entries(variant.props || {})) {
        // GV color detection
        if (val?.['$$type'] === 'global-color-variable') {
          counter.gvColors++;
          counter.totalColors++;
        } else if (
          val?.['$$type'] === 'color' ||
          (typeof val === 'string' && (val.startsWith('#') || val.startsWith('rgb')))
        ) {
          counter.totalColors++;
        }
        // GV font detection
        if (val?.['$$type'] === 'global-font-variable') {
          counter.gvFonts++;
          counter.totalFonts++;
        } else if (prop === 'font-family') {
          counter.totalFonts++;
        }
      }
    }
  }

  for (const child of (node.elements || node.children || [])) {
    countAll(child, counter);
  }

  return counter;
}

const maxDepth = calcMaxDepth(tree);
const counts = countAll(tree);

const gcCoverage = counts.totalStyles > 0 ? Math.round((counts.gcStyles / counts.totalStyles) * 100) : 0;
const gvColorCoverage = counts.totalColors > 0 ? Math.round((counts.gvColors / counts.totalColors) * 100) : 0;
const gvFontCoverage = counts.totalFonts > 0 ? Math.round((counts.gvFonts / counts.totalFonts) * 100) : 0;
const gridUsage = counts.total > 0 ? Math.round((counts.grid / counts.total) * 100) : 0;

const report = {
  generated: new Date().toISOString(),
  source: treePath,
  metrics: {
    dom_depth: { value: maxDepth, target: '≤3', status: maxDepth <= 3 ? 'OK' : maxDepth <= 5 ? 'WARN' : 'FAIL' },
    gc_coverage: { value: gcCoverage, unit: '%', target: '≥90%', status: gcCoverage >= 90 ? 'OK' : gcCoverage >= 70 ? 'WARN' : 'FAIL' },
    gv_color_substitution: { value: gvColorCoverage, unit: '%', target: '≥95%', status: gvColorCoverage >= 95 ? 'OK' : gvColorCoverage >= 80 ? 'WARN' : 'FAIL' },
    gv_font_substitution: { value: gvFontCoverage, unit: '%', target: '≥95%', status: gvFontCoverage >= 95 ? 'OK' : gvFontCoverage >= 80 ? 'WARN' : 'FAIL' },
    grid_usage: { value: gridUsage, unit: '%', target: '≥35%', status: gridUsage >= 35 ? 'OK' : gridUsage >= 15 ? 'WARN' : 'FAIL' },
    components: { value: counts.components, target: '≥10', status: counts.components >= 10 ? 'OK' : counts.components >= 3 ? 'WARN' : 'FAIL' },
    total_elements: { value: counts.total },
  },
  summary: {
    ok: 0, warn: 0, fail: 0,
  },
};

for (const [, m] of Object.entries(report.metrics)) {
  if (m.status) report.summary[m.status.toLowerCase()]++;
}

const output = JSON.stringify(report, null, 2);
if (args.output) {
  fs.writeFileSync(args.output, output, 'utf8');
  console.error(`[metrics] Report saved to ${args.output}`);
} else {
  console.log(output);
}

if (args.compare) {
  console.error(`\n[Metrics] DOM: ${maxDepth} (target ≤3) | GC: ${gcCoverage}% (target ≥90%) | GV-Color: ${gvColorCoverage}% (target ≥95%) | GV-Font: ${gvFontCoverage}% (target ≥95%) | Grid: ${gridUsage}% (target ≥35%) | Components: ${counts.components} (target ≥10)`);
}

process.exit(0);
