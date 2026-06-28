/**
 * tests/lib/pro-fallback.test.js
 *
 * Tests fuer scripts/lib/pro-fallback.js (UMBAUPLAN §4.3)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  detectProFeature,
  applyProFallback,
  maybeApplyProFallback,
  listProFeatures,
} = await import('../../scripts/lib/pro-fallback.js');

test('pro-fallback: Loop Grid → e-flexbox', () => {
  const det = detectProFeature({ name: 'Loop Grid', widgetType: 'loop-grid' });
  assert.equal(det.isProFeature, true);
  assert.equal(det.key, 'loop-grid');
  assert.equal(det.fallback.target_widget, 'e-flexbox');
});

test('pro-fallback: Form → Hinweis-Box (notice pattern)', () => {
  const det = detectProFeature({ name: 'Form', widgetType: 'form' });
  assert.equal(det.isProFeature, true);
  assert.equal(det.key, 'form');
  assert.equal(det.fallback.children_pattern, 'notice');
  assert.match(det.fallback.notice, /Pro/);
});

test('pro-fallback: Nav Menu → e-flexbox (menu-static)', () => {
  const det = detectProFeature({ name: 'Nav Menu', widgetType: 'nav-menu' });
  assert.equal(det.isProFeature, true);
  assert.equal(det.fallback.target_widget, 'e-flexbox');
  assert.equal(det.fallback.children_pattern, 'menu-static');
});

test('pro-fallback: Popup → nur Hinweis (kein target_widget)', () => {
  const det = detectProFeature({ name: 'Popup', widgetType: 'popup' });
  assert.equal(det.isProFeature, true);
  assert.equal(det.fallback.target_widget, null);
  assert.equal(det.fallback.children_pattern, 'notice-only');
});

test('pro-fallback: Theme Template → e-flexbox (template-static)', () => {
  const det = detectProFeature({ name: 'Theme Template Header', widgetType: 'theme-template' });
  assert.equal(det.isProFeature, true);
  assert.equal(det.fallback.children_pattern, 'template-static');
});

test('pro-fallback: Heading ist KEIN Pro-Feature', () => {
  const det = detectProFeature({ name: 'Heading', widgetType: 'e-heading' });
  assert.equal(det.isProFeature, false);
  assert.equal(det.fallback, null);
});

test('pro-fallback: Flexbox ist KEIN Pro-Feature', () => {
  const det = detectProFeature({ name: 'Flexbox', widgetType: 'e-flexbox' });
  assert.equal(det.isProFeature, false);
});

test('pro-fallback: maybeApplyProFallback applied=false bei Pro aktiv', () => {
  const r = maybeApplyProFallback({ name: 'Form', widgetType: 'form' }, { isProActive: true });
  assert.equal(r.applied, false);
  assert.equal(r.reason, 'pro-active');
});

test('pro-fallback: maybeApplyProFallback applied=true bei Pro inaktiv', () => {
  const r = maybeApplyProFallback({ name: 'Form', widgetType: 'form' }, { isProActive: false });
  assert.equal(r.applied, true);
  assert.ok(r.element);
  assert.equal(r.element.widgetType, 'e-flexbox');
  assert.equal(r.element._meta.is_pro_fallback, true);
});

test('pro-fallback: maybeApplyProFallback für Popup → notice-Marker', () => {
  const r = maybeApplyProFallback({ name: 'Popup', widgetType: 'popup' }, { isProActive: false });
  assert.equal(r.applied, true);
  assert.equal(r.element.type, 'notice');
  assert.match(r.element.notice, /Popup/);
});

test('pro-fallback: maybeApplyProFallback passthrough bei non-Pro', () => {
  const r = maybeApplyProFallback({ name: 'Heading', widgetType: 'e-heading' }, { isProActive: false });
  assert.equal(r.applied, false);
  assert.equal(r.element, null);
});

test('pro-fallback: listProFeatures liefert alle registrierten Fallbacks', () => {
  const features = listProFeatures();
  assert.ok(features.length >= 10, `Erwartet ≥10 Pro-Features, gefunden: ${features.length}`);
  const keys = features.map(f => f.key);
  assert.ok(keys.includes('loop-grid'));
  assert.ok(keys.includes('form'));
  assert.ok(keys.includes('nav-menu'));
  assert.ok(keys.includes('popup'));
  assert.ok(keys.includes('theme-template'));
});

test('pro-fallback: Mega Menu ist Nav-Menu-Variante', () => {
  const det = detectProFeature({ name: 'Mega Menu', widgetType: 'mega-menu' });
  assert.equal(det.isProFeature, true);
  assert.equal(det.key, 'mega-menu');
  assert.equal(det.fallback.children_pattern, 'menu-static');
});

test('pro-fallback: applyProFallback für Form erzeugt 2-children-Element (Heading + Paragraph)', () => {
  const det = detectProFeature({ name: 'Form', widgetType: 'form' });
  const el = applyProFallback({ name: 'Form', _detected_key: 'form' }, det.fallback);
  assert.equal(el.type, 'widget');
  assert.equal(el.widgetType, 'e-flexbox');
  assert.ok(Array.isArray(el.children));
  assert.equal(el.children.length, 2);
  assert.equal(el.children[0].widgetType, 'e-heading');
  assert.equal(el.children[1].widgetType, 'e-paragraph');
});
