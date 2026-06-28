/**
 * tests/lib/phase-3-workarounds.test.js
 * UMBAUPLAN v2.0 Phase 3 — Workaround-Layer Tests
 *   3.1 wp-css-injector (CSS-Generation, mu-plugin-template, injector-Factory)
 *   3.2 foundation-resilience (Fallback-CSS, Error-Detection, Cache)
 *   3.3 audit-resilience (DOM-A11y/SEO-Fallback, Method-Missing-Detection)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  generateCssFromV4Tree,
  generateMuPluginContent,
  createWpCssInjector,
} from '../../scripts/lib/wp-css-injector.js';

import {
  isFoundationError,
  generateLocalFoundationCss,
  createFoundationResilience,
} from '../../scripts/lib/foundation-resilience.js';

import {
  isMethodMissingError,
  basicA11yCheck,
  basicSeoCheck,
  createAuditResilience,
} from '../../scripts/lib/audit-resilience.js';

// ─────────────────────────────────────────────
// Phase 3.1 — CSS Generation
// ─────────────────────────────────────────────

test('Phase 3.1 generateCssFromV4Tree: simple style with size + color', () => {
  const tree = {
    styles: {
      fehero: {
        variants: [{
          meta: { breakpoint: 'desktop', state: null },
          props: {
            'font-size': { '$$type': 'size', value: { size: 60, unit: 'px' } },
            color: { '$$type': 'color', value: '#111111' },
          },
          custom_css: null,
        }],
      },
    },
  };
  const css = generateCssFromV4Tree(tree);
  assert.ok(css.includes('.fehero'));
  assert.ok(css.includes('font-size: 60px'));
  assert.ok(css.includes('color: #111111'));
});

test('Phase 3.1 generateCssFromV4Tree: tablet breakpoint wraps in @media', () => {
  const tree = {
    styles: {
      fehero: {
        variants: [{
          meta: { breakpoint: 'tablet', state: null },
          props: { 'font-size': { '$$type': 'size', value: { size: 32, unit: 'px' } } },
          custom_css: null,
        }],
      },
    },
  };
  const css = generateCssFromV4Tree(tree);
  assert.ok(css.includes('@media'));
  assert.ok(css.includes('max-width: 1024px'));
});

test('Phase 3.1 generateCssFromV4Tree: hover state becomes pseudo-selector', () => {
  const tree = {
    styles: {
      febtn: {
        variants: [{
          meta: { breakpoint: 'desktop', state: 'hover' },
          props: { color: { '$$type': 'color', value: '#ffffff' } },
          custom_css: null,
        }],
      },
    },
  };
  const css = generateCssFromV4Tree(tree);
  assert.ok(css.includes('.febtn:hover'));
});

test('Phase 3.1 generateCssFromV4Tree: dimensions → shorthand', () => {
  const tree = {
    styles: {
      fep: {
        variants: [{
          meta: { breakpoint: 'desktop', state: null },
          props: {
            padding: {
              '$$type': 'dimensions',
              value: {
                'block-start':  { '$$type': 'size', value: { size: 10, unit: 'px' } },
                'block-end':    { '$$type': 'size', value: { size: 10, unit: 'px' } },
                'inline-start': { '$$type': 'size', value: { size: 20, unit: 'px' } },
                'inline-end':   { '$$type': 'size', value: { size: 20, unit: 'px' } },
              },
            },
          },
          custom_css: null,
        }],
      },
    },
  };
  const css = generateCssFromV4Tree(tree);
  assert.ok(css.includes('padding: 10px 20px 10px 20px'));
});

test('Phase 3.1 generateCssFromV4Tree: empty tree → empty string', () => {
  assert.equal(generateCssFromV4Tree(null), '');
  assert.equal(generateCssFromV4Tree({}), '');
});

test('Phase 3.1 generateMuPluginContent: includes post_id enqueue logic', () => {
  const php = generateMuPluginContent(123, '/wp-content/uploads/elementor-custom-css/post-123.css');
  assert.ok(php.includes('is_singular( 123 )'));
  assert.ok(php.includes('novamira-custom-css-123'));
  assert.ok(php.includes('post-123.css'));
  assert.ok(php.startsWith('<?php'));
  assert.ok(php.includes('ABSPATH'));
});

test('Phase 3.1 createWpCssInjector: throws without mcpBridge', () => {
  assert.throws(() => createWpCssInjector({ siteId: 'solar' }));
  assert.throws(() => createWpCssInjector({ mcpBridge: {} }));
});

test('Phase 3.1 createWpCssInjector: injectCustomCss calls mcpBridge with create-upload-link', async () => {
  const calls = [];
  const bridge = {
    call: async (name, params) => {
      calls.push({ name, params });
      return { success: true };
    },
  };
  const injector = createWpCssInjector({ mcpBridge: bridge, siteId: 'solar' });
  const result = await injector.injectCustomCss({ post_id: 42, css: 'body { color: red; }' });
  assert.equal(result.success, true);
  assert.equal(calls[0].name, 'create-upload-link');
  assert.equal(calls[0].params.filename, 'post-42.css');
  assert.equal(calls[1].name, 'execute-php');
  assert.equal(calls[1].params.path, 'wp-content/mu-plugins/elementor-custom-css-42.php');
});

test('Phase 3.1 createWpCssInjector: throws on invalid input', async () => {
  const bridge = { call: async () => ({ success: true }) };
  const injector = createWpCssInjector({ mcpBridge: bridge, siteId: 'solar' });
  await assert.rejects(injector.injectCustomCss({ post_id: 'abc', css: 'x' }));
  await assert.rejects(injector.injectCustomCss({ post_id: 1, css: 42 }));
});

test('Phase 3.1 createWpCssInjector: handles upload failure gracefully', async () => {
  const bridge = {
    call: async () => ({ error: 'permission denied' }),
  };
  const injector = createWpCssInjector({ mcpBridge: bridge, siteId: 'solar' });
  const result = await injector.injectCustomCss({ post_id: 1, css: 'body {}' });
  assert.equal(result.success, false);
  assert.ok(result.error.includes('css-upload'));
});

// ─────────────────────────────────────────────
// Phase 3.2 — Foundation Resilience
// ─────────────────────────────────────────────

test('Phase 3.2 isFoundationError: detects "Guards not found"', () => {
  assert.equal(isFoundationError('Class Novamira\\AdrianV2\\Guards not found'), true);
  assert.equal(isFoundationError('Call to undefined method ensureSession'), true);
  assert.equal(isFoundationError('Some random error'), false);
});

test('Phase 3.2 generateLocalFoundationCss: includes :root + classes', () => {
  const css = generateLocalFoundationCss(
    { colors: { primary: { hex: '#ff0000' } }, fonts: { body: { family: 'Inter' } } },
    { btn: { props: { color: 'white', padding: '10px' } } },
  );
  assert.ok(css.includes(':root'));
  assert.ok(css.includes('--gv-primary: #ff0000'));
  assert.ok(css.includes('--gv-font-body: Inter'));
  assert.ok(css.includes('.btn'));
  assert.ok(css.includes('color: white'));
  assert.ok(css.includes('padding: 10px'));
});

test('Phase 3.2 createFoundationResilience: throws without mcpBridge', () => {
  assert.throws(() => createFoundationResilience({ siteId: 'solar' }));
});

test('Phase 3.2 createFoundationResilience: success returns ok status', async () => {
  const bridge = { call: async () => ({ ok: true, gv_count: 12 }) };
  const setup = createFoundationResilience({ mcpBridge: bridge, siteId: 'solar' });
  const result = await setup.setupWithFallback({ post_id: 1 });
  assert.equal(result.status, 'ok');
  assert.equal(result.foundation.ok, true);
});

test('Phase 3.2 createFoundationResilience: Guards error → fallback with local CSS', async () => {
  const bridge = { call: async () => ({ error: 'Class Novamira\\AdrianV2\\Guards not found' }) };
  const setup = createFoundationResilience({ mcpBridge: bridge, siteId: 'solar' });
  const result = await setup.setupWithFallback({
    post_id: 1,
    designTokens: { colors: { primary: { hex: '#abc' } } },
    designClasses: {},
  });
  assert.equal(result.status, 'fallback');
  assert.ok(result.fallbackCss.includes('#abc'));
  assert.ok(result.foundationError.includes('Guards'));
});

test('Phase 3.2 createFoundationResilience: unknown error → failed (no fallback)', async () => {
  const bridge = { call: async () => ({ error: 'Connection timeout' }) };
  const setup = createFoundationResilience({ mcpBridge: bridge, siteId: 'solar' });
  const result = await setup.setupWithFallback({ post_id: 1 });
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'Connection timeout');
});

test('Phase 3.2 createFoundationResilience: cache is written and read', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'foundation-test-'));
  try {
    const bridge = { call: async () => ({ ok: true }) };
    const setup = createFoundationResilience({ mcpBridge: bridge, siteId: 'test-cache', cacheDir: dir });
    await setup.setupWithFallback({ post_id: 1 });
    const info = setup.getCacheInfo();
    assert.equal(info.cached, true);
    assert.equal(info.status, 'ok');
    setup.clearCache();
    const info2 = setup.getCacheInfo();
    assert.equal(info2.cached, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────
// Phase 3.3 — Audit Resilience
// ─────────────────────────────────────────────

test('Phase 3.3 isMethodMissingError: detects missing methods', () => {
  assert.equal(isMethodMissingError('Call to undefined method Novamira\\AdrianV2\\A11y::read_page()'), true);
  assert.equal(isMethodMissingError('method read_page does not exist'), true);
  assert.equal(isMethodMissingError('Some other error'), false);
});

test('Phase 3.3 basicA11yCheck: missing h1 → fail', () => {
  const issues = basicA11yCheck('<html><body><p>Hello</p></body></html>');
  const h1Issue = issues.find(i => i.check === 'h1-missing');
  assert.ok(h1Issue);
  assert.equal(h1Issue.status, 'fail');
});

test('Phase 3.3 basicA11yCheck: multiple h1s → warn', () => {
  const issues = basicA11yCheck('<html><body><h1>A</h1><h1>B</h1></body></html>');
  const h1 = issues.find(i => i.check === 'h1-multiple');
  assert.ok(h1);
  assert.equal(h1.status, 'warn');
});

test('Phase 3.3 basicA11yCheck: image without alt → fail', () => {
  const issues = basicA11yCheck('<html><body><img src="x.png"></body></html>');
  const alt = issues.find(i => i.check === 'img-alt');
  assert.ok(alt);
  assert.equal(alt.status, 'fail');
});

test('Phase 3.3 basicA11yCheck: image with alt → no alt issue', () => {
  const issues = basicA11yCheck('<html><body><img src="x.png" alt="Hero"></body></html>');
  assert.equal(issues.find(i => i.check === 'img-alt'), undefined);
});

test('Phase 3.3 basicA11yCheck: empty link → fail', () => {
  const issues = basicA11yCheck('<html><body><a href="/x"></a></body></html>');
  const link = issues.find(i => i.check === 'link-empty');
  assert.ok(link);
});

test('Phase 3.3 basicA11yCheck: heading skip → warn', () => {
  const issues = basicA11yCheck('<html><body><h1>X</h1><h4>Skip h2-h3</h4></body></html>');
  const skip = issues.find(i => i.check === 'heading-skip');
  assert.ok(skip);
});

test('Phase 3.3 basicSeoCheck: missing title → fail', () => {
  const issues = basicSeoCheck('<html><body></body></html>');
  const title = issues.find(i => i.check === 'title-missing');
  assert.ok(title);
  assert.equal(title.status, 'fail');
});

test('Phase 3.3 basicSeoCheck: long title → warn', () => {
  const longTitle = 'A'.repeat(80);
  const issues = basicSeoCheck(`<html><head><title>${longTitle}</title></head><body></body></html>`);
  const length = issues.find(i => i.check === 'title-length');
  assert.ok(length);
});

test('Phase 3.3 basicSeoCheck: missing og:title → warn', () => {
  const issues = basicSeoCheck('<html><head><title>Test</title><meta name="description" content="x"></head></html>');
  const og = issues.find(i => i.check === 'og-title');
  assert.ok(og);
  assert.equal(og.status, 'warn');
});

test('Phase 3.3 basicSeoCheck: complete SEO → no issues', () => {
  const html = `<html><head>
    <title>Page Title</title>
    <meta name="description" content="A reasonable description for the page.">
    <meta property="og:title" content="Page Title">
    <meta property="og:description" content="Desc">
    <link rel="canonical" href="/x">
  </head><body><h1>H1</h1></body></html>`;
  const issues = basicSeoCheck(html);
  assert.equal(issues.length, 0);
});

test('Phase 3.3 createAuditResilience: throws without required args', () => {
  assert.throws(() => createAuditResilience({ siteId: 'solar' }));
  const bridge = { call: async () => ({}) };
  const audit = createAuditResilience({ mcpBridge: bridge, siteId: 'solar' });
  // @ts-ignore — testing wrong type
  return assert.rejects(audit.safeAudit({ post_id: 1, type: 'foo' }));
});

test('Phase 3.3 createAuditResilience: success returns mcp source', async () => {
  const bridge = { call: async () => ({ issues: [{ check: 'x', status: 'pass' }], score: 95 }) };
  const audit = createAuditResilience({ mcpBridge: bridge, siteId: 'solar' });
  const result = await audit.safeAudit({ post_id: 1, type: 'a11y' });
  assert.equal(result.status, 'ok');
  assert.equal(result.source, 'mcp');
  assert.equal(result.score, 95);
});

test('Phase 3.3 createAuditResilience: method-missing + no html → empty', async () => {
  const bridge = { call: async () => ({ error: 'Call to undefined method A11y::read_page()' }) };
  const audit = createAuditResilience({ mcpBridge: bridge, siteId: 'solar' });
  const result = await audit.safeAudit({ post_id: 1, type: 'a11y' });
  assert.equal(result.status, 'empty');
  assert.equal(result.source, 'no-html');
});

test('Phase 3.3 createAuditResilience: method-missing + html → dom fallback', async () => {
  const bridge = { call: async () => ({ error: 'Call to undefined method A11y::read_page()' }) };
  const fetcher = {
    fetch: async () => '<html><body><h1>Hello</h1><img src="x.png" alt="x"></body></html>',
  };
  const audit = createAuditResilience({ mcpBridge: bridge, siteId: 'solar', fetcher });
  const result = await audit.safeAudit({ post_id: 1, type: 'a11y', url: 'http://test.local/' });
  assert.equal(result.status, 'fallback');
  assert.equal(result.source, 'dom');
  assert.equal(result.issues.length, 0);
  assert.equal(result.score, 100);
});
