#!/usr/bin/env node
/**
 * build-quality-gate.js — Phase 5: Complete QA Pipeline Orchestrator
 *
 * Führt die gesamte QA-Kette aus:
 *   1. framer-pre-build-validate  (12 Guards, Score ≥85%)
 *   2. measure-quality-metrics    (DOM depth, GC coverage, GV substitution)
 *   3. validate-v4-tree           (Structural validation)
 *   4. verify-build-binding       (Invariant I check)
 *   5. design-diff                (Framer ↔ Elementor CSS computed-style diff)
 *   6. section-compare            (Framer ↔ Elementor pixel diff)
 *   7. post-build-auto-fix        (Auto-fix plan generation)
 *   8. Quality report             (Consolidated summary)
 *
 * Usage:
 *   node scripts/build-quality-gate.js \
 *     --tree v4-tree.json \
 *     --tokens token-mapping.json \
 *     --post-id 1950 \
 *     --framer-url https://example.framer.app/ \
 *     --elementor-url https://test.example.com/?p=1950 \
 *     --output-dir reports/qa/
 *     [--skip-design-diff] [--skip-screenshots]
 *     [--design-diff-strict] [--no-design-diff-strict]
 *     [--design-diff-min-score 70]
 *     [--apply-fixes] [--apply-fixes-inject] [--skip-apply-fixes]
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync, spawn } from 'node:child_process';
import { processDesignDiffResult } from './lib/design-diff-gate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    tree:            { type: 'string' },
    tokens:          { type: 'string' },
    fonts:           { type: 'string' },
    'post-id':       { type: 'string' },
    'framer-url':    { type: 'string' },
    'elementor-url': { type: 'string' },
    'output-dir':    { type: 'string' },
    'dry-run':             { type: 'boolean', default: false },
    'skip-screenshots':     { type: 'boolean', default: false },
    'skip-design-diff':      { type: 'boolean', default: false },
    'design-diff-strict':    { type: 'boolean', default: true },
    'design-diff-min-score':  { type: 'string' },
    'framer-selector':       { type: 'string' },
    'elementor-selector':    { type: 'string' },
    'apply-fixes':           { type: 'boolean', default: false },
    'apply-fixes-inject':    { type: 'boolean', default: false },
    'skip-apply-fixes':      { type: 'boolean', default: false },
    'min-score':             { type: 'string', default: '85' },
    verbose:                { type: 'boolean', default: false },
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

/** Run a single script asynchronously (real parallelism via spawn). */
function runScriptAsync(scriptName, scriptArgs, { optional = false } = {}) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, scriptName);
    if (!fs.existsSync(scriptPath)) {
      if (optional) return resolve({ ok: false, reason: 'Script not found', code: -1 });
      return resolve({ ok: false, reason: `Script not found: ${scriptPath}`, code: -1 });
    }

    const child = spawn('node', [scriptPath, ...scriptArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: AbortSignal.timeout(60000),
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      let parsed = null;
      try { if (stdout) parsed = JSON.parse(stdout); } catch {}
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.slice(0, 2000),
        stderr: stderr.slice(0, 2000),
        parsed,
      });
    });

    child.on('error', (err) => {
      resolve({ ok: false, reason: err.message, code: -1 });
    });
  });
}

