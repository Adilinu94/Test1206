#!/usr/bin/env node
/**
 * scripts/preflight/ensure-elementor-experiments.js  —  P1-A Preflight Gate
 *
 * Stellt sicher dass alle 4 V4-Pflichtexperiments aktiv sind:
 *   - e_atomic_elements  (V4 Atomic Widgets — Pflicht)
 *   - e_opt_in_v4        (V4 Rendering-Stack — Pflicht)
 *   - e_variables        (e-gv-* Variablen-Auflösung — Pflicht)
 *   - e_classes          (Global Classes (gc-*) — Pflicht)
 *
 * Hintergründe aus dem E2E-Verbesserungsbericht (17. Juni 2026):
 *   - elementor-check-setup gibt atomic.runtime_available:true zurück, prüft aber
 *     NUR ob die PHP-Klassen geladen sind — NICHT ob die Experimente aktiv sind.
 *   - Ohne e_atomic_elements rendert kein einziges V4-Widget (e-flexbox, e-heading,
 *     e-paragraph, e-button, e-image). Die Seite antwortet mit HTTP 200 und einer
 *     leeren <body>. Keine Konsolenmeldung, kein 500er.
 *
 *   - e_css_grid hat release_status:"dev" und wird beim Speichern wieder auf
 *     inactive zurückgesetzt. Workaround: grid-template-columns als
 *     $$type:"string" Style-Prop setzen. Der CSS wird trotzdem inline gerendert.
 *
 * Aufruf:
 *   node scripts/preflight/ensure-elementor-experiments.js [--post-id ID] [--json] [--dry-run] [--help]
 *
 * Exit-Codes:
 *   0 = alle 4 Experimente aktiv (oder wurden gerade aktiviert)
 *   1 = Fehler (MCP nicht erreichbar, PHP-Snippet fehlgeschlagen)
 *   2 = Input-Fehler
 */

'use strict';

import { parseArgs } from 'node:util';

// ─────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    'post-id':     { type: 'string' },                       // Post-ID fuer CSS-Post-Rebuild (optional aber empfohlen)
    'json':        { type: 'boolean', default: false },       // JSON-Output
    'dry-run':     { type: 'boolean', default: false },       // Nur pruefen, nicht aktivieren
    'help':        { type: 'boolean', default: false },
    'include-css-grid': { type: 'boolean', default: false },  // Auch e_css_grid (dev-release, funktioniert nicht zuverlaessig)
  },
  strict: false,
});

if (args.help || process.argv.includes('-h')) {
  process.stdout.write(`ensure-elementor-experiments.js — P1-A Preflight Gate fuer V4-Experiments

USAGE:
  node scripts/preflight/ensure-elementor-experiments.js [--post-id ID] [--json] [--dry-run]

OPTIONS:
  --post-id ID        WordPress Post-ID fuer files_manager->clear_cache() + CSS-Post-Rebuild
  --json              JSON-Output statt formatiertem Text
  --dry-run           Nur pruefen ohne Aenderung
  --include-css-grid  Auch e_css_grid pruefen (hat release_status:"dev", standardmaessig NICHT inkl.)
  --help              Diese Hilfe

EXPERIMENTE (PFLICHT):
  e_atomic_elements    V4 Atomic Widgets (e-flexbox, e-heading, ...)
  e_opt_in_v4          V4 Rendering-Stack
  e_variables          e-gv-* Variablen-Aufloesung
  e_classes            Global Classes (gc-*)

EXIT-CODES:
  0 = alle PFLICHT-Experimente aktiv (oder wurden gerade aktiviert)
  1 = Fehler aufgetreten
  2 = Input-Fehler
`);
  process.exit(0);
}

const required = [
  'e_atomic_elements',
  'e_opt_in_v4',
  'e_variables',
  'e_classes',
];

if (args['include-css-grid']) {
  required.push('e_css_grid');
}

const REQUIRED_EXPERIMENTS = Object.freeze(required);
const dryRun = !!args['dry-run'];
const postId = args['post-id'] ? parseInt(args['post-id'], 10) : 0;

// ─────────────────────────────────────────────
// PHP-SNIPPET vorbereiten
// ─────────────────────────────────────────────

