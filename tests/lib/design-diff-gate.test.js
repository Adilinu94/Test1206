/**
 * tests/lib/design-diff-gate.test.js
 *
 * Unit tests for processDesignDiffResult() — the pure decision logic extracted
 * from build-quality-gate.js Step 5.
 *
 * Covers:
 *   - FAIL → blocked = true  (strict, default)
 *   - FAIL → blocked = false (non-strict, --no-design-diff-strict)
 *   - WARN → never blocks
 *   - PASS → never blocks
 *   - dry-run → PASS with dryRun flag
 *   - null/missing report → SKIP
 *   - external failure reason → SKIP
 *   - mixed severity categories
 *   - strict default (omitted opts.strict)
 *
 * Run: node --test tests/lib/design-diff-gate.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { processDesignDiffResult } from '../../scripts/lib/design-diff-gate.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal design-diff report object with a single category.
 *
 * @param {'PASS'|'WARN'|'FAIL'} severity
 * @param {string} [category='colors']
 * @param {number} [overallScore] — optional overall_score for numeric threshold tests
 * @returns {import('../../scripts/lib/design-diff-gate.js').DesignDiffReport}
 */
function makeReport(severity, category = 'colors', overallScore) {
  const meta = {
    max_severity: severity,
    categories_tested: 1,
  };
  if (overallScore !== undefined) meta.overall_score = overallScore;
  return {
    meta,
    diff: [{
      category,
      severity,
    }],
  };
}

/**
 * Build a multi-category report.
 *
 * @param {Array<{category:string, severity:'PASS'|'WARN'|'FAIL'}>} cats
 * @returns {import('../../scripts/lib/design-diff-gate.js').DesignDiffReport}
 */
function makeMultiReport(cats) {
  const severities = cats.map(c => c.severity);
  const max = severities.includes('FAIL') ? 'FAIL'
    : severities.includes('WARN') ? 'WARN'
    : 'PASS';
  return {
    meta: {
      max_severity: max,
      categories_tested: cats.length,
    },
    diff: cats,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('processDesignDiffResult — FAIL severity', () => {

  test('FAIL + strict (default) → blocked=true, passed=false, severity=FAIL', () => {
    const report = makeReport('FAIL', 'colors');
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.blocked, true, 'FAIL + strict must block the build');
    assert.equal(result.severity, 'FAIL');
    assert.equal(result.passed, false);
    assert.equal(result.skipped, false);
    assert.ok(result.message.includes('FAIL'), `Message must contain FAIL: "${result.message}"`);
    assert.ok(result.message.includes('colors'), `Message must name category: "${result.message}"`);
  });

  test('FAIL + strict (default omitted) → blocked=true (strict defaults to true)', () => {
    const report = makeReport('FAIL', 'typography');
    const result = processDesignDiffResult(report, {}); // no explicit strict

    assert.equal(result.blocked, true, 'Default strict should be true');
    assert.equal(result.severity, 'FAIL');
    assert.equal(result.passed, false);
  });

  test('FAIL + non-strict (--no-design-diff-strict) → blocked=false, severity still FAIL', () => {
    const report = makeReport('FAIL', 'spacing');
    const result = processDesignDiffResult(report, { strict: false });

    assert.equal(result.blocked, false, 'non-strict FAIL must NOT block');
    assert.equal(result.severity, 'FAIL');
    assert.equal(result.passed, false);
    assert.equal(result.skipped, false);
    assert.ok(result.message.includes('non-strict'), `Message must mention non-strict: "${result.message}"`);
    assert.ok(result.message.includes('blocking disabled'), `Message must indicate blocking disabled: "${result.message}"`);
  });

  test('FAIL → step record has severity=FAIL, passed=false, categories populated', () => {
    const report = makeReport('FAIL', 'colors');
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.step.step, 'design-diff');
    assert.equal(result.step.passed, false);
    assert.equal(result.step.severity, 'FAIL');
    assert.equal(result.step.categories.length, 1);
    assert.equal(result.step.categories[0].category, 'colors');
    assert.equal(result.step.categories[0].severity, 'FAIL');
  });

  test('FAIL with multiple FAIL categories → message lists all FAIL categories', () => {
    const report = makeMultiReport([
      { category: 'colors', severity: 'FAIL' },
      { category: 'typography', severity: 'FAIL' },
      { category: 'spacing', severity: 'PASS' },
    ]);
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.blocked, true);
    assert.ok(result.message.includes('2 category(s) FAIL'), `Should say 2 FAIL: "${result.message}"`);
    assert.ok(result.message.includes('colors'), `Should mention colors: "${result.message}"`);
    assert.ok(result.message.includes('typography'), `Should mention typography: "${result.message}"`);
    // spacing is PASS, should NOT appear in the FAIL list
    assert.ok(!result.message.match(/spacing.*FAIL/), 'PASS category must not appear as FAIL');
  });
});

