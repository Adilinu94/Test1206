/**
 * scripts/lib/framer-cache.js  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 5.1 — Framer-Source-Cache.
 * Spart 6+ MCP-Calls pro Re-Run (FramerSource + ColorStyles + TextStyles + Components).
 *
 * Cache-Layout: .framer-export-cache/framer-source/{projectId}/
 *   - getProjectXml-{ISO-timestamp}.json   (TTL 24h, jeweils volle Antwort)
 *   - nodeXml-{nodeId}-{ISO-timestamp}.json
 *   - colorStyles.json                     (TTL 24h, letzte Quelle)
 *   - textStyles.json                      (TTL 24h, letzte Quelle)
 *
 * Invalidation: mtimeCheck() — wenn export-Dir neuer als Cache → invalidate.
 * Frontend: mcp__framer__getProjectXml und getNodeXml werden via cachedGetXxx gewrappt.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function getCacheDir({ cacheRoot = process.cwd(), projectId = 'default' } = {}) {
  return join(cacheRoot, '.framer-export-cache', 'framer-source', projectId);
}

function isoTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listCacheFiles(dir, prefix) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .map((name) => join(dir, name))
    .sort();
}

function newestCacheFile(dir, prefix) {
  const files = listCacheFiles(dir, prefix);
  if (files.length === 0) return null;
  return files[files.length - 1];
}

function isFresh(cacheFile, { ttlMs = DEFAULT_TTL_MS, exportDir = null } = {}) {
  if (!cacheFile || !existsSync(cacheFile)) return false;
  const cacheMtime = statSync(cacheFile).mtimeMs;
  if (Date.now() - cacheMtime > ttlMs) return false;
  if (exportDir && existsSync(exportDir)) {
    const exportMtime = statSync(exportDir).mtimeMs;
    if (exportMtime > cacheMtime) return false;
  }
  return true;
}

/**
 * Cached wrapper for mcp__framer__getProjectXml.
 * If cache hit → returns parsed JSON; if miss → caller fetches via fetcher and we write cache.
 *
 * @param {object} args
 * @param {string} args.projectId
 * @param {Function} args.fetcher  async () => xmlJson
 * @param {object} [args.options]  { cacheRoot, ttlMs, exportDir, forceRefresh }
 * @returns {Promise<{ xml: object, cached: boolean, cacheFile: string }>}
 */
export async function cachedGetProjectXml({
  projectId = 'default',
  fetcher,
  options = {},
}) {
  if (typeof fetcher !== 'function') {
    throw new Error('[framer-cache] cachedGetProjectXml: fetcher is required');
  }
  const cacheDir = getCacheDir({ cacheRoot: options.cacheRoot, projectId });
  mkdirSync(cacheDir, { recursive: true });

  const cacheFile = newestCacheFile(cacheDir, 'getProjectXml-');
  if (!options.forceRefresh && isFresh(cacheFile, { ttlMs: options.ttlMs, exportDir: options.exportDir })) {
    const xml = readJsonSafe(cacheFile);
    if (xml) {
      return { xml, cached: true, cacheFile };
    }
  }

  const xml = await fetcher();
  const stamp = isoTimestamp();
  const outFile = join(cacheDir, `getProjectXml-${stamp}.json`);
  writeFileSync(outFile, JSON.stringify(xml, null, 2), 'utf8');

  if (cacheFile && cacheFile !== outFile) {
    try { unlinkSync(cacheFile); } catch { /* old-cache cleanup, non-critical */ }
  }
  return { xml, cached: false, cacheFile: outFile };
}

/**
 * Cached wrapper for mcp__framer__getNodeXml(nodeId).
 * Per-NodeId separate cache file.
 */
