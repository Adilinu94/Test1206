/**
 * tests/lib/apply-design-diff-fixes.test.js
 *
 * Unit tests for the pure CSS generation functions extracted to
 * scripts/lib/apply-fix-css-generators.js.
 *
 * Tests all 5 generators with mock design-diff diff data:
 *   - generateColorFixes
 *   - generateTypographyFixes
 *   - generateSpacingFixes
 *   - generateLayoutFixes
 *   - generateVisualFixes
 *
 * Run: node --test tests/lib/apply-design-diff-fixes.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateColorFixes,
  generateTypographyFixes,
  generateSpacingFixes,
  generateLayoutFixes,
  generateVisualFixes,
} from '../../scripts/lib/apply-fix-css-generators.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Assert that `lines` contains a line matching a substring or regex.
 * @param {string[]} lines
 * @param {string|RegExp} pattern
 * @param {string} [msg]
 */
function assertLineContains(lines, pattern, msg) {
  const found = lines.some(l =>
    pattern instanceof RegExp ? pattern.test(l) : l.includes(pattern)
  );
  assert.ok(found, msg || `Expected a line matching "${pattern}"`);
}

/**
 * Assert that no line contains the pattern.
 */
function assertNoLineContains(lines, pattern, msg) {
  const found = lines.some(l =>
    pattern instanceof RegExp ? pattern.test(l) : l.includes(pattern)
  );
  assert.ok(!found, msg || `Expected no line matching "${pattern}"`);
}

// ── COLORS ───────────────────────────────────────────────────────────────────

describe('generateColorFixes', () => {

  test('missing text colors → generates CSS custom properties', () => {
    const diff = {
      text_colors: {
        only_in_framer: ['#000000', '#595e5c'],
        match_pct: 50,
      },
      background_colors: {},
    };

    const lines = generateColorFixes(diff);

    assertLineContains(lines, '--framer-missing-text-1: #000000;');
    assertLineContains(lines, '--framer-missing-text-2: #595e5c;');
    assertLineContains(lines, 'Missing Framer text colors (2)');
  });

  test('missing background colors → generates CSS custom properties', () => {
    const diff = {
      text_colors: {},
      background_colors: {
        only_in_framer: ['#f5f4f7', '#c9cbc5', '#f7f7f7'],
        match_pct: 60,
      },
    };

    const lines = generateColorFixes(diff);

    assertLineContains(lines, '--framer-missing-bg-1: #f5f4f7;');
    assertLineContains(lines, '--framer-missing-bg-2: #c9cbc5;');
    assertLineContains(lines, '--framer-missing-bg-3: #f7f7f7;');
    assertLineContains(lines, 'Missing Framer background colors (3)');
  });

  test('low text match_pct (<40) → generates color override', () => {
    const diff = {
      text_colors: {
        only_in_framer: ['#000000'],
        match_pct: 20,
      },
      background_colors: {},
    };

    const lines = generateColorFixes(diff);

    assertLineContains(lines, 'WARNING: Low text color match (20%)');
    assertLineContains(lines, 'color: #000000;');
  });

  test('low text match_pct but no missing colors → warning but NO color: override', () => {
    const diff = {
      text_colors: {
        only_in_framer: [],
        match_pct: 15,
      },
      background_colors: {},
    };

    const lines = generateColorFixes(diff);

    assertLineContains(lines, 'WARNING: Low text color match (15%)');
    assertNoLineContains(lines, 'color:');
  });

  test('medium text match_pct (>=40) → NO color override (not aggressive enough)', () => {
    const diff = {
      text_colors: {
        only_in_framer: ['#000000'],
        match_pct: 45,
      },
      background_colors: {},
    };

    const lines = generateColorFixes(diff);

    assertLineContains(lines, 'Missing Framer text colors');
    assertNoLineContains(lines, 'WARNING: Low text color match');
    assertNoLineContains(lines, 'color: #000000;');
  });

  test('low background match_pct (<50) → generates background-color override', () => {
    const diff = {
      text_colors: {},
      background_colors: {
        only_in_framer: ['#f5f4f7'],
        match_pct: 30,
      },
    };

    const lines = generateColorFixes(diff);

    assertLineContains(lines, 'Low background color match (30%)');
    assertLineContains(lines, 'background-color: #f5f4f7;');
  });

  test('high background match_pct (>=50) → NO background override', () => {
    const diff = {
      text_colors: {},
      background_colors: {
        only_in_framer: ['#f5f4f7'],
        match_pct: 65,
      },
    };

    const lines = generateColorFixes(diff);

    assertLineContains(lines, 'Missing Framer background colors');
    assertNoLineContains(lines, 'Low background color match');
    assertNoLineContains(lines, 'background-color:');
  });

  test('empty diff → returns empty array', () => {
    const lines = generateColorFixes({});
    assert.equal(lines.length, 0);
  });

  test('null/undefined sub-fields do not crash', () => {
    const diff = { text_colors: null, background_colors: undefined };
    const lines = generateColorFixes(diff);
    assert.equal(lines.length, 0);
  });

  test('both text + background missing and low match → generates all rules', () => {
    const diff = {
      text_colors: { only_in_framer: ['#000000'], match_pct: 15 },
      background_colors: { only_in_framer: ['#cccccc'], match_pct: 25 },
    };

    const lines = generateColorFixes(diff);

    assertLineContains(lines, '--framer-missing-text-1: #000000;');
    assertLineContains(lines, '--framer-missing-bg-1: #cccccc;');
    assertLineContains(lines, 'color: #000000;');
    assertLineContains(lines, 'background-color: #cccccc;');
  });
});

