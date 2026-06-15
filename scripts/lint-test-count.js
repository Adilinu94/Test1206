#!/usr/bin/env node
/**
 * scripts/lint-test-count.js
 *
 * Prueft ob:
 *   1. Die Test-Anzahl in README.md / BLUEPRINT.md mit den tatsaechlichen
 *      Test-Anzahlen uebereinstimmt.
 *   2. Die CHANGELOG.md die aktuelle package.json Version enthaelt.
 *
 * Usage:
 *   node scripts/lint-test-count.js          # Genau: fuehrt Tests aus
 *   node scripts/lint-test-count.js --fast   # Schnell: zaehlt test()-Calls
 *   node scripts/lint-test-count.js --fix    # Aktualisiert README/BLUEPRINT
 *   node scripts/lint-test-count.js --json   # JSON-Output
 *
 * Hinweis: --fast zaehlt test()-Calls in Quelltexten und ist eine Naeherung.
 *   Dynamisch generierte Tests (for-loop) werden korrekt gezaehlt, aber
 *   test()-Strings in Kommentaren koennen falsch-positive erzeugen.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const NODE = process.execPath;

const args = process.argv.slice(2);
const FAST = args.includes('--fast');
const FIX = args.includes('--fix');
const JSON_OUT = args.includes('--json');
const VERBOSE = args.includes('--verbose');

// ══════════════════════════════════════════════════════════════════════════════
// 1. Actual test counts
// ══════════════════════════════════════════════════════════════════════════════

function countBySource() {
  function countFile(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const tests = (content.match(/\btest\(/g) || []).length;
    const suites = (content.match(/\bdescribe\(/g) || []).length;
    return { tests, suites, file: filePath };
  }

  const results = {};
  const pipelinePath = join(PROJECT_ROOT, 'tests', 'pipeline.test.js');
  const e2ePath = join(PROJECT_ROOT, 'tests', 'e2e.test.js');
  const integrationPath = join(PROJECT_ROOT, 'tests', 'integration.test.js');

  if (existsSync(pipelinePath)) results.pipeline = countFile(pipelinePath);
  if (existsSync(e2ePath)) results.e2e = countFile(e2ePath);
  if (existsSync(integrationPath)) results.integration = countFile(integrationPath);

  return results;
}

function runTestsAndParse(filePath) {
  // spawnSync returns { stdout, stderr, status, error } — Node test
  // runner writes summary (tests/suites/pass/fail) to stderr.
  const result = spawnSync(NODE, ['--test', filePath], {
    encoding: 'utf8',
    timeout: 120000,
  });

  const output = (result.stderr || '') + (result.stdout || '');
  const errorMsg = result.error?.message || (result.status !== 0 ? `exit code ${result.status}` : null);

  return parseTestOutput(output, filePath, errorMsg);
}

function parseTestOutput(output, filePath, errorMsg = null) {
  const testMatch = output.match(/tests\s+(\d+)/);
  const suiteMatch = output.match(/suites\s+(\d+)/);
  const passMatch = output.match(/pass\s+(\d+)/);
  const failMatch = output.match(/fail\s+(\d+)/);

  return {
    tests: testMatch ? parseInt(testMatch[1], 10) : 0,
    suites: suiteMatch ? parseInt(suiteMatch[1], 10) : 0,
    pass: passMatch ? parseInt(passMatch[1], 10) : 0,
    fail: failMatch ? parseInt(failMatch[1], 10) : 0,
    file: filePath,
    error: errorMsg,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. Documented test counts
// ══════════════════════════════════════════════════════════════════════════════

function parseDocumentation(content, source) {
  const findings = [];
  // Track (type, tests, suites) by source+text to deduplicate
  const seen = new Set();

  function add(type, tests, suites, raw) {
    const key = `${source}|${type}|${tests}|${suites || 'X'}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ type, tests, suites: suites || null, source, raw });
  }

  // Pattern: "N Pipeline-Tests (M Suiten)" — parenthesized
  const pipelineParenRe = /(\d+)\s+Pipeline-Tests?\s*\(\s*(\d+)\s+Suiten?\s*\)/gi;
  let match;
  while ((match = pipelineParenRe.exec(content)) !== null) {
    add('pipeline', parseInt(match[1], 10), parseInt(match[2], 10), match[0].trim());
  }

  // Pattern: "N Pipeline-Tests in M Suiten" or "N Pipeline-Tests, M Suiten"
  const pipelineInCommaRe = /(\d+)\s+Pipeline-Tests?\s*(?:in|,)\s*(\d+)\s+Suiten?/gi;
  while ((match = pipelineInCommaRe.exec(content)) !== null) {
    add('pipeline', parseInt(match[1], 10), parseInt(match[2], 10), match[0].trim());
  }

  // Pattern: "N Pipeline-Tests" — standalone (no suite count, already captured above if suite present)
  const pipelineSoloRe = /(\d+)\s+Pipeline-Tests?(?=\s|$)/gi;
  while ((match = pipelineSoloRe.exec(content)) !== null) {
    add('pipeline', parseInt(match[1], 10), null, match[0].trim());
  }

  // Pattern: "N E2E-Tests"
  const e2eRe = /(\d+)\s+E2E-Tests?(?:\s|$)/gi;
  while ((match = e2eRe.exec(content)) !== null) {
    add('e2e', parseInt(match[1], 10), null, match[0].trim());
  }

  // Pattern: "N integration tests"
  const integrationRe = /(\d+)\s+integration(?:\s+tests?)?/gi;
  while ((match = integrationRe.exec(content)) !== null) {
    add('integration', parseInt(match[1], 10), null, match[0].trim());
  }

  // Pattern: "N tests total" (lower priority — only if not already captured)
  const totalRe = /(\d+)\s+(?:tests?\s+)?total(?!\s*\()/gi;
  while ((match = totalRe.exec(content)) !== null) {
    add('total', parseInt(match[1], 10), null, match[0].trim());
  }

  return findings;
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. Version check (CHANGELOG.md vs package.json)
// ══════════════════════════════════════════════════════════════════════════════

function checkVersion() {
  const pkgPath = join(PROJECT_ROOT, 'package.json');
  const changelogPath = join(PROJECT_ROOT, 'CHANGELOG.md');

  if (!existsSync(pkgPath)) return { ok: false, error: 'package.json not found' };
  if (!existsSync(changelogPath)) return { ok: true, note: 'No CHANGELOG.md — skipping version check' };

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const changelog = readFileSync(changelogPath, 'utf8');
  const version = pkg.version;

  if (!changelog.includes(version)) {
    return { ok: false, error: `CHANGELOG.md missing v${version}`, version };
  }

  return { ok: true, version };
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. Compare
// ══════════════════════════════════════════════════════════════════════════════

function compare(actual, documented) {
  const issues = [];
  const seen = new Set();

  for (const doc of documented) {
    let actualCount = null;
    let label = '';

    switch (doc.type) {
      case 'pipeline':
        actualCount = actual.pipeline?.tests ?? null;
        label = 'Pipeline-Tests';
        break;
      case 'e2e':
        actualCount = actual.e2e?.tests ?? null;
        label = 'E2E-Tests';
        break;
      case 'integration':
        actualCount = actual.integration?.tests ?? null;
        label = 'Integration-Tests';
        break;
      case 'total':
        actualCount = (actual.pipeline?.tests || 0) + (actual.e2e?.tests || 0) + (actual.integration?.tests || 0);
        label = 'Total Tests';
        break;
    }

    if (actualCount !== null && doc.tests !== actualCount) {
      const key = `${doc.source}|${label}|${doc.tests}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ source: doc.source, raw: doc.raw, documented: doc.tests, actual: actualCount, label, type: doc.type });
    }

    if (doc.type === 'pipeline' && doc.suites !== null && actual.pipeline?.suites) {
      if (doc.suites !== actual.pipeline.suites) {
        const key = `${doc.source}|Pipeline-Suiten|${doc.suites}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({ source: doc.source, raw: doc.raw, documented: doc.suites, actual: actual.pipeline.suites, label: 'Pipeline-Suiten', type: 'pipeline-suites' });
      }
    }
  }

  return issues;
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. Fix
// ══════════════════════════════════════════════════════════════════════════════

function fixFile(filePath, actual) {
  if (!existsSync(filePath)) return false;

  let content = readFileSync(filePath, 'utf8');
  let changed = false;

  // Order matters: match more specific patterns first!

  // "N Pipeline-Tests (M Suiten)"
  const pipelineParenRe = /(\d+)\s+Pipeline-Tests?\s*\((\d+)\s+Suiten?\)/g;
  content = content.replace(pipelineParenRe, (match, tests, suites) => {
    if (tests !== String(actual.pipeline.tests) || suites !== String(actual.pipeline.suites)) {
      changed = true;
      return `${actual.pipeline.tests} Pipeline-Tests (${actual.pipeline.suites} Suiten)`;
    }
    return match;
  });

  // "N Pipeline-Tests in M Suiten"
  const pipelineInRe = /(\d+)\s+Pipeline-Tests?\s+in\s+(\d+)\s+Suiten/gi;
  content = content.replace(pipelineInRe, (match, tests, suites) => {
    if (tests !== String(actual.pipeline.tests) || suites !== String(actual.pipeline.suites)) {
      changed = true;
      return `${actual.pipeline.tests} Pipeline-Tests in ${actual.pipeline.suites} Suiten`;
    }
    return match;
  });

  // "N Pipeline-Tests, M Suiten"
  const pipelineCommaRe = /(\d+)\s+Pipeline-Tests?,\s*(\d+)\s+Suiten?/gi;
  content = content.replace(pipelineCommaRe, (match, tests, suites) => {
    if (tests !== String(actual.pipeline.tests) || suites !== String(actual.pipeline.suites)) {
      changed = true;
      return `${actual.pipeline.tests} Pipeline-Tests, ${actual.pipeline.suites} Suiten`;
    }
    return match;
  });

  // "N Pipeline-Tests" (standalone, no suite count — must be after specific patterns)
  content = content.replace(/(\d+)\s+Pipeline-Tests?\b(?!\s*[\(\,]\s*\d)/g, (match, tests) => {
    if (tests !== String(actual.pipeline.tests)) {
      changed = true;
      return `${actual.pipeline.tests} Pipeline-Tests`;
    }
    return match;
  });

  // "N E2E-Tests"
  content = content.replace(/(\d+)\s+E2E-Tests?\b/g, (match, tests) => {
    if (tests !== String(actual.e2e.tests)) {
      changed = true;
      return `${actual.e2e.tests} E2E-Tests`;
    }
    return match;
  });

  // "N integration tests"
  content = content.replace(/(\d+)\s+integration\s+tests?\b/gi, (match, tests) => {
    if (tests !== String(actual.integration.tests)) {
      changed = true;
      return `${actual.integration.tests} integration tests`;
    }
    return match;
  });

  // "N tests total (N pipeline + N e2e + N integration)"
  const totalCombinedRe = /(\d+)\s+tests?\s+total\s*\(\s*(\d+)\s+pipeline\s*\+\s*(\d+)\s+e2e\s*\+\s*(\d+)\s+integration\s*\)/gi;
  content = content.replace(totalCombinedRe, (match, total, pipe, e2e, integ) => {
    const actualTotal = actual.pipeline.tests + actual.e2e.tests + actual.integration.tests;
    if (total !== String(actualTotal) || pipe !== String(actual.pipeline.tests) ||
        e2e !== String(actual.e2e.tests) || integ !== String(actual.integration.tests)) {
      changed = true;
      return `${actualTotal} tests total (${actual.pipeline.tests} pipeline + ${actual.e2e.tests} e2e + ${actual.integration.tests} integration)`;
    }
    return match;
  });

  // "N Tests (N pipeline + N e2e + N integration)"
  const totalSimpleRe = /(\d+)\s+Tests?\s*\(\s*(\d+)\s+pipeline\s*\+\s*(\d+)\s+e2e\s*\+\s*(\d+)\s+integration\s*\)/gi;
  content = content.replace(totalSimpleRe, (match, total, pipe, e2e, integ) => {
    const actualTotal = actual.pipeline.tests + actual.e2e.tests + actual.integration.tests;
    if (total !== String(actualTotal) || pipe !== String(actual.pipeline.tests) ||
        e2e !== String(actual.e2e.tests) || integ !== String(actual.integration.tests)) {
      changed = true;
      return `${actualTotal} Tests (${actual.pipeline.tests} pipeline + ${actual.e2e.tests} e2e + ${actual.integration.tests} integration)`;
    }
    return match;
  });

  if (changed) {
    writeFileSync(filePath, content, 'utf8');
    console.log(`  ✅ Updated: ${filePath}`);
  }

  return changed;
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. Main
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  let exitCode = 0;

  // ── Version check ──────────────────────────────────────────────────────
  const versionResult = checkVersion();

  // ── Gather actual test counts ──────────────────────────────────────────
  let actual;
  const fastWarning = FAST ? ' (--fast: source-based count, approximate)' : '';

  if (FAST) {
    actual = countBySource();
    if (VERBOSE) {
      console.error(`[lint-test-count] Fast mode${fastWarning}`);
      for (const [key, val] of Object.entries(actual)) {
        if (val) console.error(`  ${key}: ${val.tests} tests, ${val.suites} suites`);
      }
    }
  } else {
    if (VERBOSE) console.error('[lint-test-count] Running tests (this may take a moment)...');
    const pipelinePath = join(PROJECT_ROOT, 'tests', 'pipeline.test.js');
    const e2ePath = join(PROJECT_ROOT, 'tests', 'e2e.test.js');
    const integrationPath = join(PROJECT_ROOT, 'tests', 'integration.test.js');

    actual = {
      pipeline: runTestsAndParse(pipelinePath),
      e2e: runTestsAndParse(e2ePath),
    };

    if (existsSync(integrationPath)) {
      actual.integration = runTestsAndParse(integrationPath);
    } else {
      actual.integration = { tests: 0, suites: 0, pass: 0, fail: 0 };
    }

    if (VERBOSE) {
      console.error(`  pipeline:    ${actual.pipeline.tests}t / ${actual.pipeline.suites}s`);
      console.error(`  e2e:         ${actual.e2e.tests}t`);
      console.error(`  integration: ${actual.integration.tests}t`);
      console.error(`  total:       ${actual.pipeline.tests + actual.e2e.tests + actual.integration.tests}t`);
    }
  }

  // ── Parse documentation ────────────────────────────────────────────────
  const readmePath = join(PROJECT_ROOT, 'README.md');
  const blueprintPath = join(PROJECT_ROOT, 'BLUEPRINT.md');

  const documented = [];
  if (existsSync(readmePath)) {
    documented.push(...parseDocumentation(readFileSync(readmePath, 'utf8'), 'README.md'));
  }
  if (existsSync(blueprintPath)) {
    documented.push(...parseDocumentation(readFileSync(blueprintPath, 'utf8'), 'BLUEPRINT.md'));
  }

  // ── Compare ────────────────────────────────────────────────────────────
  const issues = compare(actual, documented);

  // ── Output ─────────────────────────────────────────────────────────────
  if (JSON_OUT) {
    console.log(JSON.stringify({
      version: versionResult,
      fast: FAST,
      actual: Object.fromEntries(
        Object.entries(actual).map(([k, v]) => [k, v ? { tests: v.tests, suites: v.suites } : null])
      ),
      documented: documented.map(d => ({ source: d.source, type: d.type, tests: d.tests, suites: d.suites })),
      issues: issues.map(i => ({ source: i.source, label: i.label, documented: i.documented, actual: i.actual, raw: i.raw })),
      exitCode: (issues.length > 0 || !versionResult.ok) ? 1 : 0,
    }, null, 2));
  } else {
    // Version check output
    if (!versionResult.ok) {
      console.log(`❌ Version: ${versionResult.error}`);
      exitCode = 1;
    } else {
      console.log(`✅ Version: v${versionResult.version} in CHANGELOG.md`);
    }

    // Test count output
    if (issues.length === 0) {
      console.log(`✅ Test counts match${fastWarning}.`);
      if (VERBOSE) {
        console.log(`   Pipeline: ${actual.pipeline?.tests || 0}t / ${actual.pipeline?.suites || 0}s`);
        console.log(`   E2E:      ${actual.e2e?.tests || 0}t`);
        console.log(`   Int:      ${actual.integration?.tests || 0}t`);
      }
    } else {
      console.log(`❌ Test count mismatches${fastWarning}:`);
      for (const issue of issues) {
        console.log(`  ${issue.source}: "${issue.raw}"`);
        console.log(`    → Documented: ${issue.documented}, Actual: ${issue.actual} (${issue.label})`);
      }
      exitCode = 1;
    }
  }

  // ── Fix mode ───────────────────────────────────────────────────────────
  if (FIX && issues.length > 0) {
    console.log('\n--- Fix mode: updating documentation ---');
    let fixed = false;
    if (existsSync(readmePath)) fixed = fixFile(readmePath, actual) || fixed;
    if (existsSync(blueprintPath)) fixed = fixFile(blueprintPath, actual) || fixed;
    if (fixed) {
      console.log('✅ Documentation updated. Run without --fix to verify.');
    }
    // Don't exit with error after successful fix
    exitCode = 0;
  } else if (FIX && issues.length === 0) {
    console.log('   (No fixes needed — counts are already correct.)');
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(2);
});