describe('processDesignDiffResult — WARN severity', () => {

  test('WARN + strict → blocked=false (WARN never blocks)', () => {
    const report = makeReport('WARN', 'typography');
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.blocked, false, 'WARN must never block');
    assert.equal(result.severity, 'WARN');
    assert.equal(result.passed, false);
    assert.equal(result.skipped, false);
    assert.ok(result.message.includes('WARN'), `Message must contain WARN: "${result.message}"`);
  });

  test('WARN + non-strict → blocked=false (same as strict)', () => {
    const report = makeReport('WARN', 'typography');
    const result = processDesignDiffResult(report, { strict: false });

    assert.equal(result.blocked, false);
    assert.equal(result.severity, 'WARN');
    assert.equal(result.passed, false);
  });

  test('WARN → step record has passed=false, severity=WARN', () => {
    const report = makeReport('WARN', 'spacing');
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.step.step, 'design-diff');
    assert.equal(result.step.passed, false);
    assert.equal(result.step.severity, 'WARN');
    assert.equal(result.step.categories.length, 1);
  });

  test('WARN with multiple WARN categories → message lists them all', () => {
    const report = makeMultiReport([
      { category: 'colors', severity: 'WARN' },
      { category: 'typography', severity: 'WARN' },
      { category: 'layout', severity: 'PASS' },
    ]);
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.blocked, false);
    assert.equal(result.severity, 'WARN');
    assert.ok(result.message.includes('2 category(s) WARN'), `Should say 2 WARN: "${result.message}"`);
    assert.ok(result.message.includes('colors') && result.message.includes('typography'),
      'Both WARN categories should be named');
    assert.ok(!result.message.match(/layout.*WARN/), 'PASS category must not appear as WARN');
  });
});

describe('processDesignDiffResult — PASS severity', () => {

  test('PASS → blocked=false, passed=true', () => {
    const report = makeReport('PASS', 'colors');
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.blocked, false);
    assert.equal(result.severity, 'PASS');
    assert.equal(result.passed, true);
    assert.equal(result.skipped, false);
    assert.ok(result.message.includes('PASS'), `Message must contain PASS: "${result.message}"`);
    assert.ok(result.message.includes('categories_tested' in report.meta
      ? String(report.meta.categories_tested) : ''), 'Message should mention count');
  });

  test('PASS + non-strict → same as strict (PASS is always PASS)', () => {
    const report = makeReport('PASS', 'colors');
    const strict   = processDesignDiffResult(report, { strict: true });
    const nonStrict = processDesignDiffResult(report, { strict: false });

    assert.deepEqual(strict.blocked, nonStrict.blocked);
    assert.deepEqual(strict.severity, nonStrict.severity);
  });

  test('PASS → step record has passed=true, severity=PASS', () => {
    const report = makeReport('PASS', 'typography');
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.step.step, 'design-diff');
    assert.equal(result.step.passed, true);
    assert.equal(result.step.severity, 'PASS');
    assert.equal(result.step.categories[0].severity, 'PASS');
  });
});

describe('processDesignDiffResult — dry-run', () => {

  test('dry-run → blocked=false, passed=true, severity=PASS, dryRun flag', () => {
    const report = {
      meta: { backend: 'dry-run' },
    };
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.blocked, false);
    assert.equal(result.severity, 'PASS');
    assert.equal(result.passed, true);
    assert.equal(result.skipped, false);
    assert.ok(result.message.includes('dry-run'), `Message must mention dry-run: "${result.message}"`);
    assert.equal(result.step.dryRun, true, 'step must carry dryRun: true');
  });
});

