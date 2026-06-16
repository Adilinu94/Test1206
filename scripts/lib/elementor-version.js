#!/usr/bin/env node
/**
 * scripts/lib/elementor-version.js  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 4.1 — Elementor-Version-Detection.
 *
 * Erkennt die installierte Elementor-Version, Atomic-Runtime-Verfuegbarkeit,
 * Pro-Status, Container-Width, aktive Breakpoints, CSS-Pipeline-Bugs
 * und entscheidet dann, welche Build-Strategie die Pipeline waehlen soll.
 *
 * Input:  mcpBridge (McpBridge instance, optional — ohne Bridge = Fallback auf ENV)
 * Output: ElementorEnv object
 *
 * Wird einmal pro Pipeline-Run gecacht (TTL: Session = 1 Build-Run).
 * Cache-File: .framer-export-cache/elementor-env-{site_id}.json
 *
 * Strategies:
 *   - 4.1.0-beta1 + atomic_widgets_initialized=false  → Phase-3-Workarounds aktivieren
 *   - 4.1.0+ ohne Pro                                 → Pro-Features als e-* generisch bauen
 *   - <4.0.0                                            → Legacy-Tools (add-heading, add-container)
 *
 * Self-Test:
 *   node scripts/lib/elementor-version.js --self-test
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const CACHE_DIR = '.framer-export-cache';
const CACHE_FILE_PREFIX = 'elementor-env';

/**
 * Detect active Elementor installation via mcpBridge.
 *
 * @param {Object} opts
 * @param {Object} opts.mcpBridge - McpBridge instance (optional)
 * @param {string} [opts.siteId] - e.g. 'solar-local' (used in cache filename)
 * @param {string} [opts.cacheRoot] - absolute path to cache dir (default: process.cwd())
 * @returns {Promise<ElementorEnv>}
 */
export async function detectElementorVersion({ mcpBridge = null, siteId = 'default', cacheRoot = process.cwd() } = {}) {
  const cachePath = getCachePath(cacheRoot, siteId);

  // Cache-Hit?
  const cached = readCache(cachePath);
  if (cached) {
    return { ...cached, _cache: 'hit' };
  }

  // Echte Detection via MCP
  let env;
  if (mcpBridge) {
    env = await detectViaMcp(mcpBridge);
  } else {
    // Fallback: minimale Default-Annahme (4.0+ Atomic), Conservative
    env = {
      version: 'unknown',
      is_atomic_supported: true,
      is_pro_active: false,
      container_width: { unit: 'px', size: 1140 },
      breakpoints: ['desktop', 'mobile', 'tablet', 'laptop'],
      css_pipeline_broken: true, // conservative: assume beta
      atomic_widgets_initialized: true,
      _source: 'fallback',
    };
  }

  // Strategy-Decision
  env.strategy = decideStrategy(env);

  writeCache(cachePath, env);
  return { ...env, _cache: 'miss' };
}

/**
 * Detect via mcp-adapter-execute-ability (newest API: novamira/elementor-check-setup).
 * Falls back to novamira-adrianv2/detect-elementor-version for legacy sites.
 */
async function detectViaMcp(mcpBridge) {
  // Prefer 1.7.0+ check-setup
  try {
    const res = await mcpBridge.call('novamira/elementor-check-setup', {});
    const data = res?.data || res;
    return parseCheckSetup(data);
  } catch (err) {
    // Fallback: legacy detect-elementor-version
    try {
      const res = await mcpBridge.call('novamira-adrianv2/detect-elementor-version', {});
      const data = res?.data || res;
      return parseLegacyVersion(data);
    } catch (err2) {
      throw new Error(`detectElementorVersion: beide MCP-Calls fehlgeschlagen — ${err.message} | ${err2.message}`);
    }
  }
}

function parseCheckSetup(data) {
  const el = data?.elementor || {};
  const pro = data?.elementor_pro || {};
  const atomic = data?.atomic || {};
  const kit = data?.kit || {};

  const version = el.version || 'unknown';
  const majorMinor = parseMajorMinor(version);
  const isAtomic = majorMinor[0] >= 4 && majorMinor[1] >= 0;

  // Heuristik: 4.1.0-beta1 hat den 0-byte CSS-File Bug (siehe E2E-Test 2026-06-15)
  const cssPipelineBroken = isBeta4_1(version);

  return {
    version,
    is_atomic_supported: !!atomic.runtime_available && isAtomic,
    is_pro_active: !!pro.active,
    pro_version: pro.version || '',
    container_width: kit.container_width || { unit: 'px', size: 1140 },
    breakpoints: kit.active_breakpoints || ['desktop', 'mobile', 'tablet', 'laptop'],
    css_pipeline_broken: cssPipelineBroken,
    atomic_widgets_initialized: !!atomic.runtime_available,
    style_schema_available: !!atomic.style_schema_available,
    global_classes_available: !!atomic.global_classes_available,
    variables_available: !!atomic.variables_available,
    interactions_available: !!atomic.interactions_available,
    issues: data.issues || [],
    _source: 'mcp:elementor-check-setup',
  };
}

