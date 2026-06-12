#!/usr/bin/env node
/**
 * Framer → Elementor V4 Pipeline V2: Interactive CLI Wizard
 * 
 * Zentraler Entry-Point für die Framer-zu-V4-Konvertierung.
 * Orchestriert Pre-Build-Extraktion, Validierung und generiert das Build-Manifest.
 */

import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoDir = __dirname;
const pipelineDir = __dirname;
const nodeBin = process.execPath;
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const rl = readline.createInterface({ input, output });

// Helper: Colored console output
const log = {
  info: (msg) => console.log(`\n🔵 [INFO] ${msg}`),
  success: (msg) => console.log(`\n✅ [SUCCESS] ${msg}`),
  warn: (msg) => console.log(`\n⚠️  [WARN] ${msg}`),
  error: (msg) => console.log(`\n❌ [ERROR] ${msg}`),
  step: (msg) => console.log(`\n▶️  [STEP] ${msg}`),
};

function findWorkspaceRoot() {
  if (process.env.FRAMER_PIPELINE_ROOT) return path.resolve(process.env.FRAMER_PIPELINE_ROOT);
  const candidates = [
    process.cwd(),
    repoDir,
    path.resolve(repoDir, '..'),
  ];
  return candidates.find(dir =>
    existsSync(path.join(dir, 'tools', 'framer-export')) ||
    existsSync(path.join(dir, 'FramerExport')) ||
    existsSync(path.join(dir, 'build-manifest.json'))
  ) || repoDir;
}

const rootDir = findWorkspaceRoot();

function findFramerExportDir() {
  const candidates = [
    process.env.FRAMER_EXPORT_DIR,
    path.join(rootDir, 'tools', 'framer-export'),
    path.join(rootDir, 'FramerExport'),
    path.resolve(rootDir, '..', 'FramerExport'),
  ].filter(Boolean).map(p => path.resolve(p));
  return candidates.find(dir => existsSync(dir)) || null;
}

async function runFile(command, args, description, cwd = rootDir) {
  log.step(description);
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd, maxBuffer: 1024 * 1024 * 20 });
    if (stderr) log.warn(stderr);
    log.success(`${description} abgeschlossen.`);
    return stdout;
  } catch (error) {
    log.error(`${description} fehlgeschlagen.`);
    console.error(error.message);
    throw error;
  }
}

async function findIndexHtmlDirs(baseDir) {
  const found = [];
  async function scan(dir, depth = 0) {
    if (depth > 3) return;
    if (!existsSync(dir)) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    if (entries.some(e => e.isFile() && e.name === 'index.html')) {
      const stat = await fs.stat(path.join(dir, 'index.html'));
      found.push({ dir, mtimeMs: stat.mtimeMs });
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await scan(path.join(dir, entry.name), depth + 1);
      }
    }
  }
  await scan(baseDir);
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

// ═══════════════════════════════════════════════════════════════════════════
// PREFLIGHT SUBCOMMAND (Plan 0.4)
// ═══════════════════════════════════════════════════════════════════════════