export async function cachedGetNodeXml({
  projectId = 'default',
  nodeId,
  fetcher,
  options = {},
}) {
  if (!nodeId) throw new Error('[framer-cache] cachedGetNodeXml: nodeId required');
  if (typeof fetcher !== 'function') {
    throw new Error('[framer-cache] cachedGetNodeXml: fetcher is required');
  }
  const cacheDir = getCacheDir({ cacheRoot: options.cacheRoot, projectId });
  mkdirSync(cacheDir, { recursive: true });

  const prefix = `nodeXml-${nodeId}-`;
  const cacheFile = newestCacheFile(cacheDir, prefix);
  if (!options.forceRefresh && isFresh(cacheFile, { ttlMs: options.ttlMs, exportDir: options.exportDir })) {
    const xml = readJsonSafe(cacheFile);
    if (xml) return { xml, cached: true, cacheFile };
  }

  const xml = await fetcher();
  const stamp = isoTimestamp();
  const outFile = join(cacheDir, `${prefix}${stamp}.json`);
  writeFileSync(outFile, JSON.stringify(xml, null, 2), 'utf8');
  if (cacheFile && cacheFile !== outFile) {
    try { unlinkSync(cacheFile); } catch { /* cleanup */ }
  }
  return { xml, cached: false, cacheFile: outFile };
}

/**
 * Cached wrapper for FramerExport color/text styles.
 * Separate single-file cache (not timestamped) — these are smaller and overwrite frequently.
 */
export async function cachedGetColorStyles({
  projectId = 'default',
  fetcher,
  options = {},
}) {
  const cacheDir = getCacheDir({ cacheRoot: options.cacheRoot, projectId });
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, 'colorStyles.json');

  if (!options.forceRefresh && isFresh(file, { ttlMs: options.ttlMs, exportDir: options.exportDir })) {
    const json = readJsonSafe(file);
    if (json) return { styles: json, cached: true, cacheFile: file };
  }
  const styles = await fetcher();
  writeFileSync(file, JSON.stringify(styles, null, 2), 'utf8');
  return { styles, cached: false, cacheFile: file };
}

export async function cachedGetTextStyles({
  projectId = 'default',
  fetcher,
  options = {},
}) {
  const cacheDir = getCacheDir({ cacheRoot: options.cacheRoot, projectId });
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, 'textStyles.json');

  if (!options.forceRefresh && isFresh(file, { ttlMs: options.ttlMs, exportDir: options.exportDir })) {
    const json = readJsonSafe(file);
    if (json) return { styles: json, cached: true, cacheFile: file };
  }
  const styles = await fetcher();
  writeFileSync(file, JSON.stringify(styles, null, 2), 'utf8');
  return { styles, cached: false, cacheFile: file };
}

/**
 * Invalidate all caches for a project (or all projects).
 */
export function clearFramerCache({ cacheRoot = process.cwd(), projectId = null } = {}) {
  const baseDir = join(cacheRoot, '.framer-export-cache', 'framer-source');
  if (!existsSync(baseDir)) return { removed: 0 };
  if (projectId) {
    const target = join(baseDir, projectId);
    if (existsSync(target)) {
      try { rmSync(target, { recursive: true, force: true }); } catch { /* noop */ }
      return { removed: 1 };
    }
    return { removed: 0 };
  }
  try { rmSync(baseDir, { recursive: true, force: true }); } catch { /* noop */ }
  return { removed: -1 };
}

/**
 * Returns cache stats (size in bytes, file count, hit/miss counters per type).
 * Useful for build-quality-gate reports.
 */
export function getFramerCacheStats({ cacheRoot = process.cwd(), projectId = null } = {}) {
  const baseDir = join(cacheRoot, '.framer-export-cache', 'framer-source');
  if (!existsSync(baseDir)) {
    return { exists: false, total_files: 0, total_bytes: 0, per_project: {} };
  }
  const projectDirs = projectId
    ? [projectId].filter((p) => existsSync(join(baseDir, p)))
    : readdirSync(baseDir).filter((d) => statSync(join(baseDir, d)).isDirectory());
  const perProject = {};
  let totalFiles = 0;
  let totalBytes = 0;
  for (const proj of projectDirs) {
    const dir = join(baseDir, proj);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    let bytes = 0;
    for (const f of files) {
      try { bytes += statSync(join(dir, f)).size; } catch { /* noop */ }
    }
    perProject[proj] = { files: files.length, bytes };
    totalFiles += files.length;
    totalBytes += bytes;
  }
  return { exists: true, total_files: totalFiles, total_bytes: totalBytes, per_project: perProject };
}
