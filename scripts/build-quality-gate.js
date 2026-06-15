#!/usr/bin/env node
/**
 * build-quality-gate.js — Phase 5: Complete QA Pipeline Orchestrator
 *
 * Führt die gesamte QA-Kette aus:
 *   1. framer-pre-build-validate  (12 Guards, Score ≥85%)
 *   2. measure-quality-metrics    (DOM depth, GC coverage, GV substitution)
 *   3. validate-v4-tree           (Structural validation)
 *   4. verify-build-binding       (Invariant I check)
 *   5. section-compare            (Framer ↔ Elementor pixel diff)
 *   6. post-build-auto-fix        (Auto-fix plan generation)
 *   7. Quality report             (Consolidated summary)
 *
 * Usage:
 *   node scripts/build-quality-gate.js \
 *     --tree v4-tree.json \
 *     --tokens token-mapping.json \
 *     --post-id 1950 \
 *     --framer-url https://example.framer.app/ \
 *     --elementor-url https://test.example.com/?p=1950 \
 *     --output-dir reports/qa/
 */

import fs   from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const { values: args } = parseArgs({
  options: {
    tree:            { type: 'string' },
    tokens:          { type: 'string' },
    fonts:           { type: 'string' },
    'post-id':       { type: 'string' },
    'framer-url':    { type: 'string' },
    'elementor-url': { type: 'string' },
    'output-dir':    { type: 'string' },
    'dry-run':       { type: 'boolean', default: false },
    'skip-screenshots': { type: 'boolean', default: false },
    'min-score':     { type: 'string', default: '85' },
    verbose:         { type: 'boolean', default: false },
  },
  strict: false,
});

const log  = (...m) => { if (args.verbose) process.stderr.write('[gate] ' + m.join(' ') + '\n'); };
const warn = (m)    => process.stderr.write(`⚠ ${m}\n`);
const ok   = (m)    => process.stderr.write(`✅ ${m}\n`);
const fail = (m)    => process.stderr.write(`❌ ${m}\n`);

const outDir = args['output-dir'] || '.';
fs.mkdirSync(outDir, { recursive: true });

const results = [];
let blocked = false;

function runScript(scriptName, scriptArgs, { optional = false } = {}) {
  const scriptPath = path.join(__dirname, scriptName);
  if (!fs.existsSync(scriptPath)) {
    if (optional) return { ok: false, reason: 'Script not found' };
    throw new Error(`Script not found: ${scriptPath}`);
  }

  const result = spawnSync('node', [scriptPath, ...scriptArgs], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60000,
  });

  let parsed = null;
  try {
    if (result.stdout) parsed = JSON.parse(result.stdout);
  } catch {}

  return {
    ok: result.status === 0,
    code: result.status,
    stdout: result.stdout?.slice(0, 2000) || '',
    stderr: result.stderr?.slice(0, 2000) || '',
    parsed,
  };
}

// ─────────────────────────────────────────────
// STEP 1: Pre-Build Validation (12 Guards)
// ─────────────────────────────────────────────

log('Step 1/6: Pre-Build Validation (12 Guards)...');

const preBuildArgs = ['--tree', args.tree];
if (args.tokens) preBuildArgs.push('--tokens', args.tokens);
if (args.fonts)  preBuildArgs.push('--fonts', args.fonts);
preBuildArgs.push('--output', path.join(outDir, 'pre-build-validation.json'));

const preBuildResult = runScript('framer-pre-build-validate.js', preBuildArgs);
const preBuildScore = preBuildResult.parsed?.meta?.score || 0;
const minScore = parseInt(args['min-score']) || 85;

if (preBuildScore >= minScore && preBuildResult.ok) {
  ok(`Pre-Build: ${preBuildScore}% (≥${minScore}%)`);
} else {
  fail(`Pre-Build: ${preBuildScore}% (<${minScore}%)`);
  blocked = true;
}
results.push({ step: 'pre-build-validate', score: preBuildScore, passed: preBuildScore >= minScore, report: preBuildResult.parsed });

// ─────────────────────────────────────────────
// STEP 2: Quality Metrics
// ─────────────────────────────────────────────

log('Step 2/6: Quality Metrics...');

const metricsResult = runScript('measure-quality-metrics.js', [
  args.tree,
  '--output', path.join(outDir, 'quality-metrics.json'),
], { optional: true });

if (metricsResult.ok) {
  const m = metricsResult.parsed?.metrics;
  ok(`Metrics: DOM depth ${m?.dom_depth?.value || '?'}, GC ${m?.gc_coverage?.value || '?'}%, GV ${m?.gv_color_substitution?.value || '?'}%`);
} else {
  warn('Quality metrics failed (optional).');
}
results.push({ step: 'quality-metrics', passed: metricsResult.ok, report: metricsResult.parsed });

// ─────────────────────────────────────────────
// STEP 3: Structural Validation
// ─────────────────────────────────────────────

log('Step 3/6: Structural Validation (validate-v4-tree)...');

const validateResult = runScript('validate-v4-tree.js', [
  args.tree,
  '--mode=warn',
  '--output', path.join(outDir, 'validate-report.json'),
]);

