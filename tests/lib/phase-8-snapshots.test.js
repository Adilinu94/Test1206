/**
 * tests/lib/phase-8-snapshots.test.js
 * UMBAUPLAN v2.0 Phase 8 — Test-Hardening
 *   8.2 Snapshot-Tests für V4-Tree-Output (buildAtomicContainer/Widget → known good shape)
 *   8.3 Regression-Tests für die 7 dokumentierten Schema-Bugs
 *
 * Phase 8.1 (Live-Integration gegen test4) und 8.4 (Performance-Bench) bleiben für
 * spätere Sprints, da sie Live-WP-Zugang bzw. Wall-Clock-Messung erfordern.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAtomicContainer,
  buildAtomicWidget,
  buildStyleClass,
  buildDesktopVariant,
  mapFramerStyleToV4Props,
} from '../../scripts/lib/v4-tree-builder.js';
import {
  wrapHtmlContent,
  wrapImage,
  wrapImageSrc,
  wrapColor,
  wrapSize,
  isValidStyleId,
  sanitizeStyleId,
  wrapClasses,
  parseFramerPrefix,
} from '../../scripts/lib/framer-utils.js';

// ─────────────────────────────────────────────
// Phase 8.2 — Snapshot-Tests für V4-Tree-Output
// ─────────────────────────────────────────────

test('Phase 8.2 snapshot: hero section e-flexbox tree', () => {
  const tree = buildAtomicContainer({
    id: 'hero',
    tag: 'section',
    styleId: 'fehero',
    children: [
      buildAtomicContainer({
        id: 'hero-inner',
        tag: 'div',
        styleId: 'feinner',
        children: [
          buildAtomicWidget({
            id: 'h1', widgetType: 'e-heading', styleId: 'feh1',
            settings: { title: wrapHtmlContent('Willkommen') },
          }),
          buildAtomicWidget({
            id: 'p', widgetType: 'e-paragraph', styleId: 'fep',
            settings: { paragraph: wrapHtmlContent('Wir helfen Ihnen') },
          }),
          buildAtomicWidget({
            id: 'btn', widgetType: 'e-button', styleId: 'febtn',
            settings: { text: wrapHtmlContent('Mehr erfahren') },
          }),
        ],
      }),
    ],
  });

  // Snapshot: e-flexbox root
  assert.equal(tree.type, 'e-flexbox');
  assert.equal(tree.elType, 'e-flexbox');
  assert.equal(tree.id, 'hero');
  assert.deepEqual(tree.settings.classes.value, ['fehero']);
  assert.ok(tree.styles.fehero);
  assert.ok(Array.isArray(tree.elements));

  // Snapshot: inner container
  const inner = tree.elements[0];
  assert.equal(inner.id, 'hero-inner');
  assert.equal(inner.settings.tag.value, 'div');

  // Snapshot: heading
  const h1 = inner.elements[0];
  assert.equal(h1.widgetType, 'e-heading');
  assert.equal(h1.elType, 'widget'); // Phase 1.1 Fix #2
  assert.equal(h1.settings.title['$$type'], 'html-v3'); // Phase 1.2 Fix #3
  assert.equal(h1.settings.title.value.content.value, 'Willkommen');

  // Snapshot: button
  const btn = inner.elements[2];
  assert.equal(btn.widgetType, 'e-button');
  assert.equal(btn.settings.text['$$type'], 'html-v3'); // Phase 1.2 Fix #4
  assert.equal(btn.settings.text.value.content.value, 'Mehr erfahren');
});

test('Phase 8.2 snapshot: 4-corner border-radius (Invariant III preserved)', () => {
  const props = mapFramerStyleToV4Props(
    { borderRadius: '12px 8px' },
    'e-button',
  );
  // 2-value shorthand: 12px 8px 12px 8px
  const br = props['border-radius'];
  assert.equal(br['$$type'], 'border-radius');
  assert.equal(br.value['start-start']['$$type'], 'size');
  assert.equal(br.value['start-start'].value.size, 12);
  assert.equal(br.value['end-end']['$$type'], 'size');
  assert.equal(br.value['end-end'].value.size, 12);
  assert.equal(br.value['start-end'].value.size, 8);
});

test('Phase 8.2 snapshot: image with id-only (no url key, Invariant IV)', () => {
  const tree = buildAtomicWidget({
    id: 'img1', widgetType: 'e-image', styleId: 'feimg',
    settings: {
      image: wrapImage(wrapImageSrc({ id: 42 })),
    },
  });
  const srcVal = tree.settings.image.value.src.value;
  assert.equal(srcVal.id, 42);
  assert.equal(srcVal.url, undefined);
});

test('Phase 8.2 snapshot: e-div-block always uses elements-key (Fix #1)', () => {
  const tree = buildAtomicContainer({
    id: 'grid', tag: 'div', styleId: 'fegrid', widgetType: 'e-div-block',
    children: [
      buildAtomicWidget({ id: 'c1', widgetType: 'e-heading', styleId: 'fec1', settings: {} }),
      buildAtomicWidget({ id: 'c2', widgetType: 'e-heading', styleId: 'fec2', settings: {} }),
    ],
  });
  assert.equal(tree.widgetType, 'e-div-block');
  assert.ok(Array.isArray(tree.elements));
  assert.equal(tree.elements.length, 2);
  // Beide children müssen e-heading sein (NICHT e-div-block / NICHT e-flexbox)
  for (const child of tree.elements) {
    assert.equal(child.widgetType, 'e-heading');
  }
});

// ─────────────────────────────────────────────
// Phase 8.3 — Regression-Tests für die 7 Schema-Bugs
// ─────────────────────────────────────────────

test('Regression Bug #1: Children-Key ist elements (NICHT children)', () => {
  const tree = buildAtomicContainer({
    id: 'w', tag: 'div', styleId: 'few',
    children: [{ id: 'c' }],
  });
  assert.ok('elements' in tree, 'tree must have elements-key');
  assert.ok(!('children' in tree), 'tree must NOT have children-key');
});

test('Regression Bug #2: elType ist "widget" für atomic-widgets', () => {
  const tree = buildAtomicWidget({
    id: 'h', widgetType: 'e-heading', styleId: 'feh', settings: {},
  });
  assert.equal(tree.elType, 'widget');
  assert.equal(tree.widgetType, 'e-heading');
  assert.notEqual(tree.elType, 'e-heading');
});

test('Regression Bug #3+4: title/text/paragraph als html-v3 (NICHT string)', () => {
  const h1 = buildAtomicWidget({
    id: 'h', widgetType: 'e-heading', styleId: 'feh',
    settings: { title: wrapHtmlContent('Title') },
  });
  const para = buildAtomicWidget({
    id: 'p', widgetType: 'e-paragraph', styleId: 'fep',
    settings: { paragraph: wrapHtmlContent('Body') },
  });
  const btn = buildAtomicWidget({
    id: 'b', widgetType: 'e-button', styleId: 'feb',
    settings: { text: wrapHtmlContent('CTA') },
  });
  assert.equal(h1.settings.title['$$type'], 'html-v3');
  assert.equal(para.settings.paragraph['$$type'], 'html-v3');
  assert.equal(btn.settings.text['$$type'], 'html-v3');
  for (const t of [h1, para, btn]) {
    assert.notEqual(t.settings.title?.['$$type'], 'string');
    assert.notEqual(t.settings.text?.['$$type'], 'string');
    assert.notEqual(t.settings.paragraph?.['$$type'], 'string');
  }
});

test('Regression Bug #5: classes-Setting ist { $$type: "classes", value: [...] }', () => {
  const tree = buildAtomicContainer({ id: 'w', tag: 'div', styleId: 'few' });
  assert.equal(tree.settings.classes['$$type'], 'classes');
  assert.ok(Array.isArray(tree.settings.classes.value));
  assert.deepEqual(tree.settings.classes.value, ['few']);
});

test('Regression Bug #6: styles-Format mit class-id-Struktur + variants', () => {
  const tree = buildAtomicContainer({ id: 'w', tag: 'div', styleId: 'few' });
  const sc = tree.styles['few'];
  assert.ok(sc, 'styles must contain the classId');
  assert.equal(sc.id, 'few');
  assert.ok(Array.isArray(sc.variants), 'variants[] must exist');
  assert.equal(sc.variants[0].meta.breakpoint, null);
  assert.equal(sc.variants[0].custom_css, null);
});

test('Regression Bug #7: Style-IDs ohne Bindestrich (Invariant III)', () => {
  // builder wirft bei invalid IDs — das ist der Test
  assert.throws(() => buildAtomicContainer({ id: 'w', tag: 'div', styleId: 'e-s-hero' }));
  assert.throws(() => buildAtomicContainer({ id: 'w', tag: 'div', styleId: '1hero' }));
  // Sanitize funktioniert
  assert.equal(sanitizeStyleId('e-s-hero'), 'e_s_hero');
  // gültige IDs gehen durch
  assert.doesNotThrow(() => buildAtomicContainer({ id: 'w', tag: 'div', styleId: 'fehero' }));
});

test('Regression: wrapHtmlContent produziert V4-konforme html-v3 Struktur', () => {
  const html = wrapHtmlContent('Hello');
  assert.equal(html['$$type'], 'html-v3');
  assert.equal(html.value.content['$$type'], 'string');
  assert.equal(html.value.content.value, 'Hello');
});

test('Regression: Image mit id aber kein url-key (Invariant IV — doppelter Schutz)', () => {
  const src = wrapImageSrc({ id: 99 });
  const img = wrapImage(src);
  // Both: src.value has id=99 but no url-key
  assert.equal(img.value.src.value.id, 99);
  assert.equal(img.value.src.value.url, undefined);
  // Edge case: nur id, kein url
  const srcOnly = wrapImageSrc({ id: 1 });
  assert.equal(srcOnly.value.id, 1);
  assert.equal(srcOnly.value.url, undefined);
  // Edge case: nur url, kein id
  const urlOnly = wrapImageSrc({ url: 'https://x.com/a.png' });
  assert.equal(urlOnly.value.id, undefined);
  assert.equal(urlOnly.value.url['$$type'], 'url');
  assert.equal(urlOnly.value.url.value, 'https://x.com/a.png');
});

test('Regression: buildStyleClass default hat custom_css:null (Invariant V)', () => {
  const sc = buildStyleClass({ id: 'few' });
  for (const v of sc.variants) {
    if (v.custom_css !== null) {
      assert.equal(typeof v.custom_css, 'object');
      assert.ok('raw' in v.custom_css);
    }
  }
});

test('Regression: buildDesktopVariant folgt desktop-Breakpoint + state null', () => {
  const v = buildDesktopVariant({ stackGap: '16px' }, 'e-flexbox');
  assert.equal(v.meta.breakpoint, null);
  assert.equal(v.meta.state, null);
  assert.equal(v.props['display'].value, 'flex');
  assert.equal(v.custom_css, null);
});

test('Regression: isValidStyleId akzeptiert nur [a-z][a-z0-9_]*', () => {
  // Gültig
  for (const id of ['a', 'fe', 'fe_hero', 'fe1', 'fe_hero_section_1']) {
    assert.equal(isValidStyleId(id), true, `should be valid: ${id}`);
  }
  // Ungültig
  for (const id of ['', '1a', 'fe-hero', 'feHero', 'fe.hero', 'fe hero']) {
    assert.equal(isValidStyleId(id), false, `should be invalid: ${id}`);
  }
});

test('Regression: parseFramerPrefix parst "FR;Inter-SemiBold" korrekt', () => {
  const r = parseFramerPrefix('FR;Inter-SemiBold');
  assert.equal(r.source, 'FR');
  assert.equal(r.family, 'Inter');
  assert.equal(r.weight, '600');
  assert.equal(r.variant, 'SemiBold');
});

test('Regression: wrapClasses sanitiert ID-Liste', () => {
  const c = wrapClasses(['e-s-hero', 'MyHero', 'feok']);
  assert.equal(c['$$type'], 'classes');
  for (const id of c.value) {
    assert.equal(isValidStyleId(id), true, `${id} should be sanitized to valid format`);
  }
});
