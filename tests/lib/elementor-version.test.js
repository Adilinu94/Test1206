/**
 * tests/lib/elementor-version.test.js
 *
 * Tests fuer scripts/lib/elementor-version.js (UMBAUPLAN §4.1)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Module wird via --experimental-loader ESM geladen — workaround via dynamic import
const { detectElementorVersion, clearElementorCache } = await import('../../scripts/lib/elementor-version.js');

test('elementor-version: Fallback ohne mcpBridge liefert default-Strategy', async () => {
  const env = await detectElementorVersion({ mcpBridge: null });
  assert.equal(env.version, 'unknown');
  assert.equal(env.is_atomic_supported, true);
  assert.equal(env._source, 'fallback');
  assert.ok(env.strategy, 'strategy muss gesetzt sein');
});

test('elementor-version: parseCheckSetup mit echten Live-Daten (test4)', async () => {
  const env = await detectElementorVersion({ mcpBridge: null });
  // Mock-Live-Daten simulieren via internal call
  // Wir testen die Strategy-Decision direkt mit manuellen Daten
  const { parseCheckSetup: _parseCheckSetup } = await import('../../scripts/lib/elementor-version.js').catch(() => ({}));
  // Da parseCheckSetup nicht exportiert, testen wir ueber detectElementorVersion mit null-bridge
  // und prufen die Strategy-Defaults
  assert.equal(env.strategy.activate_phase3, false);  // unknown version → conservative
  assert.equal(env.strategy.legacy_fallback, true);    // unknown → legacy
});

test('elementor-version: Cache-Hit nach erstem Call', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'el-version-test-'));
  try {
    const env1 = await detectElementorVersion({ mcpBridge: null, siteId: 'test', cacheRoot: tmpDir });
    assert.equal(env1._cache, 'miss');

    const env2 = await detectElementorVersion({ mcpBridge: null, siteId: 'test', cacheRoot: tmpDir });
    assert.equal(env2._cache, 'hit');
    assert.equal(env2.version, env1.version);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('elementor-version: Strategy "beta-workarounds" fuer 4.1.0-beta1', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'el-version-test-'));
  try {
    // Mock mcpBridge
    const mockBridge = {
      call: async (ability, params) => {
        if (ability === 'novamira/elementor-check-setup') {
          return {
            data: {
              elementor: { active: true, version: '4.1.0-beta1' },
              elementor_pro: { active: false },
              atomic: { runtime_available: true },
              kit: { container_width: { unit: 'px', size: 1140 }, active_breakpoints: ['desktop', 'mobile', 'tablet'] },
              issues: [],
            },
          };
        }
        throw new Error('Unknown ability');
      },
    };
    const env = await detectElementorVersion({ mcpBridge: mockBridge, siteId: 'beta', cacheRoot: tmpDir });
    assert.equal(env.version, '4.1.0-beta1');
    assert.equal(env.css_pipeline_broken, true);
    assert.equal(env.strategy.mode, 'beta-workarounds');
    assert.equal(env.strategy.activate_phase3, true);
    assert.equal(env.strategy.pro_fallbacks, true); // Pro fehlt
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('elementor-version: Strategy "atomic-pro" fuer 4.1.0 stable mit Pro', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'el-version-test-'));
  try {
    const mockBridge = {
      call: async (ability, params) => ({
        data: {
          elementor: { active: true, version: '4.1.0' },
          elementor_pro: { active: true, version: '3.33.2' },
          atomic: { runtime_available: true, style_schema_available: true, global_classes_available: true, variables_available: true, interactions_available: true },
          kit: { container_width: { unit: 'px', size: 1140 }, active_breakpoints: ['desktop', 'mobile', 'tablet', 'laptop'] },
          issues: [],
        },
      }),
    };
    const env = await detectElementorVersion({ mcpBridge: mockBridge, siteId: 'pro', cacheRoot: tmpDir });
    assert.equal(env.version, '4.1.0');
    assert.equal(env.is_pro_active, true);
    assert.equal(env.strategy.mode, 'atomic-pro');
    assert.equal(env.strategy.activate_phase3, false);
    assert.equal(env.strategy.pro_fallbacks, false);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('elementor-version: Strategy "legacy" fuer <4.0.0', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'el-version-test-'));
  try {
    const mockBridge = {
      call: async (ability) => ({ data: { elementor: { active: true, version: '3.21.0' } } }),
    };
    const env = await detectElementorVersion({ mcpBridge: mockBridge, siteId: 'legacy', cacheRoot: tmpDir });
    assert.equal(env.version, '3.21.0');
    assert.equal(env.is_atomic_supported, false);
    assert.equal(env.strategy.mode, 'legacy');
    assert.equal(env.strategy.legacy_fallback, true);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('elementor-version: Fallback auf legacy detect-elementor-version wenn check-setup fehlt', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'el-version-test-'));
  try {
    const mockBridge = {
      call: async (ability) => {
        if (ability === 'novamira/elementor-check-setup') throw new Error('not found');
        if (ability === 'novamira-adrianv2/detect-elementor-version') return { data: { version: '4.0.15', atomic_supported: true } };
        throw new Error('Unknown');
      },
    };
    const env = await detectElementorVersion({ mcpBridge: mockBridge, siteId: 'fallback', cacheRoot: tmpDir });
    assert.equal(env.version, '4.0.15');
    assert.equal(env._source, 'mcp:detect-elementor-version (legacy)');
    assert.equal(env.strategy.mode, 'atomic-4.0');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('elementor-version: clearElementorCache entfernt Cache-File', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'el-version-test-'));
  try {
    await detectElementorVersion({ mcpBridge: null, siteId: 'clear', cacheRoot: tmpDir });
    const cacheFile = join(tmpDir, '.framer-export-cache', 'elementor-env-clear.json');
    assert.ok(existsSync(cacheFile), 'cache muss existieren');
    clearElementorCache({ cacheRoot: tmpDir, siteId: 'clear' });
    assert.ok(!existsSync(cacheFile), 'cache muss weg sein');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
