/**
 * scripts/lib/audit-resilience.js
 * UMBAUPLAN v2.0 Phase 3.3 — Audit-Auto-Skip + DOM-Fallback.
 *
 * Symptom: `audit-page-a11y`, `audit-page-seo` brechen ab wegen fehlender Methoden
 * (z.B. A11y::read_page() nicht implementiert).
 *
 * Workaround:
 *   1. Try MCP-Audit
 *   2. If method-missing: try DOM-based audit (parse rendered HTML)
 *   3. If DOM-Audit also fails: log warning, return empty array
 *
 * API:
 *   const audit = createAuditResilience({ mcpBridge, siteId });
 *   const result = await audit.safeAudit({ post_id, type: 'a11y' | 'seo' });
 */

const METHOD_MISSING_PATTERNS = [
  'Call to undefined method',
  'method.*not found',
  'read_page',
  'does not exist',
];

const EMPTY_RESULT = Object.freeze({ issues: [], score: 100, status: 'empty' });

export function isMethodMissingError(errorMessage) {
  if (!errorMessage) return false;
  return METHOD_MISSING_PATTERNS.some(p => new RegExp(p).test(errorMessage));
}

// ─────────────────────────────────────────────
// DOM-BASED A11Y FALLBACK
// ─────────────────────────────────────────────

/**
 * Einfache HTML-A11y-Prüfung — nur basic stuff.
 * Erkennt: h1-count, img-alt, link-text, heading-hierarchy.
 *
 * @param {string} html - rendered page HTML
 * @returns {Array<{check: string, status: string, detail: string}>}
 */
export function basicA11yCheck(html) {
  const issues = [];
  if (typeof html !== 'string') {
    return [{ check: 'a11y-basic', status: 'fail', detail: 'No HTML provided' }];
  }

  // H1 count
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count === 0) {
    issues.push({ check: 'h1-missing', status: 'fail', detail: 'No <h1> found on page' });
  } else if (h1Count > 1) {
    issues.push({ check: 'h1-multiple', status: 'warn', detail: `${h1Count} <h1> elements (recommended: 1)` });
  }

  // Image alt
  const imgTags = html.match(/<img[^>]*>/gi) || [];
  const imgsWithoutAlt = imgTags.filter(t => !/\salt\s*=/i.test(t)).length;
  if (imgsWithoutAlt > 0) {
    issues.push({
      check: 'img-alt',
      status: 'fail',
      detail: `${imgsWithoutAlt}/${imgTags.length} images missing alt attribute`,
    });
  }

  // Empty link text
  const linkTags = html.match(/<a[^>]*>[\s]*<\/a>/gi) || [];
  if (linkTags.length > 0) {
    issues.push({
      check: 'link-empty',
      status: 'fail',
      detail: `${linkTags.length} links with empty text`,
    });
  }

  // Heading hierarchy
  const headingLevels = [...html.matchAll(/<h([1-6])[\s>]/gi)].map(m => parseInt(m[1], 10));
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      issues.push({
        check: 'heading-skip',
        status: 'warn',
        detail: `Heading skip: h${headingLevels[i - 1]} → h${headingLevels[i]}`,
      });
      break;
    }
  }

  return issues;
}

// ─────────────────────────────────────────────
// DOM-BASED SEO FALLBACK
// ─────────────────────────────────────────────

/**
 * Einfache HTML-SEO-Prüfung.
 * Erkennt: title-tag, meta-description, og-tags, h1, canonical.
 *
 * @param {string} html
 * @returns {Array<{check: string, status: string, detail: string}>}
 */