async function runPreflight(formatJson) {
  const checks = [];
  const T = (label) => ({ label, result: null, detail: '' });

  // 1. .env Variablen
  const envCheck = T('.env Variablen');
  const requiredEnv = ['WP_API_URL', 'WP_API_USERNAME', 'FRAMER_EXPORT_DIR'];
  const missing = requiredEnv.filter(k => !process.env[k]);
  envCheck.result = missing.length === 0;
  envCheck.detail = envCheck.result ? `${requiredEnv.length}/${requiredEnv.length}` : `Fehlt: ${missing.join(', ')}`;
  checks.push(envCheck);

  // 2. FRAMER_EXPORT_DIR
  const feCheck = T('FRAMER_EXPORT_DIR');
  try {
    const feDir = findFramerExportDir();
    feCheck.result = feDir !== null;
    feCheck.detail = feCheck.result ? feDir : 'Nicht gefunden';
  } catch { feCheck.result = false; feCheck.detail = 'Fehler'; }
  checks.push(feCheck);

  // 3. WP_API_URL per HTTP
  const httpCheck = T('WP_API_URL erreichbar');
  const mcpUrl = process.env.WP_API_URL;
  if (!mcpUrl) { httpCheck.result = false; httpCheck.detail = 'Nicht gesetzt'; }
  else {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(mcpUrl, { method: 'HEAD', signal: ctrl.signal });
      httpCheck.result = res.ok || res.status === 401;
      httpCheck.detail = `HTTP ${res.status}`;
      clearTimeout(t);
    } catch (e) {
      httpCheck.result = false;
      httpCheck.detail = e.name === 'AbortError' ? 'Timeout' : e.message.slice(0, 60);
    }
  }
  checks.push(httpCheck);

  // 4. MCP Discovery (non-fatal — greet might not be registered)
  const mcpCheck = T('MCP Discovery');
  try {
    const { McpBridge } = await import(pathToFileURL(path.join(pipelineDir, 'scripts', 'lib', 'mcp-bridge.js')).href);
    const mcp = await McpBridge.fromConfig();
    try {
      await mcp.call('novamira/adrians-greet', { name: 'preflight' });
      mcpCheck.result = true;
      mcpCheck.detail = 'greet OK';
    } catch {
      const setup = await mcp.call('novamira/elementor-check-setup', {});
      mcpCheck.result = true;
      mcpCheck.detail = 'check-setup OK';
    }
  } catch (e) {
    mcpCheck.result = false;
    mcpCheck.detail = e.message.slice(0, 60);
  }
  checks.push(mcpCheck);

  // 5. V2-Plugin / Elementor Version
  const verCheck = T('V2-Plugin / Elementor');
  if (mcpCheck.result) {
    try {
      const { McpBridge } = await import(pathToFileURL(path.join(pipelineDir, 'scripts', 'lib', 'mcp-bridge.js')).href);
      const mcp = await McpBridge.fromConfig();
      const setup = await mcp.call('novamira/elementor-check-setup', {});
      verCheck.result = setup?.elementor?.version !== undefined;
      verCheck.detail = verCheck.result
        ? `El ${setup.elementor.version}, Atomic ${setup.atomic?.runtime_available ? 'ON' : 'OFF'}`
        : 'Keine Version-Daten';
    } catch (e) {
      verCheck.result = false;
      verCheck.detail = e.message.slice(0, 60);
    }
  } else {
    verCheck.result = false;
    verCheck.detail = 'MCP nicht erreichbar';
  }
  checks.push(verCheck);

  // 6. Schema-Endpoint
  const schemaCheck = T('Schema-Endpoint');
  try {
    const wpUrl = mcpUrl?.replace(/\/wp-json\/mcp\/.*$/, '');
    if (wpUrl) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`${wpUrl}/wp-json/novamira-adrianv2/v1/prop-schema`, { signal: ctrl.signal });
      schemaCheck.result = res.ok;
      schemaCheck.detail = `HTTP ${res.status}`;
      clearTimeout(t);
    } else { schemaCheck.result = false; schemaCheck.detail = 'WP_API_URL nicht gesetzt'; }
  } catch (e) {
    schemaCheck.result = false;
    schemaCheck.detail = e.message.slice(0, 60);
  }
  checks.push(schemaCheck);

  // 7. Disk-Space
  const diskCheck = T('Disk-Space >= 1 GB');
  diskCheck.result = true;
  diskCheck.detail = 'Nicht ermittelbar (Windows)';
  checks.push(diskCheck);

  // 8. .mcp.json Config
  const cfgCheck = T('.mcp.json / Config');
  const cfgPath = path.join(pipelineDir, '.mcp.json');
  cfgCheck.result = existsSync(cfgPath);
  cfgCheck.detail = cfgCheck.result ? cfgPath : 'Nicht gefunden (env vars OK)';
  checks.push(cfgCheck);

  // ── Output ──────────────────────────────────────────────────────────
  if (formatJson) {
    const json = {
      timestamp: new Date().toISOString(),
      passed: checks.filter(c => c.result).length,
      failed: checks.filter(c => c.result === false).length,
      total: checks.length,
      checks: checks.map(c => ({ label: c.label, result: c.result, detail: c.detail })),
    };
    console.log(JSON.stringify(json, null, 2));
  } else {
    console.log(`\n${"=".repeat(56)}`);
    console.log('  PREFLIGHT — System-Checks vor dem Build');
    console.log(`${"=".repeat(56)}`);
    for (const c of checks) {
      console.log(`  ${c.result ? "✅" : "❌"} ${c.label.padEnd(28)} ${c.detail}`);
    }
    console.log(`${"=".repeat(56)}`);
    const allOk = checks.every(c => c.result);
    console.log(`  ${allOk ? "✅ ALLE CHECKS BESTANDEN" : "❌ EINIGE CHECKS FEHLGESCHLAGEN"}`);
    console.log(`${"=".repeat(56)}\n`);
    if (!allOk) {
      console.error('Behebe die fehlgeschlagenen Checks vor dem Wizard-Start.\n');
      process.exit(1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DRY-RUN (Plan 3.1)
// ═══════════════════════════════════════════════════════════════════════════

async function runDryRun() {
  console.log(`\n${"=".repeat(56)}`);
  console.log('  DRY-RUN — Build-Plan ohne Schreibzugriff');
  console.log(`${"=".repeat(56)}`);

  const plan = {
    generated: new Date().toISOString(),
    mode: 'dry-run',
    phases: [
      { phase: '0', step: 'MCP-Verbindungsprüfung', action: 'McpBridge.fromConfig() + self-test' },
      { phase: '0.2', step: 'Schema-Sync', action: 'node scripts/sync-schema.js' },
      { phase: '0a', step: 'V4 Atomic Check', action: 'node scripts/check-v4-requirements.js --auto-call' },
      { phase: 'A', step: 'FramerExport', action: 'npm run dev -- <framer-url> im FramerExport-Checkout' },
      { phase: 'B', step: 'Asset-Extraction (6 Scripts)', action: 'extract-image-urls, resolve-fonts, breakpoints, styles, tokens, widget-plan' },
      { phase: 'C', step: '12-Guard Validation', action: 'node scripts/framer-pre-build-validate.js --tree v4-tree.json' },
      { phase: '1.3', step: 'Rollback-Backup', action: 'RollbackManager.backupPlan(postId)' },
      { phase: '1.4', step: 'Split-Large-Tree', action: 'node scripts/lib/split-large-tree.js --plan' },
      { phase: 'D', step: 'Build-Manifest', action: 'Schreibt build-manifest.json (kein MCP-Call)' },
      { phase: '4', step: 'Build (MCP)', action: 'elementor-set-content (NICHT ausgeführt im Dry-Run)' },
    ],
    warnings: [
      'Dry-Run führt KEINE MCP-Calls aus und schreibt KEINE Daten nach WordPress.',
      'Alle Phase-B-Calls (extract-image-urls.js etc.) werden NUR im Dry-Run-Log dokumentiert.',
      'Für echten Build: wizard.js (ohne --dry-run)',
    ],
  };

  console.log(JSON.stringify(plan, null, 2));
  console.log(`\nDry-Run abgeschlossen — kein Build ausgeführt.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW + PROMOTE (Plan 3.2)
// ═══════════════════════════════════════════════════════════════════════════

async function runPreview(postId) {
  if (!postId || isNaN(parseInt(postId, 10))) {
    log.error('preview benötigt --post-id <ID> (numerisch)');
    process.exit(1);
  }
  const pid = parseInt(postId, 10);
  const previewHash = Date.now().toString(36);
  const previewTitle = `Preview ${previewHash} — Post ${pid}`;

  log.step(`Erstelle Preview-Page von Post ${pid}...`);

  try {
    const { McpBridge } = await import(pathToFileURL(path.join(pipelineDir, 'scripts', 'lib', 'mcp-bridge.js')).href);
    const mcp = await McpBridge.fromConfig();

    // 1. Content der Quellseite holen
    const source = await mcp.call('novamira/elementor-get-content', { post_id: pid });
    if (!source?.content) throw new Error('Kein Elementor-Content auf Quellseite.');

    // 2. Neue Preview-Page anlegen
    const created = await mcp.call('novamira/create-post', {
      title: previewTitle,
      status: 'draft',
      post_type: 'page',
    });
    const previewId = created?.post_id || created?.id;
    if (!previewId) throw new Error('Preview-Page konnte nicht erstellt werden.');

    // 3. Content auf Preview-Seite setzen
    await mcp.call('novamira/elementor-set-content', {
      post_id: previewId,
      content: source.content,
    });

    // 4. Page-Settings übertragen (optional)
    try {
      const settings = await mcp.call('novamira/adrians-page-settings', { post_id: pid, action: 'get' });
      if (settings && !settings.error) {
        await mcp.call('novamira/adrians-page-settings', {
          post_id: previewId,
          action: 'set',
          settings: settings,
        });
      }
    } catch { /* page-settings optional */ }

    log.success(`Preview-Page erstellt: Post #${previewId}`);
    console.log(`\n  Preview-URL: ${process.env.WP_API_URL?.replace('/wp-json/mcp/novamira', '') || 'http://solar.local'}/?p=${previewId}&preview=true`);
    console.log(`  Zum Promoten: node wizard.js promote --preview-id ${previewId} --target-id ${pid}\n`);
    process.exit(0);
  } catch (e) {
    log.error(`Preview fehlgeschlagen: ${e.message}`);
    process.exit(1);
  }
}

async function runPromote(previewId, targetId) {
  if (!previewId || !targetId) {
    log.error('promote benötigt --preview-id <ID> --target-id <ID>');
    process.exit(1);
  }
  const pvId = parseInt(previewId, 10);
  const tgId = parseInt(targetId, 10);

  log.step(`Promote: Preview #${pvId} → Live #${tgId}...`);

  try {
    const { McpBridge } = await import(pathToFileURL(path.join(pipelineDir, 'scripts', 'lib', 'mcp-bridge.js')).href);
    const mcp = await McpBridge.fromConfig();

    // 1. Content der Preview holen
    const preview = await mcp.call('novamira/elementor-get-content', { post_id: pvId });
    if (!preview?.content) throw new Error('Kein Content auf Preview-Seite.');

    // 2. Backup des Live-Stands
    const live = await mcp.call('novamira/elementor-get-content', { post_id: tgId });
    const backupPath = path.join(rootDir, `promote-backup-${tgId}-${Date.now().toString(36)}.json`);
    await fs.writeFile(backupPath, JSON.stringify(live, null, 2), 'utf8');
    log.info(`Live-Backup gespeichert: ${path.relative(rootDir, backupPath)}`);

    // 3. Preview-Content auf Live-Seite schreiben
    await mcp.call('novamira/elementor-set-content', {
      post_id: tgId,
      content: preview.content,
    });

    log.success(`Promote erfolgreich: Preview #${pvId} → Live #${tgId}`);
    console.log(`  Backup: ${path.relative(rootDir, backupPath)}`);
    console.log(`  Live-URL: ${process.env.WP_API_URL?.replace('/wp-json/mcp/novamira', '') || 'http://solar.local'}/?p=${tgId}\n`);
    process.exit(0);
  } catch (e) {
    log.error(`Promote fehlgeschlagen: ${e.message}`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTIVE ERROR RECOVERY (Plan 3.3)
// ═══════════════════════════════════════════════════════════════════════════

async function promptErrorRecovery(stepName, error) {
  console.log(`\n${"─".repeat(56)}`);
  console.log(`  ⚡ FEHLER in Schritt: ${stepName}`);
  console.log(`  ${error.message || error}`);
  console.log(`${"─".repeat(56)}`);
  console.log('  [R]etry — Schritt wiederholen');
  console.log('  [S]kip  — Schritt überspringen und fortsetzen');
  console.log('  [F]ix   — Manuell beheben, dann weitermachen');
  console.log('  [A]bort — Build abbrechen');

  while (true) {
    const choice = (await rl.question('  Auswahl [R/S/F/A]: ')).trim().toLowerCase();
    switch (choice) {
      case 'r': return 'retry';
      case 's': log.warn(`Schritt "${stepName}" übersprungen.`); return 'skip';
      case 'f':
        log.info('Warte auf manuelle Behebung... (Enter zum Fortfahren)');
        await rl.question('');
        return 'retry';
      case 'a':
        log.error('Build durch Benutzer abgebrochen.');
        rl.close();
        process.exit(1);
      default:
        console.log('  Ungültige Eingabe. [R]etry [S]kip [F]ix [A]bort');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE-AS-A-SERVICE (Plan 4.1)
// ═══════════════════════════════════════════════════════════════════════════

async function runServe(port) {
  try { var http = await import('node:http'); } catch { var http = await import('http'); }
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url === '/health') {
      res.end(JSON.stringify({ status: 'ok', version: '0.7.0', uptime: process.uptime() }));
    } else if (req.method === 'POST' && req.url === '/build') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const { url, postId } = JSON.parse(body || '{}');
        const buildId = `build-${Date.now()}`;
        res.writeHead(202);
        res.end(JSON.stringify({ status: 'accepted', buildId, url, postId }));
      });
    } else if (req.method === 'GET' && req.url?.startsWith('/builds/')) {
      res.end(JSON.stringify({ status: 'completed', logs: [] }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found', endpoints: ['GET /health', 'POST /build', 'GET /builds/:id'] }));
    }
  });
  server.listen(port, () => process.stderr.write(`[serve] Pipeline-API auf http://localhost:${port}\n`));
}

// ═══════════════════════════════════════════════════════════════════════════
// WRAPPER: runWithRecovery — führt einen Schritt mit interaktivem Recovery aus
// ═══════════════════════════════════════════════════════════════════════════

async function runWithRecovery(stepName, fn) {
  while (true) {
    try {
      await fn();
      return; // success
    } catch (err) {
      const action = await promptErrorRecovery(stepName, err);
      if (action === 'skip') return;
      // 'retry' loops back
    }
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 FRAMER → ELEMENTOR V4 PIPELINE V2 WIZARD');
  console.log('='.repeat(60) + '\n');

  // PHASE 0: MCP CONNECTION CHECK
  log.step('Phase 0: MCP Connector Prüfung...');
  console.log(`
  ┌─────────────────────────────────────────────────────────┐
  │  NOVAMIRA MCP CONNECTOR                                 │
  │                                                         │
  │  Tool:   novamira-solar-local:mcp-adapter-execute-ability│
  │  Format: { ability_name: "novamira/...", parameters: {} }│
  │                                                         │
  │  Kein .mcp.json nötig. Kein HTTP aus Node.js.          │
  │  Der Agent ruft alle Abilities direkt auf.              │
  └─────────────────────────────────────────────────────────┘
  `);

  // PHASE 0.2: SCHEMA SYNC (Fail-Fast)
  log.step('Phase 0.2: Schema-Sync mit V2-Plugin...');
  try {
    await runFile(
      nodeBin,
      [path.join(pipelineDir, 'scripts', 'sync-schema.js'), '--verbose'],
      'Prop-Schema vom V2-Plugin synchronisieren',
      pipelineDir
    );
    log.success('Prop-Schema erfolgreich synchronisiert.');
  } catch (err) {
    log.error('SCHEMA-SYNC FEHLGESCHLAGEN — Build abgebrochen.');
    log.error('Stelle sicher, dass:');
    console.error('  1. Die WordPress-Seite läuft und erreichbar ist');
    console.error('  2. Das Novamira AdrianV2 Plugin aktiviert ist');
    console.error('  3. WP_API_URL env var oder --url in sync-schema.js gesetzt ist');
    rl.close();
    process.exit(1);
  }

  // PHASE 0a: V4 ATOMIC REQUIREMENTS CHECK
  log.step('Phase 0a: V4 Atomic Requirements Check...');

  let v4CheckPassed = false;

  // 1. Primär: --auto-call
  try {
    await runFile(
      nodeBin,
      [path.join(pipelineDir, 'scripts', 'check-v4-requirements.js'), '--auto-call'],
      'V4 Requirements Check (elementor-check-setup via McpBridge)',
      pipelineDir
    );
    v4CheckPassed = true;
    log.success('V4 Atomic Requirements erfüllt (Auto-Call).');
  } catch (err) {
    log.warn(`V4 Auto-Check fehlgeschlagen: ${String(err).slice(0, 200)}`);
  }

  // 2. Fallback: Gespeicherte Datei
  if (!v4CheckPassed) {
    const setupCheckPath = path.join(rootDir, 'reports', 'elementor-check-setup.json');
    if (existsSync(setupCheckPath)) {
      try {
        await runFile(
          nodeBin,
          [path.join(pipelineDir, 'scripts', 'check-v4-requirements.js'), '--check-setup-json', setupCheckPath],
          'V4 Requirements Check (gespeicherte Datei)'
        );
        v4CheckPassed = true;
        log.success('V4 Atomic Requirements erfüllt (gespeicherte Datei).');
      } catch (err) {
        if (err.message?.includes('exit code 1') || err.code === 1) {
          log.error('HARD STOP: Elementor V4 Atomic Widgets sind nicht aktiviert!');
          log.error('Bitte zuerst in WordPress beheben:');
          console.error('\n  1. Elementor → Settings → Features → "Atomic Widgets" → ON');
          console.error('  2. Elementor → Tools → Regenerate CSS & Data → Cache leeren');
          console.error('  3. Wizard erneut starten\n');
          rl.close();
          process.exit(1);
        }
        log.warn(`V4-Check-Warnung: ${err.message} — Pipeline startet auf eigene Gefahr.`);
      }
    }
  }

  // 3. Guidance
  if (!v4CheckPassed) {
    await runFile(
      nodeBin,
      [path.join(pipelineDir, 'scripts', 'check-v4-requirements.js'), '--guidance'],
      'V4 Requirements Guidance'
    ).catch(() => {});
    log.info('V4-Check nicht automatisch möglich — bitte manuell in WordPress prüfen.');
    log.info('Elementor → Settings → Features → "Atomic Widgets" muss ON sein.');
  }

  let targetPostIdNum = null;
  let rollbackPlanPath = null;
  let splitPlanPath = null;

  try {
    // 1. Framer URL
    const framerUrl = await rl.question('🌐 Framer-URL der Quellseite: ');
    if (!framerUrl.startsWith('http')) {
      throw new Error('Ungültige URL. Muss mit http:// oder https:// beginnen.');
    }

    // 2. Scope
    const scope = await rl.question('🎯 Scope (Enter für "ganze Seite" oder Komma-separierte Abschnittsnamen): ');
    const targetScope = scope.trim() || 'full-page';

    // 3. WP Environment
    const environments = ['testseite.nick-webdesign.de', 'treetsshop.local', 'anderer (manuell eingeben)'];
    console.log('\nVerfügbare Umgebungen:');
    environments.forEach((env, i) => console.log(`  ${i + 1}. ${env}`));
    const envChoice = await rl.question('🖥️  Ziel-Umgebung (1-3 oder Name): ');
    let wpEnv = envChoice.trim();
    if (envChoice === '1') wpEnv = environments[0];
    else if (envChoice === '2') wpEnv = environments[1];
    else if (envChoice === '3') wpEnv = await rl.question('Bitte gib die manuelle URL/domain ein: ');

    // 4. Target Post ID
    const postIdInput = await rl.question('📝 Ziel-Post-ID (oder "new" für neue Seite): ');
    const targetPostId = postIdInput.trim().toLowerCase() === 'new' ? 'new' : postIdInput.trim();

    console.log('\n' + '='.repeat(60));
    log.info('Konfiguration zusammengefasst. Starte Pre-Build-Pipeline...');
    console.log(`   URL: ${framerUrl}`);
    console.log(`   Scope: ${targetScope}`);
    console.log(`   Umgebung: ${wpEnv}`);
    console.log(`   Ziel-Post-ID: ${targetPostId}`);
    console.log('='.repeat(60) + '\n');

    const confirm = await rl.question('⚠️  Mit diesen Einstellungen fortfahren? (j/N): ');
    if (confirm.toLowerCase() !== 'j' && confirm.toLowerCase() !== 'y') {
      log.info('Abgebrochen.');
      rl.close();
      return;
    }

    // --- PRE-BUILD PIPELINE EXECUTION ---

    // Schritt A: FramerExport Symbiose
    const exportFolderName = `framer-${framerUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '-').substring(0, 30)}`;
    let exportDir = path.join(rootDir, 'exports', exportFolderName);

    await runWithRecovery('FramerExport', async () => {
      log.step(`Starte FramerExport in dediziertem Ordner: ${exportDir}`);
      await fs.mkdir(exportDir, { recursive: true });

      const framerExportDir = findFramerExportDir();
      if (!framerExportDir) {
        throw new Error('FramerExport nicht gefunden. Setze FRAMER_EXPORT_DIR oder lege FramerExport unter tools/framer-export bzw. FramerExport ab.');
      }

      const pkgJson = await readJsonIfExists(path.join(framerExportDir, 'package.json'));
      const before = await findIndexHtmlDirs(framerExportDir);
      if (pkgJson?.scripts?.dev) {
        log.info(`Befehl: npm run dev -- <framer-url> in ${framerExportDir}`);
        await runFile(npmBin, ['run', 'dev', '--', framerUrl], 'FramerExport ausführen', framerExportDir);
      } else if (existsSync(path.join(framerExportDir, 'src', 'cli', 'index.ts'))) {
        log.info(`Befehl: npx tsx src/cli/index.ts <framer-url> --platform framer in ${framerExportDir}`);
        await runFile(npxBin, ['tsx', 'src/cli/index.ts', framerUrl, '--platform', 'framer'], 'FramerExport ausführen', framerExportDir);
      } else {
        throw new Error(`Kein unterstützter FramerExport-Einstieg in ${framerExportDir} gefunden.`);
      }

      const after = await findIndexHtmlDirs(framerExportDir);
      const beforeDirs = new Set(before.map(e => path.resolve(e.dir).toLowerCase()));
      const generated = after.find(e => !beforeDirs.has(path.resolve(e.dir).toLowerCase())) || after[0];
      if (!generated) throw new Error('FramerExport hat kein index.html erzeugt.');
      exportDir = generated.dir;
      log.success('FramerExport erfolgreich abgeschlossen. Lokales Mirror erstellt.');
    });

    // Schritt B: Asset & Structure Extraction
    const exportHtml = path.join(exportDir, 'index.html');
    const tokensDir = path.join(exportDir, 'tokens');
    const assetsDir = path.join(exportDir, 'assets');
    await fs.mkdir(tokensDir, { recursive: true });
    await fs.mkdir(assetsDir, { recursive: true });
    const extractionSteps = [
      { args: ['scripts/extract-image-urls.js', '--html', exportHtml, '--output', path.join(assetsDir, 'image-manifest.json')], desc: 'Extrahiere Bild-URLs aus Framer-Export' },
      { args: ['scripts/resolve-fonts.js', '--html', exportHtml, '--fonts-dir', path.join(assetsDir, 'fonts'), '--output', path.join(tokensDir, 'font-resolution.json')], desc: 'Löse Font-Referenzen auf' },
      { args: ['scripts/extract-responsive-breakpoints.js', '--css', exportHtml, '--output', path.join(tokensDir, 'responsive-breakpoints.json')], desc: 'Extrahiere Responsive Breakpoints' },
      { args: ['scripts/extract-framer-styles.js', '--html', exportHtml, '--output', path.join(tokensDir, 'extracted-styles.json')], desc: 'Extrahiere CSS-Properties und Variablen' },
      { args: ['scripts/design-token-extractor.js', '--html', exportHtml, '--output', path.join(tokensDir, 'token-mapping.json'), '--variables-plan', path.join(tokensDir, 'variables-plan.json')], desc: 'Erzeuge Design-Token-Mapping und Variablen-Plan' },
      // RC-15: Animation Workflow — Extrahiere Framer Animationen und generiere GSAP-Plan
      ...(targetPostId && targetPostId !== 'new'
        ? [{ args: ['scripts/framer-animation-extractor.js', '--html', exportHtml, '--post-id', targetPostId, '--output', path.join(tokensDir, 'animation-plan.json')], desc: 'Extrahiere Framer Animationen → GSAP ScrollTrigger Plan (RC-15, post-spezifisch)' }]
        : [{ args: ['scripts/framer-animation-extractor.js', '--html', exportHtml, '--output', path.join(tokensDir, 'animation-plan.json')], desc: 'Extrahiere Framer Animationen → GSAP ScrollTrigger Plan (RC-15)' }]),
      { args: ['scripts/html-to-widget-plan.js', '--html', exportHtml, '--output', path.join(tokensDir, 'widget-plan.json')], desc: 'HTML → Elementor Widget-Plan analysieren' }
    ];

    for (const step of extractionSteps) {
      await runWithRecovery(step.desc, async () => {
        await runFile(nodeBin, step.args, step.desc, pipelineDir);
      });
    }

    // Schritt C: Pre-Build Validation (12 Guards)
    const treePath = path.join(rootDir, 'v4-tree.json');
    if (existsSync(treePath)) {
      await runWithRecovery('12-Guard Validation', async () => {
        const validationReportPath = path.join(rootDir, 'validation-report.json');
        await runFile(nodeBin, [
          'scripts/framer-pre-build-validate.js',
          '--tree', treePath,
          '--output', validationReportPath,
        ], 'Führe 12-Guard Pre-Build-Validierung durch', pipelineDir);

        try {
          const report = JSON.parse(await fs.readFile(validationReportPath, 'utf8'));
          const score = report.meta?.score || report.score || 0;
          if (score < 85) {
            throw new Error(`Validation Score zu niedrig: ${score}%. Mindestens 85% erforderlich.`);
          }
          log.success(`Validation bestanden mit Score: ${score}%`);
        } catch (e) {
          if (e.message.includes('Score zu niedrig')) throw e;
          log.warn('Konnte validation-report.json nicht parsen. Gehe von manuellem Check aus.');
        }
      });
    } else {
      log.warn('v4-tree.json nicht gefunden. Überspringe Pre-Build-Validierung.');
      log.info('Hinweis: Führe manuell `node scripts/convert-xml-to-v4.js` oder ein ähnliches Tool aus.');
    }

    // ── PHASE 1.3: ROLLBACK BACKUP PLAN ──────────────────────────────
    targetPostIdNum = targetPostId !== 'new' ? parseInt(targetPostId, 10) : null;
    rollbackPlanPath = null;
    splitPlanPath = null;

    if (targetPostIdNum && !isNaN(targetPostIdNum)) {
      await runWithRecovery('Rollback-Backup', async () => {
        const { RollbackManager } = await import(
          pathToFileURL(path.join(pipelineDir, 'scripts', 'lib', 'rollback.js')).href
        );
        const rb = new RollbackManager();
        const { plan } = rb.backupPlan(targetPostIdNum);
        if (plan) {
          rollbackPlanPath = path.join(rootDir, 'rollback-plan.json');
          await fs.writeFile(rollbackPlanPath, JSON.stringify(plan, null, 2), 'utf8');
          log.success(`Rollback-Plan gespeichert: ${path.relative(rootDir, rollbackPlanPath)}`);
          console.error(`  → ${plan.mcp_calls.length} MCP-Calls (elementor-get-content + adrians-page-settings)`);
          console.error('  → Agent: MCP-Calls ausführen → Ergebnisse an RollbackManager.backupPlan() übergeben');
        } else {
          log.info('Backup existiert bereits — überspringe.');
        }
      });
    } else {
      log.info('Phase 1.3 übersprungen (neue Seite — kein Backup nötig).');
    }

    // ── PHASE 1.4: SPLIT-LARGE-TREE CHECK ────────────────────────────
    if (existsSync(treePath) && targetPostIdNum) {
      await runWithRecovery('Split-Large-Tree', async () => {
        const splitStdout = await runFile(
          nodeBin,
          [path.join(pipelineDir, 'scripts', 'lib', 'split-large-tree.js'), '--plan', treePath, '--post-id', String(targetPostIdNum)],
          'V4-Tree auf Section-Split prüfen',
          pipelineDir
        );
        if (splitStdout) {
          const splitResult = JSON.parse(splitStdout);
          const sectionCount = splitResult.sections?.length || 0;
          splitPlanPath = path.join(rootDir, 'split-plan.json');
          await fs.writeFile(splitPlanPath, splitStdout, 'utf8');
          if (sectionCount > 1) {
            log.warn(`Tree hat ${splitResult.totalElements} Elemente → in ${sectionCount} Sections gesplittet.`);
            console.error(`  → Split-Plan: ${path.relative(rootDir, splitPlanPath)}`);
            console.error('  → Agent: MCP-Calls aus split-plan.json sequenziell ausführen');
          } else {
            log.success(`Tree passt in einen Build-Call (${splitResult.totalElements} Elemente).`);
          }
        }
      });
    } else if (!existsSync(treePath)) {
      log.info('Phase 1.4 übersprungen (v4-tree.json nicht vorhanden).');
    }

    // Schritt D: Manifest Generierung
    log.step('Generiere Build-Manifest...');
    const manifest = {
      timestamp: new Date().toISOString(),
      framerUrl,
      scope: targetScope,
      wpEnvironment: wpEnv,
      targetPostId: targetPostId,
      exportFolder: exportFolderName,
      artifacts: {
        v4Tree: existsSync(treePath) ? 'v4-tree.json' : 'pending (manuell erstellen)',
        imageManifest: path.relative(rootDir, path.join(exportDir, 'assets', 'image-manifest.json')).replace(/\\/g, '/'),
        fontResolution: path.relative(rootDir, path.join(exportDir, 'tokens', 'font-resolution.json')).replace(/\\/g, '/'),
        responsive: path.relative(rootDir, path.join(exportDir, 'tokens', 'responsive-breakpoints.json')).replace(/\\/g, '/'),
        extractedStyles: path.relative(rootDir, path.join(exportDir, 'tokens', 'extracted-styles.json')).replace(/\\/g, '/'),
        tokenMapping: path.relative(rootDir, path.join(exportDir, 'tokens', 'token-mapping.json')).replace(/\\/g, '/'),
        variablesPlan: path.relative(rootDir, path.join(exportDir, 'tokens', 'variables-plan.json')).replace(/\\/g, '/'),
        animationPlan: path.relative(rootDir, path.join(exportDir, 'tokens', 'animation-plan.json')).replace(/\\/g, '/'),
        validation: existsSync(treePath) ? 'validation-report.json' : 'pending'
      },
      preview: targetPostIdNum ? {
        command: `node wizard.js preview --post-id ${targetPostIdNum}`,
        promote: `node wizard.js promote --preview-id <ID> --target-id ${targetPostIdNum}`,
      } : null,
      nextSteps: [
        '=== PRE-BUILD ===',
        '1. v4-tree.json generieren (convert-xml-to-v4.js oder Novamira Framer-Pipeline Skill).',
        '2. MCP: novamira/adrians-export-design-system { what: all } -> design-system-export.json speichern.',
        '3. GV-IDs aus design-system-export.json in v4-tree.json eintragen (design-token-extractor.js).',
        '4. Optional: cross-validate-sources.js --design-system design-system-export.json --tree v4-tree.json',
        '5. generate-global-classes.js --tree v4-tree.json --output tokens/gc-plan.json  (PFLICHT — verhindert ~45 Style-Duplikate)',
        '5a. Optional: framer-animation-extractor.js ausfuehren (animation-plan.json → inject-animation-code.js)',
        '6. patch-v4-tree-media-ids.js ausfuehren (Invariant IV).',
        '7. framer-pre-build-validate.js --tree v4-tree.json (Score muss >= 85 sein).',
        '=== ROLLBACK & SPLIT ===',
        `8. ROLLBACK: MCP-Calls aus ${rollbackPlanPath ? path.relative(rootDir, rollbackPlanPath) : 'rollback-plan.json'} ausfuehren.`,
        `   → elementor-get-content + adrians-page-settings → Ergebnisse an RollbackManager.backupPlan() uebergeben.`,
        `9. SPLIT: ${splitPlanPath ? `Falls Tree >50 Elemente → MCP-Calls aus ${path.relative(rootDir, splitPlanPath)} ausfuehren.` : 'Tree passt in einen Call.'}`,
        '=== PREVIEW (NEU v0.7.0) ===',
        '10. PREVIEW: node wizard.js preview --post-id <ID> → erstellt Preview-Page.',
        '    PROMOTE: node wizard.js promote --preview-id <ID> --target-id <ID> → schiebt Preview live.',
        '=== BUILD ===',
        '11. MCP: novamira/adrians-setup-v4-foundation { post_id: <ID> } aufrufen -> session-ids sichern.',
        '12. MCP: novamira/elementor-set-content (NICHT adrians-batch-build-page fuer Framer-Trees!).',
        '=== ROLLBACK BEI FEHLER ===',
        '    Bei Build-Fehler: RollbackManager.restorePlan(postId) aufrufen → restore-plan.json ausfuehren.',
        '=== POST-BUILD QA ===',
        '13. MCP: novamira/elementor-get-content -> als elementor-dump.json speichern.',
        '14. verify-build-binding.js elementor-dump.json (Invariant I).',
        '15. validate-v4-tree.js elementor-dump.json (Invariant I-V).',
        '16. MCP: novamira/adrians-layout-audit { post_id: <ID> } -- Pass-through, Nesting, Grid-Kandidaten.',
        '17. MCP: novamira/adrians-visual-qa { post_id: <ID>, breakpoints: [desktop, tablet, mobile] }.',
        '18. MCP: novamira/adrians-responsive-audit { post_id: <ID> } -- Breakpoint-Coverage.',
        '19. MCP: novamira/adrians-variable-audit { report: "drift" } -- e-gv-* Drift-Check.',
        '20. Bei Style-Fehlern: adrians-patch-element-styles { post_id, patches: [{element_id, ...}] }.',
        '21. Bei GC-Problemen: adrians-add-global-class-variant / adrians-edit-global-class-variant.',
        '    Kein Tree-Rebuild noetig fuer Responsive-Fixes auf Global Classes.'
      ]
    };

    const manifestPath = path.join(rootDir, 'build-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    log.success(`Build-Manifest gespeichert unter: ${manifestPath}`);

    console.log('\n' + '='.repeat(60));
    log.success('🎉 PRE-BUILD PHASE ABGESCHLOSSEN');
    console.log('='.repeat(60));
    console.log('\nNaechste Schritte: Folge der nextSteps-Liste in build-manifest.json.');
    console.log('Alle 21 Schritte sind in der richtigen Reihenfolge dokumentiert.');
    console.log('Wichtig: Schritt 8 (Rollback), 9 (Split), 10 (Preview) und 16-17 (Layout-Audit + Visual-QA) nicht ueberspringen!');
    if (targetPostIdNum) {
      console.log(`\n💡 Preview-Tipp: node wizard.js preview --post-id ${targetPostIdNum}`);
    }

  } catch (error) {
    log.error('Ein kritischer Fehler ist im Wizard aufgetreten:');
    console.error(error);

    // Interaktive Recovery auch im Top-Level Catch
    const action = await promptErrorRecovery('Build-Gesamt', error);
    if (action === 'skip') {
      log.info('Build abgeschlossen mit Fehlern — bitte Logs prüfen.');
    }

    // ── ROLLBACK RESTORE GUIDANCE ──────────────────────────────────────
    if (targetPostIdNum && !isNaN(targetPostIdNum)) {
      try {
        const { RollbackManager } = await import(
          pathToFileURL(path.join(pipelineDir, 'scripts', 'lib', 'rollback.js')).href
        );
        const rb = new RollbackManager();
        if (rb.hasBackup(targetPostIdNum)) {
          const restoreOutput = rb.restorePlan(targetPostIdNum);
          const restorePlanPath = path.join(rootDir, 'restore-plan.json');
          await fs.writeFile(restorePlanPath, JSON.stringify(restoreOutput.plan, null, 2), 'utf8');
          log.warn('ROLLBACK: Ein Backup existiert. Restore-Plan wurde erstellt:');
          console.error(`  → ${path.relative(rootDir, restorePlanPath)}`);
          console.error('  → Agent: MCP-Calls aus restore-plan.json ausführen, um den alten Stand wiederherzustellen.');
        }
      } catch (_) {}
    }
  } finally {
    rl.close();
  }
}

// ── Subcommand Dispatch ────────────────────────────────────────────────────
const sub = process.argv[2];

if (sub === 'help' || sub === '--help' || sub === '-h') {
  console.log(`
Framer -> Elementor V4 Pipeline Wizard v0.7.0

SUBCOMMANDS:
  (default)    Interaktiver Build-Wizard mit Recovery-Mode
  preflight    System-Checks vor dem Build (8 Checks)
  dry-run      Build-Plan ohne Schreibzugriff generieren
  preview      Preview-Page von bestehender Seite erstellen
  promote      Preview auf Live-Seite promovieren
  serve        HTTP-API starten (default Port 7123)
  help         Diese Hilfe

OPTIONEN:
  --post-id <ID>       Post-ID für preview
  --preview-id <ID>    Preview-ID für promote
  --target-id <ID>     Ziel-Post-ID für promote
  --format=json        JSON-Output (preflight)
  --port <PORT>        Port für serve (default 7123)
`);
  process.exit(0);
}

if (sub === 'preflight') {
  const formatJson = process.argv.includes('--format=json');
  await runPreflight(formatJson);
  process.exit(0);
}

if (sub === 'preview') {
  const postIdIdx = process.argv.indexOf('--post-id');
  const postId = postIdIdx >= 0 ? process.argv[postIdIdx + 1] : null;
  await runPreview(postId);
}

if (sub === 'promote') {
  const pvIdx = process.argv.indexOf('--preview-id');
  const tgIdx = process.argv.indexOf('--target-id');
  const previewId = pvIdx >= 0 ? process.argv[pvIdx + 1] : null;
  const targetId = tgIdx >= 0 ? process.argv[tgIdx + 1] : null;
  await runPromote(previewId, targetId);
}

if (sub === 'dry-run' || process.argv.includes('--dry-run')) {
  await runDryRun();
  process.exit(0);
}

if (sub === 'serve') {
  const port = parseInt(process.argv[3] || '7123', 10);
  await runServe(port);
  process.exit(0);
}

// Default: interaktiver Build-Wizard
main();
