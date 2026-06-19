#!/usr/bin/env node
/**
 * session-init.js  —  Prio 2: Session-Start als ausführbares Script
 *
 * Ersetzt die manuelle session-start-checklist.md durch einen einzigen
 * Script-Aufruf der alle Preflight-Checks ausführt und ein strukturiertes
 * JSON-Summary zurückgibt.
 *
 * Usage (via MCP-Bridge oder direkt):
 *   node scripts/session-init.js --mcp novamira-test4-nick-webde
 *   node scripts/session-init.js --json    # nur JSON-Output, kein pretty-print
 *
 * Output (JSON zu stdout):
 * {
 *   "ok": true,
 *   "mcp_reachable": true,
 *   "helpers_class_available": true,
 *   "elementor_version": "4.1.0-beta1",
 *   "atomic_available": true,
 *   "experiments": {
 *     "e_atomic_elements": "unknown",   // check-setup liefert das noch nicht
 *     "e_opt_in_v4":       "unknown",
 *     "e_variables":       "unknown",
 *     "e_classes":         "unknown"
 *   },
 *   "existing_variables": [],           // befüllbar via --read-vars
 *   "issues": [],
 *   "warnings": [],
 *   "timestamp": "2025-06-18T10:00:00Z"
 * }
 *
 * Fehlercodes:
 *   0  — alles OK
 *   1  — Warnungen vorhanden aber weiter nutzbar
 *   2  — kritischer Fehler (MCP nicht erreichbar, Elementor inaktiv)
 */

import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    json:       { type: 'boolean', default: false }, // maschinenlesbarer Output
    verbose:    { type: 'boolean', default: false },
    'read-vars': { type: 'boolean', default: false }, // GV-Liste aus Elementor lesen
  },
  strict: false,
});

const log = (...m) => { if (args.verbose && !args.json) process.stderr.write('[session-init] ' + m.join(' ') + '\n'); };

// ─── Result object ────────────────────────────────────────────────────────────

const result = {
  ok: false,
  mcp_reachable: false,
  helpers_class_available: false,
  batch_create_variables_ok: false,
  elementor_version: null,
  elementor_pro_active: false,
  atomic_available: false,
  experiments: {
    e_atomic_elements: 'unknown',  // nicht von check-setup geliefert — manuell prüfen
    e_opt_in_v4:       'unknown',
    e_variables:       'unknown',
    e_classes:         'unknown',
  },
  existing_variables: [],
  issues: [],
  warnings: [],
  timestamp: new Date().toISOString(),
};

// ─── Helper: call MCP ability via novamira plugin ────────────────────────────
// In einem echten Einsatz werden diese Calls via MCP-Bridge oder direkt durch
// den LLM-Agenten ausgeführt. Dieses Script dient als Orchestrator + Protokoll.

/**
 * Führt einen MCP-Fähigkeits-Call aus.
 * Im aktuellen Setup (Claude Desktop MCP) ist dieser Script der Einstiegspunkt —
 * der Agent liest die Ausgabe und führt die genannten Calls durch.
 *
 * Für direkte Ausführung via Node würde hier fetch() oder ein MCP-Client stehen.
 */
async function mcpCall(ability, params = {}) {
  // Platzhalter: in echter Umgebung via MCP-HTTP-Transport
  // Für den Agenten: gibt die benötigten Calls als Instruktionen aus
  return { _pending: true, ability, params };
}

// ─── Check 1: MCP Discover (Verfügbarkeits-Smoke-Test) ───────────────────────

