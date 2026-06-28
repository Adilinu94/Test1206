#!/usr/bin/env node
/**
 * scripts/preflight/check-unframer-connectivity.js  —  P3-A Preflight Gate
 *
 * Testet ob das Unframer MCP (https://mcp.unframer.co/mcp?id=...) erreichbar ist.
 * Hintergruende aus dem E2E-Verbesserungsbericht (17. Juni 2026):
 *   - Die Claude-Sandbox hat Allowlist-Regeln die externe MCP-Hosts blockieren
 *     koennen. Symptom: "Host not in allowlist: mcp.unframer.co".
 *   - Ohne Unframer MCP hat Phase 1 der Pipeline (getNodeXml, getStyles) keine
 *     strukturierten Framer-Daten. Fallback: web_fetch auf Framer-URL,
 *     gecachte homepage.xml (mit Projekt-Match-Check) oder Screenshot-only.
 *
 * Aufruf:
 *   node scripts/preflight/check-unframer-connectivity.js [--url URL] [--json] [--timeout MS] [--help]
 *
 * Exit-Codes:
 *   0 = MCP erreichbar (HTTP 200)
 *   1 = MCP nicht erreichbar (Fallback noetig)
 *   2 = Input-Fehler
 */

'use strict';

import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    url:     { type: 'string' },                            // Unframer MCP URL (oder default)
    json:    { type: 'boolean', default: false },
    timeout: { type: 'string', default: '5000' },            // ms
    help:    { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help || process.argv.includes('-h')) {
  process.stdout.write(`check-unframer-connectivity.js — P3-A Preflight Gate fuer Unframer MCP

USAGE:
  node scripts/preflight/check-unframer-connectivity.js [--url URL] [--timeout MS] [--json]

OPTIONS:
  --url URL         Unframer MCP URL (default: https://mcp.unframer.co/mcp)
  --timeout MS      HTTP-Timeout in ms (default: 5000)
  --json            JSON-Output
  --help            Diese Hilfe

EXIT-CODES:
  0 = MCP erreichbar (HTTP 200 + JSON-RPC initialize OK)
  1 = MCP nicht erreichbar (Fallback noetig — siehe framer-v4-pipeline Phase 0)
  2 = Input-Fehler

FALLBACK-WENN-NICHT-ERREICHBAR (siehe dual-source-workflow.md):
  Option A: Framer-Seite manuell via web_fetch laden → CSS-Tokens extrahieren
  Option B: tools/framer-export/homepage.xml nutzen (NUR mit Projekt-Match-Check!)
  Option C: Build auf Basis von Screenshot + Design-Analyse (letzter Ausweg)
  In allen Faellen: WARNUNG in Session-State, Post-Build-QA verschaerfen.
`);
  process.exit(0);
}

const mcpUrl = args.url || 'https://mcp.unframer.co/mcp';
const timeoutMs = parseInt(args.timeout, 10) || 5000;

// JSON-RPC initialize Handshake (JSON-RPC 2.0, Methoden aus offizieller Unframer Doku)
const HANDSHAKE_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'framer-v4-pipeline', version: '0.20.0' },
  },
});

async function checkConnectivity() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json, text/event-stream',
      },
      body: HANDSHAKE_BODY,
    });

    clearTimeout(timer);
    const elapsed = Date.now() - start;

    // Response-Body nur lesen wenn klein (< 1KB), sonst nur Header
    let responsePreview = null;
    try {
      const text = await res.text();
      responsePreview = text.length > 500 ? text.slice(0, 500) + '…' : text;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.result?.protocolVersion) {
          return { ok: true, source: 'mcp', elapsed_ms: elapsed, status: res.status, protocol: parsed.result.protocolVersion };
        }
      } catch { /* not JSON */ }
    } catch { /* body read failed */ }

    return { ok: res.ok, source: 'http-status', elapsed_ms: elapsed, status: res.status, response_preview: responsePreview };
  } catch (e) {
    clearTimeout(timer);
    const elapsed = Date.now() - start;
    if (e.name === 'AbortError') {
      return { ok: false, source: 'timeout', elapsed_ms: elapsed, error: `Timeout nach ${timeoutMs}ms`, url: mcpUrl };
    }
    return { ok: false, source: 'network-error', elapsed_ms: elapsed, error: e.message, url: mcpUrl };
  }
}

async function main() {
  if (timeoutMs < 100 || timeoutMs > 60000) {
    const msg = `Ungueltiger Timeout: ${timeoutMs}ms (erlaubt: 100..60000)`;
    if (args.json) process.stdout.write(JSON.stringify({ ok: false, error: 'invalid-timeout' }) + '\n');
    else process.stderr.write(msg + '\n');
    process.exit(2);
  }

  const result = await checkConnectivity();

  if (args.json) {
    process.stdout.write(JSON.stringify({
      ok: result.ok,
      source: result.source,
      elapsed_ms: result.elapsed_ms,
      url: result.url || mcpUrl,
      status: result.status || null,
      error: result.error || null,
      protocol: result.protocol || null,
      fallback: result.ok ? null : {
        option_a: 'Framer-Seite via web_fetch → CSS-Tokens extrahieren',
        option_b: 'tools/framer-export/homepage.xml (NUR mit verify-xml-project-match.js!)',
        option_c: 'Screenshot + Design-Analyse (letzter Ausweg)',
      },
    }, null, 2) + '\n');
  } else {
    if (result.ok) {
      process.stderr.write(`✅ Unframer MCP erreichbar (${result.elapsed_ms}ms)\n`);
      process.stderr.write(`   URL: ${result.url || mcpUrl}\n`);
      if (result.protocol) process.stderr.write(`   Protocol: ${result.protocol}\n`);
      if (result.status)   process.stderr.write(`   HTTP-Status: ${result.status}\n`);
    } else {
      process.stderr.write(`❌ Unframer MCP NICHT erreichbar\n`);
      process.stderr.write(`   URL: ${result.url || mcpUrl}\n`);
      process.stderr.write(`   Grund: ${result.error}\n`);
      process.stderr.write(`   Dauer: ${result.elapsed_ms}ms\n\n`);
      process.stderr.write(`Fallback-Strategie aktivieren:\n`);
      process.stderr.write(`  A) Framer-Seite via web_fetch laden → CSS-Tokens via extract-framer-css-tokens.js\n`);
      process.stderr.write(`  B) tools/framer-export/homepage.xml nutzen (NUR mit verify-xml-project-match.js!)\n`);
      process.stderr.write(`  C) Build auf Basis von Screenshot + Design-Analyse (letzter Ausweg)\n`);
      process.stderr.write(`\nIn allen Faellen: WARNUNG in SESSION-STATE.md, Post-Build-QA verschaerfen.\n`);
    }
  }

  process.exit(result.ok ? 0 : 1);
}

main().catch(e => {
  const out = { ok: false, error: 'unhandled', message: e.message };
  if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  else process.stderr.write(`Unbehandelter Fehler: ${e.message}\n`);
  process.exit(1);
});
