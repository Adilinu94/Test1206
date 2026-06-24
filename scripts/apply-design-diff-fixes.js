#!/usr/bin/env node
/**
 * apply-design-diff-fixes.js — Design-Diff → CSS Auto-Fix Generator
 *
 * Liest einen design-diff JSON-Report (von scripts/design-diff.js) und
 * generiert automatisch CSS-Korrekturen, um die Lücke zwischen der
 * Framer-Vorlage und der Elementor-Konvertierung zu schließen.
 *
 * ARCHITEKTUR:
 *   1. Parse design-diff JSON → priorisierte Issues
 *   2. Generiere CSS-Regeln pro Kategorie (colors, typography, spacing,
 *      layout, visual)
 *   3. Output: stdout (default), File (--output), MCP-Inject (--inject)
 *
 * USAGE:
 *   # CSS generieren und auf stdout ausgeben:
 *   node scripts/apply-design-diff-fixes.js --report reports/design-diff-real.json
 *
 *   # CSS in Datei speichern:
 *   node scripts/apply-design-diff-fixes.js --report reports/design-diff-real.json --output fixes.css
 *
 *   # CSS direkt auf WordPress injecten:
 *   node scripts/apply-design-diff-fixes.js --report reports/design-diff-real.json --inject --post-id 123
 *
 *   # Dry-run: nur Analyse, kein CSS:
 *   node scripts/apply-design-diff-fixes.js --report reports/design-diff-real.json --dry-run
 *
 *   # Nur FAIL-Severity fixen (strenger):
 *   node scripts/apply-design-diff-fixes.js --report ... --min-severity FAIL
 *
 * EXIT CODES: 0 = success, 1 = warnings, 2 = error
 */

'use strict';

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateColorFixes,
  generateTypographyFixes,
  generateSpacingFixes,
  generateLayoutFixes,
  generateVisualFixes,
} from './lib/apply-fix-css-generators.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI ──────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    report:           { type: 'string' },
    output:           { type: 'string' },
    'post-id':        { type: 'string' },
    inject:           { type: 'boolean', default: false },
    'dry-run':        { type: 'boolean', default: false },
    'min-severity':   { type: 'string', default: 'WARN' },
    'target-selector':{ type: 'string', default: '.e-con' },
    verbose:          { type: 'boolean', default: false },
    help:             { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  showHelp();
  process.exit(0);
}

if (!args.report) {
  console.error('Error: --report <pfad> required');
  process.exit(2);
}

if (!existsSync(args.report)) {
  console.error(`Error: Report nicht gefunden: ${args.report}`);
  process.exit(2);
}

if (args.inject && !args['post-id'] && !args['dry-run']) {
  console.error('Error: --inject requires --post-id <id>');
  process.exit(2);
}

const MIN_SEVERITY = args['min-severity'].toUpperCase();
if (!['FAIL', 'WARN', 'PASS'].includes(MIN_SEVERITY)) {
  console.error(`Error: --min-severity must be PASS, WARN, or FAIL (got: ${MIN_SEVERITY})`);
  process.exit(2);
}

const TARGET_SELECTOR = args['target-selector'];
const REPORT_PATH = args.report;
const OUTPUT_PATH = args.output ? resolve(args.output) : null;
const POST_ID = args['post-id'] ? parseInt(args['post-id'], 10) : null;
const INJECT = args.inject;
const DRY_RUN = args['dry-run'];

const log  = (...m) => { if (args.verbose) process.stderr.write('[apply-fix] ' + m.join(' ') + '\n'); };
const info = (...m) => process.stderr.write('[apply-fix] ' + m.join(' ') + '\n');
const warn = (...m) => process.stderr.write('[WARN] ' + m.join(' ') + '\n');

// ─── SEVERITY ORDER ──────────────────────────────────────────────────────────

const SEVERITY_RANK = { FAIL: 3, WARN: 2, PASS: 1, SKIP: 0 };

function shouldFix(severity) {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[MIN_SEVERITY];
}

// ─── CSS GENERATION PER CATEGORY ─────────────────────────────────────────────

