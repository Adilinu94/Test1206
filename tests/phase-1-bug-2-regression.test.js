/**
 * tests/phase-1-bug-2-regression.test.js
 *
 * Regression tests for Phase 1 Bug #2: Atomic widget elType.
 *
 * Background (E2E-Test 2026-06-15):
 *   The Framer → V4 converter produced e-component instances with
 *   elType="e-component" instead of elType="widget" + widgetType="e-component".
 *   Elementor 4.1.0-beta1's Props_Parser rejects non-standard elType values for
 *   atomic widgets — only "e-flexbox" and "e-div-block" are valid as elType.
 *   Everything else (e-heading, e-paragraph, e-button, e-image, e-svg,
 *   e-component, e-divider) must use elType="widget".
 *
 * Source: Working-Pages 1953/1859/1950 (Elementor 4.1.0-beta1, no e-component
 *   instances, but cross-validated with elementor-get-schema for e-component)
 *   + Builder-Output hero-only-v4-fixed.json (42 e-components, all with bug).
 *
 * Phase 1 Fix: removed 'e-component' from ATOMIC_ELEMENT_TYPES in
 *   scripts/convert-xml-to-v4.js (line 670 area). See commit `fix: phase 1
 *   bug #2 — e-component elType`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// Minimal XML triggering e-component conversion. Framer Component instances
// expose componentId + componentName on the root node — the converter
// routes those to widgetType='e-component'.
const FRAMER_XML_WITH_COMPONENT = `<Frame componentId="abc123def" componentName="MyButton" name="Root">
  <Frame name="Child">
    <Frame componentId="xyz789" componentName="InnerComponent" name="Inner"></Frame>
  </Frame>
</Frame>`;

test('Phase 1 Bug #2: e-component elType is "widget", not "e-component"', async () => {
  const { spawnSync } = await import('node:child_process');
  const out = resolve(ROOT, 'tmp', 'phase-1-bug-2-output.json');
  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/convert-xml-to-v4.js'),
    '--xml-string', FRAMER_XML_WITH_COMPONENT,
    '--output', out,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, `converter exited non-zero:\n${result.stderr}`);

  const tree = JSON.parse(readFileSync(out, 'utf8'));
  const arr = Array.isArray(tree) ? tree : [tree];

  const ecompNodes = [];
  function walk(n) {
    if (!n) return;
    if (n.widgetType === 'e-component') ecompNodes.push(n);
    if (Array.isArray(n.elements)) n.elements.forEach(walk);
  }
  arr.forEach(walk);

  assert.ok(ecompNodes.length >= 1, 'expected at least one e-component in output');
  for (const node of ecompNodes) {
    assert.equal(node.elType, 'widget', `e-component node has elType='${node.elType}', must be 'widget'`);
    assert.equal(node.widgetType, 'e-component', 'widgetType must be preserved');
    assert.equal(node.type, 'e-component', 'type must be preserved');
  }
});

test('Phase 1 Bug #2: e-flexbox and e-div-block keep element-type elType', async () => {
  const { spawnSync } = await import('node:child_process');
  const out = resolve(ROOT, 'tmp', 'phase-1-bug-2-containers.json');
  const xml = `<Frame name="Root">
    <Frame name="ContainerA" stackDirection="vertical" name="ContainerA">
      <Frame name="GridChild" display="grid"></Frame>
    </Frame>
  </Frame>`;
  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/convert-xml-to-v4.js'),
    '--xml-string', xml,
    '--output', out,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, `converter exited non-zero:\n${result.stderr}`);

  const tree = JSON.parse(readFileSync(out, 'utf8'));
  const arr = Array.isArray(tree) ? tree : [tree];

  const containers = [];
  function walk(n) {
    if (!n) return;
    if (n.widgetType === 'e-flexbox' || n.widgetType === 'e-div-block') containers.push(n);
    if (Array.isArray(n.elements)) n.elements.forEach(walk);
  }
  arr.forEach(walk);

  assert.ok(containers.length >= 1, 'expected at least one e-flexbox/e-div-block');
  for (const node of containers) {
    // Containers SHOULD keep their element-type elType — this is the inverse
    // invariant of the bug fix.
    assert.equal(node.elType, node.widgetType,
      `${node.widgetType} should have elType='${node.widgetType}', got '${node.elType}'`);
  }
});

test('Phase 1 Bug #2: e-heading keeps elType=widget (regression check)', async () => {
  // e-heading was already correct pre-fix, but the inverse must still hold
  // after the fix: heading is a widget, not an element type.
  const { spawnSync } = await import('node:child_process');
  const out = resolve(ROOT, 'tmp', 'phase-1-bug-2-heading.json');
  const xml = `<Frame name="Root">
    <Frame name="TitleNode" text="Hello">Hello</Frame>
  </Frame>`;
  spawnSync('node', [
    resolve(ROOT, 'scripts/convert-xml-to-v4.js'),
    '--xml-string', xml,
    '--output', out,
  ], { encoding: 'utf8' });

  const tree = JSON.parse(readFileSync(out, 'utf8'));
  const arr = Array.isArray(tree) ? tree : [tree];

  let heading = null;
  function walk(n) {
    if (!n) return;
    if (n.widgetType === 'e-heading') heading = n;
    if (Array.isArray(n.elements)) n.elements.forEach(walk);
  }
  arr.forEach(walk);

  assert.ok(heading, 'expected e-heading node');
  assert.equal(heading.elType, 'widget', 'e-heading must have elType=widget');
});
