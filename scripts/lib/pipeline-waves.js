/**
 * scripts/lib/pipeline-waves.js  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 5.3 — Pipeline-Wave-Parallelisierung.
 * Refactor 14 sequenzieller Schritte → 4 Waves.
 *
 * Wave 1: FramerSource (parallel: getProjectXml, colorStyles, textStyles, components, getNodeXml)
 * Wave 2: Asset-Processing (parallel: image-upload, font-resolution, token-mapping)
 * Wave 3: Build-Construction (sequenziell: convert-xml-to-v4, validate, fix-styles)
 * Wave 4: Deploy + QA (parallel: build-page, visual-qa, layout-audit, a11y-fallback, seo-fallback)
 *
 * API:
 *   runPipelineWaves({ framerUrl, postId, options, log, ... })
 *     returns Promise<{ status, waveResults: { wave1, wave2, wave3, wave4 }, durationMs }>
 *
 * Jede Wave-Operation ist eine async-Funktion { name, run: async () => result }.
 * Nutzt p-limit(5) innerhalb Wave 1+2+4.
 */

import { pLimit } from './mini-p-limit.js';

const DEFAULT_CONCURRENCY = 5;

async function runWave(operations, { concurrency = DEFAULT_CONCURRENCY, log = null } = {}) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return [];
  }
  const limit = pLimit(concurrency);
  const start = Date.now();
  const promises = operations.map((op) =>
    limit(async () => {
      const opStart = Date.now();
      try {
        const result = await op.run();
        const opDuration = Date.now() - opStart;
        if (log?.success) log.success(`[wave] ${op.name} ok (${opDuration}ms)`);
        return { name: op.name, status: 'ok', result, durationMs: opDuration };
      } catch (err) {
        const opDuration = Date.now() - opStart;
        if (log?.warn) log.warn(`[wave] ${op.name} failed: ${err.message} (${opDuration}ms)`);
        return { name: op.name, status: 'error', error: err.message, durationMs: opDuration };
      }
    }),
  );
  const results = await Promise.all(promises);
  return { results, durationMs: Date.now() - start };
}

/**
 * Wave 1: FramerSource — alle MCP-Framer-Calls parallel.
 * @param {object} args { framerUrl, projectId, fetcher (optional, for tests), options, log }
 */
export async function runWave1FramerSource({
  framerUrl,
  projectId = 'default',
  fetcher = null,
  options = {},
  log = null,
}) {
  // Lazy import to avoid circular dep at module load
  const { cachedGetProjectXml, cachedGetNodeXml, cachedGetColorStyles, cachedGetTextStyles } =
    await import('./framer-cache.js');

  const realFetcher = fetcher || ((ability, params) => {
    throw new Error(`[wave1] no real fetcher provided for ${ability}`);
  });

  const ops = [
    {
      name: 'getProjectXml',
      run: () => cachedGetProjectXml({
        projectId,
        fetcher: () => realFetcher('getProjectXml', { framerUrl }),
        options,
      }),
    },
    {
      name: 'colorStyles',
      run: () => cachedGetColorStyles({
        projectId,
        fetcher: () => realFetcher('getColorStyles', { framerUrl }),
        options,
      }),
    },
    {
      name: 'textStyles',
      run: () => cachedGetTextStyles({
        projectId,
        fetcher: () => realFetcher('getTextStyles', { framerUrl }),
        options,
      }),
    },
  ];
  return runWave(ops, { concurrency: options.concurrency || DEFAULT_CONCURRENCY, log });
}

/**
 * Wave 2: Asset-Processing — image-upload, font-resolution, token-mapping.
 */
export async function runWave2AssetProcessing({
  images = [],
  exportHtml,
  mcpBridge = null,
  siteId = 'default',
  options = {},
  log = null,
}) {
  const { batchUploadImages } = await import('./asset-batch-uploader.js');

  const ops = [];
  if (images.length > 0 && mcpBridge) {
    ops.push({
      name: 'image-upload',
      run: () => batchUploadImages({ images, mcpBridge, siteId, concurrency: options.concurrency }),
    });
  }
  if (exportHtml) {
    ops.push({
      name: 'font-resolution',
      run: async () => {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const pExec = promisify(execFile);
        const { nodeBin } = await import('./pipeline-paths.js').catch(() => ({ nodeBin: process.execPath }));
        const out = pathJoinTokens(options.assetsDir || './assets', 'font-resolution.json');
        await pExec(nodeBin, [
          'scripts/resolve-fonts.js',
          '--html', exportHtml,
          '--fonts-dir', pathJoinTokens(options.assetsDir || './assets', 'fonts'),
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
        const { nodeBin } = await import('./pipeline-paths.js').catch(() => ({ nodeBin: process.execPath }));
        const out = pathJoinTokens(options.tokensDir || './tokens', 'token-mapping.json');
        await pExec(nodeBin, [
          'scripts/extract-framer-css-tokens.js',
          '--html', exportHtml,
          '--output', out,
        ]);
        return { output: out };
      },
    });
  }
  return runWave(ops, { concurrency: options.concurrency || DEFAULT_CONCURRENCY, log });
}

/**
 * Wave 3: Build-Construction (sequenziell, KEIN p-limit noetig).
 */
export async function runWave3Build({ runConvert, runValidate, runFixStyles, log = null }) {
  const start = Date.now();
  const results = [];
  for (const op of [
    { name: 'convert-xml-to-v4', run: runConvert },
    { name: 'validate-v4-tree', run: runValidate },
    { name: 'fix-styles', run: runFixStyles },
  ]) {
    if (typeof op.run !== 'function') continue;
    const opStart = Date.now();
    try {
      const result = await op.run();
      results.push({ name: op.name, status: 'ok', result, durationMs: Date.now() - opStart });
      if (log?.success) log.success(`[wave3] ${op.name} ok (${Date.now() - opStart}ms)`);
    } catch (err) {
      results.push({ name: op.name, status: 'error', error: err.message, durationMs: Date.now() - opStart });
      if (log?.error) log.error(`[wave3] ${op.name} failed: ${err.message}`);
      return { results, durationMs: Date.now() - start, failedAt: op.name };
    }
  }
  return { results, durationMs: Date.now() - start };
}

/**
 * Wave 4: Deploy + QA — parallel.
 */
export async function runWave4DeployQa({
  postId,
  mcpBridge = null,
  v4TreePath = null,
  runBuild = null,
  runVisualQa = null,
  runLayoutAudit = null,
  runA11yFallback = null,
  runSeoFallback = null,
  options = {},
  log = null,
}) {
  const ops = [];
  if (runBuild) ops.push({ name: 'build-page', run: runBuild });
  if (runVisualQa) ops.push({ name: 'visual-qa', run: runVisualQa });
  if (runLayoutAudit) ops.push({ name: 'layout-audit', run: runLayoutAudit });
  if (runA11yFallback) ops.push({ name: 'a11y-fallback', run: runA11yFallback });
  if (runSeoFallback) ops.push({ name: 'seo-fallback', run: runSeoFallback });
  return runWave(ops, { concurrency: options.concurrency || DEFAULT_CONCURRENCY, log });
}

function pathJoinTokens(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}
