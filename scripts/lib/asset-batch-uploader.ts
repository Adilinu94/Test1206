/**
 * scripts/lib/asset-batch-uploader.ts  —  v1.0.0
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { pLimit } from './mini-p-limit.js';

const __dirname = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const DEFAULT_TTL_MS = 60 * 60 * 1000;

export interface ImageMap {
  entries: Record<string, number>;
  _cached_at?: number;
}

export interface UploadResult {
  ok: boolean;
  attachment_id: number | null;
  error: string | null;
}

export interface BatchUploadResult {
  imageMap: Record<string, number>;
  durationMs: number;
  uploadCount: number;
  cached: boolean;
  errors?: Array<{ url: string; error: string }>;
}

export interface McpBridgeLike {
  call(ability: string, params: Record<string, unknown>): Promise<{ upload_url?: string; attachment_id: number }>;
}

function getMapPath({ cacheRoot = process.cwd(), siteId = 'default' }: { cacheRoot?: string; siteId?: string } = {}): string {
  return join(cacheRoot, '.framer-export-cache', `image-map-${siteId}.json`);
}

function readMap(filePath: string): ImageMap {
  if (!existsSync(filePath)) return { entries: {}, _cached_at: 0 };
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as ImageMap;
  } catch {
    return { entries: {}, _cached_at: 0 };
  }
}

function writeMap(filePath: string, map: ImageMap): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(map, null, 2), 'utf8');
}

async function uploadOne({ url, mcpBridge, siteId }: { url: string; mcpBridge: McpBridgeLike; siteId: string }): Promise<UploadResult> {
  try {
    const { upload_url, attachment_id } = await mcpBridge.call('create-upload-link', { url, site_id: siteId });
    return { ok: true, attachment_id, error: null };
  } catch (err: unknown) {
    return { ok: false, attachment_id: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function batchUploadImages({
  images = [],
  mcpBridge,
  siteId = 'default',
  concurrency = 5,
  imageMapPath = null,
  forceRefresh = false,
  options = {},
}: {
  images?: string[];
  mcpBridge: McpBridgeLike;
  siteId?: string;
  concurrency?: number;
  imageMapPath?: string | null;
  forceRefresh?: boolean;
  options?: { forceRefresh?: boolean };
}): Promise<BatchUploadResult> {
  if ((options as Record<string, unknown>).forceRefresh === true) forceRefresh = true;
  if (!mcpBridge) throw new Error('[asset-batch-uploader] mcpBridge required');
  if (!Array.isArray(images)) throw new Error('[asset-batch-uploader] images must be an array');

  const mapFile = imageMapPath || getMapPath({ siteId });
  let map = readMap(mapFile);

  const start = Date.now();
  const limit = pLimit(concurrency);
  const fresh = forceRefresh ? [...images] : images.filter((u) => !map.entries[u]);

  if (fresh.length === 0) {
    return {
      imageMap: { ...map.entries },
      durationMs: 0,
      uploadCount: 0,
      cached: true,
    };
  }

  const results = await Promise.allSettled(
    fresh.map((url) => limit(() => uploadOne({ url, mcpBridge, siteId }))),
  ) as PromiseSettledResult<UploadResult>[];

  let uploadCount = 0;
  const errors: Array<{ url: string; error: string }> = [];
  for (let i = 0; i < fresh.length; i++) {
    const url = fresh[i];
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.ok) {
      map.entries[url] = r.value.attachment_id!;
      uploadCount += 1;
    } else {
      const reason = r.status === 'fulfilled' ? r.value.error : (r.reason as Error)?.message || 'unknown';
      errors.push({ url, error: reason! });
    }
  }

  map._cached_at = Date.now();
  writeMap(mapFile, map);

  return {
    imageMap: { ...map.entries },
    durationMs: Date.now() - start,
    uploadCount,
    cached: false,
    errors,
  };
}

export function resolveImage(url: string, imageMap: Record<string, number> | null = {}): number | null {
  if (!imageMap || typeof imageMap !== 'object') return null;
  return imageMap[url] || null;
}

export function clearImageMap({ cacheRoot = process.cwd(), siteId = 'default' }: { cacheRoot?: string; siteId?: string } = {}): boolean {
  const mapFile = getMapPath({ cacheRoot, siteId });
  if (existsSync(mapFile)) {
    try {
      writeFileSync(mapFile, JSON.stringify({ entries: {}, _cached_at: 0 }, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  }
  return true;
}
