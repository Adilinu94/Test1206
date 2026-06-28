/**
 * scripts/lib/pipeline-waves.ts  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 5.3 — Pipeline-Wave-Parallelisierung.
 */

import { pLimit } from './mini-p-limit.js';

const DEFAULT_CONCURRENCY = 5;

export interface WaveOperation {
  name: string;
  run: () => Promise<unknown>;
}

export interface WaveResult {
  name: string;
  status: 'ok' | 'error';
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface WaveOutput {
  results: WaveResult[];
  durationMs: number;
  failedAt?: string;
}

export interface Log {
  success?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
}

async function runWave(operations: WaveOperation[], { concurrency = DEFAULT_CONCURRENCY, log = null }: { concurrency?: number; log?: Log | null } = {}): Promise<WaveOutput> {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { results: [], durationMs: 0 };
  }
  const limit = pLimit(concurrency);
  const start = Date.now();
  const promises = operations.map((op) =>
    limit(async (): Promise<WaveResult> => {
      const opStart = Date.now();
      try {
        const result = await op.run();
        const opDuration = Date.now() - opStart;
        if (log?.success) log.success(`[wave] ${op.name} ok (${opDuration}ms)`);
        return { name: op.name, status: 'ok', result, durationMs: opDuration };
      } catch (err: unknown) {
        const opDuration = Date.now() - opStart;
        const msg = err instanceof Error ? err.message : String(err);
        if (log?.warn) log.warn(`[wave] ${op.name} failed: ${msg} (${opDuration}ms)`);
        return { name: op.name, status: 'error', error: msg, durationMs: opDuration };
      }
    }),
  );
  const results = await Promise.all(promises) as WaveResult[];
  return { results, durationMs: Date.now() - start };
}

export async function runWave1FramerSource({
  framerUrl,
  projectId = 'default',
  fetcher = null,
  options = {} as Record<string, unknown>,
  log = null as Log | null,
}: {
  framerUrl: string;
  projectId?: string;
  fetcher?: ((ability: string, params: Record<string, unknown>) => Promise<unknown>) | null;
  options?: Record<string, unknown>;
  log?: Log | null;
}): Promise<WaveOutput> {
  const { cachedGetProjectXml, cachedGetNodeXml, cachedGetColorStyles, cachedGetTextStyles } =
    await import('./framer-cache.js');

  const realFetcher = fetcher || ((ability: string, params: Record<string, unknown>) => {
    throw new Error(`[wave1] no real fetcher provided for ${ability}`);
  });

  const ops: WaveOperation[] = [
    {
      name: 'getProjectXml',
      run: () => cachedGetProjectXml({
        projectId,
        fetcher: () => realFetcher('getProjectXml', { framerUrl }),
        options: options as { cacheRoot?: string; ttlMs?: number; exportDir?: string | null; forceRefresh?: boolean },
      }),
    },
    {
      name: 'colorStyles',
      run: () => cachedGetColorStyles({
        projectId,
        fetcher: () => realFetcher('getColorStyles', { framerUrl }),
        options: options as { cacheRoot?: string; ttlMs?: number; exportDir?: string | null; forceRefresh?: boolean },
      }),
    },
    {
      name: 'textStyles',
      run: () => cachedGetTextStyles({
        projectId,
        fetcher: () => realFetcher('getTextStyles', { framerUrl }),
        options: options as { cacheRoot?: string; ttlMs?: number; exportDir?: string | null; forceRefresh?: boolean },
      }),
    },
  ];
  return runWave(ops, { concurrency: (options.concurrency as number) || DEFAULT_CONCURRENCY, log });
}

