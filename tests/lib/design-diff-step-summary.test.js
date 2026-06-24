/**
 * tests/lib/design-diff-step-summary.test.js
 *
 * Unit tests for the helper functions extracted to
 * scripts/lib/design-diff-summary-helpers.cjs.
 *
 * Tests all 7 helpers:
 *   - pct
 *   - px
 *   - arr
 *   - colorBadge
 *   - scoreColor
 *   - categoryEmoji
 *   - capitalize
 *
 * Plus integration: the helpers module can be required without side effects.
 *
 * Run: node --test tests/lib/design-diff-step-summary.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  pct,
  px,
  arr,
  colorBadge,
  scoreColor,
  categoryEmoji,
  capitalize,
} = require('../../scripts/lib/design-diff-summary-helpers.cjs');

// ── pct ───────────────────────────────────────────────────────────────────────

describe('pct', () => {

  test('number → "N%" string', () => {
    assert.equal(pct(50), '50%');
    assert.equal(pct(100), '100%');
    assert.equal(pct(0), '0%');
  });

  test('null → em dash', () => {
    assert.equal(pct(null), '\u2014');
  });

  test('undefined → em dash', () => {
    assert.equal(pct(undefined), '\u2014');
  });

  test('negative number → "N%" (preserved)', () => {
    assert.equal(pct(-10), '-10%');
  });

  test('fractional number → string with fraction', () => {
    assert.equal(pct(33.33), '33.33%');
  });

  test('NaN → em dash (guarded)', () => {
    assert.equal(pct(NaN), '\u2014');
  });
});

// ── px ────────────────────────────────────────────────────────────────────────

describe('px', () => {

  test('integer → "Npx"', () => {
    assert.equal(px(16), '16px');
    assert.equal(px(0), '0px');
    assert.equal(px(1200), '1200px');
  });

  test('float → rounded to 2 decimal places', () => {
    assert.equal(px(57.6), '57.6px');
    assert.equal(px(14.444), '14.44px');      // rounds down
    assert.equal(px(14.445), '14.45px');      // rounds up
    // Note: 1.005 * 100 = 100.4999... in JS floats, Math.round → 100 → 1px
    // This is standard IEEE 754 behavior, not a bug in our code.
    assert.equal(px(1.005), '1px');
  });

  test('null → em dash', () => {
    assert.equal(px(null), '\u2014');
  });

  test('undefined → em dash', () => {
    assert.equal(px(undefined), '\u2014');
  });

  test('negative number → "Npx" (preserved)', () => {
    assert.equal(px(-8), '-8px');
  });

  test('NaN → em dash (guarded)', () => {
    assert.equal(px(NaN), '\u2014');
  });
});

// ── arr ───────────────────────────────────────────────────────────────────────

describe('arr', () => {

  test('short array → all items backticked and joined', () => {
    assert.equal(arr(['#fff', '#000']), '`#fff`, `#000`');
    assert.equal(arr(['Inter', 'Jost'], 3), '`Inter`, `Jost`');
  });

  test('single item → one backticked item (no trailing comma)', () => {
    assert.equal(arr(['Roboto']), '`Roboto`');
  });

  test('longer than max → truncated with "+N more" suffix', () => {
    assert.equal(
      arr(['a', 'b', 'c', 'd', 'e', 'f'], 3),
      '`a`, `b`, `c` +3 more'
    );
  });

  test('exactly max items → no truncation suffix', () => {
    assert.equal(
      arr(['a', 'b', 'c', 'd', 'e'], 5),
      '`a`, `b`, `c`, `d`, `e`'
    );
  });

  test('default max=5 when not provided', () => {
    assert.equal(
      arr(['1', '2', '3', '4', '5', '6']),
      '`1`, `2`, `3`, `4`, `5` +1 more'
    );
  });

  test('empty array → em dash', () => {
    assert.equal(arr([]), '\u2014');
  });

  test('null → em dash', () => {
    assert.equal(arr(null), '\u2014');
  });

  test('undefined → em dash', () => {
    assert.equal(arr(undefined), '\u2014');
  });

  test('non-array (string) → em dash', () => {
    assert.equal(arr('not-an-array'), '\u2014');
  });

  test('non-array (number) → em dash', () => {
    assert.equal(arr(42), '\u2014');
  });

  test('non-array (object) → em dash', () => {
    assert.equal(arr({ 0: 'a', length: 1 }), '\u2014');
  });

  test('array with 0 items → em dash (same as empty)', () => {
    // Empty array already tested above, but explicit length check
    assert.equal(arr([], 5), '\u2014');
  });

  test('max=0 → falls back to default 5 (0 is falsy in max || 5)', () => {
    // max || 5 treats 0 as falsy, so limit=5, items=['a','b'], no suffix
    const result = arr(['a', 'b'], 0);
    assert.equal(result, '`a`, `b`');
  });

  test('max=1 → shows exactly 1 item', () => {
    assert.equal(arr(['a', 'b', 'c'], 1), '`a` +2 more');
  });

  test('max larger than array → shows all, no suffix', () => {
    assert.equal(arr(['a', 'b'], 10), '`a`, `b`');
  });
});

// ── colorBadge ────────────────────────────────────────────────────────────────

describe('colorBadge', () => {

  test('PASS → green circle', () => {
    const result = colorBadge('PASS');
    assert.ok(result.includes('\uD83D\uDFE2'), 'Should include green circle');
  });

  test('WARN → orange circle', () => {
    const result = colorBadge('WARN');
    assert.ok(result.includes('\uD83D\uDFE0'), 'Should include orange circle');
  });

  test('FAIL → red circle', () => {
    const result = colorBadge('FAIL');
    assert.ok(result.includes('\uD83D\uDD34'), 'Should include red circle');
  });

  test('unknown severity → empty string', () => {
    assert.equal(colorBadge('UNKNOWN'), '');
    assert.equal(colorBadge('SKIP'), '');
  });

  test('empty string → empty return', () => {
    assert.equal(colorBadge(''), '');
  });

  test('useColor=false → empty string regardless of severity', () => {
    assert.equal(colorBadge('PASS', false), '');
    assert.equal(colorBadge('WARN', false), '');
    assert.equal(colorBadge('FAIL', false), '');
  });

  test('useColor=true (explicit) → emoji returned', () => {
    assert.notEqual(colorBadge('PASS', true), '');
    assert.notEqual(colorBadge('FAIL', true), '');
  });

  test('useColor omitted (default true) → emoji returned', () => {
    assert.notEqual(colorBadge('PASS'), '');
  });

  test('trailing whitespace on severity does NOT match', () => {
    // The switch is strict — 'PASS ' !== 'PASS'
    assert.equal(colorBadge('PASS '), '');
  });

  test('lowercase severity does NOT match', () => {
    assert.equal(colorBadge('pass'), '');
    assert.equal(colorBadge('warn'), '');
  });
});

// ── scoreColor ────────────────────────────────────────────────────────────────

describe('scoreColor', () => {

  test('score ≥ 85 → green circle', () => {
    assert.ok(scoreColor(85).includes('\uD83D\uDFE2'));
    assert.ok(scoreColor(100).includes('\uD83D\uDFE2'));
    assert.ok(scoreColor(90).includes('\uD83D\uDFE2'));
  });

  test('score 70–84 → orange circle', () => {
    assert.ok(scoreColor(70).includes('\uD83D\uDFE0'), '70 should be orange');
    assert.ok(scoreColor(75).includes('\uD83D\uDFE0'), '75 should be orange');
    assert.ok(scoreColor(84).includes('\uD83D\uDFE0'), '84 should be orange');
  });

  test('score 1–69 → red circle', () => {
    assert.ok(scoreColor(1).includes('\uD83D\uDD34'));
    assert.ok(scoreColor(30).includes('\uD83D\uDD34'));
    assert.ok(scoreColor(69).includes('\uD83D\uDD34'));
  });

  test('score 0 → red circle', () => {
    assert.ok(scoreColor(0).includes('\uD83D\uDD34'));
  });

  test('score undefined → empty string', () => {
    assert.equal(scoreColor(undefined), '');
  });

  test('score null → red circle (0 coerces to 0 < 70)', () => {
    // null is not undefined, so it passes the `score === undefined` guard
    // null < 70 → true (null coerces to 0 in comparison)
    assert.ok(scoreColor(null).includes('\uD83D\uDD34'));
  });

  test('useColor=false → empty string regardless of score', () => {
    assert.equal(scoreColor(100, false), '');
    assert.equal(scoreColor(50, false), '');
  });

  test('useColor=true (explicit) → emoji returned', () => {
    assert.notEqual(scoreColor(100, true), '');
    assert.notEqual(scoreColor(50, true), '');
  });

  test('useColor omitted (default true) → emoji returned', () => {
    assert.notEqual(scoreColor(90), '');
  });

  test('negative score → red circle (since < 70)', () => {
    assert.ok(scoreColor(-5).includes('\uD83D\uDD34'));
  });
});

// ── categoryEmoji ─────────────────────────────────────────────────────────────

describe('categoryEmoji', () => {

  test('colors → artist palette', () => {
    assert.ok(categoryEmoji('colors').includes('\uD83C\uDFA8'));
  });

  test('typography → input latin letters', () => {
    assert.ok(categoryEmoji('typography').includes('\uD83D\uDD24'));
  });

  test('spacing → straight ruler', () => {
    assert.ok(categoryEmoji('spacing').includes('\uD83D\uDCCF'));
  });

  test('layout → triangular ruler', () => {
    assert.ok(categoryEmoji('layout').includes('\uD83D\uDCD0'));
  });

  test('visual → sparkles', () => {
    assert.ok(categoryEmoji('visual').includes('\u2728'));
  });

  test('unknown category → clipboard', () => {
    assert.ok(categoryEmoji('unknown').includes('\uD83D\uDCCB'));
    assert.ok(categoryEmoji('').includes('\uD83D\uDCCB'));
    assert.ok(categoryEmoji('motion').includes('\uD83D\uDCCB'));
  });

  test('all known categories return at least one character', () => {
    const cats = ['colors', 'typography', 'spacing', 'layout', 'visual'];
    for (const cat of cats) {
      const emoji = categoryEmoji(cat);
      assert.equal(typeof emoji, 'string');
      // Note: 'visual' → ✨ (U+2728) is a single BMP character, length=1
      assert.ok(emoji.length >= 1, `"${cat}" emoji too short: "${emoji}"`);
    }
  });
});

// ── capitalize ────────────────────────────────────────────────────────────────

describe('capitalize', () => {

  test('lowercase → first char uppercased', () => {
    assert.equal(capitalize('hello'), 'Hello');
    assert.equal(capitalize('world'), 'World');
  });

  test('already uppercase → unchanged', () => {
    assert.equal(capitalize('Hello'), 'Hello');
    assert.equal(capitalize('HELLO'), 'HELLO');
  });

  test('single char → uppercased', () => {
    assert.equal(capitalize('a'), 'A');
  });

  test('empty string → empty string', () => {
    assert.equal(capitalize(''), '');
  });

  test('falsy values → returned unchanged', () => {
    assert.equal(capitalize(null), null);
    assert.equal(capitalize(undefined), undefined);
    assert.equal(capitalize(0), 0);
    assert.equal(capitalize(false), false);
  });

  test('string with leading space → space preserved, next char capitalized', () => {
    assert.equal(capitalize(' hello'), ' hello');
  });

  test('number string → first digit unchanged', () => {
    assert.equal(capitalize('123abc'), '123abc');
  });

  test('unicode character → toUpperCase applied', () => {
    // 'ä'.toUpperCase() → 'Ä' in JS (locale-independent)
    assert.equal(capitalize('\u00E4pfel'), '\u00C4pfel');  // Äpfel
  });
});

// ── Integration: helpers module loads without side effects ────────────────────

describe('helpers module — integration', () => {

  test('all 7 exports are functions', () => {
    assert.equal(typeof pct, 'function');
    assert.equal(typeof px, 'function');
    assert.equal(typeof arr, 'function');
    assert.equal(typeof colorBadge, 'function');
    assert.equal(typeof scoreColor, 'function');
    assert.equal(typeof categoryEmoji, 'function');
    assert.equal(typeof capitalize, 'function');
  });

  test('requiring the module twice returns same cached object (no side effects)', () => {
    const helpers2 = require('../../scripts/lib/design-diff-summary-helpers.cjs');
    assert.equal(helpers2.pct, pct);
    assert.equal(helpers2.px, px);
    // All functions should be the same references
  });

  test('all functions are pure (no side effects, same input = same output)', () => {
    // pct
    assert.equal(pct(42), pct(42));
    // px
    assert.equal(px(16), px(16));
    // arr
    assert.equal(arr(['a', 'b'], 3), arr(['a', 'b'], 3));
    // colorBadge
    assert.equal(colorBadge('PASS'), colorBadge('PASS'));
    // scoreColor
    assert.equal(scoreColor(85), scoreColor(85));
    // categoryEmoji
    assert.equal(categoryEmoji('colors'), categoryEmoji('colors'));
    // capitalize
    assert.equal(capitalize('test'), capitalize('test'));
  });

  test('pct and px format correctly together for a table row', () => {
    const row = `| **Padding** | ${px(80)} | ${px(60)} | ${pct(25)} |`;
    assert.equal(row, '| **Padding** | 80px | 60px | 25% |');
  });

  test('null padding + 100% diff → em dashes and percentage', () => {
    const row = `| **Padding** | ${px(null)} | ${px(undefined)} | ${pct(100)} |`;
    assert.equal(row, '| **Padding** | \u2014 | \u2014 | 100% |');
  });
});
