/**
 * scripts/lib/framer-cache.ts  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 5.1 — Framer-Source-Cache.
 * Spart 6+ MCP-Calls pro Re-Run (FramerSource + ColorStyles + TextStyles + Components).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface CacheOptions {
  cacheRoot?: string;
  projectId?: string;
  ttlMs?: number;
  exportDir?: string | null;
  forceRefresh?: boolean;
}

export interface CacheResult<T = unknown> {
  xml?: T;
  styles?: T;
  cached: boolean;
  cacheFile: string;
}

function getCacheDir({ cacheRoot = process.cwd(), projectId = 'default' }: Partial<CacheOptions> = {}): string {
  return join(cacheRoot, '.framer-export-cache', 'framer-source', projectId);
}

function isoTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function readJsonSafe(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listCacheFiles(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .map((name) => join(dir, name))
    .sort();
}

function newestCacheFile(dir: string, prefix: string): string | null {
  const files = listCacheFiles(dir, prefix);
  if (files.length === 0) return null;
  return files[files.length - 1];
}

function isFresh(cacheFile: string | null, { ttlMs = DEFAULT_TTL_MS, exportDir = null }: { ttlMs?: number; exportDir?: string | null } = {}): boolean {
  if (!cacheFile || !existsSync(cacheFile)) return false;
  const cacheMtime = statSync(cacheFile).mtimeMs;
  if (Date.now() - cacheMtime > ttlMs) return false;
  if (exportDir && existsSync(exportDir)) {
    const exportMtime = statSync(exportDir).mtimeMs;
    if (exportMtime > cacheMtime) return false;
  }
  return true;
}

export async function cachedGetProjectXml<T = unknown>({
  projectId = 'default',
  fetcher,
  options = {},
}: {
  projectId?: string;
  fetcher: () => Promise<T>;
  options?: CacheOptions;
}): Promise<CacheResult<T>> {
  if (typeof fetcher !== 'function') {
    throw new Error('[framer-cache] cachedGetProjectXml: fetcher is required');
  }
  const cacheDir = getCacheDir({ cacheRoot: options.cacheRoot, projectId });
  mkdirSync(cacheDir, { recursive: true });

  const cacheFile = newestCacheFile(cacheDir, 'getProjectXml-');
  if (!options.forceRefresh && isFresh(cacheFile, { ttlMs: options.ttlMs, exportDir: options.exportDir })) {
    const xml = readJsonSafe(cacheFile!) as T;
    if (xml) {
      return { xml, cached: true, cacheFile: cacheFile! };
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

export async function cachedGetNodeXml<T = unknown>({
  projectId = 'default',
  nodeId,
  fetcher,
  options = {},
}: {
  projectId?: string;
  nodeId: string;
  fetcher: () => Promise<T>;
  options?: CacheOptions;
}): Promise<CacheResult<T>> {
  if (!nodeId) throw new Error('[framer-cache] cachedGetNodeXml: nodeId required');
  if (typeof fetcher !== 'function') {
    throw new Error('[framer-cache] cachedGetNodeXml: fetcher is required');
  }
  const cacheDir = getCacheDir({ cacheRoot: options.cacheRoot, projectId });
  mkdirSync(cacheDir, { recursive: true });

  const prefix = `nodeXml-${nodeId}-`;
  const cacheFile = newestCacheFile(cacheDir, prefix);
  if (!options.forceRefresh && isFresh(cacheFile, { ttlMs: options.ttlMs, exportDir: options.exportDir })) {
    const xml = readJsonSafe(cacheFile!) as T;
    if (xml) return { xml, cached: true, cacheFile: cacheFile! };
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

export async function cachedGetColorStyles<T = unknown>({
  projectId = 'default',
  fetcher,
  options = {},
}: {
  projectId?: string;
  fetcher: () => Promise<T>;
  options?: CacheOptions;
}): Promise<CacheResult<T>> {
  const cacheDir = getCacheDir({ cacheRoot: options.cacheRoot, projectId });
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, 'colorStyles.json');

  if (!options.forceRefresh && isFresh(file, { ttlMs: options.ttlMs, exportDir: options.exportDir })) {
    const json = readJsonSafe(file) as T;
    if (json) return { styles: json, cached: true, cacheFile: file };
  }
  const styles = await fetcher();
  writeFileSync(file, JSON.stringify(styles, null, 2), 'utf8');
  return { styles, cached: false, cacheFile: file };
}

export async function cachedGetTextStyles<T = unknown>({
  projectId = 'default',
  fetcher,
  options = {},
}: {
  projectId?: string;
  fetcher: () => Promise<T>;
  options?: CacheOptions;
}): Promise<CacheResult<T>> {
  const cacheDir = getCacheDir({ cacheRoot: options.cacheRoot, projectId });
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, 'textStyles.json');

  if (!options.forceRefresh && isFresh(file, { ttlMs: options.ttlMs, exportDir: options.exportDir })) {
    const json = readJsonSafe(file) as T;
    if (json) return { styles: json, cached: true, cacheFile: file };
  }
  const styles = await fetcher();
  writeFileSync(file, JSON.stringify(styles, null, 2), 'utf8');
  return { styles, cached: false, cacheFile: file };
}

export function clearFramerCache({ cacheRoot = process.cwd(), projectId = null }: { cacheRoot?: string; projectId?: string | null } = {}): { removed: number } {
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

export function getFramerCacheStats({ cacheRoot = process.cwd(), projectId = null }: { cacheRoot?: string; projectId?: string | null } = {}): Record<string, unknown> {
  const baseDir = join(cacheRoot, '.framer-export-cache', 'framer-source');
  if (!existsSync(baseDir)) {
    return { exists: false, total_files: 0, total_bytes: 0, per_project: {} };
  }
  const projectDirs = projectId
    ? [projectId].filter((p) => existsSync(join(baseDir, p)))
    : readdirSync(baseDir).filter((d) => statSync(join(baseDir, d)).isDirectory());
  const perProject: Record<string, { files: number; bytes: number }> = {};
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
