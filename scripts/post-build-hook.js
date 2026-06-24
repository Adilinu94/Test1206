#!/usr/bin/env node
/**
 * post-build-hook.js  —  Fix #13: Automatischer Post-Build Visual QA Hook
 *
 * Läuft automatisch nach dem Build und:
 *   1. Triggert section-compare.js (Screenshot-Diff Framer ↔ Elementor)
 *   2. Triggert design-diff.js (CSS computed-style diff, keine Screenshots)
 *   3. Liest compare-report.json und prüft ob diffPct < threshold (Default 10%)
 *   4. Triggert run-post-build-qa.js mit Layout/Responsive/Variable-Audit
 *   5. Schreibt build-quality.json mit Pass/Fail + Diff-Prozenten
 *   6. Gibt klares Exit-Code Signal an den aufrufenden Agenten
 *
 * Usage:
 *   node scripts/post-build-hook.js \
 *     --post-id 4943 \
 *     --framer-url https://my-site.framer.app/ \
 *     --elementor-url http://solar.local/?p=4943 \
 *     --output reports/build-quality.json \
 *     [--diff-threshold 10] \
 *     [--section hero] \
 *     [--skip-screenshot] \
 *     [--skip-design-diff] \
 *     [--design-diff-min-score 70] \
 *     [--framer-selector CSS] \
 *     [--elementor-selector CSS] \
 *     [--qa-only]
 *
 * Exit-Codes:
 *   0 = Build OK (diff < threshold, keine kritischen QA-Fehler)
 *   1 = Build FAIL (diff >= threshold ODER kritische QA-Fehler)
 *   2 = Konfigurationsfehler
 *
 * Integration in package.json:
 *   "post-build": "node scripts/post-build-hook.js --post-id $POST_ID --framer-url $FRAMER_URL ..."
 *
 * Integration in convert-pipeline (Aufruf nach batch-build-page):
 *   const hook = spawnSync('node', ['scripts/post-build-hook.js', '--post-id', postId, ...])
 */

import { parseArgs }  from 'node:util';
import { spawnSync }  from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI ─────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    'post-id':         { type: 'string' },
    'framer-url':      { type: 'string' },
    'elementor-url':   { type: 'string' },
    section:           { type: 'string', default: 'section' },
    output:            { type: 'string', default: 'reports/build-quality.json' },
    'diff-threshold':  { type: 'string', default: '10' },   // % — fail wenn drüber
    'skip-screenshot': { type: 'boolean', default: false },  // Nur QA, kein Screenshot-Diff
    'skip-design-diff':    { type: 'boolean', default: false },  // Kein CSS-Style-Vergleich
    'design-diff-strict':  { type: 'boolean', default: true },   // FAIL = Build abbrechen
    'design-diff-min-score': { type: 'string' },                 // Numerischer Schwellwert (0-100)
    'apply-fixes':           { type: 'boolean', default: false },   // Automatisch CSS generieren
    'apply-fixes-inject':    { type: 'boolean', default: false },   // CSS auch per MCP injecten
    'skip-apply-fixes':      { type: 'boolean', default: false },   // Kein Auto-Fix
    'framer-selector':     { type: 'string' },                  // CSS-Selector auf Framer-Seite
    'elementor-selector':  { type: 'string' },                  // CSS-Selector auf Elementor-Seite
    'qa-only':             { type: 'boolean', default: false },  // Alias für --skip-screenshot
    'dry-run':         { type: 'boolean', default: false },
    verbose:           { type: 'boolean', default: false },
    help:              { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  process.stdout.write(`
post-build-hook.js — Automatischer Post-Build Visual QA Hook

Optionen:
  --post-id <id>          WordPress Post-ID (erforderlich)
  --framer-url <url>      Publizierte Framer-URL für Screenshot-Vergleich
  --elementor-url <url>   Lokale Elementor-Seiten-URL (z.B. http://solar.local/?p=ID)
  --section <name>        Section-Name für Screenshot-Targeting (default: section)
  --output <pfad>         Ausgabe-JSON (default: reports/build-quality.json)
  --diff-threshold <n>    Pixel-Diff Schwellwert in % (default: 10)
  --skip-screenshot       Kein Screenshot-Diff, nur QA-Audits
  --skip-design-diff      Kein CSS-Style-Vergleich (design-diff.js)
  --design-diff-strict    FAIL = Build abbrechen (default: an)
  --design-diff-min-score N Numerischer Schwellwert in % (0-100); blockiert wenn overall_score < N
  --apply-fixes            Automatisch CSS-Fixes aus design-diff generieren
  --apply-fixes-inject     CSS per MCP auf WordPress-Seite injecten (benötigt --post-id)
  --skip-apply-fixes       Kein Auto-Fix
  --framer-selector CSS   CSS-Selector für Framer-Seite (für design-diff)
  --elementor-selector CSS CSS-Selector für Elementor-Seite (für design-diff)
  --qa-only               Alias für --skip-screenshot
  --dry-run               Simuliert den Run ohne echte Aufrufe
  --verbose               Ausführliche Logs

Exit-Codes:
  0 = Build OK (diff < threshold, keine kritischen QA-Fehler)
  1 = Build FAIL
  2 = Konfigurationsfehler
`);
  process.exit(0);
}

