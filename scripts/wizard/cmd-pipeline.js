/**
 * scripts/wizard/cmd-pipeline.js — Full 14-Step Pipeline (Phase 6, Optimized)
 *
 * UMBAUPLAN v2.0 Phase 6+8: Orchestriert alle 14 Pipeline-Schritte.
 * Optimized: parallel extraction, output dedup, removed redundant calls.
 *
 * STEPS:
 *   1.  FramerExport (cached, existing)
 *   2.  CSS-Token-Extraktion (extract-framer-css-tokens.js, PRIMARY)
 *   3.  Browser-Crawl-Fallback (extract-framer-css-tokens.js --url, FALLBACK)
 *   4.  Unframer MCP getProjectXml (delegated)
 *   5.  Unframer MCP getNodeXml(section) (delegated)
 *   6.  Style-Referenzen sammeln
 *   7.  Token-Mapping erstellen
 *   8.  Token-Mapping validieren
 *   9.  Design System aufbauen (design-system-builder.js, WITH OUTPUT DEDUP)
 *  10.  resolve-fonts.js (parallel mit Step 2)
 *  11.  convert-xml-to-v4.js (WITH --token-map + --output-dir)
 *  12.  framer-pre-build-validate.js (parallel mit Step 14)
 *  13.  elementor-set-content (MCP — delegated)
 *  14.  Visual QA + Auto-Fix (build-quality-gate.js, parallel mit Step 12)
 *
 * Usage:
 *   node wizard.js pipeline --url https://example.framer.app/ [--post-id 42]
 *   node wizard.js pipeline --export-dir exports/my-project/
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import {
  log, findWorkspaceRoot, findFramerExportDir,
  runFile, runParallel, findIndexHtmlDirs, readJsonIfExists,
  nodeBin, npxBin, npmBin,
  checkFramerExportCache, writeFramerExportCache,
  pipelineDir, repoDir,
} from './shared.js';
import { getFramerCacheStats } from '../lib/framer-cache.js';
import { detectElementorVersion } from '../lib/elementor-version.js';
import { detectActiveTheme } from '../lib/wp-theme.js';

/**
 * Gibt die Hilfe fuer dieses Subcommand aus.
 */
export function printHelp() {
  console.log(`wizard.js pipeline — Vollstaendige 14-Step Pipeline (OPTIMIZED)

USAGE:
  node wizard.js pipeline --url <framer-url> [OPTIONS]

OPTIONS:
  --url <url>           Framer-Quell-URL (Pflicht)
  --post-id <ID>        Ziel-Post-ID in WordPress
  --export-dir <dir>    FramerExport-Verzeichnis (ueberspringt Export)
  --no-cache            FramerExport-Cache umgehen
  --skip-qa             QA-Gate ueberspringen (schnellerer Build)
  --dry-run             Keine MCP-Calls, nur Plan generieren
  --site <id>          Site-ID fuer MCP-Detection (default: 'default')
  --verbose             Ausfuehrliche Logs

OPTIMIZATIONS:
  - Steps 2+10 run in PARALLEL (CSS tokens + fonts)
  - Steps 12+14 run in PARALLEL (validate + QA gate)
  - Design System output dedup (skips if fresh)
  - resolve-fonts.js NOT called twice

BEISPIELE:
  node wizard.js pipeline --url https://hilarious-workshops-284047.framer.app/
  node wizard.js pipeline --url https://example.framer.app/ --post-id 42
  node wizard.js pipeline --export-dir exports/my-page/ --verbose
`);
}

/**
 * Führt den vollen 14-Step Pipeline-Durchlauf aus (optimized).
 */