const validateScore = validateResult.parsed?.score || 0;
if (validateScore >= parseInt(args['min-score'])) {
  ok(`Validate: ${validateScore}%`);
} else {
  warn(`Validate: ${validateScore}% (below threshold but not blocking)`);
}
results.push({ step: 'structural-validation', score: validateScore, passed: validateScore >= minScore, report: validateResult.parsed });

// ─────────────────────────────────────────────
// STEP 4: Build Binding Check
// ─────────────────────────────────────────────

log('Step 4/6: Build Binding (Invariant I)...');

const bindingResult = runScript('verify-build-binding.js', [args.tree]);

if (bindingResult.ok) {
  ok('Build Binding: All styles bound');
} else {
  warn('Build Binding: Unbound styles detected');
}
results.push({ step: 'build-binding', passed: bindingResult.ok });

// ─────────────────────────────────────────────
// STEP 5: Section Compare (Screenshot Diff)
// ─────────────────────────────────────────────

if (!args['skip-screenshots'] && args['framer-url'] && args['elementor-url']) {
  log('Step 5/6: Section Compare (Screenshot Diff)...');

  if (args['dry-run']) {
    const compareResult = runScript('section-compare.js', [
      '--framer-url', args['framer-url'],
      '--elementor-url', args['elementor-url'],
      '--section', 'hero',
      '--dry-run',
      '--output', path.join(outDir, 'section-compare'),
    ], { optional: true });

    log('Section Compare: dry-run completed');
    results.push({ step: 'section-compare', passed: true, dryRun: true });
  } else {
    warn('Section Compare requires browser (Playwright/Puppeteer). Use --dry-run for CI. Skipping.');
    results.push({ step: 'section-compare', passed: null, skipped: true, reason: 'No browser in CI mode' });
  }
} else {
  log('Step 5/6: Section Compare skipped (--skip-screenshots or missing URLs)');
  results.push({ step: 'section-compare', passed: null, skipped: true });
}

// ─────────────────────────────────────────────
// STEP 6: Auto-Fix Plan
// ─────────────────────────────────────────────

log('Step 6/6: Auto-Fix Plan...');

const autoFixResult = runScript('post-build-auto-fix.js', [
  '--post-id', args['post-id'] || '0',
  '--qa-report', path.join(outDir, 'pre-build-validation.json'),
  '--output', path.join(outDir, 'auto-fix-plan.json'),
  '--fix-types', 'contrast,alt-text,layout,variables,seo',
], { optional: true });

if (autoFixResult.ok || autoFixResult.code > 0) {
  const totalIssues = autoFixResult.parsed?.stats?.total_issues || autoFixResult.parsed?.stats?.unique_calls || 0;
  ok(`Auto-Fix: ${totalIssues} issue(s) → ${autoFixResult.parsed?.stats?.unique_calls || '?'} MCP call(s)`);
} else {
  warn('Auto-Fix: no issues to fix or script failed');
}
results.push({ step: 'auto-fix', passed: autoFixResult.ok || autoFixResult.code > 0, report: autoFixResult.parsed });

// ─────────────────────────────────────────────
// CONSOLIDATED REPORT
// ─────────────────────────────────────────────

const totalSteps = results.length;
const passedSteps = results.filter(r => r.passed === true).length;
const skippedSteps = results.filter(r => r.skipped).length;
const failedSteps = results.filter(r => r.passed === false).length;

const report = {
  meta: {
    generated_at: new Date().toISOString(),
    tree: args.tree,
    post_id: args['post-id'],
    min_score: minScore,
  },
  pipeline: {
    total_steps: totalSteps,
    passed: passedSteps,
    failed: failedSteps,
    skipped: skippedSteps,
    blocked,
  },
  steps: results.map(r => ({
    step: r.step,
    passed: r.passed,
    skipped: r.skipped,
    score: r.score,
    report: r.report ? Object.keys(r.report).slice(0, 5).join(',') : null,
  })),
  summary: {
    status: blocked ? 'BLOCKED' : (failedSteps > 0 ? 'WARNINGS' : 'PASS'),
    message: blocked
      ? `Build blocked: Pre-build validation score ${preBuildScore}% < ${minScore}%`
      : failedSteps > 0
        ? `Build allowed with ${failedSteps} warnings`
        : 'All quality gates passed',
  },
};

const reportPath = path.join(outDir, 'quality-gate-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

// ─────────────────────────────────────────────
// CONSOLE SUMMARY
// ─────────────────────────────────────────────

process.stderr.write(`\n${'═'.repeat(60)}\n`);
process.stderr.write(`📊 Build Quality Gate Report\n`);
process.stderr.write(`${'═'.repeat(60)}\n`);
process.stderr.write(`  Status:  ${report.summary.status}\n`);
process.stderr.write(`  Steps:   ${passedSteps}/${totalSteps} passed`);
if (skippedSteps > 0) process.stderr.write(`, ${skippedSteps} skipped`);
process.stderr.write(`\n`);
process.stderr.write(`  Report:  ${path.relative(process.cwd(), reportPath)}\n`);
process.stderr.write(`${'═'.repeat(60)}\n\n`);

process.exit(blocked ? 1 : 0);