// ── TYPOGRAPHY ───────────────────────────────────────────────────────────────

describe('generateTypographyFixes', () => {

  test('missing font families → generates @import comment and font-family', () => {
    const diff = {
      fonts: {
        only_in_framer: ['Inter', 'Jost'],
        match_pct: 33,
      },
      font_size: {},
      font_weight: {},
      line_height: {},
    };

    const lines = generateTypographyFixes(diff);

    assertLineContains(lines, 'Missing font families');
    assertLineContains(lines, 'fonts.googleapis.com/css2?family=Inter&family=Jost');
    assertLineContains(lines, "font-family: 'Inter', 'Jost', sans-serif;");
  });

  test('single missing font → no + concatenation', () => {
    const diff = {
      fonts: { only_in_framer: ['Bricolage Grotesque'] },
      font_size: {},
      font_weight: {},
      line_height: {},
    };

    const lines = generateTypographyFixes(diff);

    assertLineContains(lines, 'Bricolage+Grotesque');
    assertLineContains(lines, "'Bricolage Grotesque'");
  });

  test('font-size big diff (>1.3 ratio) → absolute px override', () => {
    const diff = {
      fonts: {},
      font_size: { diff_pct: 58, framer_median: 57.6, elementor_median: 24 },
      font_weight: {},
      line_height: {},
    };

    const lines = generateTypographyFixes(diff);

    assertLineContains(lines, 'Font-size diff 58%');
    assertLineContains(lines, 'font-size: 57.6px;');
  });

  test('font-size small diff (≤1.3 ratio) → calc() scale', () => {
    const diff = {
      fonts: {},
      font_size: { diff_pct: 15, framer_median: 18, elementor_median: 16 },
      font_weight: {},
      line_height: {},
    };

    const lines = generateTypographyFixes(diff);

    const ratio = 18 / 16; // 1.125
    assertLineContains(lines, /scaling by 113%/);
    assertLineContains(lines, `calc(1em * ${ratio.toFixed(2)})`);
  });

  test('font-size diff ≤10% → NO font-size rule (below threshold)', () => {
    const diff = {
      fonts: {},
      font_size: { diff_pct: 8, framer_median: 16.5, elementor_median: 16 },
      font_weight: {},
      line_height: {},
    };

    const lines = generateTypographyFixes(diff);
    assertNoLineContains(lines, 'font-size:');
    assertNoLineContains(lines, 'calc(1em');
  });

  test('font-size diff_pct undefined → NO font-size rule', () => {
    const diff = {
      fonts: {},
      font_size: {},
      font_weight: {},
      line_height: {},
    };

    const lines = generateTypographyFixes(diff);
    assertNoLineContains(lines, 'font-size:');
  });

  test('missing font-weights → generates comment hints', () => {
    const diff = {
      fonts: {},
      font_size: {},
      font_weight: { missing_in_elementor: [600, 700] },
      line_height: {},
    };

    const lines = generateTypographyFixes(diff);

    assertLineContains(lines, 'Missing font-weights: 600, 700');
    assertLineContains(lines, 'font-weight: 600;');
    assertLineContains(lines, 'font-weight: 700;');
  });

  test('no missing weights → NO font-weight lines', () => {
    const diff = {
      fonts: {},
      font_size: {},
      font_weight: { missing_in_elementor: [] },
      line_height: {},
    };

    const lines = generateTypographyFixes(diff);
    assertNoLineContains(lines, 'Missing font-weights');
    assertNoLineContains(lines, 'font-weight');
  });

  test('line-height big diff (>15) → absolute override', () => {
    const diff = {
      fonts: {},
      font_size: {},
      font_weight: {},
      line_height: { diff_pct: 58, framer_median: 57.6, elementor_median: 24 },
    };

    const lines = generateTypographyFixes(diff);

    assertLineContains(lines, 'Line-height diff 58%');
    assertLineContains(lines, 'line-height: 57.6px;');
  });

  test('line-height diff ≤15% → NO line-height rule', () => {
    const diff = {
      fonts: {},
      font_size: {},
      font_weight: {},
      line_height: { diff_pct: 10, framer_median: 24, elementor_median: 22 },
    };

    const lines = generateTypographyFixes(diff);
    assertNoLineContains(lines, 'line-height:');
  });

  test('line-height with null framer_median → NO override', () => {
    const diff = {
      fonts: {},
      font_size: {},
      font_weight: {},
      line_height: { diff_pct: 58, framer_median: null, elementor_median: 24 },
    };

    const lines = generateTypographyFixes(diff);
    assertNoLineContains(lines, 'line-height:');
  });

  test('empty diff → empty array', () => {
    assert.equal(generateTypographyFixes({}).length, 0);
  });

  test('font-size with zero elementor median → no division by zero', () => {
    const diff = {
      fonts: {},
      font_size: { diff_pct: 50, framer_median: 16, elementor_median: 0 },
      font_weight: {},
      line_height: {},
    };

    const lines = generateTypographyFixes(diff);
    // 0 is falsy, so `if (framerSize && elSize)` short-circuits → no font-size rule
    assertNoLineContains(lines, 'font-size:');
  });

  test('font-size with zero framer median → no NaN ratio', () => {
    const diff = {
      fonts: {},
      font_size: { diff_pct: 50, framer_median: 0, elementor_median: 16 },
      font_weight: {},
      line_height: {},
    };

    const lines = generateTypographyFixes(diff);
    // 0 is falsy, short-circuit → no font-size rule
    assertNoLineContains(lines, 'font-size:');
  });
});