export async function runWave2AssetProcessing({
  images = [],
  exportHtml,
  mcpBridge = null,
  siteId = 'default',
  options = {} as Record<string, unknown>,
  log = null as Log | null,
}: {
  images?: string[];
  exportHtml?: string;
  mcpBridge?: { call: (ability: string, params: Record<string, unknown>) => Promise<unknown> } | null;
  siteId?: string;
  options?: Record<string, unknown>;
  log?: Log | null;
}): Promise<WaveOutput> {
  const { batchUploadImages } = await import('./asset-batch-uploader.js');

  const ops: WaveOperation[] = [];
  if (images.length > 0 && mcpBridge) {
    ops.push({
      name: 'image-upload',
      run: () => batchUploadImages({ images, mcpBridge: mcpBridge as { call(ability: string, params: Record<string, unknown>): Promise<{ upload_url?: string; attachment_id: number }> }, siteId, concurrency: (options.concurrency as number) || 5 }),
    });
  }
  if (exportHtml) {
    ops.push({
      name: 'font-resolution',
      run: async () => {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const pExec = promisify(execFile);
        const out = pathJoinTokens((options.assetsDir as string) || './assets', 'font-resolution.json');
        await pExec(process.execPath, [
          'scripts/resolve-fonts.js',
          '--html', exportHtml,
          '--fonts-dir', pathJoinTokens((options.assetsDir as string) || './assets', 'fonts'),
          '--output', out,
        ]);
        return { output: out };
      },
    });
    ops.push({
      name: 'token-mapping',
      run: async () => {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const pExec = promisify(execFile);
        const out = pathJoinTokens((options.tokensDir as string) || './tokens', 'token-mapping.json');
        await pExec(process.execPath, [
          'scripts/extract-framer-css-tokens.js',
          '--html', exportHtml,
          '--output', out,
        ]);
        return { output: out };
      },
    });
  }
  return runWave(ops, { concurrency: (options.concurrency as number) || DEFAULT_CONCURRENCY, log });
}

export async function runWave3Build({ runConvert, runValidate, runFixStyles, log = null }: {
  runConvert: () => Promise<unknown>;
  runValidate: () => Promise<unknown>;
  runFixStyles: () => Promise<unknown>;
  log?: Log | null;
}): Promise<WaveOutput> {
  const start = Date.now();
  const results: WaveResult[] = [];
  for (const op of [
    { name: 'convert-xml-to-v4' as const, run: runConvert },
    { name: 'validate-v4-tree' as const, run: runValidate },
    { name: 'fix-styles' as const, run: runFixStyles },
  ]) {
    if (typeof op.run !== 'function') continue;
    const opStart = Date.now();
    try {
      const result = await op.run();
      results.push({ name: op.name, status: 'ok', result, durationMs: Date.now() - opStart });
      if (log?.success) log.success(`[wave3] ${op.name} ok (${Date.now() - opStart}ms)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: op.name, status: 'error', error: msg, durationMs: Date.now() - opStart });
      if (log?.error) log.error(`[wave3] ${op.name} failed: ${msg}`);
      return { results, durationMs: Date.now() - start, failedAt: op.name };
    }
  }
  return { results, durationMs: Date.now() - start };
}

export async function runWave4DeployQa({
  postId,
  mcpBridge = null,
  v4TreePath = null,
  runBuild = null,
  runVisualQa = null,
  runLayoutAudit = null,
  runA11yFallback = null,
  runSeoFallback = null,
  options = {} as Record<string, unknown>,
  log = null as Log | null,
}: {
  postId: number;
  mcpBridge?: { call: (ability: string, params: Record<string, unknown>) => Promise<unknown> } | null;
  v4TreePath?: string | null;
  runBuild?: (() => Promise<unknown>) | null;
  runVisualQa?: (() => Promise<unknown>) | null;
  runLayoutAudit?: (() => Promise<unknown>) | null;
  runA11yFallback?: (() => Promise<unknown>) | null;
  runSeoFallback?: (() => Promise<unknown>) | null;
  options?: Record<string, unknown>;
  log?: Log | null;
}): Promise<WaveOutput> {
  const ops: WaveOperation[] = [];
  if (runBuild) ops.push({ name: 'build-page', run: runBuild });
  if (runVisualQa) ops.push({ name: 'visual-qa', run: runVisualQa });
  if (runLayoutAudit) ops.push({ name: 'layout-audit', run: runLayoutAudit });
  if (runA11yFallback) ops.push({ name: 'a11y-fallback', run: runA11yFallback });
  if (runSeoFallback) ops.push({ name: 'seo-fallback', run: runSeoFallback });
  return runWave(ops, { concurrency: (options.concurrency as number) || DEFAULT_CONCURRENCY, log });
}

function pathJoinTokens(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}