function parseLegacyVersion(data) {
  const version = data?.version || data?.elementor_version || 'unknown';
  const isAtomic = !!data?.atomic_supported;
  return {
    version,
    is_atomic_supported: isAtomic,
    is_pro_active: false,
    pro_version: '',
    container_width: { unit: 'px', size: 1140 },
    breakpoints: ['desktop', 'mobile', 'tablet', 'laptop'],
    css_pipeline_broken: isBeta4_1(version),
    atomic_widgets_initialized: isAtomic,
    style_schema_available: isAtomic,
    global_classes_available: isAtomic,
    variables_available: isAtomic,
    interactions_available: isAtomic,
    issues: [],
    _source: 'mcp:detect-elementor-version (legacy)',
  };
}

function decideStrategy(env) {
  // 4.1.0-beta1 + atomic runtime = beta workarounds ON
  if (isBeta4_1(env.version) && env.atomic_widgets_initialized) {
    return {
      mode: 'beta-workarounds',
      activate_phase3: true,
      pro_fallbacks: !env.is_pro_active,
      legacy_fallback: false,
      reason: `Elementor ${env.version} (beta) — Phase-3-Workarounds aktiv, ${env.is_pro_active ? 'Pro vorhanden' : 'Pro fehlt → Generic-Fallbacks'}`,
    };
  }
  // 4.1.0+ stable, no Pro
  if (parseMajorMinor(env.version)[0] >= 4 && parseMajorMinor(env.version)[1] >= 1) {
    if (!env.is_pro_active) {
      return {
        mode: 'atomic-generic',
        activate_phase3: false,
        pro_fallbacks: true,
        legacy_fallback: false,
        reason: `Elementor ${env.version} (stable) ohne Pro — Generic-Fallbacks fuer Pro-Widgets`,
      };
    }
    return {
      mode: 'atomic-pro',
      activate_phase3: false,
      pro_fallbacks: false,
      legacy_fallback: false,
      reason: `Elementor ${env.version} (stable) + Pro aktiv — volle Feature-Nutzung`,
    };
  }
  // 4.0.x — Atomic only, no Pro expected
  if (parseMajorMinor(env.version)[0] >= 4) {
    return {
      mode: 'atomic-4.0',
      activate_phase3: false,
      pro_fallbacks: !env.is_pro_active,
      legacy_fallback: false,
      reason: `Elementor ${env.version} (4.0.x) — Atomic-Builds`,
    };
  }
  // <4.0.0 — legacy
  return {
    mode: 'legacy',
    activate_phase3: false,
    pro_fallbacks: !env.is_pro_active,
    legacy_fallback: true,
    reason: `Elementor ${env.version} (<4.0) — Legacy-Tools nutzen`,
  };
}

function parseMajorMinor(version) {
  const m = (version || '').match(/^(\d+)\.(\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

function isBeta4_1(version) {
  return /^4\.1\.0-(beta|rc|alpha)/i.test(version || '');
}

// ── Cache helpers ──────────────────────────────────────────────────────────

function getCachePath(root, siteId) {
  return join(root, CACHE_DIR, `${CACHE_FILE_PREFIX}-${siteId}.json`);
}

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
    // Cache-Write-Fehler sind non-fatal
    process.stderr.write(`[elementor-version] cache-write failed: ${err.message}\n`);
  }
}

/**
 * Invalidiert den Elementor-Env-Cache (z.B. nach Elementor-Update).
 */
export function clearElementorCache({ cacheRoot = process.cwd(), siteId = 'default' } = {}) {
  const path = getCachePath(cacheRoot, siteId);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch (err) {
      process.stderr.write(`[elementor-version] cache-clear failed: ${err.message}\n`);
    }
  }
}

// ── Self-Test ──────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    if (process.argv.includes('--self-test')) {
      // Mock-Modus: keine echte MCP-Verbindung
      const env = await detectElementorVersion({ mcpBridge: null });
      console.log(JSON.stringify(env, null, 2));
    } else {
      console.log('Usage: node scripts/lib/elementor-version.js --self-test');
      process.exit(1);
    }
  })();
}
