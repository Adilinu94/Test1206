/**
 * scripts/lib/elementor-version.ts  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 4.1 — Elementor-Version-Detection.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_DIR = '.framer-export-cache';
const CACHE_FILE_PREFIX = 'elementor-env';

export interface ElementorVersionResult {
  version: string;
  is_atomic_supported: boolean;
  is_pro_active: boolean;
  pro_version?: string;
  container_width: { unit: string; size: number };
  breakpoints: string[];
  css_pipeline_broken: boolean;
  atomic_widgets_initialized: boolean;
  style_schema_available?: boolean;
  global_classes_available?: boolean;
  variables_available?: boolean;
  interactions_available?: boolean;
  issues?: string[];
  strategy?: Record<string, unknown>;
  _source?: string;
  _cache?: string;
}

interface McpBridgeLike {
  call(ability: string, params: Record<string, unknown>): Promise<unknown>;
}

export async function detectElementorVersion({ mcpBridge = null, siteId = 'default', cacheRoot = process.cwd() }: {
  mcpBridge?: McpBridgeLike | null;
  siteId?: string;
  cacheRoot?: string;
} = {}): Promise<ElementorVersionResult> {
  const cachePath = getCachePath(cacheRoot, siteId);

  const cached = readCache(cachePath);
  if (cached) {
    return { ...cached, _cache: 'hit' };
  }

  let env;
  if (mcpBridge) {
    env = await detectViaMcp(mcpBridge);
  } else {
    env = {
      version: 'unknown',
      is_atomic_supported: true,
      is_pro_active: false,
      container_width: { unit: 'px', size: 1140 },
      breakpoints: ['desktop', 'mobile', 'tablet', 'laptop'],
      css_pipeline_broken: true,
      atomic_widgets_initialized: true,
      _source: 'fallback',
    };
  }

  env.strategy = decideStrategy(env);

  writeCache(cachePath, env);
  return { ...env, _cache: 'miss' };
}

async function detectViaMcp(mcpBridge: McpBridgeLike): Promise<ElementorVersionResult> {
  try {
    const res = await mcpBridge.call('novamira/elementor-check-setup', {}) as { data?: Record<string, unknown> };
    const data = (res?.data || res) as Record<string, unknown>;
    return parseCheckSetup(data);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    try {
      const res = await mcpBridge.call('novamira-adrianv2/detect-elementor-version', {}) as { data?: Record<string, unknown> };
      const data = (res?.data || res) as Record<string, unknown>;
      return parseLegacyVersion(data);
    } catch (err2: unknown) {
      const errMsg2 = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(`detectElementorVersion: beide MCP-Calls fehlgeschlagen — ${errMsg} | ${errMsg2}`);
    }
  }
}

function parseCheckSetup(data: Record<string, unknown>): ElementorVersionResult {
  const el = (data?.elementor as Record<string, unknown>) || {};
  const pro = (data?.elementor_pro as Record<string, unknown>) || {};
  const atomic = (data?.atomic as Record<string, unknown>) || {};
  const kit = (data?.kit as Record<string, unknown>) || {};

  const version = (el.version as string) || 'unknown';
  const majorMinor = parseMajorMinor(version);
  const isAtomic = majorMinor[0] >= 4 && majorMinor[1] >= 0;
  const cssPipelineBroken = isBeta4_1(version);

  return {
    version,
    is_atomic_supported: !!(atomic.runtime_available as boolean) && isAtomic,
    is_pro_active: !!(pro.active as boolean),
    pro_version: (pro.version as string) || '',
    container_width: (kit.container_width as { unit: string; size: number }) || { unit: 'px', size: 1140 },
    breakpoints: (kit.active_breakpoints as string[]) || ['desktop', 'mobile', 'tablet', 'laptop'],
    css_pipeline_broken: cssPipelineBroken,
    atomic_widgets_initialized: !!(atomic.runtime_available as boolean),
    style_schema_available: !!(atomic.style_schema_available as boolean),
    global_classes_available: !!(atomic.global_classes_available as boolean),
    variables_available: !!(atomic.variables_available as boolean),
    interactions_available: !!(atomic.interactions_available as boolean),
    issues: (data.issues as string[]) || [],
    _source: 'mcp:elementor-check-setup',
  };
}

function parseLegacyVersion(data: Record<string, unknown>): ElementorVersionResult {
  const version = (data?.version || data?.elementor_version || 'unknown') as string;
  const isAtomic = !!(data?.atomic_supported as boolean);
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

function decideStrategy(env: ElementorVersionResult): Record<string, unknown> {
  if (isBeta4_1(env.version) && env.atomic_widgets_initialized) {
    return {
      mode: 'beta-workarounds',
      activate_phase3: true,
      pro_fallbacks: !env.is_pro_active,
      legacy_fallback: false,
      reason: `Elementor ${env.version} (beta) — Phase-3-Workarounds aktiv, ${env.is_pro_active ? 'Pro vorhanden' : 'Pro fehlt → Generic-Fallbacks'}`,
    };
  }
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
  if (parseMajorMinor(env.version)[0] >= 4) {
    return {
      mode: 'atomic-4.0',
      activate_phase3: false,
      pro_fallbacks: !env.is_pro_active,
      legacy_fallback: false,
      reason: `Elementor ${env.version} (4.0.x) — Atomic-Builds`,
    };
  }
  return {
    mode: 'legacy',
    activate_phase3: false,
    pro_fallbacks: !env.is_pro_active,
    legacy_fallback: true,
    reason: `Elementor ${env.version} (<4.0) — Legacy-Tools nutzen`,
  };
}

function parseMajorMinor(version: string): [number, number] {
  const m = (version || '').match(/^(\d+)\.(\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

function isBeta4_1(version: string): boolean {
  return /^4\.1\.0-(beta|rc|alpha)/i.test(version || '');
}

function getCachePath(root: string, siteId: string): string {
  return join(root, CACHE_DIR, `${CACHE_FILE_PREFIX}-${siteId}.json`);
}

function readCache(path: string): ElementorVersionResult | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as ElementorVersionResult & { _cached_at?: number };
    if (Date.now() - (raw._cached_at || 0) > CACHE_TTL_MS) return null;
    delete raw._cached_at;
    return raw;
  } catch {
    return null;
  }
}

function writeCache(path: string, env: ElementorVersionResult): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ ...env, _cached_at: Date.now() }, null, 2));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[elementor-version] cache-write failed: ${msg}\n`);
  }
}

export function clearElementorCache({ cacheRoot = process.cwd(), siteId = 'default' }: {
  cacheRoot?: string;
  siteId?: string;
} = {}): void {
  const path = getCachePath(cacheRoot, siteId);
  if (existsSync(path)) {
    try { unlinkSync(path); } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[elementor-version] cache-clear failed: ${msg}\n`);
    }
  }
}