// ── SPACING ───────────────────────────────────────────────────────────────────

describe('generateSpacingFixes', () => {

  test('padding diff >10% → generates padding override', () => {
    const diff = {
      padding: { diff_pct: 17, framer_median: 12, elementor_median: 10 },
      margin: {},
    };

    const lines = generateSpacingFixes(diff);

    assertLineContains(lines, 'Padding diff 17%');
    assertLineContains(lines, 'padding: 12px;');
  });

  test('padding diff ≤10% → NO padding rule', () => {
    const diff = {
      padding: { diff_pct: 5, framer_median: 12, elementor_median: 11.5 },
      margin: {},
    };

    const lines = generateSpacingFixes(diff);
    assertNoLineContains(lines, 'padding:');
  });

  test('padding diff >10% but null framer_median → NO rule', () => {
    const diff = {
      padding: { diff_pct: 30, framer_median: null, elementor_median: 10 },
      margin: {},
    };

    const lines = generateSpacingFixes(diff);
    assertNoLineContains(lines, 'padding:');
  });

  test('margin diff >20% + framer has value → margin override to Framer median', () => {
    const diff = {
      padding: {},
      margin: { diff_pct: 75, framer_median: 8, elementor_median: 4 },
    };

    const lines = generateSpacingFixes(diff);

    assertLineContains(lines, 'Margin diff 75%');
    assertLineContains(lines, 'margin: 8px;');
  });

  test('margin diff >20% + framer null + elementor >0 → margin:0 removal', () => {
    const diff = {
      padding: {},
      margin: { diff_pct: 100, framer_median: null, elementor_median: 4 },
    };

    const lines = generateSpacingFixes(diff);

    assertLineContains(lines, 'Elementor added margin where Framer has none');
    assertLineContains(lines, 'margin: 0;');
  });

  test('margin diff >20% + framer null + elementor 0 → NO rule (nothing to remove)', () => {
    const diff = {
      padding: {},
      margin: { diff_pct: 100, framer_median: null, elementor_median: 0 },
    };

    const lines = generateSpacingFixes(diff);
    assertNoLineContains(lines, 'margin:');
  });

  test('margin diff ≤20% → NO margin rule', () => {
    const diff = {
      padding: {},
      margin: { diff_pct: 15, framer_median: 10, elementor_median: 9 },
    };

    const lines = generateSpacingFixes(diff);
    assertNoLineContains(lines, 'margin:');
  });

  test('both padding + margin → generates both', () => {
    const diff = {
      padding: { diff_pct: 17, framer_median: 12 },
      margin: { diff_pct: 100, framer_median: null, elementor_median: 4 },
    };

    const lines = generateSpacingFixes(diff);

    assertLineContains(lines, 'padding: 12px;');
    assertLineContains(lines, 'margin: 0;');
  });

  test('empty diff → empty array', () => {
    assert.equal(generateSpacingFixes({}).length, 0);
  });
});