/**
 * Generates CSS for a color diff entry.
 * Strategies:
 *  - Inject missing Framer colors as CSS custom properties
 *  - Override text colors if match_pct < 50
 */
function generateColorFixes(diff) {
  const lines = [];
  const textColors = diff.text_colors || {};
  const bgColors = diff.background_colors || {};

  // Text color variables for missing Framer colors
  const missingText = textColors.only_in_framer || [];
  if (missingText.length > 0) {
    lines.push(`  /* Missing Framer text colors (${missingText.length}) */`);
    missingText.forEach((color, i) => {
      lines.push(`  --framer-missing-text-${i + 1}: ${color};`);
    });
  }

  // Background color variables
  const missingBg = bgColors.only_in_framer || [];
  if (missingBg.length > 0) {
    lines.push(`  /* Missing Framer background colors (${missingBg.length}) */`);
    missingBg.forEach((color, i) => {
      lines.push(`  --framer-missing-bg-${i + 1}: ${color};`);
    });
  }

  // If text color match is very low, suggest overriding heading/body colors
  if (textColors.match_pct !== undefined && textColors.match_pct < 40) {
    lines.push(`  /* ⚠ WARNING: Low text color match (${textColors.match_pct}%). */`);
    lines.push(`  /* Overriding ALL text colors on this selector. Review manually or use --min-severity PASS to skip. */`);
    if (missingText[0]) {
      lines.push(`  color: ${missingText[0]};`);
    }
  }

  // If background color match is low
  if (bgColors.match_pct !== undefined && bgColors.match_pct < 50) {
    lines.push(`  /* Low background color match (${bgColors.match_pct}%). */`);
    if (missingBg[0]) {
      lines.push(`  background-color: ${missingBg[0]};`);
    }
  }

  return lines;
}

/**
 * Generates CSS for typography diffs.
 * Strategies:
 *  - Font-size correction based on diff_pct
 *  - Font-weight injection for missing weights
 *  - Line-height override
 *  - Font-family import suggestion (via @import comment)
 */
function generateTypographyFixes(diff) {
  const lines = [];
  const fonts = diff.fonts || {};
  const fontSize = diff.font_size || {};
  const fontWeight = diff.font_weight || {};
  const lineHeight = diff.line_height || {};

  // Missing font families → suggest @import
  const missingFonts = fonts.only_in_framer || [];
  if (missingFonts.length > 0) {
    lines.push(`  /* Missing font families. Add to your Google Fonts import: */`);
    const googleFontNames = missingFonts.map(f => f.replace(/\s+/g, '+')).join('&family=');
    lines.push(`  /* @import url('https://fonts.googleapis.com/css2?family=${googleFontNames}&display=swap'); */`);
    lines.push(`  font-family: ${missingFonts.map(f => `'${f}'`).join(', ')}, sans-serif;`);
  }

  // Font-size correction
  if (fontSize.diff_pct !== undefined && fontSize.diff_pct > 10) {
    const framerSize = fontSize.framer_median || 16;
    const elSize = fontSize.elementor_median || 16;
    if (framerSize && elSize && framerSize !== elSize) {
      const ratio = framerSize / elSize;
      if (isNaN(ratio) || ratio > 1.3 || ratio < 0.7) {
        // Big difference or NaN — set absolute
        lines.push(`  /* Font-size diff ${fontSize.diff_pct}%: ${elSize}px → ${framerSize}px */`);
        lines.push(`  font-size: ${framerSize}px;`);
      } else {
        // Small difference — use scale for relative adjustment
        const pct = Math.round(ratio * 100);
        lines.push(`  /* Font-size diff ${fontSize.diff_pct}%: scaling by ${pct}% */`);
        lines.push(`  font-size: calc(1em * ${ratio.toFixed(2)});`);
      }
    }
  }

  // Font-weight injection
  const missingWeights = fontWeight.missing_in_elementor || [];
  if (missingWeights.length > 0) {
    lines.push(`  /* Missing font-weights: ${missingWeights.join(', ')} */`);
    missingWeights.forEach(w => {
      lines.push(`  /* To apply weight ${w}, add class or target element: font-weight: ${w}; */`);
    });
  }

  // Line-height override
  if (lineHeight.diff_pct !== undefined && lineHeight.diff_pct > 15) {
    const framerLh = lineHeight.framer_median;
    const elLh = lineHeight.elementor_median;
    if (framerLh && elLh) {
      lines.push(`  /* Line-height diff ${lineHeight.diff_pct}%: ${elLh}px → ${framerLh}px */`);
      lines.push(`  line-height: ${framerLh}px;`);
    }
  }

  return lines;
}