if (!args['post-id']) {
  process.stderr.write('Fehler: --post-id erforderlich\n');
  process.exit(2);
}

const postId         = args['post-id'];
const diffThreshold  = parseFloat(args['diff-threshold'] || '10');
const skipScreenshot = args['skip-screenshot'] || args['qa-only'];
const outputPath     = resolve(args.output || 'reports/build-quality.json');
const reportsDir     = dirname(outputPath);
const log = (...m) => { if (args.verbose) process.stderr.write('[post-build-hook] ' + m.join(' ') + '\n'); };
const info = (m)   => process.stderr.write(`ℹ [post-build-hook] ${m}\n`);
const warn = (m)   => process.stderr.write(`⚠ [post-build-hook] ${m}\n`);
const ok   = (m)   => process.stderr.write(`✓ [post-build-hook] ${m}\n`);

mkdirSync(reportsDir, { recursive: true });

// ─── Ergebnis-Objekt ─────────────────────────────────────────────────────────

const result = {
  meta: {
    post_id:    postId,
    timestamp:  new Date().toISOString(),
    threshold:  diffThreshold,
    dry_run:    args['dry-run'],
  },
  screenshot_diff:   null,
  design_diff:        null,
  qa_audit:           null,
  summary: {
    pass: false,
    diff_pct: null,
    critical_issues: [],
    warnings: [],
    agent_verdict: '',   // Klarer Satz für den nächsten Agenten
  },
};

// ─── Schritt 1: Screenshot-Diff ──────────────────────────────────────────────

if (!skipScreenshot) {
  if (!args['framer-url'] || !args['elementor-url']) {
    warn('--framer-url und --elementor-url für Screenshot-Diff erforderlich. Überspringe Screenshot-Diff.');
    warn('Mit --skip-screenshot starten wenn kein Browser verfügbar.');
    result.summary.warnings.push('Screenshot-Diff übersprungen: URLs fehlen');
  } else {
    const compareReportPath = join(reportsDir, 'section-compare', 'compare-report.json');
    const compareDir        = join(reportsDir, 'section-compare');

    info(`Screenshot-Diff: ${args['framer-url']} ↔ ${args['elementor-url']}`);

    if (!args['dry-run']) {
      const compareResult = spawnSync(
        process.execPath,
        [
          join(__dirname, 'section-compare.js'),
          '--framer-url',    args['framer-url'],
          '--elementor-url', args['elementor-url'],
          '--section',       args.section,
          '--output',        compareDir,
          ...(args.verbose ? ['--verbose'] : []),
        ],
        { stdio: 'inherit' }
      );

      if (compareResult.status === 0 && existsSync(compareReportPath)) {
        const compareReport = JSON.parse(readFileSync(compareReportPath, 'utf8'));
        const pixelDiffs    = compareReport.pixelDiffs || {};

        // Desktop + Mobile Diff-Prozente auswerten
        const diffs = Object.entries(pixelDiffs)
          .filter(([, d]) => d?.ok && typeof d.diffPct === 'number')
          .map(([bp, d]) => ({ bp, diffPct: d.diffPct }));

        const maxDiff = diffs.length > 0
          ? Math.max(...diffs.map(d => d.diffPct))
          : null;

        result.screenshot_diff = {
          status:   compareResult.status === 0 ? 'ok' : 'error',
          diffs,
          max_diff_pct: maxDiff,
          report:   compareReportPath,
        };

        if (maxDiff !== null) {
          result.summary.diff_pct = maxDiff;
          if (maxDiff >= diffThreshold) {
            result.summary.critical_issues.push(
              `Screenshot-Diff ${maxDiff}% ≥ Schwellwert ${diffThreshold}% — visueller Fehler!`
            );
            ok(`Screenshot-Diff: ${maxDiff}% (ÜBER Schwellwert ${diffThreshold}%) ❌`);
          } else {
            ok(`Screenshot-Diff: ${maxDiff}% < Schwellwert ${diffThreshold}% ✅`);
          }
        } else {
          warn('Kein Pixel-Diff verfügbar (pngjs/pixelmatch nicht installiert?)');
          result.summary.warnings.push('Pixel-Diff nicht verfügbar — pngjs/pixelmatch fehlt');
        }
      } else {
        warn('section-compare.js fehlgeschlagen oder Browser nicht verfügbar');
        result.summary.warnings.push('Screenshot-Diff fehlgeschlagen — kein Playwright/Puppeteer?');
      }
    } else {
      info('[dry-run] Screenshot-Diff würde laufen');
      result.screenshot_diff = { status: 'dry-run' };
    }
  }
} else {
  info('Screenshot-Diff übersprungen (--skip-screenshot / --qa-only)');
}

