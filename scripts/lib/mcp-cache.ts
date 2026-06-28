/**
 * scripts/lib/mcp-cache.ts — Phase 2.3: MCP Design-System Cache
 *
 * Cached das Ergebnis von adrians-export-design-system, um wiederholte
 * HTTP-Roundtrips zu vermeiden.
 *
 * Hinweis: Dies ist ein Design-System-Cache (GV-IDs, GC-IDs), NICHT
 * ein Discovery-Cache für Ability-Listen. TTL ist kurz (default 300s = 5min),
 * da GV-IDs session-abhängig sind.
 *
 * Usage:
 *   import { McpDesignSystemCache } from './lib/mcp-cache.js';
 *   const cache = new McpDesignSystemCache('.pipeline/design-system.json');
 *   const designSystem = await cache.getOrFetchDesignSystem(mcp);
 *
 * Legacy-Alias (rückwärtskompatibel):
 *   import { McpCache } from './lib/mcp-cache.js';  // deprecated
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { McpDesignSystemCacheData, McpCaller } from './types.js';

export class McpDesignSystemCache {
  path: string;
  ttl: number;

  constructor(cachePath: string = '.pipeline/design-system.json', ttlSeconds: number | null = null) {
    this.path = cachePath;
    // Design-System-Cache: kurze TTL (5min default), da GV-IDs session-abhängig
    this.ttl = ttlSeconds ?? parseInt(process.env.PIPELINE_DESIGN_SYSTEM_CACHE_TTL || '300', 10);
  }

  /** Read cached data, returns null if expired/missing. */
  get(): unknown | null {
    if (!existsSync(this.path)) return null;
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as McpDesignSystemCacheData;
      if (raw.expires && Date.now() > raw.expires) return null;
      return raw.data ?? raw;
    } catch { return null; }
  }

  /** Write data to cache with TTL. */
  set(data: unknown): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify({
      data,
      expires: Date.now() + this.ttl * 1000,
      cached_at: new Date().toISOString(),
    }, null, 2), 'utf8');
  }

  /** Invalidate cache. */
  clear(): void { try { writeFileSync(this.path, '{}'); } catch { /* noop */ } }

  /** Fetch design system (with cache). */
  async getOrFetchDesignSystem(mcp: McpCaller): Promise<unknown> {
    const cached = this.get();
    if (cached) {
      process.stderr.write(`[mcp-cache] Design-System Cache-HIT (${Object.keys(cached as object).length} entries)\n`);
      return cached;
    }
    process.stderr.write('[mcp-cache] Design-System Cache-MISS — fetching...\n');
    const designSystem = await mcp.call('novamira/adrians-export-design-system', { what: 'all' });
    this.set(designSystem);
    return designSystem;
  }

  /**
   * @deprecated Verwende getOrFetchDesignSystem() — dieser Alias existiert
   * für Rückwärtskompatibilität mit alten Call-Sites.
   */
  async getOrDiscover(mcp: McpCaller): Promise<unknown> {
    process.stderr.write('[mcp-cache] WARN: getOrDiscover() ist deprecated, nutze getOrFetchDesignSystem()\n');
    return this.getOrFetchDesignSystem(mcp);
  }
}

/**
 * @deprecated Verwende McpDesignSystemCache — dieser Alias existiert
 * für Rückwärtskompatibilität.
 */
export const McpCache = McpDesignSystemCache;
