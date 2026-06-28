/**
 * tests/lib/v4-tree-builder.test.js
 * UMBAUPLAN v2.0 Phase 1.1+1.3+1.4+1.5 — Regression-Tests
 *
 * Deckt ab:
 *   - Phase 1.1 (Fix #1+#2): elements-Key + elType:'widget' für atomic-widgets
 *   - Phase 1.3 (Fix #5):    wrapClasses → { $$type: 'classes', value: [...] }
 *   - Phase 1.4 (Fix #6):    buildStyleClass → variants[] mit custom_css:null
 *   - Phase 1.5 (Fix #7):    sanitizeStyleId — Invariante III
 *
 * Plus die 5 V4-Invarianten (I-V).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAtomicContainer,
  buildAtomicWidget,
  buildStyleClass,
  buildDesktopVariant,
  mapFramerStyleToV4Props,
  wrapClasses,
} from '../../scripts/lib/v4-tree-builder.js';
import { sanitizeStyleId, isValidStyleId } from '../../scripts/lib/framer-utils.js';

// ─────────────────────────────────────────────
// Phase 1.5 — sanitizeStyleId + Invariant III
// ─────────────────────────────────────────────

test('Phase 1.5 sanitizeStyleId: hyphen → underscore', () => {
  assert.equal(sanitizeStyleId('e-s-hero-title'), 'e_s_hero_title');
});

test('Phase 1.5 sanitizeStyleId: uppercase → lowercase', () => {
  assert.equal(sanitizeStyleId('MyHeroTitle'), 'myherotitle');
});

test('Phase 1.5 sanitizeStyleId: leading digit → prefix', () => {
  assert.equal(sanitizeStyleId('123node'), 'fe_123node');
});

test('Phase 1.5 sanitizeStyleId: special chars stripped', () => {
  assert.equal(sanitizeStyleId('hero@#section!'), 'herosection');
});

test('Phase 1.5 sanitizeStyleId: empty input → fallback', () => {
  assert.equal(sanitizeStyleId(''), 'fenode');
  assert.equal(sanitizeStyleId(null), 'fenode');
});

test('Phase 1.5 sanitizeStyleId: multiple underscores collapsed', () => {
  assert.equal(sanitizeStyleId('a___b___c'), 'a_b_c');
});

test('Phase 1.5 isValidStyleId: matches [a-z][a-z0-9_]*', () => {
  assert.equal(isValidStyleId('fehero'), true);
  assert.equal(isValidStyleId('fe_hero_1'), true);
  assert.equal(isValidStyleId('fe-hero'), false);
  assert.equal(isValidStyleId('feHero'), false);
  assert.equal(isValidStyleId('1hero'), false);
  assert.equal(isValidStyleId(''), false);
});

// ─────────────────────────────────────────────
// Phase 1.3 — wrapClasses
// ─────────────────────────────────────────────

test('Phase 1.3 wrapClasses: produces { $$type: "classes", value: [...] }', () => {
  const c = wrapClasses(['fehero', 'fesection']);
  assert.equal(c['$$type'], 'classes');
  assert.deepEqual(c.value, ['fehero', 'fesection']);
});

test('Phase 1.3 wrapClasses: sanitizes invalid IDs', () => {
  const c = wrapClasses(['e-s-hero', 'MyHero']);
  // Beide werden zu conform IDs umgewandelt
  assert.equal(c['$$type'], 'classes');
  for (const id of c.value) {
    assert.equal(isValidStyleId(id), true, `id "${id}" should be valid`);
  }
});

test('Phase 1.3 wrapClasses: empty array → empty value', () => {
  const c = wrapClasses([]);
  assert.deepEqual(c.value, []);
});

test('Phase 1.3 wrapClasses: non-array → empty', () => {
  const c = wrapClasses(null);
  assert.deepEqual(c.value, []);
});

// ─────────────────────────────────────────────
// Phase 1.1 — buildAtomicContainer (Fix #1 + #2)
// ─────────────────────────────────────────────

test('Phase 1.1 buildAtomicContainer: e-flexbox with elements-key + elType:e-flexbox', () => {
  const node = buildAtomicContainer({
    id: 'w1', tag: 'section', styleId: 'fesection', children: [{ id: 'c1' }],
  });
  assert.equal(node.elType, 'e-flexbox');
  assert.equal(node.widgetType, 'e-flexbox');
  assert.equal(node.type, 'e-flexbox');
  assert.ok(Array.isArray(node.elements), 'elements[] should be an array (NOT children)');
  assert.equal(node.elements.length, 1);
  assert.equal(node.settings.tag['$$type'], 'string');
  assert.equal(node.settings.tag.value, 'section');
});

test('Phase 1.1 buildAtomicContainer: e-div-block variant', () => {
  const node = buildAtomicContainer({
    id: 'w2', tag: 'div', styleId: 'fedivblock', widgetType: 'e-div-block',
  });
  assert.equal(node.elType, 'e-div-block');
  assert.equal(node.type, 'e-div-block');
  assert.equal(node.settings.tag.value, 'div');
});

test('Phase 1.1 buildAtomicContainer: styleId in settings.classes.value (Invariant I)', () => {
  const node = buildAtomicContainer({ id: 'w3', tag: 'div', styleId: 'fehero' });
  assert.deepEqual(node.settings.classes.value, ['fehero']);
  assert.ok(node.styles['fehero'], 'styles must contain the styleId key');
});

test('Phase 1.1 buildAtomicContainer: throws on invalid styleId (Invariant III)', () => {
  assert.throws(() => buildAtomicContainer({ id: 'w', tag: 'div', styleId: 'fe-hero' }));
});

// ─────────────────────────────────────────────
// Phase 1.1 — buildAtomicWidget (Fix #2)
// ─────────────────────────────────────────────

test('Phase 1.1 buildAtomicWidget: e-heading has elType:"widget" + widgetType:"e-heading"', () => {
  const node = buildAtomicWidget({
    id: 'h1', widgetType: 'e-heading', styleId: 'feh1', settings: {},
  });
  assert.equal(node.elType, 'widget');
  assert.equal(node.widgetType, 'e-heading');
  assert.equal(node.type, 'e-heading');
});

test('Phase 1.1 buildAtomicWidget: e-button includes wrapped text', () => {
  const node = buildAtomicWidget({
    id: 'b1', widgetType: 'e-button', styleId: 'febtn',
    settings: { text: { '$$type': 'html-v3', value: { content: { '$$type': 'string', value: 'Click me' } } } },
  });
  assert.equal(node.elType, 'widget');
  assert.equal(node.widgetType, 'e-button');
  assert.equal(node.settings.text['$$type'], 'html-v3');
  assert.equal(node.settings.text.value.content.value, 'Click me');
});

test('Phase 1.1 buildAtomicWidget: refuses container types', () => {
  assert.throws(() => buildAtomicWidget({ id: 'x', widgetType: 'e-flexbox', styleId: 'few' }));
  assert.throws(() => buildAtomicWidget({ id: 'x', widgetType: 'e-div-block', styleId: 'wed' }));
});

// ─────────────────────────────────────────────
// Phase 1.4 — buildStyleClass (Fix #6)
// ─────────────────────────────────────────────

test('Phase 1.4 buildStyleClass: default desktop variant has custom_css:null (Invariant V)', () => {
  const sc = buildStyleClass({ id: 'fehero' });
  assert.equal(sc.id, 'fehero');
  assert.equal(sc.type, 'class');
  assert.ok(Array.isArray(sc.variants));
  assert.equal(sc.variants.length, 1);
  assert.equal(sc.variants[0].meta.breakpoint, null);
  assert.equal(sc.variants[0].meta.state, null);
  assert.deepEqual(sc.variants[0].props, {});
  assert.equal(sc.variants[0].custom_css, null);
});

test('Phase 1.4 buildStyleClass: variants argument overrides default', () => {
  const sc = buildStyleClass({
    id: 'fehero',
    variants: [{
      meta: { breakpoint: 'tablet', state: 'hover' },
      props: { 'font-size': { '$$type': 'size', value: { size: 14, unit: 'px' } } },
      custom_css: { raw: '.cls { color: red; }' },
    }],
  });
  assert.equal(sc.variants.length, 1);
  assert.equal(sc.variants[0].meta.breakpoint, 'tablet');
  assert.equal(sc.variants[0].meta.state, 'hover');
  assert.equal(sc.variants[0].custom_css.raw, '.cls { color: red; }');
});

test('Phase 1.4 buildStyleClass: throws on invalid id (Invariant III)', () => {
  assert.throws(() => buildStyleClass({ id: 'fe-hero' }));
});

// ─────────────────────────────────────────────
// Phase 1.4 — mapFramerStyleToV4Props
// ─────────────────────────────────────────────

test('Phase 1.4 mapFramerStyleToV4Props: e-flexbox → display:flex + direction', () => {
  const props = mapFramerStyleToV4Props(
    { stackDirection: 'vertical', stackGap: '16px', padding: '12px' },
    'e-flexbox',
  );
  assert.equal(props.display['$$type'], 'string');
  assert.equal(props.display.value, 'flex');
  assert.equal(props['flex-direction'].value, 'column');
  assert.equal(props.gap['$$type'], 'size');
  assert.equal(props.gap.value.size, 16);
  assert.equal(props.padding['$$type'], 'dimensions');
});

test('Phase 1.4 mapFramerStyleToV4Props: e-heading typography', () => {
  const props = mapFramerStyleToV4Props(
    { 'font-size': '60px', 'font-weight': '700', 'font-family': 'Inter, sans-serif', color: '#111111' },
    'e-heading',
  );
  assert.equal(props['font-size'].value.size, 60);
  assert.equal(props['font-weight'].value, '700');
  assert.equal(props['font-family'].value, 'Inter');
  assert.equal(props.color.value, '#111111');
});

test('Phase 1.4 mapFramerStyleToV4Props: e-div-block → display:grid', () => {
  const props = mapFramerStyleToV4Props({}, 'e-div-block');
  assert.equal(props.display.value, 'grid');
});

test('Phase 1.4 mapFramerStyleToV4Props: border-radius 4-corner object', () => {
  const props = mapFramerStyleToV4Props({ borderRadius: '8px' }, 'e-button');
  assert.equal(props['border-radius']['$$type'], 'border-radius');
  assert.ok(props['border-radius'].value['start-start']);
  assert.ok(props['border-radius'].value['end-end']);
});

test('Phase 1.4 buildDesktopVariant: returns full variant structure', () => {
  const v = buildDesktopVariant(
    { stackDirection: 'horizontal', stackGap: '32px', padding: '20px' },
    'e-flexbox',
  );
  assert.equal(v.meta.breakpoint, null);
  assert.equal(v.meta.state, null);
  assert.equal(v.props.display.value, 'flex');
  assert.equal(v.custom_css, null); // Invariant V
});

// ─────────────────────────────────────────────
// Invarianten I-V — Cross-Cutting
// ─────────────────────────────────────────────

test('Invariant I: style.id ALWAYS in settings.classes.value (container)', () => {
  const node = buildAtomicContainer({ id: 'a', tag: 'div', styleId: 'fea' });
  assert.ok(node.styles[node.settings.classes.value[0]], 'style must exist in styles map');
});

test('Invariant I: style.id ALWAYS in settings.classes.value (widget)', () => {
  const node = buildAtomicWidget({ id: 'b', widgetType: 'e-heading', styleId: 'feb' });
  assert.ok(node.styles[node.settings.classes.value[0]]);
});

test('Invariant II: visual props NEVER leak into settings (only styles)', () => {
  const node = buildAtomicContainer({ id: 'c', tag: 'div', styleId: 'fec' });
  // settings darf KEINE color/padding/font-size keys haben
  for (const key of Object.keys(node.settings)) {
    assert.ok(
      ['classes', 'tag'].includes(key),
      `settings.${key} should not be a visual prop (Invariant II)`,
    );
  }
});

test('Invariant IV: image-src with id → no url-key', () => {
  // wrapImageSrc verhält sich konform — id-Form
  const node = buildAtomicWidget({
    id: 'd', widgetType: 'e-image', styleId: 'fed',
    settings: {
      image: {
        '$$type': 'image',
        value: {
          src: { '$$type': 'image-src', value: { id: 123 } },
          size: { '$$type': 'string', value: 'full' },
        },
      },
    },
  });
  const srcVal = node.settings.image.value.src.value;
  assert.equal(srcVal.id, 123);
  assert.equal(srcVal.url, undefined, 'url-key must NOT exist when id is set (Invariant IV)');
});

test('Invariant V: custom_css in buildStyleClass variants is always {raw: ...} or null', () => {
  const sc = buildStyleClass({ id: 'fee' });
  for (const v of sc.variants) {
    if (v.custom_css !== null) {
      assert.equal(typeof v.custom_css, 'object');
      assert.ok('raw' in v.custom_css, 'custom_css must be {raw: "..."} not plain string');
    }
  }
});