/**
 * Generates CSS for spacing diffs.
 */
function generateSpacingFixes(diff) {
  const lines = [];
  const padding = diff.padding || {};
  const margin = diff.margin || {};

  if (padding.diff_pct !== undefined && padding.diff_pct > 10) {
    if (padding.framer_median != null) {
      lines.push(`  /* Padding diff ${padding.diff_pct}%: override to Framer median */`);
      lines.push(`  padding: ${padding.framer_median}px;`);
    }
  }

  if (margin.diff_pct !== undefined && margin.diff_pct > 20) {
    if (margin.framer_median != null) {
      lines.push(`  /* Margin diff ${margin.diff_pct}%: override to Framer median */`);
      lines.push(`  margin: ${margin.framer_median}px;`);
    } else if (margin.elementor_median != null && margin.elementor_median > 0) {
      // Framer has no margin, Elementor added one → remove it
      lines.push(`  /* Margin diff ${margin.diff_pct}%: Elementor added margin where Framer has none */`);
      lines.push(`  margin: 0;`);
    }
  }

  return lines;
}

/**
 * Generates CSS for layout diffs.
 */
function generateLayoutFixes(diff) {
  const lines = [];
  const container = diff.container || {};

  if (container.width_diff_pct !== undefined && container.width_diff_pct > 5) {
    if (container.framer_width != null) {
      lines.push(`  /* Container width diff ${container.width_diff_pct}% */`);
      lines.push(`  width: ${container.framer_width}px;`);
    }
  }

  if (container.max_width_diff_pct !== undefined && container.max_width_diff_pct > 5) {
    if (container.framer_max_width != null) {
      lines.push(`  /* Max-width diff ${container.max_width_diff_pct}% */`);
      lines.push(`  max-width: ${container.framer_max_width}px;`);
    } else if (container.elementor_max_width == null && container.framer_width != null) {
      // Both null → set an explicit max-width
      lines.push(`  /* Set explicit max-width (both null in source) */`);
      lines.push(`  max-width: ${container.framer_width}px;`);
    }
  }

  return lines;
}

/**
 * Generates CSS for visual diffs.
 */
function generateVisualFixes(diff) {
  const lines = [];
  const borderColors = diff.border_colors || {};
  const borderRadius = diff.border_radius || {};
  const shadows = diff.shadows || {};

  // Missing border colors as CSS variables
  const missingBorders = borderColors.only_in_framer || [];
  if (missingBorders.length > 0) {
    lines.push(`  /* Missing Framer border colors (${missingBorders.length}) */`);
    missingBorders.forEach((color, i) => {
      lines.push(`  --framer-missing-border-${i + 1}: ${color};`);
    });
  }

  // Border-radius override
  if (borderRadius.diff_pct !== undefined && borderRadius.diff_pct > 20) {
    if (borderRadius.framer_median != null) {
      lines.push(`  /* Border-radius diff ${borderRadius.diff_pct}%: ${borderRadius.elementor_median || '?'}px → ${borderRadius.framer_median}px */`);
      lines.push(`  border-radius: ${borderRadius.framer_median}px;`);
    }
  }

  // Box-shadow
  if (shadows.framer_count !== undefined && shadows.elementor_count !== undefined) {
    if (shadows.framer_count === 0 && shadows.elementor_count > 0) {
      lines.push(`  /* Elementor has box-shadow, Framer has none */`);
      lines.push(`  box-shadow: none;`);
    }
  }

  return lines;
}

// ─── MAIN CSS GENERATION ─────────────────────────────────────────────────────

