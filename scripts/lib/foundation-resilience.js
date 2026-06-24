/**
 * scripts/lib/foundation-resilience.js
 * UMBAUPLAN v2.0 Phase 3.2 — `setup-v4-foundation` Auto-Retry + Auto-Workaround.
 *
 * Symptom: Foundation wirft "Guards not found", bricht ab.
 * Workaround:
 *   1. Try novamira/setup-v4-foundation
 *   2. If Guards-error: log warning, generate local CSS instead of Global Classes
 *   3. Cache result: if Foundation failed, skip on next call (TTL: 1h)
 *
 * API:
 *   const setup = createFoundationResilience({ mcpBridge, cacheDir, siteId });
 *   const result = await setup.setupWithFallback({ post_id, designTokens, designClasses });
 *   // result.status = 'ok' | 'fallback' | 'skipped-cached' | 'failed'
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FOUNDATION_ERRORS = [
  'Guards not found',
  'Class Novamira',
  'Class.*not found',
  'guaranteeSession',
  'ensureSession',
];

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Detektiert einen Foundation-Failure anhand der MCP-Error-Message.
 *
 * @param {string} errorMessage
 * @returns {boolean} true wenn das ein bekannter Foundation-Fehler ist
 */
export function isFoundationError(errorMessage) {
  if (!errorMessage) return false;
  return FOUNDATION_ERRORS.some(p => new RegExp(p).test(errorMessage));
}

/**
 * Generiert lokales CSS aus Design-Tokens + Classes als Workaround.
 * Wird in wp-css-injector.js geschrieben.
 *
 * @param {object} designTokens - {colors: {name: {hex, gv_id}}, fonts: {name: {family, gv_id}}}
 * @param {object} designClasses - {className: {props, custom_css}}
 * @returns {string} Generated CSS
 */
export function generateLocalFoundationCss(designTokens = {}, designClasses = {}) {
  const lines = [':root {'];

  // Color tokens
  for (const [name, data] of Object.entries(designTokens.colors || {})) {
    if (data?.hex) {
      lines.push(`  --gv-${name}: ${data.hex};`);
    }
  }

  // Font tokens
  for (const [name, data] of Object.entries(designTokens.fonts || {})) {
    if (data?.family) {
      lines.push(`  --gv-font-${name}: ${data.family};`);
    }
  }

  lines.push('}');
  lines.push('');

  // Global classes
  for (const [className, classDef] of Object.entries(designClasses || {})) {
    const classLines = [];
    for (const [prop, value] of Object.entries(classDef.props || {})) {
      classLines.push(`  ${prop}: ${formatCssValue(value)};`);
    }
    if (classLines.length > 0) {
      lines.push(`.${className} {`);
      lines.push(...classLines);
      lines.push('}');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatCssValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (value['$$type'] === 'size') return `${value.value?.size ?? 0}${value.value?.unit ?? 'px'}`;
    if (value['$$type'] === 'string') return value.value ?? '';
    if (value['$$type'] === 'color') return value.value ?? '';
  }
  return String(value);
}

// ─────────────────────────────────────────────
// RESILIENCE FACTORY
// ─────────────────────────────────────────────

/**
 * Factory für Foundation-Resilience-Wrapper.
 *
 * @param {object} options
 * @param {object} options.mcpBridge - { call(ability_name, parameters) }
 * @param {string} options.siteId
 * @param {string} [options.cacheDir='.framer-export-cache']
 * @returns {object} resilience-API
 */
export function createFoundationResilience({ mcpBridge, siteId, cacheDir = '.framer-export-cache' }) {
  if (!mcpBridge) throw new Error('createFoundationResilience: mcpBridge required');
  if (!siteId) throw new Error('createFoundationResilience: siteId required');

  const cachePath = join(cacheDir, `foundation-fallback-${siteId}.json`);

  function readCache() {
    try {
      if (!existsSync(cachePath)) return null;
      const data = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (Date.now() - data.timestamp > CACHE_TTL_MS) return null;
      return data;
    } catch { return null; }
  }

  function writeCache(status, payload) {
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), status, payload }, null, 2), 'utf8');
    } catch { /* cache write failure is non-fatal */ }
  }

  /**
   * Versucht Foundation aufzusetzen. Bei Fehler: lokales CSS generieren.
   *
   * @param {object} opts
   * @param {number} opts.post_id
   * @param {object} [opts.designTokens]
   * @param {object} [opts.designClasses]
   * @returns {Promise<{status: string, foundation?: object, fallbackCss?: string, error?: string}>}
   */
  async function setupWithFallback({ post_id, designTokens = {}, designClasses = {} }) {
    if (!post_id) throw new Error('setupWithFallback: post_id required');

    // 1. Try real Foundation
    const result = await mcpBridge.call('setup-v4-foundation', { post_id, designTokens, designClasses })
      .catch(err => ({ error: err.message, code: err.code || 'UNKNOWN' }));

    if (result && !result.error) {
      writeCache('ok', { post_id });
      return { status: 'ok', foundation: result };
    }

    const errorMsg = String(result?.error || '');
    if (!isFoundationError(errorMsg)) {
      // Unknown error — rethrow-ish
      return { status: 'failed', error: errorMsg };
    }

    // 2. Known Foundation error → fallback
    const fallbackCss = generateLocalFoundationCss(designTokens, designClasses);
    writeCache('fallback', { post_id, css: fallbackCss, errorMsg });

    return {
      status: 'fallback',
      fallbackCss,
      foundationError: errorMsg,
    };
  }

  /**
   * Liefert den Cache-Status (für Tests/Debug).
   */
  function getCacheInfo() {
    const cache = readCache();
    if (!cache) return { cached: false };
    return {
      cached: true,
      status: cache.status,
      age_ms: Date.now() - cache.timestamp,
    };
  }

  /**
   * Manueller Cache-Reset.
   */
  function clearCache() {
    try { if (existsSync(cachePath)) writeFileSync(cachePath, '', 'utf8'); } catch { /* noop */ }
  }

  return {
    siteId,
    setupWithFallback,
    getCacheInfo,
    clearCache,
  };
}
