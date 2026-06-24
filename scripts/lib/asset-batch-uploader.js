/**
 * scripts/lib/asset-batch-uploader.js  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 5.2 — Asset-Batch-Upload.
 * Sammelt alle Framer-Image-URLs und laedt sie parallel in die WP-Media-Library
 * (concurrency: 5 via p-limit). Vermeidet 1-by-1 Upload wie im E2E-Test (5 Min/Bild).
 *
 * API:
 *   batchUploadImages({ images, mcpBridge, siteId, concurrency=5, imageMapPath })
 *     returns Promise<{ imageMap: { url: id }, durationMs, uploadCount, cached: bool }>
 *
 * Map: image-map.json mit { framer_url: wp_attachment_id }.
 * Cache: .framer-export-cache/image-map-{siteId}.json (TTL 1h, gemerkt pro URL).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { pLimit } from './mini-p-limit.js';

const __dirname = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h

function getMapPath({ cacheRoot = process.cwd(), siteId = 'default' } = {}) {
  return join(cacheRoot, '.framer-export-cache', `image-map-${siteId}.json`);
}

function readMap(filePath) {
  if (!existsSync(filePath)) return { entries: {}, _cached_at: 0 };
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return { entries: {}, _cached_at: 0 };
  }
}

function writeMap(filePath, map) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(map, null, 2), 'utf8');
}

function isFresh(map, { ttlMs = DEFAULT_TTL_MS, now = Date.now() } = {}) {
  if (!map?._cached_at) return false;
  return now - map._cached_at < ttlMs;
}

/**
 * Uploadet ein einzelnes Asset via MCP. create-upload-link PUT flow.
 * Returns { ok, attachment_id, error }.
 */
async function uploadOne({ url, mcpBridge, siteId }) {
  try {
    const { upload_url, attachment_id } = await mcpBridge.call('create-upload-link', {
      url,
      site_id: siteId,
    });
    return { ok: true, attachment_id, error: null };
  } catch (err) {
    return { ok: false, attachment_id: null, error: err.message };
  }
}

/**
 * Batch-Upload. Bereits gemappte URLs werden uebersprungen.
 *
 * @param {object} args
 * @param {string[]} args.images   - Array of Framer-Image-URLs
 * @param {object} args.mcpBridge  - McpBridge-Instanz mit call(ability, params)
 * @param {string} [args.siteId]
 * @param {number} [args.concurrency=5]
 * @param {string} [args.imageMapPath]
 * @param {boolean} [args.forceRefresh=false]
 * @returns {Promise<{ imageMap: object, durationMs, uploadCount, cached: boolean }>}
 */
export async function batchUploadImages({
  images = [],
  mcpBridge,
  siteId = 'default',
  concurrency = 5,
  imageMapPath = null,
  forceRefresh = false,
  options = {},
} = {}) {
  if (options.forceRefresh === true) forceRefresh = true;
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
  );

  let uploadCount = 0;
  const errors = [];
  for (let i = 0; i < fresh.length; i++) {
    const url = fresh[i];
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.ok) {
      map.entries[url] = r.value.attachment_id;
      uploadCount += 1;
    } else {
      const reason = r.status === 'fulfilled' ? r.value.error : r.reason?.message || 'unknown';
      errors.push({ url, error: reason });
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

/**
 * Convenience: Map-Framer-URL auf WP-Attachment-ID. Returnt null wenn nicht gemappt.
 */
export function resolveImage(url, imageMap = {}) {
  if (!imageMap || typeof imageMap !== 'object') return null;
  return imageMap[url] || null;
}

/**
 * Invalidates den Image-Map-Cache.
 */
export function clearImageMap({ cacheRoot = process.cwd(), siteId = 'default' } = {}) {
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