/**
 * Generates a complete CSS string from a design-diff report.
 *
 * @param {object} report - Parsed design-diff JSON
 * @returns {{ css: string, summary: object }}
 */
function generateCssFromReport(report) {
  const diffs = report.diff || [];
  const blocks = [];
  const summary = { categories: {}, total_fixes: 0, fixable: 0, skipped: 0 };

  // Sort diffs: FAIL first, then WARN, then by biggest diff_pct
  const sorted = [...diffs]
    .filter(d => shouldFix(d.severity))
    .sort((a, b) => {
      const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (sevDiff !== 0) return sevDiff;
      // Secondary: biggest problem first (get max diff_pct from each)
      const aMax = maxDiffPct(a);
      const bMax = maxDiffPct(b);
      return bMax - aMax;
    });

  for (const diff of sorted) {
    const rules = [];

    switch (diff.category) {
      case 'colors':
        rules.push(...generateColorFixes(diff));
        break;
      case 'typography':
        rules.push(...generateTypographyFixes(diff));
        break;
      case 'spacing':
        rules.push(...generateSpacingFixes(diff));
        break;
      case 'layout':
        rules.push(...generateLayoutFixes(diff));
        break;
      case 'visual':
        rules.push(...generateVisualFixes(diff));
        break;
    }

    if (rules.length > 0) {
      const block = [
        `/* ══════════════════════════════════════════════════════════ */`,
        `/* CATEGORY: ${diff.category.toUpperCase()}  [${diff.severity}]  (score: ${report.meta?.category_scores?.[diff.category] || '?'}) */`,
        `/* ══════════════════════════════════════════════════════════ */`,
        `${TARGET_SELECTOR} {`,
        ...rules,
        `}`,
      ].join('\n');
      blocks.push(block);
      summary.categories[diff.category] = { severity: diff.severity, rules: rules.length };
      summary.fixable++;
    } else {
      summary.categories[diff.category] = { severity: diff.severity, rules: 0, note: 'no actionable diff data' };
      summary.skipped++;
    }
  }

  // Count unfixable (skipped due to severity filter)
  const unfixed = diffs.filter(d => !shouldFix(d.severity));
  summary.skipped += unfixed.length;
  summary.total_fixes = summary.fixable + summary.skipped;
  summary.original_score = report.meta?.overall_score || null;
  summary.category_scores = report.meta?.category_scores || {};

  const header = [
    `/* ─────────────────────────────────────────────────────────── */`,
    `/* Auto-generated by apply-design-diff-fixes.js                */`,
    `/* Report: ${basename(REPORT_PATH)} */`,
    `/* Generated: ${new Date().toISOString()} */`,
    `/* Original score: ${report.meta?.overall_score || '?'}/100 */`,
    `/* Target: ${TARGET_SELECTOR} */`,
    `/* Categories fixed: ${summary.fixable} */`,
    `/* ─────────────────────────────────────────────────────────── */`,
    ``,
  ].join('\n');

  const css = header + '\n' + blocks.join('\n\n') + '\n';

  return { css, summary };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function maxDiffPct(diff) {
  const candidates = [];
  // Collect all diff_pct values from nested objects
  for (const [key, val] of Object.entries(diff)) {
    if (val && typeof val === 'object' && 'diff_pct' in val) {
      candidates.push(val.diff_pct);
    }
    if (val && typeof val === 'object' && 'match_pct' in val) {
      // Invert match_pct: 100=perfect, 0=terrible → 100-match_pct = diff_pct
      candidates.push(100 - val.match_pct);
    }
  }
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const C = {
  r: '\x1b[0m', b: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

info(`${C.b}apply-design-diff-fixes.js${C.r} — Design-Diff → CSS Auto-Fix`);
info(`${C.cyan}Report:${C.r}  ${REPORT_PATH}`);
info(`${C.cyan}Min-Sev:${C.r} ${MIN_SEVERITY}`);
info('');

// Parse report
let report;
try {
  report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
} catch (err) {
  console.error(`Error: Cannot parse report JSON: ${err.message}`);
  process.exit(2);
}

if (!report.diff || !Array.isArray(report.diff)) {
  console.error('Error: Report has no diff[] array. Is this a valid design-diff report?');
  process.exit(2);
}

// Dry-run mode: analyze only
if (DRY_RUN) {
  const diffs = report.diff || [];
  const fixable = diffs.filter(d => shouldFix(d.severity));
  const skipped = diffs.filter(d => !shouldFix(d.severity));

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  apply-design-diff-fixes.js — DRY-RUN                ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`\n  Original Score: ${report.meta?.overall_score || '?'}/100`);
  console.log(`  Min Severity:   ${MIN_SEVERITY}`);
  console.log(`  Categories:     ${fixable.length} fixable, ${skipped.length} skipped`);
  console.log(`\n  ─── Fixable Categories ──────────────────────────────`);
  
  if (fixable.length === 0) {
    console.log(`  ✅ No fixes needed at severity ${MIN_SEVERITY}.`);
  } else {
    for (const d of fixable) {
      const catScore = report.meta?.category_scores?.[d.category] || '?';
      const icon = d.severity === 'FAIL' ? `${C.red}✗${C.r}` : `${C.yellow}⚠${C.r}`;
      console.log(`  ${icon} ${d.category.padEnd(12)} [${d.severity}] — score: ${catScore} — ${summarizeDiff(d)}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n  ─── Skipped (below --min-severity) ───────────────────`);
    for (const d of skipped) {
      console.log(`    ${d.category.padEnd(12)} [${d.severity}]`);
    }
  }

  console.log(`\n  Run without --dry-run to generate CSS.`);
  console.log(`  Run with --inject --post-id <id> to apply to WordPress.\n`);
  process.exit(0);
}

// Generate CSS
const { css, summary } = generateCssFromReport(report);

// Output: stdout or file
if (OUTPUT_PATH) {
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, css, 'utf8');
  info(`CSS saved → ${OUTPUT_PATH}`);
} else if (!INJECT) {
  // Print to stdout (pipeline-friendly)
  console.log(css);
}

// ─── CONSOLE SUMMARY ──────────────────────────────────────────────────────────

console.error('');
console.error(`╔══════════════════════════════════════════════════════╗`);
console.error(`║  apply-design-diff-fixes.js                          ║`);
console.error(`╚══════════════════════════════════════════════════════╝`);
console.error(`\n  Original Score: ${summary.original_score}/100`);
console.error(`  Target:         ${TARGET_SELECTOR}`);
console.error(`  Fixed:          ${summary.fixable} categories`);
console.error(`  Skipped:        ${summary.skipped} categories`);
console.error('');

if (summary.fixable > 0) {
  console.error(`  ─── Generated Rules ─────────────────────────────────`);
  for (const [cat, info] of Object.entries(summary.categories)) {
    if (info.rules > 0) {
      const icon = info.severity === 'FAIL' ? `${C.red}✗${C.r}` : `${C.yellow}⚠${C.r}`;
      console.error(`  ${icon} ${cat.padEnd(12)} ${String(info.rules).padStart(3)} rules`);
    }
  }
  console.error('');
  console.error(`  Total CSS rules: ${css.split('\n').filter(l => l.includes(':') && !l.trim().startsWith('/*')).length}`);
  console.error('');
}

// ─── INJECT MODE ──────────────────────────────────────────────────────────────

if (INJECT && POST_ID) {
  console.error(`${C.cyan}Injecting CSS to post ${POST_ID}...${C.r}`);

  let success = false;
  try {
    const { McpBridge } = await import('./lib/mcp-bridge.js');
    const { createWpCssInjector } = await import('./lib/wp-css-injector.js');

    const bridge = await McpBridge.fromConfig();
    const injector = createWpCssInjector({ mcpBridge: bridge, siteId: 'auto' });

    const result = await injector.injectCustomCss({ post_id: POST_ID, css });
    
    if (result.success) {
      console.error(`${C.green}✅ CSS injected successfully!${C.r}`);
      console.error(`   CSS URL: ${result.css_url}`);
      console.error(`   Hash:    ${result.css_hash}`);
      success = true;
    } else {
      console.error(`${C.red}❌ Injection failed: ${result.error}${C.r}`);
    }
  } catch (err) {
    console.error(`${C.red}❌ MCP Injection error: ${err.message}${C.r}`);
    if (args.verbose) console.error(err.stack);

    // Fallback: print PHP snippet for manual injection
    console.error(`\n${C.yellow}─── Manual Fallback ───${C.r}`);
    console.error(`Run this PHP via novamira/execute-php:`);
    console.error(`\n  $css = ${JSON.stringify(css)};`);
    console.error(`  update_post_meta(${POST_ID}, '_elementor_custom_css', $css);`);
    console.error(`  \\Elementor\\Plugin::$instance->files_manager->clear_cache();`);
  }

  if (!success) process.exit(1);
}

console.error('');
process.exit(0);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function summarizeDiff(diff) {
  const parts = [];
  const p = (label, val) => { if (val != null) parts.push(`${label}:${val}`); };
  
  switch (diff.category) {
    case 'colors':
      p('text', diff.text_colors?.match_pct != null ? `${diff.text_colors.match_pct}%` : null);
      p('bg', diff.background_colors?.match_pct != null ? `${diff.background_colors.match_pct}%` : null);
      break;
    case 'typography':
      p('fonts', diff.fonts?.match_pct != null ? `${diff.fonts.match_pct}%` : null);
      p('sizeΔ', diff.font_size?.diff_pct != null ? `${diff.font_size.diff_pct}%` : null);
      p('lhΔ', diff.line_height?.diff_pct != null ? `${diff.line_height.diff_pct}%` : null);
      break;
    case 'spacing':
      p('padΔ', diff.padding?.diff_pct != null ? `${diff.padding.diff_pct}%` : null);
      p('marΔ', diff.margin?.diff_pct != null ? `${diff.margin.diff_pct}%` : null);
      break;
    case 'layout':
      p('wΔ', diff.container?.width_diff_pct != null ? `${diff.container.width_diff_pct}%` : null);
      break;
    case 'visual':
      p('border', diff.border_colors?.match_pct != null ? `${diff.border_colors.match_pct}%` : null);
      p('radiusΔ', diff.border_radius?.diff_pct != null ? `${diff.border_radius.diff_pct}%` : null);
      break;
  }
  return parts.join(' ');
}

// ─── HELP ────────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
apply-design-diff-fixes.js — Design-Diff → CSS Auto-Fix Generator

Liest einen design-diff JSON-Report und generiert automatisch CSS-Korrekturen.

USAGE:
  node scripts/apply-design-diff-fixes.js --report <pfad> [options]

OPTIONS:
  --report PATH              Design-diff JSON report (required)
  --output PATH              Save CSS to file
  --inject                   Inject CSS into WordPress via MCP
  --post-id ID               Post ID for --inject
  --dry-run                  Analyze only, don't generate CSS
  --min-severity SEVERITY    Minimum severity to fix: FAIL, WARN (default), PASS
  --target-selector CSS      Target CSS selector (default: .e-con)
  --verbose                  Verbose logging
  --help                     This help

EXAMPLES:
  # Generate CSS to stdout:
  node scripts/apply-design-diff-fixes.js --report reports/design-diff-real.json

  # Save CSS to file:
  node scripts/apply-design-diff-fixes.js --report reports/design-diff-real.json --output fixes.css

  # Dry-run: see what would be fixed:
  node scripts/apply-design-diff-fixes.js --report reports/design-diff-real.json --dry-run

  # Inject CSS into WordPress (requires MCP config):
  node scripts/apply-design-diff-fixes.js --report reports/design-diff-real.json --inject --post-id 123

  # Only fix FAIL-severity issues (stricter):
  node scripts/apply-design-diff-fixes.js --report reports/design-diff-real.json --min-severity FAIL

CATEGORIES FIXED:
  colors      → CSS custom properties for missing colors, color overrides
  typography  → Font imports, size/weight/line-height overrides
  spacing     → Padding and margin overrides
  layout      → Container width and max-width
  visual      → Border-radius, box-shadow, border colors
`);
}
