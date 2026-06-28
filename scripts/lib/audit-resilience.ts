/**
 * scripts/lib/audit-resilience.ts
 * UMBAUPLAN v2.0 Phase 3.3 — Audit-Auto-Skip + DOM-Fallback.
 */

export interface McpBridgeLike {
  call(ability: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface FetcherLike {
  fetch(url: string): Promise<string>;
}

export interface AuditIssue {
  check: string;
  status: string;
  detail: string;
}

export interface AuditResult {
  issues: AuditIssue[];
  score: number;
  status: string;
  source?: string;
  error?: string;
}

const METHOD_MISSING_PATTERNS = [
  'Call to undefined method',
  'method.*not found',
  'read_page',
  'does not exist',
];

const EMPTY_RESULT = Object.freeze({ issues: [], score: 100, status: 'empty' });

export function isMethodMissingError(errorMessage: string): boolean {
  if (!errorMessage) return false;
  return METHOD_MISSING_PATTERNS.some(p => new RegExp(p).test(errorMessage));
}

export function basicA11yCheck(html: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  if (typeof html !== 'string') {
    return [{ check: 'a11y-basic', status: 'fail', detail: 'No HTML provided' }];
  }

  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count === 0) {
    issues.push({ check: 'h1-missing', status: 'fail', detail: 'No <h1> found on page' });
  } else if (h1Count > 1) {
    issues.push({ check: 'h1-multiple', status: 'warn', detail: `${h1Count} <h1> elements (recommended: 1)` });
  }

  const imgTags = html.match(/<img[^>]*>/gi) || [];
  const imgsWithoutAlt = imgTags.filter(t => !/\salt\s*=/i.test(t)).length;
  if (imgsWithoutAlt > 0) {
    issues.push({ check: 'img-alt', status: 'fail', detail: `${imgsWithoutAlt}/${imgTags.length} images missing alt attribute` });
  }

  const linkTags = html.match(/<a[^>]*>[\s]*<\/a>/gi) || [];
  if (linkTags.length > 0) {
    issues.push({ check: 'link-empty', status: 'fail', detail: `${linkTags.length} links with empty text` });
  }

  const headingLevels = [...html.matchAll(/<h([1-6])[\s>]/gi)].map(m => parseInt(m[1], 10));
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      issues.push({ check: 'heading-skip', status: 'warn', detail: `Heading skip: h${headingLevels[i - 1]} → h${headingLevels[i]}` });
      break;
    }
  }

  return issues;
}

export function basicSeoCheck(html: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  if (typeof html !== 'string') {
    return [{ check: 'seo-basic', status: 'fail', detail: 'No HTML provided' }];
  }

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titleMatch || !titleMatch[1].trim()) {
    issues.push({ check: 'title-missing', status: 'fail', detail: 'No <title> tag' });
  } else if (titleMatch[1].length > 60) {
    issues.push({ check: 'title-length', status: 'warn', detail: `Title ${titleMatch[1].length} chars (recommended: ≤60)` });
  }

  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  if (!descMatch || !descMatch[1].trim()) {
    issues.push({ check: 'meta-desc-missing', status: 'fail', detail: 'No meta description' });
  } else if (descMatch[1].length > 155) {
    issues.push({ check: 'meta-desc-length', status: 'warn', detail: `Description ${descMatch[1].length} chars (recommended: ≤155)` });
  }

  if (!/<meta\s+property=["']og:title["']/i.test(html)) {
    issues.push({ check: 'og-title', status: 'warn', detail: 'No og:title' });
  }
  if (!/<meta\s+property=["']og:description["']/i.test(html)) {
    issues.push({ check: 'og-description', status: 'warn', detail: 'No og:description' });
  }

  if (!/<h1[\s>]/i.test(html)) {
    issues.push({ check: 'h1', status: 'fail', detail: 'No <h1>' });
  }

  if (!/<link\s+rel=["']canonical["']/i.test(html)) {
    issues.push({ check: 'canonical', status: 'warn', detail: 'No canonical link' });
  }

  return issues;
}

export function createAuditResilience({ mcpBridge, siteId, fetcher }: {
  mcpBridge: McpBridgeLike;
  siteId: string;
  fetcher?: FetcherLike;
}): {
  siteId: string;
  safeAudit: (opts: { post_id: number; type: 'a11y' | 'seo'; url?: string }) => Promise<AuditResult>;
  basicA11yCheck: typeof basicA11yCheck;
  basicSeoCheck: typeof basicSeoCheck;
} {
  if (!mcpBridge) throw new Error('createAuditResilience: mcpBridge required');
  if (!siteId) throw new Error('createAuditResilience: siteId required');

  async function safeAudit({ post_id, type, url }: { post_id: number; type: 'a11y' | 'seo'; url?: string }): Promise<AuditResult> {
    if (!post_id) throw new Error('safeAudit: post_id required');
    if (!['a11y', 'seo'].includes(type)) throw new Error(`safeAudit: invalid type "${type}"`);

    const ability = type === 'a11y' ? 'audit-page-a11y' : 'audit-page-seo';

    const rawResult = await mcpBridge.call(ability, { post_id })
      .catch((err: Error) => ({ error: err.message }));

    const result = rawResult as Record<string, unknown> | { error: string };

    if (result && !('error' in result) && 'issues' in result && Array.isArray(result.issues)) {
      return { ...(result as unknown as AuditResult), status: 'ok', source: 'mcp' };
    }

    const errorMsg = String((result as { error?: string }).error || '');
    if (!isMethodMissingError(errorMsg) && (result as { error?: string }).error) {
      return { ...EMPTY_RESULT, source: 'unknown-error', error: errorMsg };
    }

    const html = await fetchHtml({ post_id, url, fetcher });
    if (!html) {
      return { ...EMPTY_RESULT, source: 'no-html', error: errorMsg };
    }

    const issues = type === 'a11y' ? basicA11yCheck(html) : basicSeoCheck(html);
    const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 10);
    return { issues, score, status: 'fallback', source: 'dom' };
  }

  return { siteId, safeAudit, basicA11yCheck, basicSeoCheck };
}

async function fetchHtml({ post_id, url, fetcher }: {
  post_id: number;
  url?: string;
  fetcher?: FetcherLike;
}): Promise<string | null> {
  if (fetcher && typeof fetcher.fetch === 'function') {
    return await fetcher.fetch(url || `/?p=${post_id}`).catch(() => null);
  }
  if (typeof globalThis.fetch === 'function' && url) {
    return await globalThis.fetch(url).then(r => r.text()).catch(() => null);
  }
  return null;
}