// ─── Schritt 1.5: Design-Diff (CSS computed-style comparison) ───────────────

if (!args['skip-design-diff'] && args['framer-url'] && args['elementor-url']) {
  const designDiffOutputPath = join(reportsDir, 'design-diff.json');

  info(`Design-Diff (CSS Styles): ${args['framer-url']} ↔ ${args['elementor-url']}`);

  if (!args['dry-run']) {
    const designDiffArgs = [
      join(__dirname, 'design-diff.js'),
      '--framer-url', args['framer-url'],
      '--elementor-url', args['elementor-url'],
      '--output', designDiffOutputPath,
      '--timeout', '45000',
    ];
    if (args['framer-selector']) designDiffArgs.push('--framer-selector', args['framer-selector']);
    if (args['elementor-selector']) designDiffArgs.push('--elementor-selector', args['elementor-selector']);
    if (args.section && args.section !== 'section') designDiffArgs.push('--nth-section', '1');

    const designDiffResult = spawnSync(
      process.execPath,
      designDiffArgs,
      { stdio: 'pipe', timeout: 90000 }
    );

    // Read report from output file (design-diff writes JSON to --output, not stdout)
    let designDiffReport = null;
    if (existsSync(designDiffOutputPath)) {
      try { designDiffReport = JSON.parse(readFileSync(designDiffOutputPath, 'utf8')); } catch {}
    }

    if (!designDiffReport && designDiffResult.stdout) {
      try { designDiffReport = JSON.parse(designDiffResult.stdout); } catch {}
    }

    if (designDiffReport?.meta?.max_severity) {
      const maxSev = designDiffReport.meta.max_severity;
      const overallScore = designDiffReport.meta.overall_score;
      const minScoreVal = args['design-diff-min-score'] ? parseInt(args['design-diff-min-score'], 10) : null;
      const failedCats = (designDiffReport.diff || []).filter(d => d.severity !== 'PASS');

      result.design_diff = {
        status: maxSev === 'PASS' ? 'pass' : (maxSev === 'WARN' ? 'warn' : 'fail'),
        max_severity: maxSev,
        categories_tested: designDiffReport.meta.categories_tested,
        overall_score: overallScore,
        failures: failedCats.map(d => ({
          category: d.category,
          severity: d.severity,
        })),
        report: designDiffOutputPath,
      };

      // ── Numeric score threshold (checked first, before categorical) ──
      if (minScoreVal != null && typeof overallScore === 'number' && overallScore < minScoreVal) {
        const scoreMsg = `Design Diff: overall score ${overallScore}/100 < threshold ${minScoreVal}/100`;
        if (args['design-diff-strict']) {
          warn(`${scoreMsg} (BLOCKING)`);
          result.summary.critical_issues.push(`Design-Diff: ${scoreMsg}`);
        } else {
          warn(`${scoreMsg} (non-strict)`);
          result.summary.warnings.push(`Design-Diff: ${scoreMsg}`);
        }
      }

      // ── Categorical severity ──────────────────────────────────────
      if (maxSev === 'PASS') {
        ok(`Design Diff: All ${designDiffReport.meta.categories_tested} categories PASS${typeof overallScore === 'number' ? ` (score ${overallScore}/100)` : ''}`);
      } else if (maxSev === 'WARN') {
        const catNames = failedCats.map(d => d.category).join(', ');
        warn(`Design Diff: ${failedCats.length} category(s) WARN — ${catNames}${typeof overallScore === 'number' ? ` (score ${overallScore}/100)` : ''}`);
        for (const d of failedCats) {
          result.summary.warnings.push(`Design-Diff: ${d.category} — ${d.severity}`);
        }
      } else if (maxSev === 'FAIL') {
        const failCats = failedCats.filter(d => d.severity === 'FAIL');
        const failCatNames = failCats.map(d => d.category).join(', ');
        if (args['design-diff-strict']) {
          warn(`Design Diff: ${failCats.length} category(s) FAIL — ${failCatNames} (BLOCKING)${typeof overallScore === 'number' ? ` (score ${overallScore}/100)` : ''}`);
          for (const d of failCats) {
            result.summary.critical_issues.push(`Design-Diff FAIL: ${d.category}`);
          }
          // Non-FAIL diffs still go to warnings
          for (const d of failedCats.filter(d => d.severity !== 'FAIL')) {
            result.summary.warnings.push(`Design-Diff: ${d.category} — ${d.severity}`);
          }
        } else {
          warn(`Design Diff: ${failCats.length} category(s) FAIL — ${failCatNames} (non-strict)${typeof overallScore === 'number' ? ` (score ${overallScore}/100)` : ''}`);
          for (const d of failedCats) {
            result.summary.warnings.push(`Design-Diff: ${d.category} — ${d.severity}`);
          }
        }
      }
    } else {
      warn('Design Diff: produced no valid JSON report');
      result.summary.warnings.push('Design-Diff fehlgeschlagen — kein Playwright/Puppeteer?');
      result.design_diff = { status: 'error', reason: 'No valid report' };
    }
  } else {
    info('[dry-run] Design-Diff würde laufen');
    result.design_diff = { status: 'dry-run' };
  }
} else {
  info('Design-Diff übersprungen (--skip-design-diff oder URLs fehlen)');
}

