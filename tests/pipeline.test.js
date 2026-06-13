/**
 * tests/pipeline.test.js
 *
 * Smoke + regression test suite fuer die Framer -> Elementor V4 Pipeline.
 * Laeuft mit: node --test tests/pipeline.test.js
 * Oder via:   npm test
 *
 * Testet:
 *   1. framer-utils exports (wrapSize, wrapDimensions, generateStyleId, ...)
 *   2. convert-xml-to-v4 CLI (XML -> V4 JSON, image-src Format)
 *   3. patch-v4-tree-media-ids (Invariant IV: image-attachment-id wrapper, kein url:null)
 *   4. auto-scale-responsive ($$type-bewusstes Scaling, kein plain-number Bug)
 *   5. verify-build-binding (Invariant I, gc- Filter)
 *   6. framer-pre-build-validate (Score-System, g12 dedup)
 *   7. generate-global-classes (GC-Vorschlaege aus Tree)
 *   8. design-token-extractor (CSS Custom Properties -> token-mapping)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS   = join(__dirname, '..', 'scripts');
const toFileUrl = (p) => pathToFileURL(p).href;
const NODE      = process.execPath;

// ── Helpers ────────────────────────────────────────────────────────────────

function tmpFile(name, content) {
  const dir = join(tmpdir(), 'pipeline-test');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  if (content !== undefined) writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8');
  return p;
}

function run(script, extraArgs = [], { expectFail = false } = {}) {
  try {
    const out = execFileSync(NODE, [join(SCRIPTS, script), ...extraArgs], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    });
    return { ok: true, stdout: out, stderr: '' };
  } catch (err) {
    if (expectFail) return { ok: false, stdout: err.stdout || '', stderr: err.stderr || '', code: err.status };
    throw err;
  }
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ── 1. framer-utils unit tests ─────────────────────────────────────────────

describe('framer-utils', async () => {
  const utils = await import(toFileUrl(join(SCRIPTS, 'lib', 'framer-utils.js')));

  test('wrapSize: px string -> $$type:size object', () => {
    const r = utils.wrapSize('68px');
    assert.equal(r['$$type'], 'size');
    assert.equal(r.value.size, 68);
    assert.equal(r.value.unit, 'px');
  });

  test('wrapSize: percentage', () => {
    const r = utils.wrapSize('100%');
    assert.equal(r['$$type'], 'size');
    assert.equal(r.value.size, 100);
    assert.equal(r.value.unit, '%');
  });

  test('wrapDimensions: shorthand "40px 20px" -> block/inline sides', () => {
    const r = utils.wrapDimensions('40px 20px');
    assert.equal(r['$$type'], 'dimensions');
    assert.equal(r.value['block-start'].value.size, 40);
    assert.equal(r.value['inline-end'].value.size, 20);
  });

  test('generateStyleId: no hyphens in output', () => {
    const id = utils.generateStyleId('Hero Section');
    assert.ok(!id.includes('-'), `Style ID must not contain hyphens: ${id}`);
    assert.match(id, /^[a-z][a-z0-9_]*$/);
  });

  test('generateStyleId: starts with fe prefix', () => {
    const id = utils.generateStyleId('Feature Card');
    assert.ok(id.startsWith('fe'));
  });

  test('normalizeHex: rgb -> hex', () => {
    assert.equal(utils.normalizeHex('rgb(14, 42, 59)'), '#0e2a3b');
  });

  test('normalizeHex: already hex', () => {
    assert.equal(utils.normalizeHex('#0e2a3b'), '#0e2a3b');
  });

  test('wrapGvColor: wraps in global-color-variable', () => {
    const r = utils.wrapGvColor('e-gv-ef6c8f0');
    assert.equal(r['$$type'], 'global-color-variable');
    assert.equal(r.value, 'e-gv-ef6c8f0');
  });

  test('getWrappedSizeNumber: extracts size from $$type:size', () => {
    const r = utils.getWrappedSizeNumber({ '$$type': 'size', value: { size: 52, unit: 'px' } });
    assert.equal(r, 52);
  });

  test('getWrappedSizeNumber: returns null for non-size', () => {
    assert.equal(utils.getWrappedSizeNumber({ '$$type': 'color', value: '#fff' }), null);
    assert.equal(utils.getWrappedSizeNumber(null), null);
    assert.equal(utils.getWrappedSizeNumber(42), null);
  });

  test('scaleWrappedSize: scales size value', () => {
    const input = { '$$type': 'size', value: { size: 60, unit: 'px' } };
    const r = utils.scaleWrappedSize(input, 0.75);
    assert.equal(r.value.size, 45);
    assert.equal(r.value.unit, 'px');
  });

  test('walkTree: visits all nodes including nested children', () => {
    const tree = {
      id: 'root',
      children: [
        { id: 'child1', children: [{ id: 'grandchild' }] },
        { id: 'child2' },
      ],
    };
    const visited = [];
    utils.walkTree(tree, n => visited.push(n.id));
    assert.deepEqual(visited, ['root', 'child1', 'grandchild', 'child2']);
  });

  // wrapHtmlContent — exported from framer-utils, used by e-heading / e-paragraph / e-button
  test('wrapHtmlContent: plain text produces html-v3 shape', () => {
    const r = utils.wrapHtmlContent('Hello World');
    assert.equal(r['$$type'], 'html-v3', '$$type must be html-v3');
    assert.equal(r.value?.content?.['$$type'], 'string', 'inner $$type must be string');
    assert.equal(r.value?.content?.value, 'Hello World', 'content value must match');
  });

  test('wrapHtmlContent: empty string → value is empty string (not undefined)', () => {
    const r = utils.wrapHtmlContent('');
    assert.equal(r.value?.content?.value, '', 'empty string must not become undefined');
  });

  test('wrapHtmlContent: HTML tags preserved in value', () => {
    const html = '<strong>Bold</strong> text';
    const r = utils.wrapHtmlContent(html);
    assert.equal(r.value?.content?.value, html, 'HTML tags must be preserved verbatim');
  });
});

// ── 2. convert-xml-to-v4 ──────────────────────────────────────────────────

describe('convert-xml-to-v4', () => {
  const SAMPLE_XML = `
    <Frame name="Hero Section" stackDirection="vertical" stackGap="40px" padding="80px 60px" maxWidth="1200px">
      <Text name="Heading 1" text="Willkommen" font-size="68px" color="#0e2a3b"/>
      <Image name="Hero Image" backgroundImage="url(https://framerusercontent.com/images/hero.jpg)"/>
    </Frame>
  `.trim();

  test('converts simple XML to V4 tree', () => {
    const xmlFile = tmpFile('test.xml', SAMPLE_XML);
    const outFile = tmpFile('test-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    assert.ok(tree.widgetType, 'Should have widgetType');
    assert.ok(tree.settings, 'Should have settings');
    assert.ok(tree.styles, 'Should have styles');
  });

  test('settings.classes.value contains style ID', () => {
    const xmlFile = tmpFile('test2.xml', SAMPLE_XML);
    const outFile = tmpFile('test2-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    const styleIds = Object.keys(tree.styles);
    const classesVal = tree.settings.classes?.value || [];
    assert.ok(styleIds.length > 0, 'Should have styles');
    for (const sid of styleIds) {
      assert.ok(classesVal.includes(sid), `Style ID "${sid}" not bound in settings.classes.value`);
    }
  });

  test('style IDs have no hyphens', () => {
    const xmlFile = tmpFile('test3.xml', SAMPLE_XML);
    const outFile = tmpFile('test3-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    function checkStyleIds(node) {
      for (const sid of Object.keys(node.styles || {})) {
        assert.ok(!sid.includes('-'), `Style ID "${sid}" contains hyphen (Invariant violation)`);
      }
      for (const child of node.children || []) checkStyleIds(child);
    }
    checkStyleIds(tree);
  });

  test('image-src uses url key (not _url)', () => {
    const xmlFile = tmpFile('test4.xml', SAMPLE_XML);
    const outFile = tmpFile('test4-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const raw = readFileSync(outFile, 'utf8');
    assert.ok(!raw.includes('"_url"'), 'Should not contain _url key');
    assert.ok(!raw.includes('"id": 0'), 'Should not contain id: 0');
  });

  test('font-size wrapped as $$type:size', () => {
    const xmlFile = tmpFile('test5.xml', SAMPLE_XML);
    const outFile = tmpFile('test5-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    // Find heading node
    function findFontSize(node) {
      for (const style of Object.values(node.styles || {})) {
        for (const variant of style.variants || []) {
          if (variant.props?.['font-size']) return variant.props['font-size'];
        }
      }
      for (const c of node.children || []) {
        const r = findFontSize(c);
        if (r) return r;
      }
      return null;
    }
    const fs = findFontSize(tree);
    if (fs) {
      assert.equal(fs['$$type'], 'size', `font-size must be $$type:size, got: ${JSON.stringify(fs)}`);
      assert.equal(typeof fs.value?.size, 'number');
    }
  });
});

// ── 3. patch-v4-tree-media-ids (Invariant IV) ─────────────────────────────

describe('patch-v4-tree-media-ids (Invariant IV)', () => {
  function makeTree(imageUrl) {
    return {
      widgetType: 'e-image',
      id: 'img1',
      settings: {
        'image-src': { '$$type': 'image-src', url: imageUrl },
        classes: { '$$type': 'classes', value: ['simg'] },
      },
      styles: { simg: { '$$type': 'image', variants: [{ meta: { breakpoint: null, state: null }, props: {} }] } },
    };
  }

  test('injects image-attachment-id $$type wrapper', () => {
    const url = 'https://framerusercontent.com/images/hero.jpg';
    const tree = makeTree(url);
    const treeFile = tmpFile('inv4-tree.json', tree);
    const mapFile = tmpFile('inv4-map.json', {
      images: { 'hero.jpg': { wp_media_id: 42 } },
    });
    const outFile = tmpFile('inv4-out.json');
    run('patch-v4-tree-media-ids.js', [treeFile, mapFile, outFile]);
    const patched = readJson(outFile);
    const imgSrc = patched.settings['image-src'];
    // Should have value.id as $$type:image-attachment-id
    assert.ok(imgSrc.value, 'Should have value object');
    assert.equal(imgSrc.value.id?.['$$type'], 'image-attachment-id',
      `id must be $$type:image-attachment-id, got: ${JSON.stringify(imgSrc.value.id)}`);
    assert.equal(imgSrc.value.id?.value, 42, 'id.value should be the WP media ID');
  });

  test('url key absent after patching (Invariant IV: no url:null)', () => {
    const url = 'https://framerusercontent.com/images/hero2.jpg';
    const tree = makeTree(url);
    const treeFile = tmpFile('inv4b-tree.json', tree);
    const mapFile = tmpFile('inv4b-map.json', {
      images: { 'hero2.jpg': { wp_media_id: 99 } },
    });
    const outFile = tmpFile('inv4b-out.json');
    run('patch-v4-tree-media-ids.js', [treeFile, mapFile, outFile]);
    const raw = readFileSync(outFile, 'utf8');
    const patched = readJson(outFile);
    const imgSrc = patched.settings['image-src'];
    // url key must not exist (not even as null)
    assert.ok(!('url' in (imgSrc.value || imgSrc)),
      'url key must be absent after patching (Invariant IV)');
    assert.ok(!raw.includes('"url": null'), 'JSON must not contain url: null');
  });
});

// ── 4. auto-scale-responsive ───────────────────────────────────────────────

describe('auto-scale-responsive', () => {
  function makeStyleTree(fontSizePx) {
    return [{
      widgetType: 'e-heading',
      id: 'hero',
      settings: { classes: { '$$type': 'classes', value: ['shero'] } },
      styles: {
        shero: {
          '$$type': 'heading',
          variants: [{
            meta: { breakpoint: null, state: null },
            props: {
              'font-size': { '$$type': 'size', value: { size: fontSizePx, unit: 'px' } },
            },
          }],
        },
      },
    }];
  }

  test('injects tablet+mobile variants for font-size > 28px', () => {
    const tree = makeStyleTree(68);
    const inFile  = tmpFile('scale-in.json', tree);
    const outFile = tmpFile('scale-out.json');
    run('auto-scale-responsive.js', [inFile, outFile]);
    const result = readJson(outFile);
    const variants = result[0].styles.shero.variants;
    const breakpoints = variants.map(v => v.meta?.breakpoint);
    assert.ok(breakpoints.includes('tablet'), 'Should inject tablet variant');
    assert.ok(breakpoints.includes('mobile'), 'Should inject mobile variant');
  });

  test('scaled font-size is wrapped as $$type:size (not plain number)', () => {
    const tree = makeStyleTree(68);
    const inFile  = tmpFile('scale-type-in.json', tree);
    const outFile = tmpFile('scale-type-out.json');
    run('auto-scale-responsive.js', [inFile, outFile]);
    const result = readJson(outFile);
    const variants = result[0].styles.shero.variants;
    for (const v of variants) {
      const fs = v.props?.['font-size'];
      if (fs !== undefined) {
        assert.equal(typeof fs, 'object', `font-size must be object ($$type:size), got ${typeof fs}`);
        assert.equal(fs['$$type'], 'size', `font-size must have $$type:size, got ${fs['$$type']}`);
      }
    }
  });

  test('does NOT inject variants for font-size <= 28px', () => {
    const tree = makeStyleTree(16);
    const inFile  = tmpFile('scale-small-in.json', tree);
    const outFile = tmpFile('scale-small-out.json');
    run('auto-scale-responsive.js', [inFile, outFile]);
    const result = readJson(outFile);
    const variants = result[0].styles.shero.variants;
    assert.equal(variants.length, 1, 'Should not inject variants for small font-size');
  });

  test('does NOT overwrite existing tablet variant', () => {
    const treeWithTablet = [{
      widgetType: 'e-heading',
      id: 'h2',
      settings: { classes: { '$$type': 'classes', value: ['sh2'] } },
      styles: {
        sh2: {
          '$$type': 'heading',
          variants: [
            { meta: { breakpoint: null, state: null }, props: { 'font-size': { '$$type': 'size', value: { size: 60, unit: 'px' } } } },
            { meta: { breakpoint: 'tablet', state: null }, props: { 'font-size': { '$$type': 'size', value: { size: 99, unit: 'px' } } } },
          ],
        },
      },
    }];
    const inFile  = tmpFile('scale-existing-in.json', treeWithTablet);
    const outFile = tmpFile('scale-existing-out.json');
    run('auto-scale-responsive.js', [inFile, outFile]);
    const result = readJson(outFile);
    const tabletVariant = result[0].styles.sh2.variants.find(v => v.meta?.breakpoint === 'tablet');
    assert.equal(tabletVariant.props['font-size'].value.size, 99, 'Existing tablet variant must not be overwritten');
  });
});

// ── 5. verify-build-binding (Invariant I + gc- filter) ───────────────────

describe('verify-build-binding', () => {
  test('passes when all local styles are bound', () => {
    const dump = {
      content: [{
        id: 'el1',
        widgetType: 'e-heading',
        settings: { classes: { '$$type': 'classes', value: ['shero'] } },
        styles: {
          shero: { '$$type': 'heading', variants: [] },
        },
      }],
    };
    const dumpFile = tmpFile('binding-ok.json', dump);
    const result = run('verify-build-binding.js', [dumpFile]);
    assert.ok(result.stdout.includes('SUCCESS') || result.ok, 'Should pass with all styles bound');
  });

  test('fails when local style not in classes', () => {
    const dump = {
      content: [{
        id: 'el2',
        widgetType: 'e-heading',
        settings: { classes: { '$$type': 'classes', value: [] } },
        styles: {
          shero: { '$$type': 'heading', variants: [] },
        },
      }],
    };
    const dumpFile = tmpFile('binding-fail.json', dump);
    const result = run('verify-build-binding.js', [dumpFile], { expectFail: true });
    assert.ok(!result.ok || result.stdout.includes('WARNUNG') || result.stderr.includes('WARNUNG'),
      'Should fail / warn when style is unbound');
  });

  test('gc- prefixed styles do NOT trigger Invariant I violation', () => {
    const dump = {
      content: [{
        id: 'el3',
        widgetType: 'e-heading',
        settings: { classes: { '$$type': 'classes', value: ['shero'] } },
        styles: {
          shero: { '$$type': 'heading', variants: [] },
          'gc-text-xl': { '$$type': 'heading', variants: [] }, // gc- global class: no binding required
        },
      }],
    };
    const dumpFile = tmpFile('binding-gc.json', dump);
    const result = run('verify-build-binding.js', [dumpFile]);
    assert.ok(result.ok, 'gc- prefixed styles should not trigger Invariant I violation');
  });
});

// ── 6. framer-pre-build-validate (g5 + g12) ───────────────────────────────

describe('framer-pre-build-validate', () => {
  test('passes a clean V4 tree', () => {
    const tree = [{
      widgetType: 'e-flexbox',
      id: 'section1',
      settings: {
        classes: { '$$type': 'classes', value: ['ssection'] },
        tag: 'section',
      },
      styles: {
        ssection: {
          '$$type': 'flexbox',
          variants: [{
            meta: { breakpoint: null, state: null },
            props: { 'flex-direction': { '$$type': 'string', value: 'column' } },
          }],
        },
      },
    }];
    const treeFile = tmpFile('validate-ok.json', tree);
    const outFile = tmpFile('validate-ok-report.json');
    const result = run('framer-pre-build-validate.js', ['--tree', treeFile, '--output', outFile]);
    const report = readJson(outFile);
    assert.ok(report.meta.score >= 85, `Score should be >= 85, got ${report.meta.score}`);
    assert.equal(report.summary.status, 'OK');
  });

  test('g5 catches unbound style IDs', () => {
    const tree = [{
      widgetType: 'e-heading',
      id: 'h1',
      settings: {
        classes: { '$$type': 'classes', value: [] }, // missing shero
        tag: 'h1',
        title: { '$$type': 'html-v3', value: { content: { '$$type': 'string', value: 'Hello' } } },
      },
      styles: {
        shero: { '$$type': 'heading', variants: [{ meta: { breakpoint: null, state: null }, props: {} }] },
      },
    }];
    const treeFile = tmpFile('validate-unbound.json', tree);
    const outFile = tmpFile('validate-unbound-report.json');
    run('framer-pre-build-validate.js', ['--tree', treeFile, '--output', outFile], { expectFail: true });
    const report = readJson(outFile);
    const g5 = report.guards.find(g => g.id === 'STYLE_CLASSES_BINDING');
    assert.equal(g5.status, 'FAIL', 'g5 should fail for unbound style');
  });

  test('g12 catches image-src with both id and url set', () => {
    const tree = [{
      widgetType: 'e-image',
      id: 'img1',
      settings: {
        classes: { '$$type': 'classes', value: ['simg'] },
        'image-src': { '$$type': 'image-src', id: 42, url: 'https://example.com/img.jpg' },
      },
      styles: {
        simg: { '$$type': 'image', variants: [{ meta: { breakpoint: null, state: null }, props: {} }] },
      },
    }];
    const treeFile = tmpFile('validate-img.json', tree);
    const outFile = tmpFile('validate-img-report.json');
    run('framer-pre-build-validate.js', ['--tree', treeFile, '--output', outFile], { expectFail: true });
    const report = readJson(outFile);
    const g12 = report.guards.find(g => g.id === 'IMAGE_SRC_FORMAT');
    assert.equal(g12.status, 'FAIL', 'g12 should fail when both id and url are set');
  });

  test('g12 does NOT fire multiple violations for same image-src node', () => {
    const tree = [{
      widgetType: 'e-image',
      id: 'img2',
      settings: {
        classes: { '$$type': 'classes', value: ['simg2'] },
        'image-src': { '$$type': 'image-src', id: 42, url: 'https://example.com/img.jpg' },
      },
      styles: {
        simg2: { '$$type': 'image', variants: [{ meta: { breakpoint: null, state: null }, props: {} }] },
      },
    }];
    const treeFile = tmpFile('validate-g12-dedup.json', tree);
    const outFile = tmpFile('validate-g12-dedup-report.json');
    run('framer-pre-build-validate.js', ['--tree', treeFile, '--output', outFile], { expectFail: true });
    const report = readJson(outFile);
    const g12 = report.guards.find(g => g.id === 'IMAGE_SRC_FORMAT');
    const violations = g12.details?.invalid || [];
    assert.ok(violations.length <= 2, `g12 should not fire more than 2 violations per node, got ${violations.length}`);
  });
});

// ── 7. design-token-extractor ─────────────────────────────────────────────

describe('design-token-extractor', () => {
  const SAMPLE_CSS = `
:root {
  --token-primary: #0e2a3b;
  --token-white: #ffffff;
  --token-accent: rgb(255, 198, 0);
  --font-heading: "Manrope", sans-serif;
}
  `.trim();

  test('extracts color tokens from CSS', () => {
    const cssFile  = tmpFile('tokens.css', SAMPLE_CSS);
    const outFile  = tmpFile('token-mapping.json');
    run('design-token-extractor.js', ['--css', cssFile, '--output', outFile], { expectFail: true });
    const mapping = readJson(outFile);
    assert.ok(mapping.colors, 'Should have colors object');
    const keys = Object.keys(mapping.colors);
    assert.ok(keys.some(k => k.includes('primary')), 'Should extract primary token');
  });

  test('generates variables-plan with MCP call structure', () => {
    const cssFile   = tmpFile('tokens2.css', SAMPLE_CSS);
    const planFile  = tmpFile('variables-plan.json');
    run('design-token-extractor.js', ['--css', cssFile, '--variables-plan', planFile], { expectFail: true });
    const plan = readJson(planFile);
    assert.ok(Array.isArray(plan.variables) || plan.calls || plan.create_calls || Object.keys(plan).length > 0,
      'variables-plan should not be empty');
  });
});

// ── 8. generate-global-classes ────────────────────────────────────────────

describe('generate-global-classes', () => {
  const TREE_WITH_DUPS = [{
    widgetType: 'e-heading',
    id: 'h1',
    settings: { classes: { '$$type': 'classes', value: ['stitle1'] }, tag: 'h1',
      title: { '$$type': 'html-v3', value: { content: { '$$type': 'string', value: 'A' } } } },
    styles: { stitle1: { '$$type': 'heading', variants: [{
      meta: { breakpoint: null, state: null },
      props: { 'font-size': { '$$type': 'size', value: { size: 52, unit: 'px' } }, 'font-weight': { '$$type': 'string', value: '800' } },
    }] } },
  }, {
    widgetType: 'e-heading',
    id: 'h2',
    settings: { classes: { '$$type': 'classes', value: ['stitle2'] }, tag: 'h2',
      title: { '$$type': 'html-v3', value: { content: { '$$type': 'string', value: 'B' } } } },
    styles: { stitle2: { '$$type': 'heading', variants: [{
      meta: { breakpoint: null, state: null },
      props: { 'font-size': { '$$type': 'size', value: { size: 52, unit: 'px' } }, 'font-weight': { '$$type': 'string', value: '800' } },
    }] } },
  }];

  test('detects duplicate styles and suggests GC', () => {
    const treeFile = tmpFile('gc-tree.json', TREE_WITH_DUPS);
    const outFile  = tmpFile('gc-plan.json');
    run('generate-global-classes.js', ['--tree', treeFile, '--output', outFile]);
    const plan = readJson(outFile);
    assert.ok(plan.suggested_classes !== undefined, 'Should produce suggested_classes array');
    assert.ok(plan.meta?.suggestedClasses >= 1, `Should find at least 1 GC suggestion, got ${plan.meta?.suggestedClasses}`);
  });
});

// ── 9. convert-xml-to-v4: Robustness (cross-project) ──────────────────────

describe('convert-xml-to-v4: cross-project robustness', () => {

  test('child-text-node: text between tags is extracted correctly', () => {
    const xml = `<Frame name="S"><Text name="Heading 1" font-size="68px">Real text content</Text></Frame>`;
    const xmlFile = tmpFile('ct1.xml', xml);
    const outFile = tmpFile('ct1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    const heading = tree.elements[0];
    assert.equal(heading.widgetType, 'e-heading', 'Should be e-heading');
    const content = heading.settings?.title?.value?.content?.value;
    assert.equal(content, 'Real text content', `Text content should be "Real text content", got "${content}"`);
  });

  test('multi-level pass-through: 3-deep chain is fully unwrapped', () => {
    const xml = `<Frame name="Root" stackGap="20px"><Frame name="W1"><Frame name="W2"><Frame name="W3"><Text name="H1">Deep</Text></Frame></Frame></Frame></Frame>`;
    const xmlFile = tmpFile('ml1.xml', xml);
    const outFile = tmpFile('ml1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    // Root has one direct child — the heading, not a wrapper
    assert.equal(tree.elements.length, 1, 'Root should have exactly 1 child after flattening');
    assert.equal(tree.elements[0].widgetType, 'e-heading', 'Direct child should be e-heading, not e-flexbox wrapper');
  });

  test('two-child container: is NOT flattened (has layout props or multiple children)', () => {
    const xml = `<Frame name="Row" stackDirection="horizontal"><Text name="A">One</Text><Text name="B">Two</Text></Frame>`;
    const xmlFile = tmpFile('tc1.xml', xml);
    const outFile = tmpFile('tc1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    assert.equal(tree.widgetType, 'e-flexbox', 'Multi-child container should remain e-flexbox');
    assert.equal(tree.elements.length, 2, 'Multi-child container should have 2 children');
  });

  test('SVG root: e-svg with svg-icon markup, no V4 children', () => {
    const xml = `<Frame name="Icons"><svg viewBox="0 0 100 100" width="24px" height="24px"><circle cx="50" cy="50" r="40"/></svg></Frame>`;
    const xmlFile = tmpFile('svg1.xml', xml);
    const outFile = tmpFile('svg1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    const svgNode = tree.elements[0];
    assert.equal(svgNode.widgetType, 'e-svg', 'SVG node should map to e-svg');
    assert.ok(svgNode.settings?.['svg-icon']?.value?.includes('<svg'), 'svg-icon should contain SVG markup');
    assert.ok(!svgNode.children || svgNode.children.length === 0, 'e-svg should have no V4 children');
  });

  test('duplicate widget IDs: same name yields unique IDs', () => {
    const xml = `<Frame name="Section"><Text name="Heading 1">A</Text><Text name="Heading 1">B</Text><Text name="Heading 1">C</Text></Frame>`;
    const xmlFile = tmpFile('dup1.xml', xml);
    const outFile = tmpFile('dup1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    const ids = tree.elements.map(c => c.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, `All widget IDs must be unique, got: ${ids.join(', ')}`);
  });

  test('duplicate style IDs: same name yields unique style keys', () => {
    const xml = `<Frame name="Section"><Text name="Title">A</Text><Text name="Title">B</Text></Frame>`;
    const xmlFile = tmpFile('dsid1.xml', xml);
    const outFile = tmpFile('dsid1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    const styleKeys = tree.elements.flatMap(c => Object.keys(c.styles || {}));
    const unique = new Set(styleKeys);
    assert.equal(unique.size, styleKeys.length, `All style IDs must be unique, got: ${styleKeys.join(', ')}`);
  });

  test('button with child-text: text from child node, not attrs.name', () => {
    const xml = `<Frame name="CTA" href="https://example.com">Get Started</Frame>`;
    const xmlFile = tmpFile('btn1.xml', xml);
    const outFile = tmpFile('btn1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    assert.equal(tree.widgetType, 'e-button', 'Should be e-button');
    const btnText = tree.settings?.text?.value?.content?.value;
    assert.equal(btnText, 'Get Started', `Button text should be "Get Started", got "${btnText}"`);
  });

  test('attr text takes priority over child-text', () => {
    const xml = `<Text name="H1" text="From Attr">From Child</Text>`;
    const xmlFile = tmpFile('prio1.xml', xml);
    const outFile = tmpFile('prio1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    const content = tree.settings?.title?.value?.content?.value;
    assert.equal(content, 'From Attr', `Attr text should win over child text, got "${content}"`);
  });

  test('no-text container: empty pass-through with no children produces e-flexbox', () => {
    const xml = `<Frame name="Empty"/>`;
    const xmlFile = tmpFile('empty1.xml', xml);
    const outFile = tmpFile('empty1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    assert.equal(tree.widgetType, 'e-flexbox', 'Empty frame should be e-flexbox');
    assert.ok(!tree.elements || tree.elements.length === 0, 'Empty frame should have no children');
  });

  // Regression: EMCP Bug-Fix #56 — e-paragraph prop heisst 'paragraph', nicht 'editor' oder 'text'
  test('e-paragraph: content stored in settings.paragraph (not settings.editor)', () => {
    const xml = `<Text name="Body paragraph">Some body text</Text>`;
    const xmlFile = tmpFile('para1.xml', xml);
    const outFile = tmpFile('para1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    assert.equal(tree.widgetType, 'e-paragraph', `Should be e-paragraph, got: ${tree.widgetType}`);
    // Must use 'paragraph' prop (Elementor V4 native)
    assert.ok(tree.settings?.paragraph !== undefined, 'settings.paragraph must exist');
    assert.equal(tree.settings?.editor, undefined, 'settings.editor must NOT exist (wrong prop name)');
    const content = tree.settings?.paragraph?.value?.content?.value;
    assert.equal(content, 'Some body text', `paragraph content should be "Some body text", got "${content}"`);
  });

  // Regression: wrapLink — Elementor V4 nutzt 'destination' + 'tag', nicht 'href'
  test('e-button link: uses destination+tag structure (not href)', () => {
    const xml = `<Frame name="CTA Button" href="https://cal.com/booking">Book Now</Frame>`;
    const xmlFile = tmpFile('link1.xml', xml);
    const outFile = tmpFile('link1-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    assert.equal(tree.widgetType, 'e-button', 'Should be e-button');
    const link = tree.settings?.link;
    assert.ok(link !== undefined, 'settings.link must exist for href buttons');
    assert.equal(link['$$type'], 'link', `link $$type should be 'link', got: ${link?.['$$type']}`);
    // V4 native: destination (not href)
    assert.ok(link.value?.destination !== undefined, 'link.value.destination must exist');
    assert.equal(link.value?.href, undefined, 'link.value.href must NOT exist (wrong key)');
    assert.equal(link.value?.destination?.['$$type'], 'url', `destination must be $$type:url`);
    assert.equal(link.value?.destination?.value, 'https://cal.com/booking', `destination URL wrong`);
    // V4 native: tag field
    assert.ok(link.value?.tag !== undefined, 'link.value.tag must exist');
    assert.equal(link.value?.tag?.['$$type'], 'string', `tag must be $$type:string`);
    assert.equal(link.value?.tag?.value, 'a', `tag value must be 'a'`);
  });

});

// ─── Suite 11: C2 Grid Detection (Strict Grid Mapping) ────────────────────

describe('C2: Strict Grid Mapping', () => {
  test('C2: display:grid → e-div-block', () => {
    const xml = `<Frame name="Stats" display="grid" stackGap="20px"><Text name="A">1</Text><Text name="B">2</Text><Text name="C">3</Text></Frame>`;
    const xmlFile = tmpFile('c2-grid.xml', xml);
    const outFile = tmpFile('c2-grid-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    assert.equal(tree.widgetType, 'e-div-block',
      `display:grid should produce e-div-block, got ${tree.widgetType}`);
  });

  test('C2: grid-template-columns → e-div-block', () => {
    const xml = `<Frame name="Gallery" grid-template-columns="1fr 1fr 1fr"><Text name="A">1</Text><Text name="B">2</Text></Frame>`;
    const xmlFile = tmpFile('c2-gtc.xml', xml);
    const outFile = tmpFile('c2-gtc-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    assert.equal(tree.widgetType, 'e-div-block',
      `grid-template-columns should produce e-div-block, got ${tree.widgetType}`);
  });    test('C2: no grid attr → still uses name-pattern heuristic', () => {
    const xml = `<Frame name="Gallery" stackDirection="horizontal"><Text name="A">1</Text><Text name="B">2</Text><Text name="C">3</Text></Frame>`;
    const xmlFile = tmpFile('c2-gallery.xml', xml);
    const outFile = tmpFile('c2-gallery-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--output', outFile]);
    const tree = readJson(outFile);
    // Gallery with 3 children → e-div-block via name heuristic (not broken by C2)
    assert.equal(tree.widgetType, 'e-div-block',
      `Gallery with 3 children should still use e-div-block via heuristic, got ${tree.widgetType}`);
  });
});

// ─── Suite 12: C4 Semantic GC Naming ────────────────────────────────────────

describe('C4: Semantic GC Naming', () => {
  test('C4: GC name uses semantic pattern with token map', async () => {
    const tree = [{
      widgetType: 'e-heading',
      id: 'h1',
      settings: { classes: { '$$type': 'classes', value: ['stitle1'] }, tag: 'h1',
        title: { '$$type': 'html-v3', value: { content: { '$$type': 'string', value: 'Hero' } } } },
      styles: { stitle1: { '$$type': 'heading', variants: [{
        meta: { breakpoint: null, state: null },
        props: {
          'font-size': { '$$type': 'size', value: { size: 60, unit: 'px' } },
          color: { '$$type': 'color', value: '#111111' },
        },
      }] } },
    }, {
      widgetType: 'e-heading',
      id: 'h2',
      settings: { classes: { '$$type': 'classes', value: ['stitle2'] }, tag: 'h2',
        title: { '$$type': 'html-v3', value: { content: { '$$type': 'string', value: 'Sub' } } } },
      styles: { stitle2: { '$$type': 'heading', variants: [{
        meta: { breakpoint: null, state: null },
        props: {
          'font-size': { '$$type': 'size', value: { size: 60, unit: 'px' } },
          color: { '$$type': 'color', value: '#111111' },
        },
      }] } },
    }];
    const treeFile = tmpFile('c4-tree.json', tree);
    const tokenFile = tmpFile('c4-tokens.json', {
      colors: { 'primary': { hex: '#111111', gv_id: 'e-gv-abc', label: 'primary' } },
      fonts: {},
      sizes: {},
    });
    const outFile = tmpFile('c4-gc-plan.json');
    run('generate-global-classes.js', ['--tree', treeFile, '--variables', tokenFile, '--output', outFile]);
    const plan = readJson(outFile);
    const gcNames = (plan.suggested_classes || []).map(gc => gc.name);
    // Should contain semantic names, not just gc-bg-1
    const hasSemanticName = gcNames.some(n => n.includes('text-xl-primary') || n.includes('text') || n.includes('surface'));
    assert.ok(hasSemanticName,
      `GC names should be semantic, got: ${gcNames.join(', ')}`);
  });
});

// ─── Suite 13: C5 Breakpoint-aware Scaling ─────────────────────────────────

describe('C5: Breakpoint-aware Scaling', () => {
  const bpData = {
    nodes: [{
      name: 'hero-headline',
      variants: [
        { meta: { breakpoint: null }, props: { 'font-size': { '$$type': 'size', value: { size: 80, unit: 'px' } } } },
        { meta: { breakpoint: 'tablet' }, props: { 'font-size': { '$$type': 'size', value: { size: 48, unit: 'px' } } } },
        { meta: { breakpoint: 'mobile' }, props: { 'font-size': { '$$type': 'size', value: { size: 32, unit: 'px' } } } },
      ],
    }],
  };

  test('C5: element-specific factors from breakpoints.json', () => {
    const tree = [{
      widgetType: 'e-heading',
      id: 'hero-headline',
      settings: { classes: { '$$type': 'classes', value: ['shead'] }, tag: 'h1',
        title: { '$$type': 'html-v3', value: { content: { '$$type': 'string', value: 'Hero' } } } },
      styles: {
        shead: {
          variants: [{
            meta: { breakpoint: null, state: null },
            props: { 'font-size': { '$$type': 'size', value: { size: 80, unit: 'px' } } },
          }],
        },
      },
    }];
    const treeFile = tmpFile('c5-tree.json', tree);
    const bpFile = tmpFile('c5-bp.json', bpData);
    const outFile = tmpFile('c5-out.json');
    run('auto-scale-responsive.js', ['--tree', treeFile, '--breakpoints', bpFile, '--output', outFile]);
    const result = readJson(outFile);
    const variants = result[0].styles.shead.variants;
    const tabletV = variants.find(v => v.meta?.breakpoint === 'tablet');
    // With breakpoints: 48/80 = 0.6 factor, so 80*0.6 = 48
    assert.ok(tabletV, 'Should inject tablet variant');
    assert.equal(tabletV.props['font-size'].value.size, 48,
      `Tablet size should be 48px from breakpoints, got ${tabletV.props['font-size'].value.size}`);
  });

  test('C5: falls back to default factors without breakpoints.json', () => {
    const tree = [{
      widgetType: 'e-heading',
      id: 'h2',
      settings: { classes: { '$$type': 'classes', value: ['sh2'] }, tag: 'h2',
        title: { '$$type': 'html-v3', value: { content: { '$$type': 'string', value: 'Sub' } } } },
      styles: {
        sh2: {
          variants: [{
            meta: { breakpoint: null, state: null },
            props: { 'font-size': { '$$type': 'size', value: { size: 40, unit: 'px' } } },
          }],
        },
      },
    }];
    const treeFile = tmpFile('c5-fb-tree.json', tree);
    const outFile = tmpFile('c5-fb-out.json');
    run('auto-scale-responsive.js', ['--tree', treeFile, '--output', outFile]);
    const result = readJson(outFile);
    const variants = result[0].styles.sh2.variants;
    const mobileV = variants.find(v => v.meta?.breakpoint === 'mobile');
    // Without breakpoints: 40 * 0.6 = 24
    assert.ok(mobileV, 'Should inject mobile variant');
    assert.equal(mobileV.props['font-size'].value.size, 24,
      `Mobile size should be 24px (40*0.6), got ${mobileV.props['font-size'].value.size}`);
  });
});

// ─── Suite 14: C6 Token-to-GV Substitution ─────────────────────────────────

describe('C6: Token-to-GV Substitution', () => {
  test('C6: hardcoded color → gv-color when token has gv_id', () => {
    const xml = `<Text name="Heading" text="Hello" font-size="48px" color="#111111"/>`;
    const xmlFile = tmpFile('c6-c1.xml', xml);
    const tokenFile = tmpFile('c6-t1.json', {
      colors: { 'primary': { hex: '#111111', gv_id: 'e-gv-abc123' } },
      fonts: {},
      sizes: {},
    });
    const outFile = tmpFile('c6-v4.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--tokens', tokenFile, '--output', outFile]);
    const tree = readJson(outFile);
    const color = tree.styles[Object.keys(tree.styles)[0]].variants[0].props.color;
    assert.equal(color['$$type'], 'global-color-variable',
      `Color should be $$type:global-color-variable after substitution, got ${color['$$type']}`);
    assert.equal(color.value, 'e-gv-abc123',
      `Color value should be e-gv-abc123, got ${color.value}`);
  });

  test('C6: color without gv_id stays as hardcoded', () => {
    const xml = `<Text name="Heading" text="Hello" font-size="48px" color="#222222"/>`;
    const xmlFile = tmpFile('c6-c2.xml', xml);
    const tokenFile = tmpFile('c6-t2.json', {
      colors: { 'primary': { hex: '#111111', gv_id: null } },
      fonts: {},
      sizes: {},
    });
    const outFile = tmpFile('c6-v4-2.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--tokens', tokenFile, '--output', outFile]);
    const tree = readJson(outFile);
    const color = tree.styles[Object.keys(tree.styles)[0]].variants[0].props.color;
    // No gv_id for #222222 → stays as $$type:color
    assert.ok(color['$$type'] === 'color' || color.value === undefined || color.value?.startsWith('#'),
      `Color without gv_id should stay hardcoded, got: ${JSON.stringify(color)}`);
  });

  test('C6: font-family → gv-font when token has gv_id', () => {
    const xml = `<Text name="Heading" text="Hello" font-size="48px" font-family="Inter"/>`;
    const xmlFile = tmpFile('c6-f1.xml', xml);
    const tokenFile = tmpFile('c6-tf1.json', {
      colors: {},
      fonts: { 'inter': { family: 'Inter', gv_id: 'e-gv-font-x' } },
      sizes: {},
    });
    const outFile = tmpFile('c6-v4-f1.json');
    run('convert-xml-to-v4.js', ['--xml', xmlFile, '--tokens', tokenFile, '--output', outFile]);
    const tree = readJson(outFile);
    const font = tree.styles[Object.keys(tree.styles)[0]].variants[0].props['font-family'];
    assert.equal(font['$$type'], 'global-font-variable',
      `font-family should be $$type:global-font-variable after substitution, got ${font['$$type']}`);
    assert.equal(font.value, 'e-gv-font-x');
  });
});

// ─── Suite 15: D3 GRID_VS_FLEXBOX_COVERAGE ────────────────────────────────

describe('D3: GRID_VS_FLEXBOX_COVERAGE', () => {
  const VALIDATE_SCRIPT = join(SCRIPTS, 'validate-v4-tree.js');

  test('D3: e-flexbox with flex-wrap:wrap → warning', () => {
    const tree = [{
      widgetType: 'e-flexbox',
      id: 'flex-wrap-container',
      settings: { classes: { '$$type': 'classes', value: ['sfw'] } },
      styles: {
        sfw: {
          variants: [{
            meta: { breakpoint: null, state: null },
            props: { 'flex-wrap': { '$$type': 'string', value: 'wrap' } },
          }],
        },
      },
      elements: [{ id: 'c1', widgetType: 'e-heading' }, { id: 'c2', widgetType: 'e-heading' }],
    }];
    const treeFile = tmpFile('d3-fw.json', tree);
    const result = run('validate-v4-tree.js', [treeFile, '--mode=warn'], { expectFail: false });
    const parsed = JSON.parse(result.stdout);
    const gridIssues = (parsed.warnings || []).filter(w => w.rule === 'GRID_VS_FLEXBOX');
    assert.ok(gridIssues.length > 0,
      `flex-wrap:wrap should trigger GRID_VS_FLEXBOX warning, got warnings: ${JSON.stringify(parsed.warnings)}`);
  });

  test('D3: e-flexbox with 4+ children → warning', () => {
    const tree = [{
      widgetType: 'e-flexbox',
      id: 'many-kids',
      settings: { classes: { '$$type': 'classes', value: ['smk'] } },
      styles: { smk: { variants: [{ meta: { breakpoint: null, state: null }, props: {} }] } },
      elements: [
        { id: 'c1', widgetType: 'e-heading' }, { id: 'c2', widgetType: 'e-heading' },
        { id: 'c3', widgetType: 'e-heading' }, { id: 'c4', widgetType: 'e-heading' },
      ],
    }];
    const treeFile = tmpFile('d3-4c.json', tree);
    const result = run('validate-v4-tree.js', [treeFile, '--mode=warn'], { expectFail: false });
    const parsed = JSON.parse(result.stdout);
    const gridIssues = (parsed.warnings || []).filter(w => w.rule === 'GRID_VS_FLEXBOX');
    assert.ok(gridIssues.length > 0,
      `4+ children should trigger GRID_VS_FLEXBOX warning, got warnings: ${JSON.stringify(parsed.warnings)}`);
  });

  test('D3: e-flexbox with <4 children and no wrap → no warning', () => {
    const tree = [{
      widgetType: 'e-flexbox',
      id: 'few-kids',
      settings: { classes: { '$$type': 'classes', value: ['sfk'] } },
      styles: { sfk: { variants: [{ meta: { breakpoint: null, state: null }, props: {} }] } },
      elements: [{ id: 'c1', widgetType: 'e-heading' }, { id: 'c2', widgetType: 'e-heading' }],
    }];
    const treeFile = tmpFile('d3-ok.json', tree);
    const result = run('validate-v4-tree.js', [treeFile, '--mode=warn'], { expectFail: false });
    const parsed = JSON.parse(result.stdout);
    const gridIssues = (parsed.warnings || []).filter(w => w.rule === 'GRID_VS_FLEXBOX');
    assert.equal(gridIssues.length, 0,
      `e-flexbox with 2 children should not trigger GRID_VS_FLEXBOX`);
  });
});


describe('validate-v4-tree: DOM depth check (C7)', () => {
  const VALIDATE_SCRIPT = join(SCRIPTS, 'validate-v4-tree.js');

  /** Builds a nested element tree of the given depth. */
  function buildNestedTree(depth) {
    function makeNode(d) {
      const node = { id: `node-d${d}`, widgetType: 'e-flexbox', settings: {}, styles: {}, elements: [] };
      if (d > 0) node.elements.push(makeNode(d - 1));
      return node;
    }
    return [makeNode(depth)];
  }

  test('C7: tree depth 3 → no warnings, no errors', () => {
    const tree = buildNestedTree(3);
    const treeFile = tmpFile('depth3.json', JSON.stringify(tree));
    const result = run('validate-v4-tree.js', [treeFile, '--mode=warn'], { expectFail: false });
    const parsed = JSON.parse(result.stdout);
    // DOM-DEPTH must not appear in errors or warnings arrays
    const allIssues = [...(parsed.errors ?? []), ...(parsed.warnings ?? [])];
    const domDepthIssues = allIssues.filter(i => i.rule === 'DOM-DEPTH');
    assert.equal(domDepthIssues.length, 0,
      `Depth-3 tree should not trigger DOM-DEPTH, got: ${JSON.stringify(domDepthIssues)}`);
  });

  test('C7: tree depth 6 → DOM-DEPTH error reported', () => {
    const tree = buildNestedTree(6);
    const treeFile = tmpFile('depth6.json', JSON.stringify(tree));
    const result = run('validate-v4-tree.js', [treeFile, '--mode=warn'], { expectFail: false });
    const parsed = JSON.parse(result.stdout);
    const allIssues = [...(parsed.errors ?? []), ...(parsed.warnings ?? [])];
    const domDepthIssues = allIssues.filter(i => i.rule === 'DOM-DEPTH');
    assert.ok(domDepthIssues.length > 0,
      `Depth-6 tree should trigger DOM-DEPTH error, got errors: ${JSON.stringify(parsed.errors)}`);
    assert.ok(domDepthIssues[0].message.includes('6'),
      `DOM-DEPTH message should mention depth 6, got: ${domDepthIssues[0].message}`);
  });
});
