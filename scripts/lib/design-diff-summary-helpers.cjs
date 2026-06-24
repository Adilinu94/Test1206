/**
 * scripts/lib/design-diff-summary-helpers.cjs
 *
 * Pure formatting helpers extracted from design-diff-step-summary.cjs.
 * All functions are side-effect-free and independently testable.
 *
 * Exported:
 *   pct(n)              — number → "N%" or "—"
 *   px(n)               — number → "Npx" or "—"
 *   arr(arr, max)       — format array with truncation
 *   colorBadge(severity, useColor?) — severity → emoji badge
 *   scoreColor(score, useColor?)    — score → emoji indicator
 *   categoryEmoji(cat)  — category name → emoji
 *   capitalize(s)        — "foo" → "Foo"
 */

'use strict';

/**
 * Format a number as a percentage string.
 * Returns '—' for null/undefined.
 * @param {number|null|undefined} n
 * @returns {string}
 */
function pct(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '\u2014';  // em dash
  return n + '%';
}

/**
 * Format a number as a pixel string.
 * Returns '—' for null/undefined.
 * Round to 2 decimal places.
 * @param {number|null|undefined} n
 * @returns {string}
 */
function px(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '\u2014';
  return Math.round(n * 100) / 100 + 'px';
}

/**
 * Format an array for inline display with optional truncation.
 * Returns '—' for non-array, null, undefined, or empty array.
 * Items are wrapped in backticks.
 *
 * @param {Array|null|undefined} arr - the array to format
 * @param {number} [max=5] - max items to show before truncation
 * @returns {string}
 *
 * @example arr(['#fff', '#000'], 3) → "`#fff`, `#000`"
 * @example arr(['a','b','c','d','e','f'], 3) → "`a`, `b`, `c` +3 more"
 */
function arr(arr, max) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return '\u2014';
  const limit = max || 5;
  const items = arr.slice(0, limit);
  const suffix = arr.length > limit ? ' +' + (arr.length - limit) + ' more' : '';
  return '`' + items.join('`, `') + '`' + suffix;
}

/**
 * Return a color emoji badge for a design-diff severity level.
 *
 * @param {'PASS'|'WARN'|'FAIL'|string} severity
 * @param {boolean} [useColor=true] - if false, returns empty string
 * @returns {string}
 */
function colorBadge(severity, useColor) {
  if (useColor === false) return '';
  switch (severity) {
    case 'PASS':  return ' \uD83D\uDFE2';  // green circle
    case 'WARN':  return ' \uD83D\uDFE0';  // orange circle
    case 'FAIL':  return ' \uD83D\uDD34';  // red circle
    default:      return '';
  }
}

/**
 * Return a color emoji indicator for a score value.
 *
 * @param {number|undefined} score
 * @param {boolean} [useColor=true] - if false, returns empty string
 * @returns {string}
 */
function scoreColor(score, useColor) {
  if (useColor === false || score === undefined) return '';
  if (score >= 85) return ' \uD83D\uDFE2';  // green
  if (score >= 70) return ' \uD83D\uDFE0';  // orange
  return ' \uD83D\uDD34';                    // red
}

/**
 * Return an emoji for a design-diff category.
 *
 * @param {string} cat - category name
 * @returns {string}
 */
function categoryEmoji(cat) {
  switch (cat) {
    case 'colors':      return '\uD83C\uDFA8';  // artist palette
    case 'typography':  return '\uD83D\uDD24';  // input latin letters
    case 'spacing':     return '\uD83D\uDCCF';  // straight ruler
    case 'layout':      return '\uD83D\uDCD0';  // triangular ruler
    case 'visual':      return '\u2728';         // sparkles
    default:            return '\uD83D\uDCCB';  // clipboard
  }
}

/**
 * Capitalize the first character of a string.
 * Returns the input unchanged if falsy.
 *
 * @param {string} s
 * @returns {string}
 */
function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = {
  pct,
  px,
  arr,
  colorBadge,
  scoreColor,
  categoryEmoji,
  capitalize,
};
