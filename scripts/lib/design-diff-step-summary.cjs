#!/usr/bin/env node
/**
 * scripts/lib/design-diff-step-summary.js
 *
 * Reads a design-diff JSON report (e.g. reports/ci-design-diff.json) and outputs
 * GitHub Flavored Markdown suitable for $GITHUB_STEP_SUMMARY.
 *
 * Called from CI:
 *   node --input-type=commonjs scripts/lib/design-diff-step-summary.js reports/ci-design-diff.json >> $GITHUB_STEP_SUMMARY
 *
 * USAGE:
 *   node --input-type=commonjs scripts/lib/design-diff-step-summary.js <reportPath> [options]
 *
 * OPTIONS:
 *   --framer-url URL       Override Framer URL in header
 *   --elementor-url URL    Override Elementor URL in header
 *   --threshold N          Score threshold for pass/fail coloring (default: 70)
 *   --no-color             Omit HTML color badges
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  pct,
  px,
  arr,
  colorBadge,
  scoreColor,
  categoryEmoji,
  capitalize,
} = require('./design-diff-summary-helpers.cjs');

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

// Parse simple --key value and positional args
const opts = { threshold: 70, color: true };
let reportPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--framer-url')      { opts.framerUrl = args[++i]; }
  else if (args[i] === '--elementor-url') { opts.elementorUrl = args[++i]; }
  else if (args[i] === '--threshold')  { opts.threshold = parseInt(args[++i], 10) || 70; }
  else if (args[i] === '--no-color')   { opts.color = false; }
  else if (!reportPath)                { reportPath = args[i]; }
}

if (!reportPath || reportPath === '--help' || reportPath === '-h') {
  console.error('USAGE: node --input-type=commonjs scripts/lib/design-diff-step-summary.js <report.json> [--framer-url URL] [--elementor-url URL] [--threshold N]');
  console.error('');
  console.error('Reads a design-diff JSON report and outputs GitHub Flavored Markdown.');
  console.error('Pipe to $GITHUB_STEP_SUMMARY in GitHub Actions.');
  process.exit(reportPath === '--help' || reportPath === '-h' ? 0 : 2);
}

// ─── Load report ──────────────────────────────────────────────────────────────

let report;
try {
  report = require(path.resolve(reportPath));
} catch (err) {
  console.log('## 🎨 Design-Diff Results');
  console.log('');
  console.log('> ⚠️ No report file found at `' + reportPath + '`');
  process.exit(0);
}

const meta       = report.meta || {};
const diffs      = Array.isArray(report.diff) ? report.diff : [];
const framerUrl  = opts.framerUrl  || meta.framer_url  || '?';
const elementorUrl = opts.elementorUrl || meta.elementor_url || '?';
const score      = meta.overall_score;
const threshold  = opts.threshold;
const isDryRun   = meta.backend === 'dry-run';

// ─── Render ───────────────────────────────────────────────────────────────────

const out = [];

// ── Header ────────────────────────────────────────────────────────────────────

out.push('## 🎨 Design-Diff Results');
out.push('');

if (isDryRun) {
  out.push('> ℹ️ **Dry-Run** — no browser comparison performed (script integrity check only).');
  out.push('');
  out.push('| Metric | Value |');
  out.push('|--------|-------|');
  out.push('| **Mode** | dry-run |');
  out.push('| **Framer** | `' + framerUrl + '` |');
  out.push('| **Elementor** | `' + elementorUrl + '` |');
  out.push('');
  out.push('Set `DESIGNDIFF_FRAMER_URL` + `DESIGNDIFF_ELEMENTOR_URL` as [Repository Variables](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#creating-configuration-variables-for-a-repository) to enable real comparison.');
  out.push('');

  console.log(out.join('\n'));
  process.exit(0);
}

// ── Overview table ────────────────────────────────────────────────────────────

const maxSeverity = meta.max_severity || 'UNKNOWN';
const blocked = score !== undefined && score < threshold;

out.push('| Metric | Value |');
out.push('|--------|-------|');
out.push('| **Framer** | `' + framerUrl + '` |');
out.push('| **Elementor** | `' + elementorUrl + '` |');
out.push('| **Overall Score** | **' + (score !== undefined ? score + '/100' : '—') + '**' + scoreColor(score, opts.color) + ' |');
out.push('| **Max Severity** | `' + maxSeverity + '`' + colorBadge(maxSeverity, opts.color) + ' |');
out.push('| **Threshold** | ' + threshold + '/100 |');
out.push('| **Status** | ' + (blocked ? '❌ BLOCKED' : '✅ PASS') + ' |');
out.push('| **Timestamp** | ' + (meta.timestamp ? new Date(meta.timestamp).toISOString() : '—') + ' |');
out.push('| **Backend** | ' + (meta.backend || '—') + ' |');
out.push('');

// ── Per-Category Scores ──────────────────────────────────────────────────────

const catScores = meta.category_scores || {};
if (Object.keys(catScores).length > 0) {
  out.push('### 📊 Per-Category Scores');
  out.push('');
  out.push('| Category | Score |');
  out.push('|----------|-------|');
  for (const [cat, s] of Object.entries(catScores)) {
    out.push('| `' + cat + '` | **' + s + '/100**' + scoreColor(s, opts.color) + ' |');
  }
  out.push('');
}

// ── Detailed Diffs ────────────────────────────────────────────────────────────

if (diffs.length === 0) {
  out.push('> ℹ️ No diff entries in report.');
} else {
  out.push('### 📋 Detailed Diffs');
  out.push('');

  for (const d of diffs) {
    const sev = d.severity || '?';
    out.push('#### ' + categoryEmoji(d.category) + ' ' + capitalize(d.category) + ' (' + sev + colorBadge(sev, opts.color) + ')');
    out.push('');

    switch (d.category) {

      // ── COLORS ──────────────────────────────────────────────────────────
      case 'colors': {
        const tc = d.text_colors || {};
        const bg = d.background_colors || {};

        out.push('| Property | Framer | Elementor | Match |');
        out.push('|----------|--------|-----------|-------|');
        out.push('| **Text Colors** | ' + (tc.framer_count || 0) + ' unique | ' + (tc.elementor_count || 0) + ' unique | ' + pct(tc.match_pct) + ' |');
        out.push('| **Background Colors** | ' + (bg.framer_count || 0) + ' unique | ' + (bg.elementor_count || 0) + ' unique | ' + pct(bg.match_pct) + ' |');

        if ((tc.only_in_framer || []).length > 0) {
          out.push('');
          out.push('**Only in Framer (text):** ' + arr(tc.only_in_framer, 8));
        }
        if ((tc.only_in_elementor || []).length > 0) {
          out.push('');
          out.push('**Only in Elementor (text):** ' + arr(tc.only_in_elementor, 8));
        }
        if ((bg.only_in_framer || []).length > 0) {
          out.push('');
          out.push('**Only in Framer (bg):** ' + arr(bg.only_in_framer, 6));
        }
        if ((bg.only_in_elementor || []).length > 0) {
          out.push('');
          out.push('**Only in Elementor (bg):** ' + arr(bg.only_in_elementor, 6));
        }
        break;
      }

      // ── TYPOGRAPHY ──────────────────────────────────────────────────────
      case 'typography': {
        const fonts = d.fonts || {};
        const fs    = d.font_size || {};
        const fw    = d.font_weight || {};
        const lh    = d.line_height || {};

        out.push('| Property | Framer | Elementor | Diff/Match |');
        out.push('|----------|--------|-----------|------------|');
        out.push('| **Font Families** | ' + (fonts.framer_count || 0) + ' families | ' + (fonts.elementor_count || 0) + ' families | ' + pct(fonts.match_pct) + ' |');
        out.push('| **Font Size (median)** | ' + px(fs.framer_median) + ' | ' + px(fs.elementor_median) + ' | ' + pct(fs.diff_pct) + ' |');
        out.push('| **Line Height (median)** | ' + px(lh.framer_median) + ' | ' + px(lh.elementor_median) + ' | ' + pct(lh.diff_pct) + ' |');
        out.push('| **Font Weights** | ' + arr(fw.framer, 6) + ' | ' + arr(fw.elementor, 6) + ' | ' + (fw.match ? '✅' : '❌') + ' |');

        if ((fonts.only_in_framer || []).length > 0) {
          out.push('');
          out.push('**Only in Framer:** ' + arr(fonts.only_in_framer, 5));
        }
        if ((fonts.only_in_elementor || []).length > 0) {
          out.push('');
          out.push('**Only in Elementor:** ' + arr(fonts.only_in_elementor, 5));
        }
        if ((fw.missing_in_elementor || []).length > 0) {
          out.push('');
          out.push('**Missing weights in Elementor:** `' + fw.missing_in_elementor.join('`, `') + '`');
        }
        break;
      }

      // ── SPACING ─────────────────────────────────────────────────────────
      case 'spacing': {
        const pad = d.padding || {};
        const mar = d.margin || {};

        out.push('| Property | Framer | Elementor | Diff |');
        out.push('|----------|--------|-----------|------|');
        out.push('| **Padding (median)** | ' + px(pad.framer_median) + ' | ' + px(pad.elementor_median) + ' | ' + pct(pad.diff_pct) + ' |');
        out.push('| **Margin (median)** | ' + px(mar.framer_median) + ' | ' + px(mar.elementor_median) + ' | ' + pct(mar.diff_pct) + ' |');
        break;
      }

      // ── LAYOUT ──────────────────────────────────────────────────────────
      case 'layout': {
        const cont = d.container || {};
        const ec   = d.element_count || {};

        out.push('| Property | Framer | Elementor | Diff |');
        out.push('|----------|--------|-----------|------|');
        out.push('| **Container Width** | ' + px(cont.framer_width) + ' | ' + px(cont.elementor_width) + ' | ' + pct(cont.width_diff_pct) + ' |');
        out.push('| **Max Width** | ' + px(cont.framer_max_width) + ' | ' + px(cont.elementor_max_width) + ' | ' + pct(cont.max_width_diff_pct) + ' |');
        out.push('| **Elements Scanned** | ' + (ec.framer || '?') + ' | ' + (ec.elementor || '?') + ' | — |');
        break;
      }

      // ── VISUAL ──────────────────────────────────────────────────────────
      case 'visual': {
        const bc = d.border_colors || {};
        const br = d.border_radius || {};
        const sh = d.shadows || {};

        out.push('| Property | Framer | Elementor | Diff/Match |');
        out.push('|----------|--------|-----------|------------|');
        const bcFramerCount = (bc.shared || 0) + (bc.only_in_framer || []).length;
        const bcElCount     = (bc.shared || 0) + (bc.only_in_elementor || []).length;
        out.push('| **Border Colors** | ' + bcFramerCount + ' unique | ' + bcElCount + ' unique | ' + pct(bc.match_pct) + ' |');
        out.push('| **Border Radius (median)** | ' + px(br.framer_median) + ' | ' + px(br.elementor_median) + ' | ' + pct(br.diff_pct) + ' |');
        out.push('| **Box Shadows** | ' + (sh.framer_count || 0) + ' shadows | ' + (sh.elementor_count || 0) + ' shadows | ' + (Math.abs((sh.framer_count || 0) - (sh.elementor_count || 0)) <= 3 ? '✅' : '❌') + ' |');

        if ((bc.only_in_framer || []).length > 0) {
          out.push('');
          out.push('**Only in Framer (border):** ' + arr(bc.only_in_framer, 6));
        }
        if ((bc.only_in_elementor || []).length > 0) {
          out.push('');
          out.push('**Only in Elementor (border):** ' + arr(bc.only_in_elementor, 6));
        }
        break;
      }

      default:
        out.push('> Unknown category: `' + d.category + '` — severity: ' + sev);
    }

    out.push('');
  }
}

// ── Footer ────────────────────────────────────────────────────────────────────

if (blocked) {
  out.push('---');
  out.push('');
  out.push('> ⚠️ **BUILD BLOCKED** — score ' + score + '/100 < threshold ' + threshold + '/100.');
  out.push('> Check the [design-diff report artifact](../../actions/runs/' + (process.env.GITHUB_RUN_ID || '') + ') for full details.');
} else if (score !== undefined) {
  out.push('---');
  out.push('');
  out.push('> ✅ Score ' + score + '/100 ≥ threshold ' + threshold + '/100 — **PASS**');
}

console.log(out.join('\n'));
process.exit(0);