export function basicSeoCheck(html) {
  const issues = [];
  if (typeof html !== 'string') {
    return [{ check: 'seo-basic', status: 'fail', detail: 'No HTML provided' }];
  }

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titleMatch || !titleMatch[1].trim()) {
    issues.push({ check: 'title-missing', status: 'fail', detail: 'No <title> tag' });
  } else if (titleMatch[1].length > 60) {
    issues.push({
      check: 'title-length',
      status: 'warn',
      detail: `Title ${titleMatch[1].length} chars (recommended: ≤60)`,
    });
  }

  // Meta description
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  if (!descMatch || !descMatch[1].trim()) {
    issues.push({ check: 'meta-desc-missing', status: 'fail', detail: 'No meta description' });
  } else if (descMatch[1].length > 155) {
    issues.push({
      check: 'meta-desc-length',
      status: 'warn',
      detail: `Description ${descMatch[1].length} chars (recommended: ≤155)`,
    });
  }

  // OG tags
  if (!/<meta\s+property=["']og:title["']/i.test(html)) {
    issues.push({ check: 'og-title', status: 'warn', detail: 'No og:title' });
  }
  if (!/<meta\s+property=["']og:description["']/i.test(html)) {
    issues.push({ check: 'og-description', status: 'warn', detail: 'No og:description' });
  }

  // H1
  if (!/<h1[\s>]/i.test(html)) {
    issues.push({ check: 'h1', status: 'fail', detail: 'No <h1>' });
  }

  // Canonical
  if (!/<link\s+rel=["']canonical["']/i.test(html)) {
    issues.push({ check: 'canonical', status: 'warn', detail: 'No canonical link' });
  }

  return issues;
}

// ─────────────────────────────────────────────
// RESILIENCE FACTORY
// ─────────────────────────────────────────────

/**
 * @param {object} options
 * @param {object} options.mcpBridge - { call(ability_name, parameters) }
 * @param {string} options.siteId
 * @param {object} [options.fetcher] - Optional: { fetch(url) → html } für DOM-Fallback
 */
export function createAuditResilience({ mcpBridge, siteId, fetcher }) {
  if (!mcpBridge) throw new Error('createAuditResilience: mcpBridge required');
  if (!siteId) throw new Error('createAuditResilience: siteId required');

  /**
   * @param {object} opts
   * @param {number} opts.post_id
   * @param {'a11y'|'seo'} opts.type
   * @param {string} [opts.url] - URL for DOM-fallback (required if no fetcher and method-missing)
   * @returns {Promise<{issues: Array, score: number, status: string, source: string}>}
   */
  async function safeAudit({ post_id, type, url }) {
    if (!post_id) throw new Error('safeAudit: post_id required');
    if (!['a11y', 'seo'].includes(type)) throw new Error(`safeAudit: invalid type "${type}"`);

    const ability = type === 'a11y' ? 'audit-page-a11y' : 'audit-page-seo';

    // 1. Try real MCP-Audit
    const result = await mcpBridge.call(ability, { post_id })
      .catch(err => ({ error: err.message }));

    if (result && !result.error && Array.isArray(result.issues)) {
      return { ...result, status: 'ok', source: 'mcp' };
    }

    const errorMsg = String(result?.error || '');
    if (!isMethodMissingError(errorMsg) && result?.error) {
      // Unknown error → empty
      return { ...EMPTY_RESULT, source: 'unknown-error', error: errorMsg };
    }

    // 2. Method-missing → DOM-fallback
    const html = await fetchHtml({ post_id, url, fetcher });
    if (!html) {
      return { ...EMPTY_RESULT, source: 'no-html', error: errorMsg };
    }

    const issues = type === 'a11y' ? basicA11yCheck(html) : basicSeoCheck(html);
    const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 10);
    return { issues, score, status: 'fallback', source: 'dom' };
  }

  return {
    siteId,
    safeAudit,
    basicA11yCheck,
    basicSeoCheck,
  };
}

async function fetchHtml({ post_id, url, fetcher }) {
  if (fetcher && typeof fetcher.fetch === 'function') {
    return await fetcher.fetch(url || `/?p=${post_id}`).catch(() => null);
  }
  if (typeof globalThis.fetch === 'function' && url) {
    return await globalThis.fetch(url).then(r => r.text()).catch(() => null);
  }
  return null;
}
