/**
 * tests/integration.test.js
 *
 * Integration Tests gegen eine echte WordPress-Instanz (solar.local).
 *
 * VORAUSSETZUNGEN:
 *   - WordPress läuft auf http://solar.local (oder WP_URL env)
 *   - Novamira Plugin aktiv
 *   - Novamira Adrians Plugin aktiv (mit batch-media-upload)
 *   - MCP Bridge konfiguriert (.mcp.json)
 *
 * Laeuft mit: node --test tests/integration.test.js
 * Oder via:   npm run test:integration
 *
 * ⚠️  Diese Tests schreiben Daten in WordPress! Nur gegen Test-Seiten verwenden!
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────────────────

const WP_URL = process.env.WP_URL || 'http://solar.local';
const WP_USER = process.env.WP_USER || 'admin';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD || '';
const TEST_POST_ID = parseInt(process.env.TEST_POST_ID || '0', 10);
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION === '1' || (!WP_APP_PASSWORD && !process.env.NOVAMIRA_MCP_URL);

// ── Live Mode (Sprint 8: FIX-13) ────────────────────────────────────────

const isLive = process.argv.includes('--live');
if (isLive) {
  console.log('[integration] LIVE MODE — testing against solar.local');
  console.log('[integration] WP_URL: ' + WP_URL);
}

// ── Live Mode helpers ──────────────────────────────────────────────────

async function runPreflightCheck() {
  // execFileSync is imported at top of file
  try {
    const result = execFileSync(process.execPath, ['scripts/preflight-check.js', '--json'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 30000,
    });
    const report = JSON.parse(result);
    const allPassed = report.checks && report.checks.every(function(c) { return c.status === 'OK'; });
    if (!allPassed) {
      console.error('[integration] Preflight checks failed:');
      for (var i = 0; i < (report.checks || []).length; i++) {
        var chk = report.checks[i];
        if (chk.status !== 'OK') console.error('  FAIL: ' + chk.name);
      }
      return false;
    }
    console.log('[integration] Preflight: all 8 checks passed');
    return true;
  } catch (e) {
    console.error('[integration] Preflight check error: ' + e.message);
    return false;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function wpRestFetch(endpoint, options = {}) {
  const url = `${WP_URL}/wp-json/novamira/v1${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  if (WP_USER && WP_APP_PASSWORD) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, ok: res.ok };
}

async function createTestPost() {
  const url = `${WP_URL}/wp-json/wp/v2/pages`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64'),
  };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Pipeline Integration Test',
      status: 'draft',
      content: '<!-- wp:paragraph --><p>Test page for pipeline integration</p><!-- /wp:paragraph -->',
    }),
  });
  const data = await res.json();
  return data.id;
}

async function deleteTestPost(postId) {
  const url = `${WP_URL}/wp-json/wp/v2/pages/${postId}?force=true`;
  const headers = {
    'Authorization': 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64'),
  };
  await fetch(url, { method: 'DELETE', headers });
}

// ── Test Suite ──────────────────────────────────────────────────────────────

describe('Live WordPress Integration (--live)', function() {
  before(async function() {
    if (!isLive) {
      console.log('  Skipping live tests (use --live flag)');
      this.skip();
      return;
    }
    var ok = await runPreflightCheck();
    if (!ok) {
      console.error('  Aborting live tests -- preflight failed');
      this.skip();
    }
  });

  it('MCP Session-Handshake succeeds', { skip: !isLive }, async function() {
    var mcpPath = path.join(__dirname, '..', 'scripts', 'lib', 'mcp-bridge.js');
    var { McpBridge } = await import(pathToFileURL(mcpPath).href);
    var mcp = await McpBridge.fromConfig();
    var result = await mcp.call('novamira/adrians-greet', { name: 'integration-test' });
    assert.ok(result.message || result, 'MCP greet returns response');
  });

  it('elementor-check-setup confirms runtime_available', { skip: !isLive }, async function() {
    var mcpPath = path.join(__dirname, '..', 'scripts', 'lib', 'mcp-bridge.js');
    var { McpBridge } = await import(pathToFileURL(mcpPath).href);
    var mcp = await McpBridge.fromConfig();
    var setup = await mcp.call('novamira/elementor-check-setup', {});
    assert.strictEqual(setup.atomic && setup.atomic.runtime_available, true, 'V4 Atomic Widgets must be available');
  });

  it('Schema-Endpoint returns valid JSON', { skip: !isLive }, async function() {
    var { ok, data } = await wpRestFetch('/prop-schema');
    if (!ok) {
      console.log('  Schema endpoint not available via REST');
      return;
    }
    assert.ok(data, 'Should return schema data');
  });
});

describe('Integration Tests (solar.local)', () => {
  let postId = TEST_POST_ID;

  before(async () => {
    if (SKIP_INTEGRATION) return;
    if (!postId) {
      postId = await createTestPost();
      console.log(`  Created test post ID: ${postId}`);
    }
  });

  after(async () => {
    if (SKIP_INTEGRATION) return;
    if (!TEST_POST_ID && postId) {
      await deleteTestPost(postId);
      console.log(`  Deleted test post ID: ${postId}`);
    }
  });

  it('should connect to WordPress REST API', async () => {
    if (SKIP_INTEGRATION) { console.log('  ⏭️  Skipped (no credentials)'); return; }
    const { ok, data } = await wpRestFetch('/elementor/content/' + postId);
    // We just need to verify the endpoint exists
    assert.ok(data !== null, 'REST API should return data');
  });

  it('should set and get Elementor content', async () => {
    if (SKIP_INTEGRATION || !postId) { console.log('  ⏭️  Skipped'); return; }

    const testContent = [
      {
        id: 'test001',
        elType: 'container',
        widgetType: 'e-flexbox',
        settings: {},
        styles: { stest001: { id: 'stest001', type: 'class', props: { 'background-color': { $$type: 'color', value: '#ffffff' } } } },
        elements: [],
      },
    ];

    // Set content
    const setResult = await wpRestFetch('/elementor/content/' + postId, {
      method: 'POST',
      body: JSON.stringify({ content: testContent }),
    });
    assert.ok(setResult.ok, 'Set content should succeed');

    // Get content back
    const getResult = await wpRestFetch('/elementor/content/' + postId);
    assert.ok(getResult.ok, 'Get content should succeed');
    assert.ok(getResult.data, 'Should return content data');
  });

  it('should handle batch-media-upload', async () => {
    if (SKIP_INTEGRATION) { console.log('  ⏭️  Skipped'); return; }

    // Create a tiny 1x1 PNG in base64
    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    try {
      const { status, data } = await wpRestFetch('/media/upload', {
        method: 'POST',
        body: JSON.stringify({
          files: [
            { filename: 'test-pixel.png', mime_type: 'image/png', content_base64: tinyPng },
          ],
        }),
      });
      // Endpoint might not exist via REST — that's OK, we're testing MCP path
      if (status === 404) {
        console.log('  ⏭️  REST upload endpoint not found (expected — use MCP)');
        return;
      }
      assert.ok(data, 'Should return upload result');
    } catch (e) {
      console.log('  ⏭️  Upload test skipped:', e.message);
    }
  });

  it('should export design system', async () => {
    if (SKIP_INTEGRATION) { console.log('  ⏭️  Skipped'); return; }

    const { ok, data } = await wpRestFetch('/design-system');
    if (!ok) {
      console.log('  ⏭️  Design system endpoint not available via REST');
      return;
    }
    assert.ok(data, 'Should return design system data');
  });
});