export async function runPipeline({
  framerUrl,
  postId = null,
  exportDir: existingExportDir = null,
  noCache = false,
  skipQa = false,
  dryRun = false,
  verbose = false,
  siteId = 'default',
}) {
  const rootDir = findWorkspaceRoot();
  const startTime = Date.now();
  const steps = [];
  let exportDir = existingExportDir ? path.resolve(existingExportDir) : null;
  let tokenMapPath = null;
  let designSystemDir = null;
  let v4TreePath = null;
  // Phase 4: Detection-Cache (wird in Step 0 befuellt)
  let elementorEnv = null;
  let themeEnv = null;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  🚀 FULL 14-STEP PIPELINE (OPTIMIZED)');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  URL:     ${framerUrl || '(from export-dir)'}`);
  console.log(`  Post-ID: ${postId || 'auto'}`);
  console.log(`  Mode:    ${dryRun ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`${'═'.repeat(60)}\n`);

  // ════════════════════════════════════════════
  // STEP 0: Phase-4 Detection (Elementor-Version + Theme)  [UMBAUPLAN §4.1, §4.2]
  // ════════════════════════════════════════════

  log.step('Step 0/14: Elementor-Version + Theme-Detection...');
  let step0Status = 'ok';
  let step0Detail = {};
  try {
    let mcpBridge = null;
    try {
      const { McpBridge } = await import('../lib/mcp-bridge.js');
      mcpBridge = await McpBridge.fromConfig();
    } catch (bridgeErr) {
      log.warn(`MCP-Bridge nicht verfuegbar: ${bridgeErr.message} — Detection laeuft im Fallback-Modus`);
    }

    if (mcpBridge) {
      // Parallel detection
      const [elRes, thRes] = await Promise.all([
        detectElementorVersion({ mcpBridge, siteId, cacheRoot: rootDir }).catch(err => {
          log.warn(`Elementor-Detection fehlgeschlagen: ${err.message}`);
          return null;
        }),
        detectActiveTheme({ mcpBridge, siteId, cacheRoot: rootDir }).catch(err => {
          log.warn(`Theme-Detection fehlgeschlagen: ${err.message}`);
          return null;
        }),
      ]);
      elementorEnv = elRes;
      themeEnv = thRes;
      if (elRes) {
        log.success(`Elementor: ${elRes.version} (${elRes.strategy?.mode || 'unknown'})`);
        step0Detail.elementor = { version: elRes.version, strategy: elRes.strategy?.mode, _cache: elRes._cache };
      }
      if (thRes) {
        log.success(`Theme: ${thRes.name} ${thRes.version} (${thRes.classification?.tier})`);
        step0Detail.theme = { name: thRes.name, tier: thRes.classification?.tier, _cache: thRes._cache };
      }
      if (!elRes && !thRes) step0Status = 'warning';
    } else {
      step0Status = 'skipped';
      step0Detail = { reason: 'no-mcp-bridge' };
    }
  } catch (err) {
    step0Status = 'warning';
    step0Detail = { error: err.message };
    log.warn(`Step 0 fehlgeschlagen: ${err.message}`);
  }
  steps.push({ step: 0, name: 'Phase-4 Detection', status: step0Status, detail: step0Detail });

  // ════════════════════════════════════════════
  // STEP 1: FramerExport
  // ════════════════════════════════════════════

  if (exportDir && existsSync(exportDir)) {
    log.success(`Step 1/14: FramerExport — vorhanden: ${exportDir}`);
    steps.push({ step: 1, name: 'FramerExport', status: 'cached' });
  } else if (framerUrl) {
    log.step('Step 1/14: FramerExport...');

    const cacheResult = await checkFramerExportCache(framerUrl, noCache);
    if (cacheResult.cached && cacheResult.exportDir && existsSync(cacheResult.exportDir)) {
      exportDir = cacheResult.exportDir;
      log.success(`FramerExport aus Cache: ${exportDir}`);
      steps.push({ step: 1, name: 'FramerExport', status: 'cached' });
    } else {
      const framerExportDir = findFramerExportDir(rootDir);
      if (!framerExportDir) {
        log.error('FramerExport nicht gefunden.');
        return { status: 'FAILED', step: 1, error: 'FramerExport directory not found' };
      }

      const exportFolderName = 'framer-' + framerUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '-').substring(0, 30);
      exportDir = path.join(rootDir, 'exports', exportFolderName);
      await fs.mkdir(exportDir, { recursive: true });

      try {
        const pkgJson = await readJsonIfExists(path.join(framerExportDir, 'package.json'));
        const before = await findIndexHtmlDirs(framerExportDir);

        const distEntry = path.join(framerExportDir, 'dist', 'cli', 'index.js');
        if (existsSync(distEntry)) {
          log.info('FramerExport: nutze prebuilt dist/cli/index.js');
          await runFile(npmBin, ['run', 'build'], 'FramerExport build', framerExportDir);
          const nodeBin = process.execPath;
          await runFile(nodeBin, [distEntry, framerUrl, '--platform', 'framer'], 'FramerExport', framerExportDir);
        } else if (pkgJson?.scripts?.dev) {
          log.info('FramerExport: kein dist/, nutze npm run dev (langsamer)');
          await runFile(npmBin, ['run', 'dev', '--', framerUrl], 'FramerExport', framerExportDir);
        } else if (existsSync(path.join(framerExportDir, 'src', 'cli', 'index.ts'))) {
          log.info('FramerExport: nutze tsx src/cli/index.ts (Fallback)');
          await runFile(npxBin, ['tsx', 'src/cli/index.ts', framerUrl, '--platform', 'framer'], 'FramerExport', framerExportDir);
        } else {
          throw new Error('Kein unterstuetzter FramerExport-Einstieg gefunden.');
        }

        const after = await findIndexHtmlDirs(framerExportDir);
        const beforeSet = new Set(before.map(e => path.resolve(e.dir).toLowerCase()));
        const generated = after.find(e => !beforeSet.has(path.resolve(e.dir).toLowerCase())) || after[0];
        if (!generated) throw new Error('FramerExport hat kein index.html erzeugt.');
        exportDir = generated.dir;

        await writeFramerExportCache(framerUrl, exportDir);
        log.success(`FramerExport: ${exportDir}`);
        steps.push({ step: 1, name: 'FramerExport', status: 'ok' });
      } catch (err) {
        log.error(`FramerExport fehlgeschlagen: ${err.message}`);
        return { status: 'FAILED', step: 1, error: err.message };
      }
    }
  } else {
    log.error('--url oder --export-dir erforderlich');
    return { status: 'FAILED', step: 1, error: 'Missing --url or --export-dir' };
  }

  const exportHtml = path.join(exportDir, 'index.html');
  if (!existsSync(exportHtml)) {
    log.error(`index.html nicht gefunden in ${exportDir}`);
    return { status: 'FAILED', step: 1, error: 'index.html missing in export dir' };
  }

  // Initialize sub-directories
  const tokensDir = path.join(exportDir, 'tokens');
  const assetsDir = path.join(exportDir, 'assets');
  designSystemDir = path.join(exportDir, 'design-system');
  await fs.mkdir(tokensDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.mkdir(designSystemDir, { recursive: true });

  // ════════════════════════════════════════════
  // STEP 2+10: CSS-Token-Extraktion + Fonts (PARALLEL)
  // ════════════════════════════════════════════

  log.step('Steps 2+10/14: CSS-Token-Extraktion + Fonts (parallel)...');

  tokenMapPath = path.join(tokensDir, 'token-mapping.json');
  const fontResPath = path.join(tokensDir, 'font-resolution.json');

  const parallelResults = await runParallel([
    {
      command: nodeBin,
      args: [
        path.join(pipelineDir, 'extract-framer-css-tokens.js'),
        '--html', exportHtml,
        '--output', tokenMapPath,
        ...(verbose ? ['--verbose'] : []),
      ],
      description: 'CSS-Token-Extraktion',
      cwd: pipelineDir,
    },
    {
      command: nodeBin,
      args: [
        path.join(pipelineDir, 'resolve-fonts.js'),
        '--html', exportHtml,
        '--fonts-dir', path.join(assetsDir, 'fonts'),
        '--output', fontResPath,
      ],
      description: 'resolve-fonts.js',
      cwd: pipelineDir,
      optional: true,
    },
  ]);

  for (const r of parallelResults) {
    steps.push({
      step: r.description === 'CSS-Token-Extraktion' ? 2 : 10,
      name: r.description,
      status: r.ok ? 'ok' : 'warning',
      error: r.error,
    });
  }

  // ════════════════════════════════════════════
  // STEP 3: Browser-Crawl-Fallback
  // ════════════════════════════════════════════

  let tokenMap = null;
  try {
    tokenMap = JSON.parse(await fs.readFile(tokenMapPath, 'utf8'));
  } catch { tokenMap = null; }

  const unmappedCount = tokenMap?.unmapped_tokens?.length || 0;
  const mappedCount = Object.keys(tokenMap?.colors || {}).length;

  if (unmappedCount > 0 && mappedCount < 5 && framerUrl) {
    log.step('Step 3/14: Browser-Crawl-Fallback (live Framer page)...');

    try {
      await runFile(nodeBin, [
        path.join(pipelineDir, 'extract-framer-css-tokens.js'),
        '--url', framerUrl,
        '--output', tokenMapPath,
        ...(verbose ? ['--verbose'] : []),
      ], 'Browser-Crawl-Fallback', pipelineDir);

      tokenMap = JSON.parse(await fs.readFile(tokenMapPath, 'utf8'));
      const newMapped = Object.keys(tokenMap?.colors || {}).length;
      log.success(`Fallback: ${newMapped} tokens mapped (was ${mappedCount})`);
      steps.push({ step: 3, name: 'Browser-Crawl-Fallback', status: 'ok' });
    } catch (err) {
      log.warn(`Browser-Crawl-Fallback fehlgeschlagen: ${err.message}`);
      steps.push({ step: 3, name: 'Browser-Crawl-Fallback', status: 'warning', error: err.message });
    }
  } else {
    log.info(`Step 3/14: Browser-Crawl-Fallback — übersprungen (${mappedCount} mapped, ${unmappedCount} unmapped)`);
    steps.push({ step: 3, name: 'Browser-Crawl-Fallback', status: 'skipped' });
  }

  // ════════════════════════════════════════════
  // STEPS 4-5: Unframer MCP (delegated)
  // ════════════════════════════════════════════

  log.info('Steps 4-5/14: Unframer MCP — an Agent delegiert');
  steps.push({ step: 4, name: 'Unframer getProjectXml', status: 'delegated' });
  steps.push({ step: 5, name: 'Unframer getNodeXml', status: 'delegated' });

  // ════════════════════════════════════════════
  // STEP 6: Style-Referenzen sammeln
  // ════════════════════════════════════════════

  log.step('Step 6/14: Style-Referenzen sammeln...');

  const styleRefsPath = path.join(tokensDir, 'style-refs.json');
  const styleRefs = {
    generated_at: new Date().toISOString(),
    colors: tokenMap?.colors || {},
    textStyles: tokenMap?.textStyles || {},
    unmapped: tokenMap?.unmapped_tokens || [],
    stats: {
      mapped_colors: mappedCount,
      unmapped_tokens: unmappedCount,
      text_styles: Object.keys(tokenMap?.textStyles || {}).length,
    },
  };
  await fs.writeFile(styleRefsPath, JSON.stringify(styleRefs, null, 2), 'utf8');
  log.success(`Style-Referenzen: ${styleRefs.stats.mapped_colors} colors, ${styleRefs.stats.text_styles} text styles`);
  steps.push({ step: 6, name: 'Style-Referenzen sammeln', status: 'ok' });

  // ════════════════════════════════════════════
  // STEPS 7-8: Token-Mapping erstellen + validieren
  // ════════════════════════════════════════════

  log.step('Steps 7-8/14: Token-Mapping erstellen + validieren...');

  const mappingValid = mappedCount > 0;
  if (mappingValid) {
    log.success(`Token-Mapping: ${mappedCount} colors zugeordnet`);
  } else {
    log.warn(`Token-Mapping: KEINE Farben zugeordnet (${unmappedCount} unmapped) — manuelles Mapping empfohlen`);
  }
  steps.push({ step: 7, name: 'Token-Mapping erstellen', status: mappingValid ? 'ok' : 'warning' });

  const criticalPaths = ['/Theme Color/Very Dark Green', '/Theme Color/White', '/Theme Color/Black'];
  const missingCritical = criticalPaths.filter(p => !tokenMap?.colors?.[p]);
  if (missingCritical.length > 0) {
    log.warn(`Kritische Token-Pfade ohne Mapping: ${missingCritical.join(', ')}`);
    steps.push({ step: 8, name: 'Token-Mapping validieren', status: 'warning', detail: `Missing: ${missingCritical.join(', ')}` });
  } else {
    steps.push({ step: 8, name: 'Token-Mapping validieren', status: 'ok' });
  }

  // ════════════════════════════════════════════
  // STEP 9: Design System aufbauen (WITH OUTPUT DEDUP)
  // ════════════════════════════════════════════

  log.step('Step 9/14: Design System aufbauen...');

  const dsVarsPath = path.join(designSystemDir, 'variables.json');

  // Output dedup: skip if variables.json is newer than token-mapping.json
  let dsSkipped = false;
  if (existsSync(dsVarsPath) && existsSync(tokenMapPath)) {
    try {
      const dsStat = await fs.stat(dsVarsPath);
      const tokStat = await fs.stat(tokenMapPath);
      if (dsStat.mtimeMs >= tokStat.mtimeMs) {
        log.success('Design System: cached (output is fresh)');
        steps.push({ step: 9, name: 'Design System', status: 'cached' });
        dsSkipped = true;
      }
    } catch { /* fall through to rebuild */ }
  }

  if (!dsSkipped) {
    try {
      await runFile(nodeBin, [
        path.join(pipelineDir, 'design-system-builder.js'),
        '--token-map', tokenMapPath,
        '--output-dir', designSystemDir,
        ...(verbose ? ['--verbose'] : []),
      ], 'Design System Builder', pipelineDir);

      let varCount = 0, classCount = 0;
      try {
        const vars = JSON.parse(await fs.readFile(dsVarsPath, 'utf8'));
        varCount = vars.meta?.total || vars.variables?.length || 0;
      } catch {}
      try {
        const classes = JSON.parse(await fs.readFile(path.join(designSystemDir, 'global-classes.json'), 'utf8'));
        classCount = classes.meta?.total || classes.classes?.length || 0;
      } catch {}

      log.success(`Design System: ${varCount} variables, ${classCount} global classes`);
      steps.push({ step: 9, name: 'Design System', status: 'ok', detail: `${varCount}v + ${classCount}c` });
    } catch (err) {
      log.warn(`Design System Builder fehlgeschlagen: ${err.message}`);
      steps.push({ step: 9, name: 'Design System', status: 'warning', error: err.message });
    }
  }

  // ════════════════════════════════════════════
  // STEP 11: convert-xml-to-v4.js (WITH token-map)
  // ════════════════════════════════════════════

  log.step('Step 11/14: XML → V4 Tree konvertieren...');

  let xmlFiles = [];
  try {
    const entries = await fs.readdir(exportDir, { withFileTypes: true, recursive: true });
    xmlFiles = entries
      .filter(e => e.isFile() && e.name.endsWith('.xml'))
      .map(e => path.join(e.parentPath || path.dirname(path.join(exportDir, e.name)), e.name))
      .slice(0, 5);
  } catch { xmlFiles = []; }

  const framerToolsDir = path.join(rootDir, 'tools', 'framer-export');
  if (xmlFiles.length === 0 && existsSync(framerToolsDir)) {
    try {
      const entries = await fs.readdir(framerToolsDir, { withFileTypes: true });
      xmlFiles = entries
        .filter(e => e.isFile() && e.name.endsWith('.xml'))
        .map(e => path.join(framerToolsDir, e.name));
    } catch {}
  }

  const outputDir = path.join(exportDir, 'v4-output');
  await fs.mkdir(outputDir, { recursive: true });
  v4TreePath = path.join(outputDir, 'elements.json');

  if (xmlFiles.length > 0) {
    const updatedTokenMap = path.join(designSystemDir, 'token-mapping-updated.json');
    const tokenMapArg = existsSync(updatedTokenMap) ? updatedTokenMap : tokenMapPath;

    const convertResults = [];
    for (const xmlFile of xmlFiles) {
      const pageName = path.basename(xmlFile, '.xml');
      try {
        const convertArgs = [
          path.join(pipelineDir, 'convert-xml-to-v4.js'),
          '--xml', xmlFile,
          '--output', path.join(outputDir, `${pageName}.json`),
          ...(elementorEnv ? ['--is-pro-active', String(elementorEnv.is_pro_active)] : []),
          ...(verbose ? ['--verbose'] : []),
        ];
        // Converter expects --tokens (not --token-map). Insert after --xml arg.
        if (existsSync(tokenMapArg)) {
          const xmlIdx = convertArgs.indexOf('--xml');
          if (xmlIdx >= 0) convertArgs.splice(xmlIdx + 2, 0, '--tokens', tokenMapArg);
        }
        await runFile(nodeBin, convertArgs, `convert-xml-to-v4: ${pageName}`, pipelineDir);
        convertResults.push({ page: pageName, status: 'ok' });
      } catch (err) {
        log.warn(`Konvertierung ${pageName} fehlgeschlagen: ${err.message}`);
        convertResults.push({ page: pageName, status: 'failed', error: err.message });
      }
    }
    steps.push({ step: 11, name: 'convert-xml-to-v4.js', status: convertResults.every(r => r.status === 'ok') ? 'ok' : 'warning', detail: convertResults });

    // Combine individual page outputs into elements.json for validation + QA
    // Delete stale elements.json first so we always work with fresh output
    if (existsSync(v4TreePath)) {
      try { await fs.unlink(v4TreePath); } catch {}
    }
      try {
        const outputFiles = (await fs.readdir(outputDir))
          .filter(f => f.endsWith('.json') && f !== 'elements.json');
        if (outputFiles.length > 0) {
          const allElements = [];
          for (const f of outputFiles) {
            try {
              const content = JSON.parse(await fs.readFile(path.join(outputDir, f), 'utf8'));
              const arr = Array.isArray(content) ? content : [content];
              allElements.push(...arr);
            } catch {}
          }
          if (allElements.length > 0) {
            await fs.writeFile(v4TreePath, JSON.stringify(allElements, null, 2), 'utf8');
            log.success(`Combined ${outputFiles.length} pages → elements.json (${allElements.length} elements)`);
          }
        }
      } catch {}
  } else {
    log.warn('Keine XML-Dateien gefunden. Überspringe V4-Konvertierung.');
    steps.push({ step: 11, name: 'convert-xml-to-v4.js', status: 'skipped', detail: 'No XML files found' });
  }

  // ════════════════════════════════════════════
  // STEPS 12+14: Validate + QA Gate (PARALLEL)
  // ════════════════════════════════════════════

  if (v4TreePath && existsSync(v4TreePath)) {
    log.step('Steps 12+14/14: Validation + QA Gate (parallel)...');

    const preBuildReportPath = path.join(outputDir, 'pre-build-validation.json');
    const qaDir = path.join(exportDir, 'qa');
    await fs.mkdir(qaDir, { recursive: true });

    const postValidationTasks = [];

    // Task: Pre-Build Validation
    postValidationTasks.push({
      command: nodeBin,
      args: [
        path.join(pipelineDir, 'framer-pre-build-validate.js'),
        '--tree', v4TreePath,
        '--tokens', tokenMapPath,
        '--output', preBuildReportPath,
      ],
      description: 'Pre-Build-Validation',
      cwd: pipelineDir,
    });

    // Task: Quality Gate (skip if --skip-qa)
    if (!skipQa) {
      const gateArgs = [
        path.join(pipelineDir, 'build-quality-gate.js'),
        '--tree', v4TreePath,
        '--tokens', tokenMapPath,
        '--output-dir', qaDir,
        '--skip-screenshots',
        ...(dryRun ? ['--dry-run'] : []),
        ...(verbose ? ['--verbose'] : []),
      ];
      if (postId) gateArgs.push('--post-id', postId);

      postValidationTasks.push({
        command: nodeBin,
        args: gateArgs,
        description: 'Visual QA + Auto-Fix',
        cwd: pipelineDir,
        optional: true,
      });
    }

    const postResults = await runParallel(postValidationTasks);

    // Process Pre-Build result
    const preResult = postResults.find(r => r.description === 'Pre-Build-Validation');
    if (preResult?.ok) {
      let score = 0;
      try {
        const report = JSON.parse(await fs.readFile(preBuildReportPath, 'utf8'));
        score = report.meta?.score || 0;
        log.success(`Pre-Build: ${score}% (17 Guards)`);
        steps.push({ step: 12, name: 'Pre-Build-Validation', status: score >= 85 ? 'ok' : 'warning', score });
      } catch {
        steps.push({ step: 12, name: 'Pre-Build-Validation', status: 'ok' });
      }
    } else {
      steps.push({ step: 12, name: 'Pre-Build-Validation', status: 'warning', error: preResult?.error });
    }

    // Process QA Gate result
    const qaResult = postResults.find(r => r.description === 'Visual QA + Auto-Fix');
    if (!skipQa) {
      if (qaResult?.ok) {
        steps.push({ step: 14, name: 'Visual QA + Auto-Fix', status: 'ok' });
      } else if (qaResult) {
        steps.push({ step: 14, name: 'Visual QA + Auto-Fix', status: 'warning', error: qaResult.error });
      }
    } else {
      steps.push({ step: 14, name: 'Visual QA + Auto-Fix', status: 'skipped' });
    }
  } else {
    log.warn('Kein V4-Tree gefunden. Überspringe Validation + QA.');
    steps.push({ step: 12, name: 'Pre-Build-Validation', status: 'skipped' });
    steps.push({ step: 14, name: 'Visual QA + Auto-Fix', status: 'skipped' });
  }

  // ════════════════════════════════════════════
  // STEP 13: elementor-set-content (MCP — delegated)
  // ════════════════════════════════════════════

  if (dryRun) {
    log.info('Step 13/14: elementor-set-content — DRY-RUN');
    steps.push({ step: 13, name: 'elementor-set-content', status: 'dry-run' });
  } else if (postId && v4TreePath && existsSync(v4TreePath)) {
    log.info('Step 13/14: elementor-set-content — an Agent delegiert');
    steps.push({ step: 13, name: 'elementor-set-content', status: 'delegated', detail: `post_id=${postId}` });
  } else {
    steps.push({ step: 13, name: 'elementor-set-content', status: 'skipped' });
  }

  // ════════════════════════════════════════════
  // FINAL SUMMARY
  // ════════════════════════════════════════════

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const okSteps = steps.filter(s => s.status === 'ok' || s.status === 'cached').length;
  const warnSteps = steps.filter(s => s.status === 'warning').length;
  const skipSteps = steps.filter(s => s.status === 'skipped' || s.status === 'delegated' || s.status === 'dry-run').length;
  const failSteps = steps.filter(s => s.status === 'failed').length;

  const summary = {
    pipeline: '14-step-optimized',
    generated: new Date().toISOString(),
    elapsed_seconds: parseFloat(elapsed),
    framer_url: framerUrl,
    post_id: postId,
    export_dir: exportDir,
    mode: dryRun ? 'dry-run' : 'live',
    results: {
      total: steps.length,
      ok: okSteps,
      warnings: warnSteps,
      skipped: skipSteps,
      failed: failSteps,
    },
    steps: steps.map(s => ({
      step: s.step,
      name: s.name,
      status: s.status,
      score: s.score,
      detail: s.detail,
      error: s.error,
    })),
    artifacts: {
      token_mapping: tokenMapPath,
      design_system: designSystemDir,
      v4_tree: v4TreePath,
      variables: path.join(designSystemDir, 'variables.json'),
      global_classes: path.join(designSystemDir, 'global-classes.json'),
      batch_create_plan: path.join(designSystemDir, 'batch-create-plan.json'),
      font_resolution: fontResPath,
      qa_report: skipQa ? null : path.join(exportDir, 'qa', 'quality-gate-report.json'),
    },
  };

  const summaryPath = path.join(exportDir, 'pipeline-summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📊 PIPELINE COMPLETE in ${elapsed}s`);

  // Phase-5 Cache-Stats
  try {
    const stats = getFramerCacheStats({ cacheRoot: rootDir });
    if (stats.exists && stats.total_files > 0) {
      const projectList = Object.keys(stats.per_project);
      console.log(`  💾 Framer-Cache: ${stats.total_files} files, ${(stats.total_bytes / 1024).toFixed(1)} KiB (${projectList.length} projects: ${projectList.join(', ')})`);
    }
  } catch { /* stats are non-critical */ }
  console.log(`${'═'.repeat(60)}`);
  console.log(`  ✅ ${okSteps} ok  ⚠️ ${warnSteps} warnings  ⏭️ ${skipSteps} skipped  ❌ ${failSteps} failed`);
  console.log(`  📄 Summary: ${path.relative(rootDir, summaryPath)}`);
  console.log(`${'═'.repeat(60)}\n`);

  return summary;
}
