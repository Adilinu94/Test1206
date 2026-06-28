/**
 * scripts/lib/foundation-resilience.ts
 * UMBAUPLAN v2.0 Phase 3.2 — `setup-v4-foundation` Auto-Retry + Auto-Workaround.
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

const CACHE_TTL_MS = 60 * 60 * 1000;

export interface DesignTokens {
  colors?: Record<string, { hex?: string; gv_id?: string }>;
  fonts?: Record<string, { family?: string; gv_id?: string }>;
}

export interface DesignClasses {
  [className: string]: { props?: Record<string, unknown>; custom_css?: string | null };
}

export interface McpBridgeLike {
  call(ability: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface FoundationResult {
  status: string;
  foundation?: Record<string, unknown>;
  fallbackCss?: string;
  foundationError?: string;
  error?: string;
}

export interface FoundationCacheInfo {
  cached: boolean;
  status?: string;
  age_ms?: number;
}

export interface FoundationResilience {
  siteId: string;
  setupWithFallback: (opts: { post_id: number; designTokens?: DesignTokens; designClasses?: DesignClasses }) => Promise<FoundationResult>;
  getCacheInfo: () => FoundationCacheInfo;
  clearCache: () => void;
}

export function isFoundationError(errorMessage: string): boolean {
  if (!errorMessage) return false;
  return FOUNDATION_ERRORS.some(p => new RegExp(p).test(errorMessage));
}

export function generateLocalFoundationCss(designTokens: DesignTokens = {}, designClasses: DesignClasses = {}): string {
  const lines: string[] = [':root {'];

  for (const [name, data] of Object.entries(designTokens.colors || {})) {
    if (data?.hex) {
      lines.push(`  --gv-${name}: ${data.hex};`);
    }
  }

  for (const [name, data] of Object.entries(designTokens.fonts || {})) {
    if (data?.family) {
      lines.push(`  --gv-font-${name}: ${data.family};`);
    }
  }

  lines.push('}');
  lines.push('');

  for (const [className, classDef] of Object.entries(designClasses || {})) {
    const classLines: string[] = [];
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

function formatCssValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (v['$$type'] === 'size') return `${(v.value as Record<string, number>)?.size ?? 0}${(v.value as Record<string, string>)?.unit ?? 'px'}`;
    if (v['$$type'] === 'string') return (v.value as string) ?? '';
    if (v['$$type'] === 'color') return (v.value as string) ?? '';
  }
  return String(value);
}

export function createFoundationResilience({ mcpBridge, siteId, cacheDir = '.framer-export-cache' }: {
  mcpBridge: McpBridgeLike;
  siteId: string;
  cacheDir?: string;
}): FoundationResilience {
  if (!mcpBridge) throw new Error('createFoundationResilience: mcpBridge required');
  if (!siteId) throw new Error('createFoundationResilience: siteId required');

  const cachePath = join(cacheDir, `foundation-fallback-${siteId}.json`);

  function readCache(): { timestamp: number; status: string; payload: Record<string, unknown> } | null {
    try {
      if (!existsSync(cachePath)) return null;
      const data = JSON.parse(readFileSync(cachePath, 'utf8')) as { timestamp: number; status: string; payload: Record<string, unknown> };
      if (Date.now() - data.timestamp > CACHE_TTL_MS) return null;
      return data;
    } catch { return null; }
  }

  function writeCache(status: string, payload: Record<string, unknown>): void {
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), status, payload }, null, 2), 'utf8');
    } catch { /* cache write failure is non-fatal */ }
  }

  async function setupWithFallback({ post_id, designTokens = {}, designClasses = {} }: {
    post_id: number;
    designTokens?: DesignTokens;
    designClasses?: DesignClasses;
  }): Promise<FoundationResult> {
    if (!post_id) throw new Error('setupWithFallback: post_id required');

    const result = await mcpBridge.call('setup-v4-foundation', { post_id, designTokens, designClasses })
      .catch((err: Error) => ({ error: err.message, code: (err as unknown as Record<string, string>).code || 'UNKNOWN' }));

    if (result && !result.error) {
      writeCache('ok', { post_id });
      return { status: 'ok', foundation: result };
    }

    const errorMsg = String(result?.error || '');
    if (!isFoundationError(errorMsg)) {
      return { status: 'failed', error: errorMsg };
    }

    const fallbackCss = generateLocalFoundationCss(designTokens, designClasses);
    writeCache('fallback', { post_id, css: fallbackCss, errorMsg });

    return { status: 'fallback', fallbackCss, foundationError: errorMsg };
  }

  function getCacheInfo(): FoundationCacheInfo {
    const cache = readCache();
    if (!cache) return { cached: false };
    return { cached: true, status: cache.status, age_ms: Date.now() - cache.timestamp };
  }

  function clearCache(): void {
    try { if (existsSync(cachePath)) writeFileSync(cachePath, '', 'utf8'); } catch { /* noop */ }
  }

  return { siteId, setupWithFallback, getCacheInfo, clearCache };
}
