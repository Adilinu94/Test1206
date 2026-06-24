/**
 * design-diff-gate.js
 *
 * Pure decision logic extracted from build-quality-gate.js Step 5.
 * Takes a parsed design-diff JSON report and returns a result object
 * indicating whether the build should be blocked, and what step record
 * to push into the results array.
 *
 * This module exists so the FAIL → blocked logic and --design-diff-strict
 * / --no-design-diff-strict branching can be unit-tested without spawning
 * child processes or needing Playwright.
 */

/**
 * @typedef {Object} DesignDiffCategory
 * @property {string} category  — e.g. "colors", "typography"
 * @property {'PASS'|'WARN'|'FAIL'} severity
 */

/**
 * @typedef {Object} DesignDiffReport
 * @property {{ max_severity?: 'PASS'|'WARN'|'FAIL', categories_tested?: number, backend?: string }} meta
 * @property {DesignDiffCategory[]} diff
 */

/**
 * @typedef {Object} DesignDiffGateResult
 * @property {boolean}           blocked    — true when FAIL + strict
 * @property {'PASS'|'WARN'|'FAIL'|'SKIP'} severity
 * @property {boolean|null}      passed     — true=PASS, false=WARN/FAIL, null=SKIP
 * @property {boolean}           skipped
 * @property {string}            message    — human-readable summary
 * @property {Object}            step       — ready to push into results[]
 */

/**
 * Process a parsed design-diff report and return a gate decision.
 *
 * @param {DesignDiffReport|null} report  — parsed design-diff JSON, or null
 * @param {Object}               opts
 * @param {boolean}              opts.strict  — --design-diff-strict (default true)
 * @param {number}               [opts.minScore] — numeric threshold (0-100); blocks if overall_score < minScore
 * @param {string}               [opts.reason] — external failure reason (script error, missing file)
 * @returns {DesignDiffGateResult}
 */
export function processDesignDiffResult(report, { strict = true, minScore, reason } = {}) {
  // ── dry-run path ──────────────────────────────────────────────────
  if (report?.meta?.backend === 'dry-run') {
    return {
      blocked: false,
      severity: 'PASS',
      passed: true,
      skipped: false,
      message: 'Design Diff: dry-run completed',
      step: { step: 'design-diff', passed: true, dryRun: true },
    };
  }

  // ── valid report with severity ────────────────────────────────────
  if (report?.meta?.max_severity) {
    const maxSev = report.meta.max_severity;
    const overallScore = report.meta.overall_score;
    const failedCats = (report.diff || []).filter(d => d.severity !== 'PASS');
    const failCats = failedCats.filter(d => d.severity === 'FAIL');
    const categories = report.diff?.map(d => ({
      category: d.category,
      severity: d.severity,
    })) || [];

    // ── Numeric score threshold check (supplements categorical) ───
    if (minScore != null && typeof overallScore === 'number' && overallScore < minScore) {
      const scoreMsg = `Design Diff: overall score ${overallScore}/100 < threshold ${minScore}/100 — ${failCats.length} FAIL, ${failedCats.filter(d => d.severity === 'WARN').length} WARN`;
      if (strict) {
        return {
          blocked: true,
          severity: 'FAIL',
          passed: false,
          skipped: false,
          message: scoreMsg,
          step: { step: 'design-diff', passed: false, severity: 'FAIL', categories, overall_score: overallScore },
        };
      }
      return {
        blocked: false,
        severity: 'FAIL',
        passed: false,
        skipped: false,
        message: scoreMsg + ' (non-strict: blocking disabled)',
        step: { step: 'design-diff', passed: false, severity: 'FAIL', categories, overall_score: overallScore },
      };
    }

    if (maxSev === 'PASS') {
      return {
        blocked: false,
        severity: 'PASS',
        passed: true,
        skipped: false,
        message: `Design Diff: All ${report.meta.categories_tested} categories PASS` + (typeof overallScore === 'number' ? ` (score ${overallScore}/100)` : ''),
        step: { step: 'design-diff', passed: true, severity: 'PASS', categories, overall_score: overallScore },
      };
    }

    if (maxSev === 'WARN') {
      return {
        blocked: false,
        severity: 'WARN',
        passed: false,
        skipped: false,
        message: `Design Diff: ${failedCats.length} category(s) WARN — ${failedCats.map(d => d.category).join(', ')}` + (typeof overallScore === 'number' ? ` (score ${overallScore}/100)` : ''),
        step: { step: 'design-diff', passed: false, severity: 'WARN', categories, overall_score: overallScore },
      };
    }

    if (maxSev === 'FAIL') {
      if (strict) {
        return {
          blocked: true,
          severity: 'FAIL',
          passed: false,
          skipped: false,
          message: `Design Diff: ${failCats.length} category(s) FAIL — ${failCats.map(d => d.category).join(', ')}` + (typeof overallScore === 'number' ? ` (score ${overallScore}/100)` : ''),
          step: { step: 'design-diff', passed: false, severity: 'FAIL', categories, overall_score: overallScore },
        };
      }
      return {
        blocked: false,
        severity: 'FAIL',
        passed: false,
        skipped: false,
        message: `Design Diff: ${failCats.length} category(s) FAIL — ${failCats.map(d => d.category).join(', ')} (non-strict: blocking disabled)` + (typeof overallScore === 'number' ? ` (score ${overallScore}/100)` : ''),
        step: { step: 'design-diff', passed: false, severity: 'FAIL', categories, overall_score: overallScore },
      };
    }
  }

  // ── external failure (script error, missing file) ─────────────────
  if (reason) {
    return {
      blocked: false,
      severity: 'SKIP',
      passed: null,
      skipped: true,
      message: `Design Diff: ${reason}`,
      step: { step: 'design-diff', passed: null, skipped: true, reason },
    };
  }

  // ── no valid report ───────────────────────────────────────────────
  return {
    blocked: false,
    severity: 'SKIP',
    passed: null,
    skipped: true,
    message: 'Design Diff: produced no valid JSON report',
    step: { step: 'design-diff', passed: null, skipped: true, reason: 'No valid report' },
  };
}