// ─── Schritt 1.6: Apply Design-Diff Fixes (auto-generate + inject CSS) ──────

if (!args['skip-apply-fixes'] && args['apply-fixes'] && args['post-id']) {
  const designDiffFixOutput = join(reportsDir, 'apply-fixes.css');
  const designDiffReportPath = join(reportsDir, 'design-diff.json');
  const minScoreVal = args['design-diff-min-score'] ? parseInt(args['design-diff-min-score'], 10) : null;

  // Check if score is below threshold or severity is WARN/FAIL
  let scoreBelowThreshold = false;
  if (existsSync(designDiffReportPath)) {
    try {
      const ddReport = JSON.parse(readFileSync(designDiffReportPath, 'utf8'));
      const score = ddReport.meta?.overall_score;
      if (minScoreVal != null && typeof score === 'number' && score < minScoreVal) {
        scoreBelowThreshold = true;
      }
      const maxSev = ddReport.meta?.max_severity;
      if (maxSev === 'WARN' || maxSev === 'FAIL') {
        scoreBelowThreshold = true;
      }
    } catch {}
  }

  if (scoreBelowThreshold && existsSync(designDiffReportPath)) {
    info(`Apply Design-Diff Fixes → generiere CSS`);

    if (!args['dry-run']) {
      const fixArgs = [
        join(__dirname, 'apply-design-diff-fixes.js'),
        '--report', designDiffReportPath,
        '--output', designDiffFixOutput,
      ];
      if (args['apply-fixes-inject']) {
        fixArgs.push('--inject', '--post-id', args['post-id']);
      }

      const fixResult = spawnSync(process.execPath, fixArgs, {
        stdio: 'pipe',
        timeout: 60000,
      });

      const cssGenerated = existsSync(designDiffFixOutput)
        ? readFileSync(designDiffFixOutput, 'utf8').length
        : 0;

      if (fixResult.status === 0 || fixResult.status === 1) {
        if (args['apply-fixes-inject']) {
          ok(`Apply Fixes: CSS generiert (${cssGenerated} bytes) + injected → post ${args['post-id']}`);
          result.summary.warnings.push(`Auto-Fix CSS injected to post ${args['post-id']} (${cssGenerated} bytes)`);
        } else {
          ok(`Apply Fixes: CSS generiert (${cssGenerated} bytes) → ${designDiffFixOutput}`);
          result.summary.warnings.push(`Auto-Fix CSS generated: ${designDiffFixOutput}`);
        }
      } else {
        warn(`Apply Fixes: fehlgeschlagen (exit ${fixResult.status})`);
        result.summary.warnings.push('Auto-Fix CSS generation failed');
      }

      result.apply_fixes = {
        status: fixResult.status === 0 ? 'generated' : (fixResult.status === 1 ? 'generated-with-warnings' : 'failed'),
        css_bytes: cssGenerated,
        injected: args['apply-fixes-inject'] || false,
        output: designDiffFixOutput,
      };
    } else {
      info('[dry-run] Apply Fixes würde laufen');
      result.apply_fixes = { status: 'dry-run' };
    }
  } else {
    const reason = !existsSync(designDiffReportPath)
      ? 'no design-diff report' : 'score above threshold';
    info(`Apply Fixes übersprungen (${reason})`);
    result.apply_fixes = { status: 'skipped', reason };
  }
} else {
  const reason = args['skip-apply-fixes'] ? '--skip-apply-fixes' : (!args['apply-fixes'] ? '--apply-fixes not set' : 'no --post-id');
  log(`Apply Fixes übersprungen (${reason})`);
  result.apply_fixes = { status: 'skipped', reason };
}

