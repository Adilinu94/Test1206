/**
 * tests/lib/design-diff-step-summary.test.js
 *
 * Integrationstest für scripts/lib/design-diff-step-summary.cjs —
 * das einzige CJS-CLI-Script ohne Modul-Exports.
 *
 * Validiert:
 *  - Dry-Run → spezifische Markdown-Ausgabe
 *  - PASS (score ≥ threshold) → ✅ PASS Status
 *  - BLOCKED (score < threshold) → ❌ BLOCKED Status
 *  - Missing report → graceful fallback
 *  - --no-color → keine Emoji-Badges
 *  - Alle 5 Kategorien (colors, typography, spacing, layout, visual)
 *  - --threshold Override
 *  - --framer-url / --elementor-url Overrides
 *  - --help Flag
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '../../scripts/lib/design-diff-step-summary.cjs');

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'design-diff-summary-test-'));
}

function writeReport(dir, report) {
  const p = join(dir, 'design-diff.json');
  writeFileSync(p, JSON.stringify(report, null, 2));
  return p;
}

function run(dir, reportPath, opts = '') {
  return execSync(
    `node --input-type=commonjs "${SCRIPT}" "${reportPath}" ${opts}`,
    { encoding: 'utf8', cwd: dir }
  );
}

// ─── Mock report builder ──────────────────────────────────────────────────────

function mockReport(overrides = {}) {
  return {
    meta: {
      framer_url: 'https://example.framer.app/',
      elementor_url: 'https://example.com/test-page/',
      overall_score: overrides.score ?? 85,
      max_severity: overrides.maxSeverity ?? 'WARN',
      backend: overrides.backend ?? 'playwright',
      timestamp: overrides.timestamp ?? '2026-06-24T12:00:00.000Z',
      category_scores: overrides.categoryScores ?? {
        colors: 90,
        typography: 82,
        spacing: 88,
        layout: 75,
        visual: 90,
      },
    },
    diff: overrides.diffs ?? [
      mockColorDiff(),
      mockTypographyDiff(),
      mockSpacingDiff(),
      mockLayoutDiff(),
      mockVisualDiff(),
    ],
  };
}

function mockColorDiff() {
  return {
    category: 'colors',
    severity: 'PASS',
    text_colors: { framer_count: 5, elementor_count: 5, match_pct: 100, only_in_framer: [], only_in_elementor: [] },
    background_colors: { framer_count: 3, elementor_count: 3, match_pct: 100, only_in_framer: [], only_in_elementor: [] },
  };
}

function mockTypographyDiff() {
  return {
    category: 'typography',
    severity: 'WARN',
    fonts: { framer_count: 2, elementor_count: 2, match_pct: 50, only_in_framer: ['Inter Display'], only_in_elementor: ['Jost'] },
    font_size: { framer_median: 18, elementor_median: 16, diff_pct: 12.5 },
    font_weight: { framer: [400, 700], elementor: [400, 600], match: false, missing_in_elementor: [700] },
    line_height: { framer_median: 28, elementor_median: 24, diff_pct: 16.7 },
  };
}

function mockSpacingDiff() {
  return {
    category: 'spacing',
    severity: 'PASS',
    padding: { framer_median: 80, elementor_median: 72, diff_pct: 11 },
    margin: { framer_median: 24, elementor_median: 24, diff_pct: 0 },
  };
}

function mockLayoutDiff() {
  return {
    category: 'layout',
    severity: 'WARN',
    container: { framer_width: 1200, elementor_width: 1140, width_diff_pct: 5.3, framer_max_width: 1200, elementor_max_width: 1140, max_width_diff_pct: 5.3 },
    element_count: { framer: 45, elementor: 43 },
  };
}

function mockVisualDiff() {
  return {
    category: 'visual',
    severity: 'PASS',
    border_colors: { shared: 2, only_in_framer: [], only_in_elementor: [], match_pct: 100 },
    border_radius: { framer_median: 8, elementor_median: 8, diff_pct: 0 },
    shadows: { framer_count: 3, elementor_count: 3 },
  };
}

// ─── Test 1: Dry-Run Mode ─────────────────────────────────────────────────────

test('integration: dry-run mode → specific dry-run markdown output', () => {
  const dir = tmpDir();
  try {
    const report = mockReport({ backend: 'dry-run', score: undefined });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Design-Diff Results/);
    assert.match(stdout, /Dry-Run/);
    assert.match(stdout, /no browser comparison performed/);
    assert.match(stdout, /Mode.*dry-run/);
    assert.match(stdout, /Framer.*example\.framer\.app/);
    assert.match(stdout, /Elementor.*example\.com/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 2: PASS (score ≥ threshold) ─────────────────────────────────────────

test('integration: score 85 with threshold 70 → PASS status', () => {
  const dir = tmpDir();
  try {
    const report = mockReport({ score: 85, maxSeverity: 'WARN' });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Status.*PASS/);
    assert.match(stdout, /Overall Score.*85\/100/);
    assert.match(stdout, /Threshold.*70\/100/);
    assert.doesNotMatch(stdout, /BLOCKED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 3: BLOCKED (score < threshold) ──────────────────────────────────────

test('integration: score 55 with threshold 70 → BLOCKED status', () => {
  const dir = tmpDir();
  try {
    const report = mockReport({ score: 55, maxSeverity: 'FAIL' });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Status.*BLOCKED/);
    assert.match(stdout, /BUILD BLOCKED/);
    assert.match(stdout, /55\/100 < threshold 70/);
    assert.match(stdout, /Max Severity.*FAIL/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 4: Threshold override ───────────────────────────────────────────────

test('integration: --threshold 50 overrides default → score 55 passes', () => {
  const dir = tmpDir();
  try {
    const report = mockReport({ score: 55 });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath, '--threshold 50');

    assert.match(stdout, /Status.*PASS/);
    assert.match(stdout, /Threshold.*50\/100/);
    assert.doesNotMatch(stdout, /BLOCKED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 5: URL overrides ────────────────────────────────────────────────────

test('integration: --framer-url and --elementor-url overrides', () => {
  const dir = tmpDir();
  try {
    const report = mockReport({ score: 90 });
    const reportPath = writeReport(dir, report);

    const stdout = run(
      dir, reportPath,
      '--framer-url https://override.framer.app/ --elementor-url https://override.com/page/'
    );

    assert.match(stdout, /override\.framer\.app/);
    assert.match(stdout, /override\.com\/page/);
    assert.doesNotMatch(stdout, /example\.framer\.app/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 6: --no-color flag ──────────────────────────────────────────────────

test('integration: --no-color → no emoji badges in output', () => {
  const dir = tmpDir();
  try {
    const report = mockReport({ score: 85 });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath, '--no-color');

    // Emoji codepoints should NOT appear
    assert.doesNotMatch(stdout, /\uD83D\uDFE2/);  // green circle
    assert.doesNotMatch(stdout, /\uD83D\uDFE0/);  // orange circle
    assert.doesNotMatch(stdout, /\uD83D\uDD34/);  // red circle
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 7: Missing report file → graceful handling ──────────────────────────

test('integration: missing report file → graceful fallback message', () => {
  const dir = tmpDir();
  try {
    const stdout = run(dir, join(dir, 'nonexistent.json'));

    assert.match(stdout, /Design-Diff Results/);
    assert.match(stdout, /No report file found/);
    assert.match(stdout, /nonexistent\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 8: --help flag ──────────────────────────────────────────────────────

test('integration: --help flag → exits 0 with usage (stderr redirect)', () => {
  const dir = tmpDir();
  try {
    // Script writes to console.error() → redirect stderr to stdout via 2>&1
    const stdout = execSync(
      `node --input-type=commonjs "${SCRIPT}" --help 2>&1`,
      { encoding: 'utf8', cwd: dir }
    );

    assert.match(stdout, /USAGE:/);
    assert.match(stdout, /design-diff-step-summary/);
    assert.match(stdout, /--framer-url/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 9: Colors category output ───────────────────────────────────────────

test('integration: colors category → table with text/bg color stats', () => {
  const dir = tmpDir();
  try {
    const diff = {
      category: 'colors',
      severity: 'PASS',
      text_colors: { framer_count: 5, elementor_count: 5, match_pct: 100, only_in_framer: [], only_in_elementor: [] },
      background_colors: { framer_count: 3, elementor_count: 3, match_pct: 100, only_in_framer: [], only_in_elementor: [] },
    };
    const report = mockReport({ diffs: [diff], score: 90, categoryScores: { colors: 90 } });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Colors/);
    assert.match(stdout, /Text Colors/);
    assert.match(stdout, /Background Colors/);
    assert.match(stdout, /100%/);
    assert.match(stdout, /5 unique/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 10: Colors diff with only_in_framer / only_in_elementor ─────────────

test('integration: colors diff with mismatches → shows only_in lists', () => {
  const dir = tmpDir();
  try {
    const diff = {
      category: 'colors',
      severity: 'WARN',
      text_colors: {
        framer_count: 5, elementor_count: 3, match_pct: 60,
        only_in_framer: ['#FF0000', '#00FF00'],
        only_in_elementor: [],
      },
      background_colors: {
        framer_count: 3, elementor_count: 4, match_pct: 75,
        only_in_framer: [],
        only_in_elementor: ['#0000FF'],
      },
    };
    const report = mockReport({ diffs: [diff], score: 70 });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Only in Framer.*text/);
    assert.match(stdout, /#FF0000/);
    assert.match(stdout, /#00FF00/);
    assert.match(stdout, /Only in Elementor.*bg/);
    assert.match(stdout, /#0000FF/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 11: Typography category → fonts, sizes, weights, line-height ────────

test('integration: typography category → all typo sub-tables rendered', () => {
  const dir = tmpDir();
  try {
    const diff = {
      category: 'typography',
      severity: 'WARN',
      fonts: { framer_count: 2, elementor_count: 2, match_pct: 50, only_in_framer: ['Inter Display'], only_in_elementor: ['Jost'] },
      font_size: { framer_median: 18, elementor_median: 16, diff_pct: 12.5 },
      font_weight: { framer: [400, 700], elementor: [400, 600], match: false, missing_in_elementor: [700] },
      line_height: { framer_median: 28, elementor_median: 24, diff_pct: 16.7 },
    };
    const report = mockReport({ diffs: [diff], score: 75 });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Typography/);
    assert.match(stdout, /Font Families/);
    assert.match(stdout, /Font Size/);
    assert.match(stdout, /Font Weights/);
    assert.match(stdout, /Line Height/);
    assert.match(stdout, /18px/);
    assert.match(stdout, /28px/);
    assert.match(stdout, /Only in Framer/);
    assert.match(stdout, /Inter Display/);
    assert.match(stdout, /Missing weights/);
    assert.match(stdout, /700/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 12: Spacing category ────────────────────────────────────────────────

test('integration: spacing category → padding + margin table', () => {
  const dir = tmpDir();
  try {
    const diff = {
      category: 'spacing',
      severity: 'PASS',
      padding: { framer_median: 80, elementor_median: 72, diff_pct: 11 },
      margin: { framer_median: 24, elementor_median: 24, diff_pct: 0 },
    };
    const report = mockReport({ diffs: [diff], score: 90 });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Spacing/);
    assert.match(stdout, /Padding/);
    assert.match(stdout, /Margin/);
    assert.match(stdout, /80px/);
    assert.match(stdout, /72px/);
    assert.match(stdout, /24px/);
    assert.match(stdout, /11%/);
    assert.match(stdout, /0%/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 13: Layout category ─────────────────────────────────────────────────

test('integration: layout category → container widths + element count', () => {
  const dir = tmpDir();
  try {
    const diff = {
      category: 'layout',
      severity: 'WARN',
      container: { framer_width: 1200, elementor_width: 1140, width_diff_pct: 5.3, framer_max_width: 1200, elementor_max_width: 1140, max_width_diff_pct: 5.3 },
      element_count: { framer: 45, elementor: 43 },
    };
    const report = mockReport({ diffs: [diff], score: 72 });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Layout/);
    assert.match(stdout, /Container Width/);
    assert.match(stdout, /Max Width/);
    assert.match(stdout, /1200px/);
    assert.match(stdout, /1140px/);
    assert.match(stdout, /5\.3%/);
    assert.match(stdout, /Elements Scanned/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 14: Visual category ─────────────────────────────────────────────────

test('integration: visual category → border colors, radius, shadows', () => {
  const dir = tmpDir();
  try {
    const diff = {
      category: 'visual',
      severity: 'PASS',
      border_colors: { shared: 2, only_in_framer: ['#CCC'], only_in_elementor: [], match_pct: 66 },
      border_radius: { framer_median: 8, elementor_median: 8, diff_pct: 0 },
      shadows: { framer_count: 3, elementor_count: 4 },
    };
    const report = mockReport({ diffs: [diff], score: 85 });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Visual/);
    assert.match(stdout, /Border Colors/);
    assert.match(stdout, /Border Radius/);
    assert.match(stdout, /Box Shadows/);
    assert.match(stdout, /8px/);
    assert.match(stdout, /Only in Framer.*border/);
    assert.match(stdout, /#CCC/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 15: Unknown category → graceful fallback ────────────────────────────

test('integration: unknown category → fallback message rendered', () => {
  const dir = tmpDir();
  try {
    const diff = {
      category: 'animations',
      severity: 'WARN',
    };
    const report = mockReport({ diffs: [diff], score: 80 });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Unknown category/);
    assert.match(stdout, /animations/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 16: No diffs array → informational message ──────────────────────────

test('integration: empty diff array → no diff entries message', () => {
  const dir = tmpDir();
  try {
    const report = mockReport({ diffs: [], score: 100, maxSeverity: 'PASS' });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /No diff entries/);
    assert.match(stdout, /Status.*PASS/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 17: Per-Category Scores table ───────────────────────────────────────

test('integration: per-category scores table rendered', () => {
  const dir = tmpDir();
  try {
    const report = mockReport({
      score: 85,
      categoryScores: { colors: 90, typography: 82, spacing: 88, layout: 75, visual: 90 },
    });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Per-Category Scores/);
    assert.match(stdout, /colors.*90\/100/);
    assert.match(stdout, /typography.*82\/100/);
    assert.match(stdout, /spacing.*88\/100/);
    assert.match(stdout, /layout.*75\/100/);
    assert.match(stdout, /visual.*90\/100/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 18: No args → exit 2 (stderr) ──────────────────────────────────────

test('integration: no args → exits with non-zero and usage on stderr', () => {
  const dir = tmpDir();
  try {
    let stderr = '';
    try {
      execSync(`node --input-type=commonjs "${SCRIPT}"`, { encoding: 'utf8', cwd: dir });
    } catch (e) {
      stderr = e.stderr || '';
      assert.equal(e.status, 2, 'exit code must be 2 for missing report path');
    }

    assert.match(stderr, /USAGE:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 19: File with .json extension but not found → graceful ──────────────

test('integration: report path with .json but file missing → graceful fallback (exit 0)', () => {
  const dir = tmpDir();
  try {
    const fakePath = join(dir, 'ci-design-diff.json');
    // File does NOT exist — script should handle gracefully

    const stdout = run(dir, fakePath);

    assert.match(stdout, /No report file found/);
    assert.match(stdout, /ci-design-diff\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 20: Score exactly at threshold → PASS ───────────────────────────────

test('integration: score exactly at threshold → PASS (not BLOCKED)', () => {
  const dir = tmpDir();
  try {
    const report = mockReport({ score: 70, maxSeverity: 'WARN' });
    const reportPath = writeReport(dir, report);

    const stdout = run(dir, reportPath);

    assert.match(stdout, /Status.*PASS/);
    assert.match(stdout, /70\/100 ≥ threshold 70/);
    assert.doesNotMatch(stdout, /BLOCKED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
