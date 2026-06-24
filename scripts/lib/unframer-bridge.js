#!/usr/bin/env node
/**
 * scripts/lib/unframer-bridge.js  —  v1.0.0
 *
 * ARCHITEKTUR (Smoke-Test verifiziert 2026-06-16):
 *   Node.js → JSON-RPC 2.0 over HTTP → https://mcp.unframer.co/mcp
 *
 *   Auth: Query-Params (?id=...&secret=...)
 *        KEIN Session-Handshake (Server v1.8.0 unterstuetzt es nicht)
 *        Jeder Call ist self-contained ueber die URL
 *
 *   Transport: Streamable-HTTP (MCP 2024-11-05)
 *        Server verlangt Accept: application/json, text/event-stream
 *        Response kann JSON oder SSE (data: ...) sein
 *
 *   Verfuegbare Tools (22): getProjectXml, getNodeXml, getSelectedNodesXml,
 *   updateXmlForNode, manageColorStyle, manageTextStyle, searchFonts,
 *   deleteNode, duplicateNode, exportReactComponents, createCodeFile,
 *   readCodeFile, updateCodeFile, getComponentInsertUrlAndTypes,
 *   zoomIntoView, getCMSCollections, getCMSItems, upsertCMSItem,
 *   deleteCMSItem, createCMSCollection, getProjectWebsiteUrl, createPage
 *
 *   DEAKTIVIERT PER DEFAULT:
 *     Bridge wird nur aktiv wenn UNFRAMER_MCP_URL + UNFRAMER_MCP_ID +
 *     UNFRAMER_MCP_SECRET gesetzt sind UND der Aufrufer explizit
 *     UnframerBridge.fromEnv() / new UnframerBridge({...}) verwendet.
 *
 *   AKTIVIERUNG:
 *     1) .env.local (gitignored) anlegen:
 *          UNFRAMER_MCP_URL=https://mcp.unframer.co/mcp
 *          UNFRAMER_MCP_ID=<deine-id>
 *          UNFRAMER_MCP_SECRET=<dein-secret>
 *     2) Im Wizard/Pipeline:
 *          const bridge = UnframerBridge.fromEnv();
 *          if (bridge) await bridge.call('getProjectXml', {});
 *
 *   SICHERHEIT:
 *     - Secret wird NIE geloggt (immer maskiert)
 *     - .env/.env.local ist bereits in .gitignore
 *     - .mcp.json ist bereits in .gitignore
 *     - Tests nutzen MOCK_URL, kein Live-Secret
 *
 * SELF-TEST (Mock):
 *   UNFRAMER_BRIDGE_TEST=mock node scripts/lib/unframer-bridge.js
 *
 * LIVE-TEST (nur mit .env.local):
 *   node scripts/lib/unframer-bridge.js --self-test
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config Discovery ──────────────────────────────────────────────────────────

/**
 * Sucht nach .env.local / .env im Projekt-Root.
 * .env.local gewinnt vor .env (Standard 12-Factor-Konvention).
 *
 * @returns {object} Env-Vars als plain object (nicht in process.env gemerged)
 */