/**
 * PHP-Snippet das im Ziel-WP laeuft:
 *   1. prueft jedes Pflicht-Experiment ueber Elementor\Plugin experiments API
 *   2. aktiviert inaktive via update_option('elementor_experiments', ...)
 *   3. ruft files_manager->clear_cache() + Elementor\Core\Files\CSS\Post->update()
 *
 * Wichtig:
 *   - release_status:"dev" keys (z.B. e_css_grid) werden von Elementor
 *     beim update_option wieder auf "inactive" zurueckgesetzt. Das Snippet
 *     meldet sie trotzdem als requested, der build kann sie aber nicht nutzen.
 *   - Elementor ueberschreibt options bei dev-release-status automatisch —
 *     workaround im Build: grid-template-columns als $$type:"string" setzen.
 */
function buildPhpSnippet(requiredKeys, requestedPostId) {
  const keysJson = JSON.stringify(requiredKeys);
  const safePostId = Number.isInteger(requestedPostId) && requestedPostId > 0 ? requestedPostId : 0;

  return `<?php
$required = ${keysJson};
$requested_post_id = ${safePostId};
$result = [
  'activated' => [],
  'inactive_before' => [],
  'deactivated_by_dev_release' => [],
  'css_rebuilt' => false,
  'post_id' => $requested_post_id,
  'all_active' => true,
];

if (!class_exists('\\Elementor\\Plugin')) {
  return new WP_Error('elementor-missing', 'Elementor Plugin nicht geladen');
}

$exp = \\Elementor\\Plugin::$instance->experiments;
$opts = get_option('elementor_experiments', []);

// Elementor-Manifest der Experiments (release_status) — wird im Code dynamisch geholt
$manifest = [];
if (method_exists($exp, 'get_features')) {
  foreach ((array) $exp->get_features() as $key => $feature) {
    if (is_object($feature) && isset($feature->release_status)) {
      $manifest[$key] = $feature->release_status;
    }
  }
}

foreach ($required as $key) {
  if (!$exp->is_feature_active($key)) {
    $result['inactive_before'][] = $key;
    // e_css_grid hat release_status:"dev" — update_option ueberschreibt das zurueck auf inactive
    if (isset($manifest[$key]) && $manifest[$key] === 'dev') {
      $result['deactivated_by_dev_release'][] = $key;
      // Trotzdem versuchen zu setzen — vielleicht ist die Elementor-Version anders
      $opts[$key] = 'active';
    } else {
      $opts[$key] = 'active';
      $result['activated'][] = $key;
    }
  }
}

if (!empty(\$result['activated']) || !empty(\$result['deactivated_by_dev_release'])) {
  update_option('elementor_experiments', \$opts);
}

\\Elementor\\Plugin::$instance->files_manager->clear_cache();

if ($requested_post_id > 0 && class_exists('\\Elementor\\Core\\Files\\CSS\\Post')) {
  try {
    $css = new \\Elementor\\Core\\Files\\CSS\\Post($requested_post_id);
    $css->update();
    $result['css_rebuilt'] = true;
  } catch (Throwable $e) {
    $result['css_rebuild_error'] = $e->getMessage();
  }
}

$result['all_active'] = empty($result['inactive_before']);
return $result;
`;
}

// ─────────────────────────────────────────────
// MAIN: MCP-Call ausfuehren
// ─────────────────────────────────────────────