describe('processDesignDiffResult — null / missing / malformed report', () => {

  test('null report → SKIP, blocked=false, passed=null, skipped=true', () => {
    const result = processDesignDiffResult(null, { strict: true });

    assert.equal(result.blocked, false);
    assert.equal(result.severity, 'SKIP');
    assert.equal(result.passed, null);
    assert.equal(result.skipped, true);
    assert.ok(result.message.includes('no valid JSON report'), `Must mention no valid JSON report: "${result.message}"`);
    assert.equal(result.step.reason, 'No valid report');
  });

  test('undefined report → SKIP (same as null)', () => {
    const result = processDesignDiffResult(undefined, { strict: true });

    assert.equal(result.blocked, false);
    assert.equal(result.severity, 'SKIP');
    assert.equal(result.passed, null);
    assert.equal(result.skipped, true);
  });

  test('report with no meta → SKIP', () => {
    const result = processDesignDiffResult({ diff: [] }, { strict: true });

    assert.equal(result.severity, 'SKIP');
    assert.equal(result.passed, null);
    assert.equal(result.skipped, true);
  });

  test('report with meta but no max_severity → SKIP', () => {
    const result = processDesignDiffResult({ meta: {}, diff: [] }, { strict: true });

    assert.equal(result.severity, 'SKIP');
    assert.equal(result.passed, null);
  });
});

describe('processDesignDiffResult — external failure reason', () => {

  test('reason provided (script not found) → SKIP with reason in message and step', () => {
    const result = processDesignDiffResult(null, {
      strict: true,
      reason: 'Script not found',
    });

    assert.equal(result.blocked, false);
    assert.equal(result.severity, 'SKIP');
    assert.equal(result.passed, null);
    assert.equal(result.skipped, true);
    assert.ok(result.message.includes('Script not found'), `Message must include reason: "${result.message}"`);
    assert.equal(result.step.reason, 'Script not found');
  });

  test('reason passed alongside valid report: valid report wins (matching original else-if chain)', () => {
    // In practice, reason is only set when the script itself crashed (file not found),
    // and in that case designDiffReport would be null. But if both were somehow present,
    // the valid report takes priority — matching the original else-if order.
    const report = makeReport('FAIL', 'colors');
    const result = processDesignDiffResult(report, {
      strict: true,
      reason: 'Browser crashed',
    });

    // Valid report (max_severity) is checked before reason → FAIL, not SKIP
    assert.equal(result.severity, 'FAIL');
    assert.equal(result.blocked, true);
    assert.ok(result.message.includes('FAIL'), `Message must contain FAIL: "${result.message}"`);
  });
});

describe('processDesignDiffResult — edge cases', () => {

  test('FAIL with empty diff array but max_severity=FAIL → blocked=true', () => {
    const report = {
      meta: { max_severity: 'FAIL', categories_tested: 0 },
      diff: [],
    };
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.blocked, true);
    assert.equal(result.severity, 'FAIL');
    assert.ok(result.message.includes('0 category(s) FAIL'), `Should say 0 FAIL: "${result.message}"`);
  });

  test('mixed FAIL+WARN report: max_severity is FAIL, non-FAIL cats not in FAIL message', () => {
    const report = makeMultiReport([
      { category: 'colors', severity: 'FAIL' },
      { category: 'typography', severity: 'WARN' },
      { category: 'spacing', severity: 'PASS' },
    ]);
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.blocked, true);
    assert.equal(result.severity, 'FAIL');
    // Only 1 FAIL, not 2
    assert.ok(result.message.includes('1 category(s) FAIL'),
      `Should say 1 FAIL, got: "${result.message}"`);
    assert.ok(result.message.includes('colors'), 'FAIL category should be named');
    assert.ok(!result.message.includes('typography'), 'WARN category should NOT be in FAIL message');
  });

  test('step.categories includes ALL categories (not just FAIL ones)', () => {
    const report = makeMultiReport([
      { category: 'colors', severity: 'FAIL' },
      { category: 'typography', severity: 'WARN' },
      { category: 'spacing', severity: 'PASS' },
    ]);
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.step.categories.length, 3, 'All 3 categories should be in step record');
    assert.equal(result.step.categories[0].category, 'colors');
    assert.equal(result.step.categories[1].category, 'typography');
    assert.equal(result.step.categories[2].category, 'spacing');
  });

  test('strict=false does NOT affect PASS and WARN (only FAIL)', () => {
    const warnReport = makeReport('WARN', 'typography');
    const passReport = makeReport('PASS', 'colors');

    const warnStrict   = processDesignDiffResult(warnReport, { strict: true });
    const warnNonStrict = processDesignDiffResult(warnReport, { strict: false });
    assert.equal(warnStrict.blocked, warnNonStrict.blocked,
      'WARN should be unaffected by strict flag');

    const passStrict   = processDesignDiffResult(passReport, { strict: true });
    const passNonStrict = processDesignDiffResult(passReport, { strict: false });
    assert.equal(passStrict.blocked, passNonStrict.blocked,
      'PASS should be unaffected by strict flag');
  });
});