// ── LAYOUT ────────────────────────────────────────────────────────────────────

describe('generateLayoutFixes', () => {

  test('container width diff >5% → generates width override', () => {
    const diff = {
      container: { width_diff_pct: 20, framer_width: 1200, elementor_width: 960 },
    };

    const lines = generateLayoutFixes(diff);

    assertLineContains(lines, 'Container width diff 20%');
    assertLineContains(lines, 'width: 1200px;');
  });

  test('container width diff ≤5% → NO width rule', () => {
    const diff = {
      container: { width_diff_pct: 3, framer_width: 1200, elementor_width: 1164 },
    };

    const lines = generateLayoutFixes(diff);
    assertNoLineContains(lines, 'width:');
  });

  test('container max-width diff >5% → generates max-width override', () => {
    const diff = {
      container: { max_width_diff_pct: 15, framer_max_width: 1440, elementor_max_width: 1200 },
    };

    const lines = generateLayoutFixes(diff);

    assertLineContains(lines, 'Max-width diff 15%');
    assertLineContains(lines, 'max-width: 1440px;');
  });

  test('max-width both null → explicit max-width from framer_width', () => {
    const diff = {
      container: {
        max_width_diff_pct: 100,
        framer_max_width: null,
        elementor_max_width: null,
        framer_width: 1440,
      },
    };

    const lines = generateLayoutFixes(diff);

    assertLineContains(lines, 'Set explicit max-width (both null in source)');
    assertLineContains(lines, 'max-width: 1440px;');
  });

  test('max-width diff ≤5% → NO max-width rule', () => {
    const diff = {
      container: { max_width_diff_pct: 3, framer_max_width: 1440, elementor_max_width: 1400 },
    };

    const lines = generateLayoutFixes(diff);
    assertNoLineContains(lines, 'max-width:');
  });

  test('both width + max-width diff → generates both', () => {
    const diff = {
      container: {
        width_diff_pct: 10, framer_width: 1200,
        max_width_diff_pct: 15, framer_max_width: 1440,
      },
    };

    const lines = generateLayoutFixes(diff);

    assertLineContains(lines, 'width: 1200px;');
    assertLineContains(lines, 'max-width: 1440px;');
  });

  test('empty diff → empty array', () => {
    assert.equal(generateLayoutFixes({}).length, 0);
  });

  test('undefined container → no crash, empty array', () => {
    assert.equal(generateLayoutFixes({ container: undefined }).length, 0);
  });
});

