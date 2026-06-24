#!/usr/bin/env node
/**
 * scripts/lib/wp-theme.js  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 4.2 — Theme-Detection.
 *
 * Erkennt das aktive WordPress-Theme, Version, Custom-CSS-Unterstuetzung
 * und Template-Engine (block vs classic).
 *
 * Custom-CSS-Support-Map (manuell gepflegt, basierend auf WordPress-Theme-Doku):
 *   - Hello Elementor:          LIMITED (kein separates Custom-CSS-Feld, Elementor Custom-CSS via Page-Settings)
 *   - Astra / GeneratePress / OceanWP / Kadence:  FULL (Appearance > Customize > Additional CSS)
 *   - Blocksy / Neve:           FULL
 *   - Twenty* (WP-Default):     FULL
 *   - Andere:                   UNKNOWN (conservative: limited)
 *
 * Logik:
 *   - Hello Elementor -> Workaround-Layer 3.1 (wp-css-injector) bevorzugen
 *   - Astra/GP/etc    -> normaler Build mit Elementor Custom-CSS
 *   - Unknown          -> conservative: wp-css-injector als Fallback
 *
 * Self-Test:
 *   node scripts/lib/wp-theme.js --self-test
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const CACHE_DIR = '.framer-export-cache';
const CACHE_FILE = 'wp-theme-default.json';

// Themes mit voller Custom-CSS-Unterstuetzung
const THEMES_WITH_FULL_CUSTOM_CSS = new Set([
  'astra',
  'generatepress',
  'oceanwp',
  'kadence',
  'blocksy',
  'neve',
  'twentytwentyfour',
  'twentytwentythree',
  'twentytwentytwo',
  'twenty twenty-one',
  'twentytwentyone',
]);

// Themes mit eingeschraenkter Custom-CSS
const THEMES_WITH_LIMITED_CUSTOM_CSS = new Set([
  'hello-elementor',
  'hello elementor',
]);

export async function detectActiveTheme({ mcpBridge = null, siteId = 'default', cacheRoot = process.cwd() } = {}) {
  const cachePath = join(cacheRoot, CACHE_DIR, `wp-theme-${siteId}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return { ...cached, _cache: 'hit' };
  }

  let env;
  if (mcpBridge) {
    env = await detectViaMcp(mcpBridge);
  } else {
    env = {
      name: 'unknown',
      version: '0.0.0',
      slug: 'unknown',
      template_engine: 'classic',
      supports_custom_css: false,
      _source: 'fallback',
    };
  }

  // Classification
  env.classification = classifyTheme(env);
  env.recommended_css_strategy = recommendCssStrategy(env);

  writeCache(cachePath, env);
  return { ...env, _cache: 'miss' };
}

async function detectViaMcp(mcpBridge) {
  // Beste Loesung: execute-php mit wp_get_theme()
  try {
    const res = await mcpBridge.call('novamira/execute-php', {
      code: `
        $t = wp_get_theme();
        return [
          'name' => $t->get('Name'),
          'version' => $t->get('Version'),
          'slug' => $t->get_stylesheet(),
          'template' => $t->get_template(),
          'is_child' => $t->parent() !== false,
          'template_engine' => function_exists('wp_is_block_theme') && wp_is_block_theme() ? 'block' : 'classic',
        ];
      `,
    });
    const data = res?.return_value || res?.data || res;
    return {
      name: data.name || 'unknown',
      version: data.version || '0.0.0',
      slug: data.slug || 'unknown',
      template: data.template || '',
      is_child: !!data.is_child,
      template_engine: data.template_engine || 'classic',
      _source: 'mcp:execute-php+wp_get_theme',
    };
  } catch (err) {
    throw new Error(`detectActiveTheme: execute-php failed — ${err.message}`);
  }
}

function classifyTheme(env) {
  const normalized = (env.name || '').toLowerCase().trim();
  const slugNormalized = (env.slug || '').toLowerCase().trim();

  if (THEMES_WITH_FULL_CUSTOM_CSS.has(normalized) || THEMES_WITH_FULL_CUSTOM_CSS.has(slugNormalized)) {
    return {
      tier: 'full-css',
      risk: 'low',
      description: `Theme ${env.name} unterstuetzt volles Custom-CSS via Appearance > Customize`,
    };
  }
  if (THEMES_WITH_LIMITED_CUSTOM_CSS.has(normalized) || THEMES_WITH_LIMITED_CUSTOM_CSS.has(slugNormalized)) {
    return {
      tier: 'limited-css',
      risk: 'medium',
      description: `Theme ${env.name} hat eingeschraenktes Custom-CSS — Workaround-Layer empfohlen`,
    };
  }
  return {
    tier: 'unknown',
    risk: 'medium',
    description: `Theme ${env.name} ist nicht in der Liste — conservative Workaround-Strategie`,
  };
}

function recommendCssStrategy(env) {
  if (env.classification.tier === 'full-css') {
    return {
      primary: 'elementor-page-settings',
      fallback: 'wp-css-injector',
      reason: 'Elementor Custom-CSS via Page-Settings funktioniert zuverlaessig',
    };
  }
  if (env.classification.tier === 'limited-css') {
    return {
      primary: 'wp-css-injector',
      fallback: 'mu-plugin',
      reason: 'Hello Elementor speichert Custom-CSS nicht persistent — externe Injection notwendig',
    };
  }
  return {
    primary: 'wp-css-injector',
    fallback: 'mu-plugin',
    reason: 'Unbekanntes Theme — conservative: externe Injection',
  };
}

// ── Cache helpers ──────────────────────────────────────────────────────────

function readCache(path) {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (Date.now() - (raw._cached_at || 0) > CACHE_TTL_MS) return null;
    delete raw._cached_at;
    return raw;
  } catch {
    return null;
  }
}

function writeCache(path, env) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ ...env, _cached_at: Date.now() }, null, 2));
  } catch (err) {
    process.stderr.write(`[wp-theme] cache-write failed: ${err.message}\n`);
  }
}

export function clearThemeCache({ cacheRoot = process.cwd(), siteId = 'default' } = {}) {
  const path = join(cacheRoot, CACHE_DIR, `wp-theme-${siteId}.json`);
  if (existsSync(path)) {
    try {
      writeFileSync(path, '{}');
    } catch (err) {
      process.stderr.write(`[wp-theme] cache-clear failed: ${err.message}\n`);
    }
  }
}

// ── Self-Test ──────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    if (process.argv.includes('--self-test')) {
      const env = await detectActiveTheme({ mcpBridge: null });
      console.log(JSON.stringify(env, null, 2));
    } else {
      console.log('Usage: node scripts/lib/wp-theme.js --self-test');
      process.exit(1);
    }
  })();
}