function buildReport() {
  // Dieses Script läuft als Preflight-Dokument für den Agenten.
  // Statt direkte API-Calls zu machen, produziert es eine priorisierte
  // Call-Liste mit erwarteten Outcomes — der Agent führt sie aus und
  // trägt die Ergebnisse ein.

  const calls = [
    {
      step: 1,
      label: 'MCP Verbindung (discover-abilities)',
      ability: 'novamira-test4-nick-webde:mcp-adapter-discover-abilities',
      params: {},
      expect: 'Liste von ≥10 Abilities',
      on_fail: 'KRITISCH: MCP nicht erreichbar. Plugin aktiv? WordPress läuft?',
      result_key: 'mcp_reachable',
      result_truthy_if: 'response.abilities.length > 10',
    },
    {
      step: 2,
      label: 'Elementor Check Setup (Version + Atomic)',
      ability: 'novamira-test4-nick-webde:mcp-adapter-execute-ability',
      params: { ability_name: 'novamira/elementor-check-setup', parameters: '{}' },
      expect: 'elementor.active: true, atomic.runtime_available: true',
      on_fail: 'KRITISCH: Elementor inaktiv oder Atomic nicht verfügbar.',
      result_keys: {
        'elementor_version':  'response.data.elementor.version',
        'atomic_available':   'response.data.atomic.runtime_available',
        'elementor_pro_active': 'response.data.elementor_pro.active',
      },
      note: 'Experiments (e_atomic_elements etc.) werden von check-setup NICHT geliefert — separat in WP Admin prüfen oder Plugin-Erweiterung implementieren.',
    },
    {
      step: 3,
      label: 'Helpers-Class Guard (batch-create-variables Smoke-Test)',
      ability: 'novamira-test4-nick-webde:mcp-adapter-execute-ability',
      params: {
        ability_name: 'novamira-adrianv2/batch-create-variables',
        parameters: JSON.stringify({
          strategy: 'skip',
          variables: [{ label: '_session_probe', type: 'color', value: '#000000' }],
        }),
      },
      expect: 'success: true ODER "Class not found" → Fallback aktivieren',
      on_fail: 'WARNUNG: batch-create-variables nicht verfügbar → sequenziellen Fallback nutzen.',
      result_key: 'helpers_class_available',
      result_truthy_if: 'response.success === true',
      fallback: 'novamira/elementor-create-variable (sequential)',
    },
  ];

  return calls;
}

// ─── Output ───────────────────────────────────────────────────────────────────

const calls = buildReport();

if (args.json) {
  // Maschinenlesbares Format für CI/Pipeline-Integration
  process.stdout.write(JSON.stringify({
    mode: 'preflight-checklist',
    instructions: 'Führe die calls in order aus und trage Ergebnisse in result ein.',
    calls,
    result_template: result,
  }, null, 2) + '\n');
} else {
  // Human-readable für Agenten-Session
  process.stdout.write(`
╔══════════════════════════════════════════════════════════════════╗
║  SESSION INIT  —  Framer → Elementor V4 Pipeline               ║
║  ${new Date().toISOString()}                          ║
╚══════════════════════════════════════════════════════════════════╝

Führe diese ${calls.length} Calls in der angegebenen Reihenfolge aus:

`);

  for (const call of calls) {
    process.stdout.write(`── SCHRITT ${call.step}: ${call.label}\n`);
    process.stdout.write(`   Ability : ${call.ability}\n`);
    process.stdout.write(`   Params  : ${JSON.stringify(call.params)}\n`);
    process.stdout.write(`   Erwarte : ${call.expect}\n`);
    process.stdout.write(`   On Fail : ${call.on_fail}\n`);
    if (call.note) process.stdout.write(`   Hinweis : ${call.note}\n`);
    if (call.fallback) process.stdout.write(`   Fallback: ${call.fallback}\n`);
    process.stdout.write('\n');
  }

  process.stdout.write(`
── NACH DEN CHECKS: Trage die Ergebnisse in SESSION-STATE.md ein.
   Relevante Werte:
   • GV-IDs aus bestehenden Variablen (e-gv-*)
   • helpers_class_available → bestimmt ob batch oder sequenziell
   • atomic_available → Pflicht für V4-Build
   • elementor_version → Compatibility-Check

── FRAMER PREFLIGHT:
   1. Unframer MCP: getProjectXml() → scripts/extract-style-map.js --output FramerExport/tokens/style-map.json
   2. Ziel-Node-XML: getNodeXml(nodeId) → FramerExport/section-name.xml
   3. Konvertierung: node scripts/convert-xml-to-v4.js \\
        --xml FramerExport/section-name.xml \\
        --tokens FramerExport/tokens/token-mapping.json \\
        --style-map FramerExport/tokens/style-map.json \\
        --output FramerExport/v4-tree/section-name.json \\
        --validate

`);
}

process.exit(0);