// ── VISUAL ────────────────────────────────────────────────────────────────────

describe('generateVisualFixes', () => {

  test('missing border colors → generates CSS custom properties', () => {
    const diff = {
      border_colors: {
        only_in_framer: ['#0000ee', '#595e5c', '#f5f4f7', '#c9cbc5'],
        match_pct: 20,
      },
      border_radius: {},
      shadows: {},
    };

    const lines = generateVisualFixes(diff);

    assertLineContains(lines, 'Missing Framer border colors (4)');
    assertLineContains(lines, '--framer-missing-border-1: #0000ee;');
    assertLineContains(lines, '--framer-missing-border-2: #595e5c;');
    assertLineContains(lines, '--framer-missing-border-3: #f5f4f7;');
    assertLineContains(lines, '--framer-missing-border-4: #c9cbc5;');
  });

  test('border-radius diff >20% → generates radius override', () => {
    const diff = {
      border_colors: {},
      border_radius: { diff_pct: 84, framer_median: 50, elementor_median: 8 },
      shadows: {},
    };

    const lines = generateVisualFixes(diff);

    assertLineContains(lines, 'Border-radius diff 84%');
    assertLineContains(lines, 'border-radius: 50px;');
  });

  test('border-radius diff ≤20% → NO radius rule', () => {
    const diff = {
      border_colors: {},
      border_radius: { diff_pct: 15, framer_median: 50, elementor_median: 43 },
      shadows: {},
    };

    const lines = generateVisualFixes(diff);
    assertNoLineContains(lines, 'border-radius:');
  });

  test('border-radius with null framer_median → NO override', () => {
    const diff = {
      border_colors: {},
      border_radius: { diff_pct: 84, framer_median: null, elementor_median: 8 },
      shadows: {},
    };

    const lines = generateVisualFixes(diff);
    assertNoLineContains(lines, 'border-radius:');
  });

  test('Framer no shadows, Elementor has shadows → box-shadow: none', () => {
    const diff = {
      border_colors: {},
      border_radius: {},
      shadows: { framer_count: 0, elementor_count: 5 },
    };

    const lines = generateVisualFixes(diff);

    assertLineContains(lines, 'Elementor has box-shadow, Framer has none');
    assertLineContains(lines, 'box-shadow: none;');
  });

  test('Framer has shadows, Elementor none → NO box-shadow rule', () => {
    const diff = {
      border_colors: {},
      border_radius: {},
      shadows: { framer_count: 3, elementor_count: 0 },
    };

    const lines = generateVisualFixes(diff);
    assertNoLineContains(lines, 'box-shadow');
  });

  test('both have shadows → NO box-shadow rule', () => {
    const diff = {
      border_colors: {},
      border_radius: {},
      shadows: { framer_count: 3, elementor_count: 4 },
    };

    const lines = generateVisualFixes(diff);
    assertNoLineContains(lines, 'box-shadow');
  });

  test('no shadows data → NO box-shadow rule', () => {
    const diff = { border_colors: {}, border_radius: {}, shadows: {} };
    const lines = generateVisualFixes(diff);
    assertNoLineContains(lines, 'box-shadow');
  });

  test('undefined sub-fields → no crash', () => {
    const diff = {};
    const lines = generateVisualFixes(diff);
    assert.equal(lines.length, 0);
  });

  test('border-radius message includes elementor_median', () => {
    const diff = {
      border_colors: {},
      border_radius: { diff_pct: 84, framer_median: 50, elementor_median: 8 },
      shadows: {},
    };

    const lines = generateVisualFixes(diff);
    assertLineContains(lines, '8px → 50px');
  });

  test('border-radius message handles missing elementor_median gracefully', () => {
    const diff = {
      border_colors: {},
      border_radius: { diff_pct: 84, framer_median: 50 },
      shadows: {},
    };

    const lines = generateVisualFixes(diff);
    assertLineContains(lines, '?px → 50px');
  });
});

