/**
 * tests/lib/gsap-enqueue-snippet.test.js
 *
 * Unit tests for scripts/lib/gsap-enqueue-snippet.cjs
 * Validates:
 *  - Schema shape: title, type, code, location, priority, on_conflict, tags
 *  - PHP code: wp_enqueue_script calls are correct
 *  - GSAP version pinned to 3.12.5
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const snippet = require('../../scripts/lib/gsap-enqueue-snippet.cjs');

// ─── Schema shape ─────────────────────────────────────────────────────────────

test('gsap-enqueue-snippet: hat korrektes Schema (alle Pflichtfelder)', () => {
  assert.equal(typeof snippet, 'object', 'snippet muss ein Object sein');
  assert.ok(snippet.title, 'title muss gesetzt sein');
  assert.ok(snippet.type, 'type muss gesetzt sein');
  assert.ok(typeof snippet.code === 'string', 'code muss ein String sein');
  assert.ok(snippet.location, 'location muss gesetzt sein');
  assert.ok(typeof snippet.priority === 'number', 'priority muss eine Number sein');
  assert.ok(snippet.on_conflict, 'on_conflict muss gesetzt sein');
  assert.ok(Array.isArray(snippet.tags), 'tags muss ein Array sein');
  assert.ok(snippet.description, 'description muss gesetzt sein');
});

test('gsap-enqueue-snippet: type ist php', () => {
  assert.equal(snippet.type, 'php');
});

test('gsap-enqueue-snippet: title enthält GSAP', () => {
  assert.match(snippet.title, /GSAP/);
});

test('gsap-enqueue-snippet: location ist site_wide_header', () => {
  assert.equal(snippet.location, 'site_wide_header');
});

test('gsap-enqueue-snippet: priority ist 10', () => {
  assert.equal(snippet.priority, 10);
});

test('gsap-enqueue-snippet: on_conflict ist skip', () => {
  assert.equal(snippet.on_conflict, 'skip');
});

test('gsap-enqueue-snippet: tags enthalten erwartete Werte', () => {
  assert.ok(snippet.tags.includes('gsap'), 'tags muss gsap enthalten');
  assert.ok(snippet.tags.includes('enqueue'), 'tags muss enqueue enthalten');
  assert.ok(snippet.tags.includes('global'), 'tags muss global enthalten');
  assert.ok(snippet.tags.includes('critical'), 'tags muss critical enthalten');
});

// ─── PHP code validation ──────────────────────────────────────────────────────

test('gsap-enqueue-snippet: PHP code ruft wp_enqueue_script für GSAP Core auf', () => {
  assert.match(snippet.code, /wp_enqueue_script\(\s*['"]gsap-core['"]/);
});

test('gsap-enqueue-snippet: PHP code ruft wp_enqueue_script für ScrollTrigger auf', () => {
  assert.match(snippet.code, /wp_enqueue_script\(\s*['"]gsap-st['"]/);
});

test('gsap-enqueue-snippet: PHP code definiert enqueue_gsap_global Funktion', () => {
  assert.match(snippet.code, /function enqueue_gsap_global/);
});

test('gsap-enqueue-snippet: PHP code verwendet add_action für wp_enqueue_scripts', () => {
  assert.match(snippet.code, /add_action\(\s*['"]wp_enqueue_scripts['"]/);
});

test('gsap-enqueue-snippet: PHP code enthält add_action nach Funktionsdefinition', () => {
  const funcPos = snippet.code.indexOf('function enqueue_gsap_global');
  const actionPos = snippet.code.indexOf("add_action('wp_enqueue_scripts'");
  assert.ok(
    actionPos > funcPos,
    'add_action muss nach der Funktionsdefinition stehen'
  );
});

// ─── GSAP version pinning ─────────────────────────────────────────────────────

test('gsap-enqueue-snippet: GSAP Version 3.12.5 ist gepinnt (via cdn.jsdelivr.net)', () => {
  assert.match(
    snippet.code,
    /cdn\.jsdelivr\.net\/npm\/gsap@3\.12\.5\/dist\/gsap\.min\.js/
  );
});

test('gsap-enqueue-snippet: ScrollTrigger Version 3.12.5 ist gepinnt', () => {
  assert.match(
    snippet.code,
    /cdn\.jsdelivr\.net\/npm\/gsap@3\.12\.5\/dist\/ScrollTrigger\.min\.js/
  );
});

test('gsap-enqueue-snippet: GSAP Version String 3.12.5 erscheint als Versions-Parameter', () => {
  // Der 4. Parameter von wp_enqueue_script ist die Version
  // Beide Calls müssen '3.12.5' als Version übergeben
  const matches = snippet.code.match(/'3\.12\.5'/g);
  assert.ok(matches, 'Versions-String 3.12.5 muss im Code vorkommen');
  assert.ok(
    matches.length >= 2,
    `Version 3.12.5 muss mindestens 2× vorkommen (GSAP Core + ScrollTrigger), gefunden: ${matches?.length || 0}`
  );
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

test('gsap-enqueue-snippet: description erwähnt GSAP Core + ScrollTrigger', () => {
  assert.match(snippet.description, /GSAP Core/);
  assert.match(snippet.description, /ScrollTrigger/);
});

test('gsap-enqueue-snippet: code enthält keinen Syntax-Fehler-Indikator (keine ungeschlossenen Klammern)', () => {
  const openCurly  = (snippet.code.match(/\{/g) || []).length;
  const closeCurly = (snippet.code.match(/\}/g) || []).length;
  assert.equal(openCurly, closeCurly, 'PHP code: { und } müssen ausgeglichen sein');

  const openParen  = (snippet.code.match(/\(/g) || []).length;
  const closeParen = (snippet.code.match(/\)/g) || []).length;
  assert.equal(openParen, closeParen, 'PHP code: ( und ) müssen ausgeglichen sein');
});

test('gsap-enqueue-snippet: code verwendet korrekte Dependency-Reihenfolge (ScrollTrigger hängt von gsap-core ab)', () => {
  assert.match(
    snippet.code,
    /wp_enqueue_script\(\s*['"]gsap-st['"]\s*,\s*[^,]+,\s*\[\s*['"]gsap-core['"]\s*\]/
  );
});
