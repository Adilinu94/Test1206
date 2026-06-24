#!/usr/bin/env node
/**
 * mcp-cache.js — Phase 2.3: MCP Design-System Cache
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

export class McpDesignSystemCache {
  constructor(cachePath = '.pipeline/design-system.json', ttlSeconds = null) {
    this.path = cachePath;
    // Design-System-Cache: kurze TTL (5min default), da GV-IDs session-abhängig
    this.ttl = ttlSeconds ?? parseInt(process.env.PIPELINE_DESIGN_SYSTEM_CACHE_TTL || '300', 10);
  }

  /** Read cached data, returns null if expired/missing. */
  get() {
    if (!existsSync(this.path)) return null;
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8'));
      if (raw.expires && Date.now() > raw.expires) return null;
      return raw.data ?? raw;
    } catch { return null; }
  }

  /** Write data to cache with TTL. */
  set(data) {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify({
      data,
      expires: Date.now() + this.ttl * 1000,
      cached_at: new Date().toISOString(),
    }, null, 2), 'utf8');
  }

  /** Invalidate cache. */
  clear() { try { writeFileSync(this.path, '{}'); } catch {} }

  /** Fetch design system (with cache). */
  async getOrFetchDesignSystem(mcp) {
    const cached = this.get();
    if (cached) {
      process.stderr.write(`[mcp-cache] Design-System Cache-HIT (${Object.keys(cached).length} entries)\n`);
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
  async getOrDiscover(mcp) {
    process.stderr.write('[mcp-cache] WARN: getOrDiscover() ist deprecated, nutze getOrFetchDesignSystem()\n');
    return this.getOrFetchDesignSystem(mcp);
  }
}

/**
 * @deprecated Verwende McpDesignSystemCache — dieser Alias existiert
 * für Rückwärtskompatibilität.
 */
export const McpCache = McpDesignSystemCache;
