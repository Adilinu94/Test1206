#!/usr/bin/env node
/**
 * html-to-widget-plan.js
 *
 * Brücke zu novamira/adrians-html-to-elementor-widget-plan.
 * Analysiert Framer-Export HTML und erstellt einen strukturierten
 * Elementor V4 Widget-Konvertierungsplan.
 *
 * Anders als convert-xml-to-v4.js (XML → V4 Tree) arbeitet dieses
 * Script mit dem rohen HTML-Export und delegiert die DOM-Analyse
 * an die serverseitige MCP-Ability:
 *
 *   HTML → adrians-html-to-elementor-widget-plan → Widget-Plan
 *                                                      │
 *                                    ┌─────────────────┘
 *                                    ▼
 *                              v4-tree.json (via convert-xml-to-v4.js)
 *
 * Usage:
 *   # Plan generieren (McpBridge --execute)
 *   node scripts/html-to-widget-plan.js \
 *     --html ./FramerExport/index.html \
 *     --output ./FramerExport/tokens/widget-plan.json \
 *     --execute
 *
 *   # Plan-Generator (Manual-Mode, ohne McpBridge)
 *   node scripts/html-to-widget-plan.js \
 *     --html ./FramerExport/index.html \
 *     --output ./FramerExport/tokens/widget-plan.json
 *
 *   # Nur Analyse-Report (stdout)
 *   node scripts/html-to-widget-plan.js \
 *     --html ./FramerExport/index.html \
 *     --verbose
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';

// ── CLI ────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    html:             { type: 'string' },
    'html-string':    { type: 'string' },
    'target-surface': { type: 'string', default: 'v4' },
    output:           { type: 'string' },
    'max-nodes':      { type: 'string', default: '250' },
    execute:          { type: 'boolean', default: false },
    verbose:          { type: 'boolean', default: false },
    help:             { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
html-to-widget-plan.js

ZWECK:
  Analysiert Framer-Export HTML (index.html) und erstellt einen
  strukturierten Elementor V4 Widget-Konvertierungsplan via
  novamira/adrians-html-to-elementor-widget-plan.

  Anders als convert-xml-to-v4.js (Framer XML → V4 Tree) arbeitet
  dieses Script direkt mit HTML und delegiert die DOM-Analyse an die
  serverseitige MCP-Ability.

OPTIONEN:
  --html FILE            HTML-Datei (z.B. FramerExport/index.html)
  --html-string STRING   HTML direkt als String (statt --html FILE)
  --target-surface v4|v3 Ziel-Elementor-Oberfläche  [default: v4]
  --output FILE          Output-Pfad für Widget-Plan JSON
  --max-nodes N          Maximale DOM-Nodes  [default: 250]
  --execute              Direkter McpBridge-Call (statt Plan-Generator)
  --verbose              Ausführliche Logs
  --help                 Diese Hilfe

WORKFLOW:
  1. node html-to-widget-plan.js --html index.html --output widget-plan.json --execute
     → Ruft novamira/adrians-html-to-elementor-widget-plan via McpBridge auf
     → Schreibt native_widget_ratio, CSS/JS-Inventar, Empfehlungen, Tree

  2. Plan reviewen:
     - native_widget_ratio ≥ 85% → Direkter Build mit Atomic Widgets
     - native_widget_ratio < 70% → Erst HTML-Referenz, dann inkrementell konvertieren

  3. Tree aus widget-plan.json in V4-Konvertierung übernehmen
     (convert-xml-to-v4.js für Framer XML, oder manuelle Umsetzung)

EXIT-CODES:
  0  Analyse erfolgreich
  1  Warnungen (HTML nicht lesbar, McpBridge-Fallback verwendet)
  2  HTML nicht gefunden oder leer
`);
  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────────────────────────

const log = (...a) => args.verbose && process.stderr.write('[html-plan] ' + a.join(' ') + '\n');
const warn = (...a) => process.stderr.write('[WARN] ' + a.join(' ') + '\n');
const fatal = (msg, code = 2) => { process.stderr.write('[FATAL] ' + msg + '\n'); process.exit(code); };

const TARGET_SURFACE = ['v4', 'v3'].includes(args['target-surface'])
  ? args['target-surface']
  : 'v4';

const rawNodes = parseInt(args['max-nodes'] ?? '250', 10);
const MAX_NODES = isNaN(rawNodes) ? 250 : Math.max(1, Math.min(1000, rawNodes));

// ── HTML laden ─────────────────────────────────────────────────────────────

let htmlContent;

if (args['html-string']) {
  htmlContent = args['html-string'];
} else if (args.html) {
  const htmlPath = resolve(args.html);
  if (!existsSync(htmlPath)) {
    fatal(`HTML-Datei nicht gefunden: ${htmlPath}`);
  }
  try {
    htmlContent = readFileSync(htmlPath, 'utf8');
  } catch (e) {
    fatal(`HTML nicht lesbar: ${htmlPath} — ${e.message}`);
  }
  log(`HTML geladen: ${htmlPath} (${(htmlContent.length / 1024).toFixed(1)} KB)`);
} else {
  fatal('--html FILE oder --html-string STRING ist erforderlich');
}

if (!htmlContent || htmlContent.trim().length === 0) {
  fatal('HTML ist leer');
}

// ── McpBridge-Call ─────────────────────────────────────────────────────────

async function callWidgetPlan(mcp, html, targetSurface, maxNodes) {
  process.stderr.write(`[html-plan] Rufe adrians-html-to-elementor-widget-plan auf (${targetSurface}, max ${maxNodes} Nodes)...\n`);

  const result = await mcp.call('novamira/adrians-html-to-elementor-widget-plan', {
    html,
    target_surface: targetSurface,
    include_tree: true,
    max_nodes: maxNodes,
  });

  return result;
}

// ── Plan-Fallback (wenn McpBridge nicht verfügbar) ────────────────────────

function writePlanFallback() {
  const plan = {
    type: 'html-to-widget-plan',
    target_surface: TARGET_SURFACE,
    max_nodes: MAX_NODES,
    html_size_bytes: htmlContent.length,
    agent_instruction: [
      'Führe den folgenden MCP-Call aus:',
      '',
      '  novamira/adrians-html-to-elementor-widget-plan',
      `  {`,
      `    "html": "<HTML-Inhalt (${(htmlContent.length / 1024).toFixed(1)} KB)>",`,
      `    "target_surface": "${TARGET_SURFACE}",`,
      `    "include_tree": true,`,
      `    "max_nodes": ${MAX_NODES}`,
      `  }`,
      '',
      'Speichere das Ergebnis als widget-plan.json.',
      '',
      'ERGEBNIS-INTERPRETATION:',
      `  - native_widget_ratio ≥ 85% → Direkter V4 Atomic Build möglich`,
      `  - native_widget_ratio < 70% → Erst HTML-Referenz, dann inkrementell`,
      '  - stats.tag_counts → Häufigste HTML-Tags (Container-Kandidaten)',
      '  - css_inventory → CSS-Blöcke die in Global Classes ausgelagert werden sollten',
      '  - js_inventory → JS-Blöcke für page_css/page_js',
      '  - unconverted → Nicht konvertierbare Elemente (style, script, form, canvas)',
      '  - recommendations → Konkrete Handlungsempfehlungen',
      '  - tree → Vereinfachter Konvertierungsbaum (elementor_target pro Node)',
    ],
    mcp_call: {
      ability: 'novamira/adrians-html-to-elementor-widget-plan',
      params: {
        html: '<HTML_INHALT_HIER>',
        target_surface: TARGET_SURFACE,
        include_tree: true,
        max_nodes: MAX_NODES,
      },
    },
  };

  const outputPath = args.output || 'widget-plan.json';
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), JSON.stringify(plan, null, 2), 'utf8');

  process.stderr.write(
    `[html-plan] Widget-Plan-Fallback → ${outputPath}\n` +
    `[html-plan] Agent: MCP-Call aus mcp_call ausführen, Ergebnis als widget-plan.json speichern.\n`
  );
}

// ── Report aus Widget-Plan generieren ──────────────────────────────────────

function printReport(plan) {
  if (!plan || !plan.success) {
    warn(`Widget-Plan fehlgeschlagen: ${plan?.error || 'Unbekannter Fehler'}`);
    return;
  }

  const ratio = plan.native_widget_ratio ?? 0;
  const ratioPct = (ratio * 100).toFixed(1);
  const stats = plan.stats || {};
  const summary = plan.summary || {};

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  HTML → ELEMENTOR V4 WIDGET-PLAN`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Ziel-Oberfläche:    ${plan.target_surface?.toUpperCase()}`);
  console.log(`  Native Coverage:    ${ratioPct}%`);
  console.log(`  Build-Strategie:    ${summary.recommended_build_strategy || 'N/A'}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  STATISTIK:`);
  console.log(`    Total Elements:        ${stats.total_elements ?? '?'}`);
  console.log(`    Native Candidates:     ${stats.native_candidates ?? '?'}`);
  console.log(`    Container Candidates:  ${stats.container_candidates ?? '?'}`);
  console.log(`    HTML Required:         ${stats.html_required ?? '?'}`);
  console.log(`    CSS Blocks:            ${stats.css_blocks ?? '?'}`);
  console.log(`    Script Blocks:         ${stats.script_blocks ?? '?'}`);
  console.log(`    Images:                ${stats.images ?? '?'}`);
  console.log(`    Links:                 ${stats.links ?? '?'}`);
  console.log(`    Forms:                 ${stats.forms ?? '?'}`);
  console.log(`${'─'.repeat(60)}`);

  if (plan.recommendations?.length > 0) {
    console.log(`  EMPFEHLUNGEN:`);
    for (const rec of plan.recommendations) {
      console.log(`    → ${rec}`);
    }
    console.log(`${'─'.repeat(60)}`);
  }

  if (Object.keys(plan.css_inventory?.blocks || {}).length > 0) {
    console.log(`  CSS-INVENTAR: ${plan.css_inventory.count} Blöcke`);
    for (const block of (plan.css_inventory.blocks || []).slice(0, 5)) {
      console.log(`    ${block.selector_hint}: ${block.length}B, Features: [${(block.features || []).join(', ')}]`);
    }
    console.log(`${'─'.repeat(60)}`);
  }

  if (Object.keys(plan.js_inventory?.blocks || {}).length > 0) {
    console.log(`  JS-INVENTAR: ${plan.js_inventory.count} Blöcke`);
    for (const block of (plan.js_inventory.blocks || []).slice(0, 5)) {
      console.log(`    ${block.selector_hint}: ${block.length}B, Features: [${(block.features || []).join(', ')}]`);
    }
    console.log(`${'─'.repeat(60)}`);
  }

  if (plan.unconverted?.length > 0) {
    console.log(`  NICHT KONVERTIERBAR: ${plan.unconverted.length} Elemente`);
    for (const item of plan.unconverted.slice(0, 10)) {
      console.log(`    <${item.tag}> ${item.selector_hint} — ${item.reason}`);
    }
    console.log(`${'─'.repeat(60)}`);
  }

  // Bewertung
  console.log(`\n  BEWERTUNG: ${ratio >= 0.85 ? '✅ DIREKTER BUILD MÖGLICH' : ratio >= 0.7 ? '⚠️  MIT HTML-FALLBACKS' : '❌ ERST HTML-REFERENZ'}`);
  console.log(`${'═'.repeat(60)}\n`);
}

// ── MAIN ───────────────────────────────────────────────────────────────────

// --execute: Direkter McpBridge-Call
if (args.execute) {
  let McpBridge;
  try {
    const mod = await import('./lib/mcp-bridge.js');
    McpBridge = mod.McpBridge;
  } catch (e) {
    writePlanFallback();
    process.exit(0);
  }

  let mcp;
  try {
    mcp = await McpBridge.fromConfig();
    process.stderr.write(`[html-plan] MCP-Bridge verbunden: ${mcp.mcpUrl}\n`);
  } catch (e) {
    writePlanFallback();
    process.exit(0);
  }

  try {
    const plan = await callWidgetPlan(mcp, htmlContent, TARGET_SURFACE, MAX_NODES);

    if (!plan || !plan.success) {
      const errMsg = plan?.error || 'Unbekannter Fehler vom MCP-Server';
      process.stderr.write(`[html-plan] ❌ Widget-Plan fehlgeschlagen: ${errMsg}\n`);
      writePlanFallback();
      process.exit(1);
    }

    // Report ausgeben
    if (args.verbose) {
      printReport(plan);
    }

    // Output schreiben
    const enrichedPlan = {
      ...plan,
      _meta: {
        generated_by: 'html-to-widget-plan.js',
        html_source: args.html || '<html-string>',
        html_size_bytes: htmlContent.length,
        generated_at: new Date().toISOString(),
      },
    };

    const outputPath = args.output || 'widget-plan.json';
    mkdirSync(dirname(resolve(outputPath)), { recursive: true });
    writeFileSync(resolve(outputPath), JSON.stringify(enrichedPlan, null, 2), 'utf8');

    const ratioPct = ((plan.native_widget_ratio ?? 0) * 100).toFixed(1);
    process.stderr.write(
      `[html-plan] ✅ Widget-Plan: ${ratioPct}% native Coverage → ${outputPath}\n`
    );

    process.exit(0);

  } catch (err) {
    writePlanFallback();
    process.exit(1);
  }
}

// Standard-Modus: Plan-Generator (kein --execute)
process.stderr.write(`[html-plan] Plan-Modus: ${(htmlContent.length / 1024).toFixed(1)} KB HTML, ${TARGET_SURFACE}, max ${MAX_NODES} Nodes\n`);
writePlanFallback();
process.exit(0);