// ── REGRESSION: Real-world design-diff report data ────────────────────────────

describe('CSS generators — real-world design-diff data', () => {

  test('full colors diff from oralcare report → generates expected lines', () => {
    const diff = {
      category: 'colors',
      severity: 'WARN',
      text_colors: {
        framer_count: 7, elementor_count: 5, shared: 2,
        only_in_framer: ['#000000', '#0000ee', '#595e5c', '#f5f4f7', '#c9cbc5'],
        only_in_elementor: ['#3b4059', '#f4f6fa', '#d1fc71'],
        match_pct: 20,
      },
      background_colors: {
        framer_count: 7, elementor_count: 3, shared: 3,
        only_in_framer: ['#f5f4f7', '#595e5c', '#c9cbc5', '#f7f7f7'],
        only_in_elementor: [],
        match_pct: 43,
      },
    };

    const lines = generateColorFixes(diff);

    // Should have both text and bg color variables
    assertLineContains(lines, '--framer-missing-text-1: #000000;');
    assertLineContains(lines, '--framer-missing-text-5: #c9cbc5;');
    assertLineContains(lines, '--framer-missing-bg-1: #f5f4f7;');
    // Low text match → color override
    assertLineContains(lines, 'color: #000000;');
    // Low bg match → bg override
    assertLineContains(lines, 'background-color: #f5f4f7;');
  });

  test('full typography diff from oralcare report → generates expected lines', () => {
    const diff = {
      category: 'typography',
      severity: 'WARN',
      fonts: {
        framer_count: 3, elementor_count: 3,
        shared: ['bricolage grotesque'],
        only_in_framer: ['Inter', 'Jost'],
        only_in_elementor: ['Manrope', 'Figtree'],
        match_pct: 33,
      },
      font_size: { framer_median: 12, elementor_median: 16, diff_pct: 25 },
      font_weight: {
        framer: [400, 500, 600],
        elementor: [400, 500],
        missing_in_elementor: [600],
        match: false,
      },
      line_height: { framer_median: 57.6, elementor_median: 24, diff_pct: 58 },
    };

    const lines = generateTypographyFixes(diff);

    // Missing fonts
    assertLineContains(lines, 'Inter&family=Jost');
    assertLineContains(lines, "'Inter', 'Jost'");
    // Font-size: ratio 12/16 = 0.75 (< 0.7? No, 0.75 > 0.7 → calc mode)
    const ratio = 12 / 16;
    assertLineContains(lines, `calc(1em * ${ratio.toFixed(2)})`);
    // Missing weight
    assertLineContains(lines, 'Missing font-weights: 600');
    // Line-height
    assertLineContains(lines, 'Line-height diff 58%');
    assertLineContains(lines, 'line-height: 57.6px;');
  });

  test('full spacing diff → padding override + margin removal', () => {
    const diff = {
      category: 'spacing',
      severity: 'WARN',
      padding: { framer_median: 12, elementor_median: 10, diff_pct: 17 },
      margin: { framer_median: null, elementor_median: 4, diff_pct: 100 },
    };

    const lines = generateSpacingFixes(diff);

    assertLineContains(lines, 'padding: 12px;');
    assertLineContains(lines, 'margin: 0;');
  });

  test('full visual diff → radius override + shadow removal + border vars', () => {
    const diff = {
      category: 'visual',
      severity: 'WARN',
      border_colors: {
        shared: 2, only_in_framer: ['#0000ee', '#595e5c', '#f5f4f7', '#c9cbc5'],
        only_in_elementor: ['#3b4059', '#f4f6fa', '#0246d0', '#d1fc71'],
        match_pct: 20,
      },
      border_radius: { framer_median: 50, elementor_median: 8, diff_pct: 84 },
      shadows: { framer_count: 0, elementor_count: 1 },
    };

    const lines = generateVisualFixes(diff);

    assertLineContains(lines, 'border-radius: 50px;');
    assertLineContains(lines, 'box-shadow: none;');
    assertLineContains(lines, '--framer-missing-border-1: #0000ee;');
    assertLineContains(lines, '--framer-missing-border-4: #c9cbc5;');
  });
});