// ── NUMERIC THRESHOLD (--design-diff-min-score) ───────────────────────────────

describe('processDesignDiffResult — numeric threshold (minScore)', () => {

  test('overall_score < minScore + strict → blocked=true, severity=FAIL', () => {
    // Even though max_severity is WARN (not FAIL), the numeric score threshold
    // overrides: score 55 < minScore 70 → FAIL + blocked
    const report = makeReport('WARN', 'typography', 55);
    const result = processDesignDiffResult(report, { strict: true, minScore: 70 });

    assert.equal(result.blocked, true, 'Score below threshold must block');
    assert.equal(result.severity, 'FAIL');
    assert.equal(result.passed, false);
    assert.ok(result.message.includes('55/100'), `Message must mention score: "${result.message}"`);
    assert.ok(result.message.includes('70/100'), `Message must mention threshold: "${result.message}"`);
    assert.ok(result.message.includes('< threshold'), `Message must mention threshold: "${result.message}"`);
  });

  test('overall_score < minScore + non-strict → blocked=false, severity=FAIL', () => {
    const report = makeReport('WARN', 'typography', 55);
    const result = processDesignDiffResult(report, { strict: false, minScore: 70 });

    assert.equal(result.blocked, false, 'Score below threshold + non-strict must NOT block');
    assert.equal(result.severity, 'FAIL');
    assert.equal(result.passed, false);
    assert.ok(result.message.includes('non-strict'), `Must mention non-strict: "${result.message}"`);
    assert.ok(result.message.includes('55/100'), `Must mention score: "${result.message}"`);
  });

  test('overall_score >= minScore → falls through to categorical check (not blocked by score)', () => {
    // Score 85 >= minScore 70 → score check passes, fall through to WARN → blocked=false
    const report = makeReport('WARN', 'typography', 85);
    const result = processDesignDiffResult(report, { strict: true, minScore: 70 });

    assert.equal(result.blocked, false, 'Score above threshold must not block');
    assert.equal(result.severity, 'WARN', 'Should fall through to categorical WARN');
    assert.ok(result.message.includes('85/100'), `Message should include score: "${result.message}"`);
    assert.ok(!result.message.includes('threshold'), 'Should NOT mention threshold in categorical message');
  });

  test('overall_score >= minScore + categorical FAIL + strict → blocked=true (categorical)', () => {
    // Score 80 >= minScore 70 → score check passes, but categorical FAIL blocks
    const report = makeReport('FAIL', 'colors', 80);
    const result = processDesignDiffResult(report, { strict: true, minScore: 70 });

    assert.equal(result.blocked, true, 'Categorical FAIL must still block when score is OK');
    assert.equal(result.severity, 'FAIL');
    assert.ok(result.message.includes('80/100'), `Message should include score: "${result.message}"`);
  });

  test('minScore set but no overall_score in report → falls through to categorical', () => {
    // Report without overall_score should not trigger score check
    const report = makeReport('FAIL', 'colors'); // no overallScore arg
    const result = processDesignDiffResult(report, { strict: true, minScore: 70 });

    assert.equal(result.blocked, true, 'Categorical FAIL should still block');
    assert.equal(result.severity, 'FAIL');
    assert.ok(!result.message.includes('/100'), 'Should NOT include score when undefined');
  });

  test('minScore=0 → never blocks by score (any score >= 0 passes)', () => {
    const report = makeReport('PASS', 'colors', 5);
    const result = processDesignDiffResult(report, { strict: true, minScore: 0 });

    assert.equal(result.blocked, false);
    assert.equal(result.severity, 'PASS');
    assert.ok(result.message.includes('5/100'), `Should mention score: "${result.message}"`);
  });

  test('minScore=100 → blocks unless perfect score', () => {
    // Score 99 < 100 → blocked
    const report = makeReport('PASS', 'colors', 99);
    const result = processDesignDiffResult(report, { strict: true, minScore: 100 });

    assert.equal(result.blocked, true, '99 < 100 must block');
    assert.equal(result.severity, 'FAIL');
    assert.ok(result.message.includes('99/100 < threshold 100/100'), `Must show comparison: "${result.message}"`);
  });

  test('minScore=100 + score=100 → falls through to categorical PASS', () => {
    const report = makeReport('PASS', 'colors', 100);
    const result = processDesignDiffResult(report, { strict: true, minScore: 100 });

    assert.equal(result.blocked, false);
    assert.equal(result.severity, 'PASS');
    assert.ok(result.message.includes('100/100'), `Should mention perfect score: "${result.message}"`);
  });

  test('step record includes overall_score when present', () => {
    const report = makeReport('PASS', 'colors', 92);
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.step.overall_score, 92, 'Step must carry overall_score');
  });

  test('step record omits overall_score when undefined', () => {
    const report = makeReport('PASS', 'colors'); // no overallScore
    const result = processDesignDiffResult(report, { strict: true });

    assert.equal(result.step.overall_score, undefined, 'Step must not have overall_score when undefined');
  });

  test('numeric threshold applies to multi-category PASS report too', () => {
    // A PASS report with low score should still be blocked if score < threshold
    const report = makeReport('PASS', 'colors', 40);
    const result = processDesignDiffResult(report, { strict: true, minScore: 60 });

    assert.equal(result.blocked, true, 'Low-scoring PASS should be blocked by threshold');
    assert.equal(result.severity, 'FAIL');
    assert.ok(result.message.includes('40/100 < threshold 60/100'), `Must show score comparison: "${result.message}"`);
  });

  test('score threshold correctly counts FAIL and WARN categories in message', () => {
    const report = {
      meta: { max_severity: 'WARN', categories_tested: 3, overall_score: 45 },
      diff: [
        { category: 'colors', severity: 'FAIL' },
        { category: 'typography', severity: 'WARN' },
        { category: 'layout', severity: 'PASS' },
      ],
    };
    const result = processDesignDiffResult(report, { strict: true, minScore: 70 });

    assert.equal(result.blocked, true);
    assert.equal(result.severity, 'FAIL');
    assert.ok(result.message.includes('1 FAIL'), `Must count 1 FAIL: "${result.message}"`);
    assert.ok(result.message.includes('1 WARN'), `Must count 1 WARN: "${result.message}"`);
  });
});

describe('processDesignDiffResult — edge cases (continued)', () => {

  test('strict=false does NOT affect PASS and WARN (only FAIL)', () => {
    const warnReport = makeReport('WARN', 'typography');
    const passReport = makeReport('PASS', 'colors');

    const warnStrict   = processDesignDiffResult(warnReport, { strict: true });
    const warnNonStrict = processDesignDiffResult(warnReport, { strict: false });
    assert.equal(warnStrict.blocked, warnNonStrict.blocked,
      'WARN should be unaffected by strict flag');

    const passStrict   = processDesignDiffResult(passReport, { strict: true });
    const passNonStrict = processDesignDiffResult(passReport, { strict: false });
    assert.equal(passStrict.blocked, passNonStrict.blocked,
      'PASS should be unaffected by strict flag');
  });
});
