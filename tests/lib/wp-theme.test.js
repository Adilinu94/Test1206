/**
 * tests/lib/wp-theme.test.js
 *
 * Tests fuer scripts/lib/wp-theme.js (UMBAUPLAN §4.2)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { detectActiveTheme, clearThemeCache } = await import('../../scripts/lib/wp-theme.js');

test('wp-theme: Fallback ohne mcpBridge liefert unknown-Theme', async () => {
  const env = await detectActiveTheme({ mcpBridge: null });
  assert.equal(env.name, 'unknown');
  assert.equal(env._source, 'fallback');
  assert.equal(env.classification.tier, 'unknown');
  assert.equal(env.recommended_css_strategy.primary, 'wp-css-injector');
});

test('wp-theme: Hello Elementor → limited-css + wp-css-injector', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'wp-theme-test-'));
  try {
    const mockBridge = {
      call: async (ability) => ({
        return_value: { name: 'Hello Elementor', version: '3.4.0', slug: 'hello-elementor', template_engine: 'classic' },
      }),
    };
    const env = await detectActiveTheme({ mcpBridge: mockBridge, siteId: 'hello', cacheRoot: tmpDir });
    assert.equal(env.name, 'Hello Elementor');
    assert.equal(env.classification.tier, 'limited-css');
    assert.equal(env.classification.risk, 'medium');
    assert.equal(env.recommended_css_strategy.primary, 'wp-css-injector');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('wp-theme: Astra → full-css + elementor-page-settings', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'wp-theme-test-'));
  try {
    const mockBridge = {
      call: async (ability) => ({
        return_value: { name: 'Astra', version: '4.6.0', slug: 'astra', template_engine: 'classic' },
      }),
    };
    const env = await detectActiveTheme({ mcpBridge: mockBridge, siteId: 'astra', cacheRoot: tmpDir });
    assert.equal(env.classification.tier, 'full-css');
    assert.equal(env.classification.risk, 'low');
    assert.equal(env.recommended_css_strategy.primary, 'elementor-page-settings');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('wp-theme: GeneratePress → full-css', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'wp-theme-test-'));
  try {
    const mockBridge = {
      call: async (ability) => ({
        return_value: { name: 'GeneratePress', version: '3.4.0', slug: 'generatepress', template_engine: 'classic' },
      }),
    };
    const env = await detectActiveTheme({ mcpBridge: mockBridge, siteId: 'gp', cacheRoot: tmpDir });
    assert.equal(env.classification.tier, 'full-css');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('wp-theme: Twenty Twenty-Four → full-css (block theme)', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'wp-theme-test-'));
  try {
    const mockBridge = {
      call: async (ability) => ({
        return_value: { name: 'Twenty Twenty-Four', version: '1.0', slug: 'twentytwentyfour', template_engine: 'block' },
      }),
    };
    const env = await detectActiveTheme({ mcpBridge: mockBridge, siteId: 'tt4', cacheRoot: tmpDir });
    assert.equal(env.classification.tier, 'full-css');
    assert.equal(env.template_engine, 'block');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('wp-theme: Unbekanntes Theme → unknown + conservative', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'wp-theme-test-'));
  try {
    const mockBridge = {
      call: async (ability) => ({
        return_value: { name: 'Custom Random Theme', version: '1.0.0', slug: 'custom-random', template_engine: 'classic' },
      }),
    };
    const env = await detectActiveTheme({ mcpBridge: mockBridge, siteId: 'custom', cacheRoot: tmpDir });
    assert.equal(env.classification.tier, 'unknown');
    assert.equal(env.classification.risk, 'medium');
    assert.equal(env.recommended_css_strategy.primary, 'wp-css-injector');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('wp-theme: Cache-Hit nach erstem Call', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'wp-theme-test-'));
  try {
    const env1 = await detectActiveTheme({ mcpBridge: null, siteId: 'cache', cacheRoot: tmpDir });
    assert.equal(env1._cache, 'miss');
    const env2 = await detectActiveTheme({ mcpBridge: null, siteId: 'cache', cacheRoot: tmpDir });
    assert.equal(env2._cache, 'hit');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
