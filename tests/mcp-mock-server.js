#!/usr/bin/env node
/**
 * mcp-mock-server.js — Plan 1.4: Lokaler Mock des novamira-solar-local MCP-Servers.
 * Simuliert 109 Abilities für CI-Tests ohne Live-WP.
 *
 * Usage:
 *   node tests/mcp-mock-server.js --port=7890
 *   # Dann: WP_API_URL=http://localhost:7890 npm test
 */

import { createServer } from 'node:http';

const port = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '7890', 10);

// Simulierte Ability-Responses
const MOCK_ABILITIES = {
  'novamira/adrians-greet': { greeting: 'Hello from Mock MCP', version: 'mock-0.7.0' },
  'novamira/elementor-check-setup': { elementor: { version: '4.1.1' }, atomic: { runtime_available: true, global_classes_available: true, variables_available: true } },
  'novamira/adrians-setup-v4-foundation': { classes: {}, variables: {}, session_id: 'mock-session' },
  'novamira/adrians-export-design-system': { colors: {}, fonts: {}, classes: {} },
  'novamira/adrians-layout-audit': { issues: [], passed: true },
  'novamira/adrians-visual-qa': { issues: [], total_issues: 0 },
  'novamira/adrians-responsive-audit': { coverage: { desktop: 100, tablet: 100, mobile: 100 } },
  'novamira/adrians-variable-audit': { drift: [], unused: [] },
  'novamira/elementor-get-content': { content: { elements: [] } },
  'novamira/elementor-set-content': { success: true },
  'novamira/adrians-batch-media-upload': { results: [] },
  'novamira/adrians-add-global-class-variant': { success: true },
  'novamira/adrians-apply-variable-to-class': { success: true },
  'novamira/execute-php': { output: '', success: true },
  'novamira/adrians-html-to-elementor-widget-plan': { success: true, native_widget_ratio: 0.85, tree: [], stats: { total_elements: 42 } },
};

let sessionId = null;
let requestCounter = 0;

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try { var rpc = JSON.parse(body || '{}'); } catch { rpc = {}; }

    // initialize → Session-Handshake
    if (rpc.method === 'initialize') {
      sessionId = 'mock-session-' + Date.now();
      res.setHeader('Mcp-Session-Id', sessionId);
      res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2024-11-05', capabilities: {} } }));
      return;
    }

    // tools/call
    if (rpc.method === 'tools/call' && rpc.params?.arguments) {
      const { ability_name, parameters } = rpc.params.arguments;
      const mock = MOCK_ABILITIES[ability_name];

      const result = mock || { error: `Mock: Ability "${ability_name}" not found` };
      res.end(JSON.stringify({
        jsonrpc: '2.0', id: rpc.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

server.listen(port, () => process.stderr.write(`[mock-mcp] Mock MCP Server auf http://localhost:${port}\n`));