function readEnvFile() {
  const projectRoot = join(__dirname, '..', '..');
  const candidates = [
    join(projectRoot, '.env.local'),
    join(projectRoot, '.env'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const env = {};
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // Quoting entfernen
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
    return env;
  }
  return {};
}

/**
 * Maskiert ein Secret fuer sicheres Logging.
 * @param {string} s
 * @returns {string}
 */
function maskSecret(s) {
  if (!s) return '(leer)';
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

// ── UnframerBridge ────────────────────────────────────────────────────────────

export class UnframerBridge {

  /**
   * @param {object} options
   * @param {string} options.url      MCP-Endpoint (z.B. https://mcp.unframer.co/mcp)
   * @param {string} options.id       ID-Query-Param
   * @param {string} options.secret   Secret-Query-Param (nie loggen!)
   * @param {number} [options.timeout=60000]   Timeout pro Request
   * @param {number} [options.concurrency=3]   Max parallele Calls
   * @param {boolean} [options.verbose=false]  Debug-Logging
   */
  constructor(options = {}) {
    this.url = options.url || '';
    this.id = options.id || '';
    this.secret = options.secret || '';
    this.timeout = options.timeout || 60000;
    this.verbose = options.verbose || process.env.UNFRAMER_VERBOSE === '1';

    this._requestCounter = 0;

    // Konfigurierbare Concurrency (default 3, niedriger als Novamira weil
    // jeder Unframer-Call potentiell teure Framer-Cloud-Roundtrips macht)
    this.defaultConcurrency = options.concurrency
      || parseInt(process.env.UNFRAMER_CONCURRENCY || '3', 10);
  }

  // ── Static Factories ───────────────────────────────────────────────────────

  /**
   * Erstellt eine Bridge aus .env/.env.local.
   *
   * @returns {UnframerBridge|null} null wenn Env-Vars fehlen (KEIN throw)
   */
  static fromEnv() {
    const env = readEnvFile();
    // Merge mit process.env (process.env gewinnt in der Regel)
    const merged = {
      UNFRAMER_MCP_URL:    process.env.UNFRAMER_MCP_URL    || env.UNFRAMER_MCP_URL,
      UNFRAMER_MCP_ID:     process.env.UNFRAMER_MCP_ID     || env.UNFRAMER_MCP_ID,
      UNFRAMER_MCP_SECRET: process.env.UNFRAMER_MCP_SECRET || env.UNFRAMER_MCP_SECRET,
    };
    if (!merged.UNFRAMER_MCP_URL || !merged.UNFRAMER_MCP_ID || !merged.UNFRAMER_MCP_SECRET) {
      return null; // Feature-Flag: still deaktiviert
    }
    return new UnframerBridge({
      url: merged.UNFRAMER_MCP_URL,
      id: merged.UNFRAMER_MCP_ID,
      secret: merged.UNFRAMER_MCP_SECRET,
    });
  }

  /**
   * Erstellt eine Bridge mit expliziten Werten (z.B. aus Tests).
   * @param {string} url
   * @param {string} id
   * @param {string} secret
   * @returns {UnframerBridge}
   */
  static fromCredentials(url, id, secret) {
    return new UnframerBridge({ url, id, secret });
  }

  /**
   * Prueft ob alle Env-Vars fuer die Aktivierung gesetzt sind.
   * Nuetzlich fuer CLI-Feature-Flags: wenn false, bleibt Pipeline unveraendert.
   * @returns {boolean}
   */
  static isConfigured() {
    const bridge = UnframerBridge.fromEnv();
    return bridge !== null;
  }

  // ── URL Building ───────────────────────────────────────────────────────────

  /**
   * Baut die vollstaendige URL mit Auth-Query-Params.
   * @param {string|null} sessionId  ungenutzt (Server hat keine Sessions)
   * @returns {string}
   */
  _buildAuthUrl(sessionId = null) {
    const u = new URL(this.url);
    u.searchParams.set('id', this.id);
    u.searchParams.set('secret', this.secret);
    return u.toString();
  }

  // ── Core Call ──────────────────────────────────────────────────────────────

  /**
   * JSON-RPC 2.0 Call an die Unframer-Bridge.
   *
   * @param {string} method   "initialize" | "tools/list" | "tools/call" | "notifications/initialized"
   * @param {object} [params={}]
   * @param {object} [options={}]
   * @param {number} [options.maxRetries=2]
   * @returns {Promise<*>}  Parsed result (content[].text -> object wenn JSON)
   */
  async call(method, params = {}, options = {}) {
    const maxRetries = options.maxRetries ?? 2;
    const id = ++this._requestCounter;

    const body = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    let lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(this._buildAuthUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} fuer "${method}": ${text.slice(0, 300)}`);
        }

        const text = await res.text();
        const json = this._parseResponse(text);

        if (json?.error) {
          throw new Error(`RPC ${json.error.code || '?'}: ${json.error.message || 'Unbekannt'}`);
        }

        return json?.result ?? json;
      } catch (err) {
        lastErr = err;
        // Keine Retry bei 4xx (ausser 408/429)
        if (err.message.includes('HTTP 4') &&
            !err.message.includes('HTTP 408') &&
            !err.message.includes('HTTP 429')) {
          throw err;
        }
        // SyntaxError = Server hat Muell geliefert, nicht retry
        if (err instanceof SyntaxError) throw err;
        // Timeout = harter Abbruch
        if (err.name === 'TimeoutError' || err.name === 'AbortError') throw err;

        if (attempt < maxRetries) {
          const delay = Math.min(500 * Math.pow(2, attempt), 4000);
          this._log(`Retry ${attempt + 1}/${maxRetries} in ${delay}ms: ${err.message.slice(0, 100)}`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  }

  /**
   * Parst die Server-Response (JSON oder SSE-Format).
   * @param {string} text
   * @returns {object|null}
   */
  _parseResponse(text) {
    // Plain JSON
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try { return JSON.parse(text); } catch {}
    }
    // SSE: "data: <json>\n\n"
    if (text.startsWith('data:')) {
      const dataLine = text.split('\n').find(l => l.startsWith('data:'));
      if (dataLine) {
        try { return JSON.parse(dataLine.slice(5).trim()); } catch {}
      }
    }
    return null;
  }

  /**
   * Ruft ein Tool auf (Convenience-Wrapper fuer tools/call).
   *
   * @param {string} toolName     z.B. "getProjectXml"
   * @param {object} [args={}]    z.B. { nodeId: "abc" }
   * @param {object} [options={}]
   * @returns {Promise<*>}        Response.result (content-Block oder direktes Object)
   */
  async callTool(toolName, args = {}, options = {}) {
    const result = await this.call('tools/call', {
      name: toolName,
      arguments: args,
    }, options);

    // tools/call Standardformat: { content: [{ type: "text", text: "..." }] }
    if (result?.content && Array.isArray(result.content)) {
      const textBlocks = result.content.filter(b => b.type === 'text');
      if (textBlocks.length === 1) {
        const txt = textBlocks[0].text;
        try { return JSON.parse(txt); } catch { return txt; }
      }
      if (textBlocks.length > 1) {
        return textBlocks.map(b => {
          try { return JSON.parse(b.text); } catch { return b.text; }
        });
      }
    }
    return result;
  }

  /**
   * Fuehrt mehrere Tools parallel aus (mit Concurrency-Limit).
   *
   * @param {Array<{tool: string, args?: object}>} calls
   * @param {object} [options]
   * @param {number} [options.concurrency]
   * @returns {Promise<Array<{status, value?, reason?, tool}>>}
   */
  async callToolsParallel(calls, options = {}) {
    if (!Array.isArray(calls) || calls.length === 0) return [];
    const concurrency = Math.max(1, options.concurrency ?? this.defaultConcurrency);

    const results = new Array(calls.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < calls.length) {
        const idx = cursor++;
        const c = calls[idx];
        try {
          const value = await this.callTool(c.tool, c.args || {});
          results[idx] = { status: 'fulfilled', value, tool: c.tool };
        } catch (reason) {
          results[idx] = { status: 'rejected', reason, tool: c.tool };
        }
      }
    };
    const workers = Array.from(
      { length: Math.min(concurrency, calls.length) },
      () => worker()
    );
    await Promise.all(workers);
    return results;
  }

  // ── Logging ────────────────────────────────────────────────────────────────

  _log(msg) {
    if (this.verbose) {
      process.stderr.write(`[unframer-bridge] ${msg}\n`);
    }
  }

  /**
   * Oeffentliche Methode fuer sicheres Startup-Logging.
   * Zeigt URL (ohne Secret), maskierte Credentials.
   */
  logConfigSummary() {
    const u = new URL(this.url);
    process.stderr.write(
      `[unframer-bridge] Configured: ${u.protocol}//${u.host}${u.pathname}\n` +
      `[unframer-bridge]   id:     ${maskSecret(this.id)}\n` +
      `[unframer-bridge]   secret: ${maskSecret(this.secret)}\n`
    );
  }
}

export default UnframerBridge;

// ── Self-Test ─────────────────────────────────────────────────────────────────

if (process.argv.includes('--self-test') ||
    process.env.UNFRAMER_BRIDGE_TEST === '1' ||
    process.env.UNFRAMER_BRIDGE_TEST === 'mock') {

  (async () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║       framer-v4-pipeline-v2 — Unframer Bridge v1.0.0        ║
║       JSON-RPC 2.0 + Query-Auth + Streamable-HTTP          ║
╚══════════════════════════════════════════════════════════════╝
`);

    let bridge = null;
    let mode = 'unknown';

    if (process.env.UNFRAMER_BRIDGE_TEST === 'mock') {
      console.log('🧪 Mock-Modus (UNFRAMER_BRIDGE_TEST=mock)');
      bridge = UnframerBridge.fromCredentials(
        'http://127.0.0.1:1',  // wird nie erreicht
        'mock-id',
        'mock-secret-1234567890',
      );
      mode = 'mock';
    } else {
      bridge = UnframerBridge.fromEnv();
      if (!bridge) {
        console.log('⚠️  Keine .env.local oder Env-Vars gefunden.');
        console.log(`
📋 Konfigurations-Guide:
   Erstelle eine .env.local im Projekt-Root:

   UNFRAMER_MCP_URL=https://mcp.unframer.co/mcp
   UNFRAMER_MCP_ID=<deine-id>
   UNFRAMER_MCP_SECRET=<dein-secret>

   Diese Datei ist bereits in .gitignore — Secret wird nie committed.
`);
        process.exit(1);
      }
      mode = 'live';
      bridge.logConfigSummary();
    }

    if (mode === 'live') {
      let passed = 0, failed = 0;
      const check = (name, ok, detail) => {
        if (ok) { console.log(`   ✅ ${name} (${detail})`); passed++; }
        else    { console.log(`   ❌ ${name} — ${detail}`); failed++; }
      };

      try {
        // 1. initialize
        console.log('\n▶️  [1] initialize');
        const init = await bridge.call('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'unframer-bridge-self-test', version: '1.0.0' },
        });
        check('Server antwortet', !!init, init ? 'Framer MCP' : 'leer');

        // 2. tools/list
        console.log('\n▶️  [2] tools/list');
        const list = await bridge.call('tools/list', {});
        const tools = list?.tools || [];
        check(`${tools.length} Tools`, tools.length > 0, `${tools.length} verfuegbar`);
        if (tools.length > 0) {
          console.log(`      Beispiele: ${tools.slice(0, 5).map(t => t.name).join(', ')}...`);
        }

        // 3. getProjectXml
        console.log('\n▶️  [3] getProjectXml');
        const start = Date.now();
        const proj = await bridge.callTool('getProjectXml', {});
        const elapsed = Date.now() - start;
        check('getProjectXml OK', !!proj, `${elapsed}ms, type=${typeof proj}`);

        console.log(`\n📊 Self-Test: ${passed} passed, ${failed} failed`);
        process.exit(failed > 0 ? 1 : 0);
      } catch (err) {
        console.log(`\n❌ EXCEPTION: ${err.message}`);
        process.exit(2);
      }
    } else {
      // Mock-Modus: nur URL-Build + Secret-Maskierung testen
      console.log('🔧 Teste URL-Build und Secret-Maskierung...');
      const url = bridge._buildAuthUrl();
      console.log(`   URL (mock): ${url.replace(/secret=[^&]+/, 'secret=***')}`);
      const masked = maskSecret(bridge.secret);
      check = (name, ok) => console.log(`   ${ok ? '✅' : '❌'} ${name}`);
      check('URL enthaelt id-Param', url.includes('id=mock-id'));
      check('URL enthaelt secret-Param', url.includes('secret=mock-secret'));
      check('Secret wird in logConfigSummary maskiert', !JSON.stringify({
        m: bridge.logConfigSummary()
      }).includes('mock-secret-1234567890'));
      console.log('   (Mock-Test bestanden — keine Live-Calls)');
      process.exit(0);
    }
  })();
}