async function main() {
  const snippet = buildPhpSnippet(REQUIRED_EXPERIMENTS, postId);

  let mcp;
  try {
    // Pattern aus check-v4-requirements.js (-auto-call)
    const { McpBridge } = await import('../lib/mcp-bridge.js');
    mcp = await McpBridge.fromConfig();
  } catch (e) {
    const out = { ok: false, error: 'mcp-bridge-init-failed', message: e.message, snippet_attempted: snippet.length > 0 };
    if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    else process.stderr.write(`MCP-Bridge nicht initialisierbar: ${e.message}\n`);
    process.exit(1);
  }

  if (dryRun) {
    // Dry-Run: nur Status pruefen ohne Aenderung
    const checkSnippet =
      `<?php
$opts = get_option('elementor_experiments', []);
$required = ${JSON.stringify(REQUIRED_EXPERIMENTS)};
$exp = \\Elementor\\Plugin::$instance->experiments;
$state = [];
foreach ($required as $key) {
  $state[$key] = [
    'in_options' => isset($opts[$key]) ? $opts[$key] : null,
    'is_active'  => $exp->is_feature_active($key),
  ];
}
return $state;
`;
    let result;
    try {
      const raw = await mcp.call('novamira/execute-php', { code: checkSnippet });
      result = raw?.data ?? raw;
    } catch (e) {
      const out = { ok: false, error: 'dry-run-failed', message: e.message };
      if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      else process.stderr.write(`Dry-Run fehlgeschlagen: ${e.message}\n`);
      process.exit(1);
    }

    if (args.json) {
      process.stdout.write(JSON.stringify({ ok: true, dry_run: true, post_id: postId, state: result }, null, 2) + '\n');
    } else {
      process.stderr.write(`\n=== DRY-RUN: Elementor-Experiments-Status ===\n`);
      process.stderr.write(`Post-ID: ${postId || '(keine — nur global Check)'}\n`);
      process.stderr.write(`Pflicht-Experimente: ${REQUIRED_EXPERIMENTS.length}\n\n`);
      const allOk = Object.values(result).every(s => s.is_active === true);
      for (const [key, state] of Object.entries(result)) {
        const icon = state.is_active ? '🟢' : '🔴';
        process.stderr.write(`  ${icon} ${key.padEnd(25)} active=${state.is_active} opt=${state.in_options ?? '(default)'}\n`);
      }
      process.stderr.write(`\n${allOk ? '✅' : '❌'} Status: ${allOk ? 'alle aktiv' : 'Aktion erforderlich'}\n`);
    }
    process.exit(0);
  }

  // Echter Run: Experimente aktivieren + CSS rebuilden
  let result;
  try {
    const raw = await mcp.call('novamira/execute-php', { code: snippet });
    result = raw?.data ?? raw;
  } catch (e) {
    const out = { ok: false, error: 'mcp-call-failed', message: e.message, snippet_length: snippet.length };
    if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    else process.stderr.write(`MCP-Call fehlgeschlagen: ${e.message}\n`);
    process.exit(1);
  }

  // WP_Error-Handling
  if (result && typeof result === 'object' && result['WP_Error'] === true) {
    const out = { ok: false, error: 'wp-error', message: 'WP_Error vom Snippet erhalten', raw: result };
    if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    else process.stderr.write(`WP_Error vom Snippet: ${JSON.stringify(result)}\n`);
    process.exit(1);
  }

  const activated = result?.activated ?? [];
  const deactivatedByDev = result?.deactivated_by_dev_release ?? [];
  const cssRebuilt = !!result?.css_rebuilt;
  const allActive = !!result?.all_active;
  const cssRebuildError = result?.css_rebuild_error ?? null;

  if (args.json) {
    process.stdout.write(JSON.stringify({
      ok: true,
      post_id: postId,
      activated,
      deactivated_by_dev_release: deactivatedByDev,
      css_rebuilt: cssRebuilt,
      css_rebuild_error: cssRebuildError,
      all_active: allActive,
      requested: REQUIRED_EXPERIMENTS,
    }, null, 2) + '\n');
  } else {
    process.stderr.write(`\n=== ensure-elementor-experiments.js — P1-A Preflight ===\n`);
    process.stderr.write(`Post-ID: ${postId || '(keine — kein Post-spezifischer CSS-Rebuild)'}\n`);
    process.stderr.write(`Pflicht-Experimente: ${REQUIRED_EXPERIMENTS.length}\n\n`);

    if (activated.length > 0) {
      process.stderr.write(`🟢 Aktiviert:\n`);
      for (const k of activated) process.stderr.write(`   + ${k}\n`);
    } else {
      process.stderr.write(`🟢 Alle Pflicht-Experimente waren bereits aktiv.\n`);
    }

    if (deactivatedByDev.length > 0) {
      process.stderr.write(`\n⚠️  Durch Dev-release-status deaktiviert (Workaround noetig):\n`);
      for (const k of deactivatedByDev) process.stderr.write(`   ! ${k}\n`);
      process.stderr.write(`   → grid-template-columns als $$type:"string" setzen\n`);
    }

    process.stderr.write(`\n${cssRebuilt ? '✅ CSS-Cache neu gebaut.' : '⏭️  Kein Post-CSS rebuild (post-id fehlt oder Fehler)'}\n`);
    if (cssRebuildError) process.stderr.write(`   ⚠️  CSS-Rebuild Error: ${cssRebuildError}\n`);

    process.stderr.write(`\n${allActive ? '✅' : '❌'} Final-Status: ${allActive ? 'ALLE EXPERIMENTE AKTIV' : 'PROBLEM — siehe oben'}\n`);
  }

  process.exit(allActive ? 0 : 1);
}

main().catch(e => {
  const out = { ok: false, error: 'unhandled', message: e.message, stack: e.stack };
  if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  else process.stderr.write(`Unbehandelter Fehler: ${e.message}\n${e.stack}\n`);
  process.exit(1);
});