/** Run multiple analysis scripts in PARALLEL via Promise.allSettled. */
async function runScriptBatch(taskDefs) {
  const tasks = taskDefs.map(t => ({
    name: t.name,
    script: t.script,
    args: t.args,
    optional: t.optional,
  }));

  const settled = await Promise.allSettled(
    tasks.map(t =>
      runScriptAsync(t.script, t.args, { optional: t.optional })
        .then(result => ({ name: t.name, result }))
    )
  );

  return settled
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

// ─────────────────────────────────────────────
// STEP 1: Pre-Build Validation (12 Guards)
// ─────────────────────────────────────────────

log('Step 1/7: Pre-Build Validation (12 Guards)...');

const preBuildOutputPath = path.join(outDir, 'pre-build-validation.json');
const preBuildArgs = ['--tree', args.tree];
if (args.tokens) preBuildArgs.push('--tokens', args.tokens);
if (args.fonts)  preBuildArgs.push('--fonts', args.fonts);
preBuildArgs.push('--output', preBuildOutputPath);

const preBuildResult = runScript('framer-pre-build-validate.js', preBuildArgs);
// Primary: read from output file (script writes JSON there when --output is set, stdout stays empty)
let preBuildScore = 0;
try {
  const fileData = JSON.parse(fs.readFileSync(preBuildOutputPath, 'utf8'));
  preBuildScore = fileData.meta?.score || 0;
} catch {
  // Fallback: try stdout (when --output is not set or script version differs)
  preBuildScore = preBuildResult.parsed?.meta?.score || 0;
}
const minScore = parseInt(args['min-score']) || 85;

if (preBuildScore >= minScore && preBuildResult.ok) {
  ok(`Pre-Build: ${preBuildScore}% (≥${minScore}%)`);
} else {
  fail(`Pre-Build: ${preBuildScore}% (<${minScore}%)`);
  blocked = true;
}
results.push({ step: 'pre-build-validate', score: preBuildScore, passed: preBuildScore >= minScore, report: preBuildResult.parsed });

// ─────────────────────────────────────────────
// STEPS 2-4: Quality Metrics + Validation + Binding (PARALLEL)
// ─────────────────────────────────────────────

log('Steps 2-4/7: Quality Metrics + Structural Validation + Binding (batch)...');

const parallelTasks = [
  { name: 'quality-metrics', script: 'measure-quality-metrics.js', args: [args.tree, '--output', path.join(outDir, 'quality-metrics.json')], optional: true },
  { name: 'structural-validation', script: 'validate-v4-tree.js', args: [args.tree, '--mode=warn', '--output', path.join(outDir, 'validate-report.json')], optional: false },
  { name: 'build-binding', script: 'verify-build-binding.js', args: [args.tree], optional: false },
];

// Steps 2-4 run in PARALLEL (async spawn + Promise.allSettled)
const parallelResults = await runScriptBatch(parallelTasks);

for (const { name, result } of parallelResults) {
  if (name === 'quality-metrics') {
    if (result.ok) {
      const m = result.parsed?.metrics;
      ok(`Metrics: DOM depth ${m?.dom_depth?.value || '?'}, GC ${m?.gc_coverage?.value || '?'}%, GV ${m?.gv_color_substitution?.value || '?'}%`);
    } else {
      warn('Quality metrics failed (optional).');
    }
    results.push({ step: 'quality-metrics', passed: result.ok, report: result.parsed });
  } else if (name === 'structural-validation') {
    const validateScore = result.parsed?.score || 0;
    if (validateScore >= minScore) {
      ok(`Validate: ${validateScore}%`);
    } else {
      warn(`Validate: ${validateScore}% (below threshold but not blocking)`);
    }
    results.push({ step: 'structural-validation', score: validateScore, passed: validateScore >= minScore, report: result.parsed });
  } else if (name === 'build-binding') {
    if (result.ok) {
      ok('Build Binding: All styles bound');
    } else {
      warn('Build Binding: Unbound styles detected');
    }
    results.push({ step: 'build-binding', passed: result.ok });
  }
}

// ─────────────────────────────────────────────
// STEP 5: Design Diff (CSS computed-style comparison, no screenshots)
// ─────────────────────────────────────────────

if (!args['skip-design-diff'] && args['framer-url'] && args['elementor-url']) {
  log('Step 5/7: Design Diff (CSS computed styles)...');

  const designDiffOutputPath = path.join(outDir, 'design-diff.json');
  const designDiffArgs = [
    '--framer-url', args['framer-url'],
    '--elementor-url', args['elementor-url'],
    '--output', designDiffOutputPath,
    '--timeout', '45000',
  ];
  if (args['framer-selector']) designDiffArgs.push('--framer-selector', args['framer-selector']);
  if (args['elementor-selector']) designDiffArgs.push('--elementor-selector', args['elementor-selector']);
  if (args['dry-run']) designDiffArgs.push('--dry-run');

  const designDiffResult = await runScriptAsync('design-diff.js', designDiffArgs, { optional: true });

  // Read output from file (design-diff writes JSON to --output, not stdout)
  let designDiffReport = designDiffResult.parsed;
  if (!designDiffReport) {
    try { designDiffReport = JSON.parse(fs.readFileSync(designDiffOutputPath, 'utf8')); } catch {}
  }

  const gateResult = processDesignDiffResult(designDiffReport, {
    strict: args['design-diff-strict'],
    minScore: args['design-diff-min-score'] ? parseInt(args['design-diff-min-score'], 10) : undefined,
    reason: (designDiffResult.code === -1 || designDiffResult.reason)
      ? (designDiffResult.reason || 'script failed')
      : undefined,
  });

  if (gateResult.severity === 'PASS') {
    ok(gateResult.message);
  } else if (gateResult.severity === 'WARN') {
    warn(gateResult.message);
  } else if (gateResult.severity === 'FAIL') {
    if (gateResult.blocked) {
      fail(gateResult.message);
      blocked = blocked || gateResult.blocked;
    } else {
      warn(gateResult.message);
    }
  } else {
    warn(gateResult.message);
  }
  results.push(gateResult.step);
} else {
  log('Step 5/7: Design Diff skipped (--skip-design-diff or missing URLs)');
  results.push({ step: 'design-diff', passed: null, skipped: true });
}

// ─────────────────────────────────────────────
// STEP 5.5: Apply Design-Diff Fixes (auto-generate + inject CSS)
// ─────────────────────────────────────────────

if (!args['skip-apply-fixes'] && args['apply-fixes'] && args['post-id']) {
  const designDiffFixOutput = path.join(outDir, 'apply-fixes.css');
  const designDiffReportPath = path.join(outDir, 'design-diff.json');
  const minScoreVal = args['design-diff-min-score'] ? parseInt(args['design-diff-min-score'], 10) : null;

  // Check if design-diff report exists and score is below threshold
  let scoreBelowThreshold = false;
  if (fs.existsSync(designDiffReportPath)) {
    try {
      const ddReport = JSON.parse(fs.readFileSync(designDiffReportPath, 'utf8'));
      const score = ddReport.meta?.overall_score;
      if (minScoreVal != null && typeof score === 'number' && score < minScoreVal) {
        scoreBelowThreshold = true;
      }
      // Also trigger if severity is WARN or FAIL (any category not PASS)
      const maxSev = ddReport.meta?.max_severity;
      if (maxSev === 'WARN' || maxSev === 'FAIL') {
        scoreBelowThreshold = true;
      }
    } catch {}
  }

  if (scoreBelowThreshold && fs.existsSync(designDiffReportPath)) {
    log('Step 5.5/7: Apply Design-Diff Fixes...');

    const fixArgs = [
      '--report', designDiffReportPath,
      '--output', designDiffFixOutput,
    ];

    if (args['apply-fixes-inject']) {
      fixArgs.push('--inject', '--post-id', args['post-id']);
    }

    if (args['dry-run']) fixArgs.push('--dry-run');

    const fixResult = await runScriptAsync('apply-design-diff-fixes.js', fixArgs, { optional: true });

    const cssGenerated = fs.existsSync(designDiffFixOutput)
      ? fs.readFileSync(designDiffFixOutput, 'utf8').length
      : 0;

    if (args['dry-run']) {
      ok(`Apply Fixes: dry-run completed`);
    } else if (fixResult.ok || fixResult.code <= 1) {
      if (args['apply-fixes-inject']) {
        ok(`Apply Fixes: CSS generated (${cssGenerated} bytes) + injected to post ${args['post-id']}`);
      } else {
        ok(`Apply Fixes: CSS generated (${cssGenerated} bytes) → ${path.relative(process.cwd(), designDiffFixOutput)}`);
      }
    } else {
      warn(`Apply Fixes: script failed — ${fixResult.stderr?.slice(0, 200) || 'unknown error'}`);
    }

    results.push({
      step: 'apply-design-diff-fixes',
      passed: args['dry-run'] ? true : (fixResult.ok || fixResult.code <= 1),
      css_bytes: args['dry-run'] ? 0 : cssGenerated,
      injected: args['apply-fixes-inject'] || false,
      dryRun: args['dry-run'] || false,
      output: designDiffFixOutput,
    });
  } else {
    const reason = !fs.existsSync(designDiffReportPath)
      ? 'no design-diff report' : 'score above threshold';
    log(`Step 5.5/7: Apply Fixes skipped (${reason})`);
    results.push({ step: 'apply-design-diff-fixes', passed: null, skipped: true, reason });
  }
} else {
  const reason = args['skip-apply-fixes'] ? '--skip-apply-fixes'
    : (!args['apply-fixes'] ? '--apply-fixes not set' : 'no --post-id');
  log(`Step 5.5/7: Apply Fixes skipped (${reason})`);
  results.push({ step: 'apply-design-diff-fixes', passed: null, skipped: true, reason });
}

// ─────────────────────────────────────────────
// STEP 6: Section Compare (Screenshot Diff)
// ─────────────────────────────────────────────

if (!args['skip-screenshots'] && args['framer-url'] && args['elementor-url']) {
  log('Step 6/7: Section Compare (Screenshot Diff)...');

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
  log('Step 6/7: Section Compare skipped (--skip-screenshots or missing URLs)');
  results.push({ step: 'section-compare', passed: null, skipped: true });
}

// ─────────────────────────────────────────────
// STEP 7: Auto-Fix Plan
// ─────────────────────────────────────────────

log('Step 7/7: Auto-Fix Plan...');

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
      ? (preBuildScore < minScore
        ? `Build blocked: Pre-build validation score ${preBuildScore}% < ${minScore}%`
        : `Build blocked: Design-diff FAIL detected (use --no-design-diff-strict to override)`)
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