// ─── Schritt 2: QA-Audits via run-post-build-qa.js ──────────────────────────

info(`QA-Audits für Post-ID ${postId}`);

// Wir generieren einen Stub-qa-results.json mit dem Post-ID
// Das reale QA-JSON kommt vom Agent der MCP-Abilities aufruft.
// Hier: Wenn ein vorhandenes qa-results.json existiert, wird es genutzt.
const qaResultsPath = join(reportsDir, 'qa-results.json');
const qaReportPath  = join(reportsDir, 'qa-report.json');

if (!args['dry-run'] && existsSync(qaResultsPath)) {
  info(`Verwende vorhandene QA-Ergebnisse: ${qaResultsPath}`);
  const qaResult = spawnSync(
    process.execPath,
    [
      join(__dirname, 'run-post-build-qa.js'),
      '--post-id',    postId,
      '--qa-results', qaResultsPath,
      '--output',     qaReportPath,
      ...(args.verbose ? ['--verbose'] : []),
    ],
    { stdio: 'inherit' }
  );

  if (existsSync(qaReportPath)) {
    const qaReport = JSON.parse(readFileSync(qaReportPath, 'utf8'));
    const criticals = (qaReport.critical || []);
    const warnings  = (qaReport.warnings || []);

    result.qa_audit = {
      status:     qaResult.status === 0 ? 'pass' : 'issues',
      critical:   criticals.length,
      warnings:   warnings.length,
      report:     qaReportPath,
    };

    if (criticals.length > 0) {
      for (const c of criticals) {
        result.summary.critical_issues.push(`QA: ${c.message || JSON.stringify(c)}`);
      }
    }
    result.summary.warnings.push(...warnings.map(w => `QA: ${w.message || JSON.stringify(w)}`));

    ok(`QA-Audit: ${criticals.length} kritisch, ${warnings.length} Warnungen`);
  }
} else if (!args['dry-run']) {
  warn(`Kein qa-results.json unter ${qaResultsPath} — QA-Audit übersprungen.`);
  warn(`Workflow: Agent ruft MCP-Abilities auf → speichert Ergebnisse als ${qaResultsPath} → hook erneut starten.`);
  result.qa_audit = { status: 'skipped', reason: 'qa-results.json nicht vorhanden' };
  result.summary.warnings.push('QA-Audit nicht gelaufen — qa-results.json fehlt');
} else {
  info('[dry-run] QA-Audit würde laufen');
  result.qa_audit = { status: 'dry-run' };
}

// ─── Schritt 3: Gesamturteil ─────────────────────────────────────────────────

const hasCriticals = result.summary.critical_issues.length > 0;
result.summary.pass = !hasCriticals;

if (result.summary.pass) {
  const diffInfo = result.summary.diff_pct !== null ? ` (Diff: ${result.summary.diff_pct}%)` : '';
  result.summary.agent_verdict = `✅ BUILD AKZEPTIERT${diffInfo} — Kein kritischer Fehler. Nächster Schritt: MCP-Export.`;
} else {
  result.summary.agent_verdict = `❌ BUILD ABGELEHNT — ${result.summary.critical_issues.length} kritische Fehler:\n` +
    result.summary.critical_issues.map(i => `  • ${i}`).join('\n');
}

// ─── Schritt 4: Ausgabe ──────────────────────────────────────────────────────

writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

process.stderr.write('\n' + '─'.repeat(60) + '\n');
process.stderr.write(result.summary.agent_verdict + '\n');
if (result.summary.warnings.length > 0) {
  process.stderr.write(`⚠  ${result.summary.warnings.length} Warnungen:\n`);
  result.summary.warnings.forEach(w => process.stderr.write(`   • ${w}\n`));
}
process.stderr.write(`📄 Build-Quality-Report: ${outputPath}\n`);
process.stderr.write('─'.repeat(60) + '\n');

process.exit(result.summary.pass ? 0 : 1);