// ── EDGE CASES ────────────────────────────────────────────────────────────────

describe('CSS generators — edge cases', () => {

  test('all functions return arrays (even with empty input)', () => {
    assert.ok(Array.isArray(generateColorFixes({})));
    assert.ok(Array.isArray(generateTypographyFixes({})));
    assert.ok(Array.isArray(generateSpacingFixes({})));
    assert.ok(Array.isArray(generateLayoutFixes({})));
    assert.ok(Array.isArray(generateVisualFixes({})));
  });

  test('all functions return empty array for null', () => {
    // Each function defaults sub-fields to {} so null diff should produce empty
    assert.equal(generateColorFixes(null).length, 0);
    assert.equal(generateTypographyFixes(null).length, 0);
    assert.equal(generateSpacingFixes(null).length, 0);
    assert.equal(generateLayoutFixes(null).length, 0);
    assert.equal(generateVisualFixes(null).length, 0);
  });

  test('all generated lines are strings with 2-space indent', () => {
    const allFuncs = [
      generateColorFixes({ text_colors: { only_in_framer: ['#fff'], match_pct: 20 } }),
      generateTypographyFixes({ fonts: { only_in_framer: ['Roboto'] }, font_size: {}, font_weight: {}, line_height: {} }),
      generateSpacingFixes({ padding: { diff_pct: 20, framer_median: 16 } }),
      generateLayoutFixes({ container: { width_diff_pct: 10, framer_width: 1200 } }),
      generateVisualFixes({ border_colors: { only_in_framer: ['#000'] }, border_radius: {}, shadows: { framer_count: 0, elementor_count: 1 } }),
    ];

    for (const lines of allFuncs) {
      for (const line of lines) {
        assert.equal(typeof line, 'string', `Expected string, got ${typeof line}: "${line}"`);
        // Comment lines start with "  /" or "  /*"
        // CSS property lines contain ": " and end with ";"
        assert.ok(
          line.startsWith('  '),
          `Line should start with 2 spaces: "${line}"`
        );
      }
    }
  });

  test('each function is idempotent (calling twice returns same result)', () => {
    const diff = {
      text_colors: { only_in_framer: ['#000'], match_pct: 30 },
      background_colors: { only_in_framer: ['#fff'], match_pct: 40 },
    };

    const a = generateColorFixes(diff);
    const b = generateColorFixes(diff);

    assert.deepEqual(a, b);
  });

  test('functions do not mutate input diff objects', () => {
    const diff = {
      text_colors: { only_in_framer: ['#000'], match_pct: 30 },
    };
    const copy = JSON.parse(JSON.stringify(diff));

    generateColorFixes(diff);
    assert.deepEqual(diff, copy, 'Input should not be mutated');
  });
});
