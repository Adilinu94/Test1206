// tests/inspect-v4-schemas.test.js
// Verifies that the inspect-v4-schemas.js CLI:
//   1. runs without error against the bundled working-page fixtures
//   2. writes a valid aggregated schema file
//   3. detects no invariant violations in the working fixtures
//   4. includes all 6 atomic widget types (e-flexbox, e-div-block, e-heading, e-paragraph, e-button, e-image) in its element counts
//
// Run: node --test tests/inspect-v4-schemas.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'inspect-v4-schemas.js');
const TMP_OUTPUT = join(ROOT, 'tmp', 'test-v4-atomic-schema.json');

test('inspect-v4-schemas runs cleanly and writes the aggregated schema', async () => {
  await rm(TMP_OUTPUT, { force: true });
  const res = spawnSync(process.execPath, [
    SCRIPT,
    '--fixtures', join('tests', 'fixtures', 'v4-atomic', 'working-pages'),
    '--output', join('tmp', 'test-v4-atomic-schema.json'),
    '--strict',
  ], { encoding: 'utf8', cwd: ROOT });

  assert.equal(res.status, 0, `CLI exited ${res.status}\nstderr:\n${res.stderr}\nstdout:\n${res.stdout}`);
  const st = await stat(TMP_OUTPUT);
  assert.ok(st.size > 200, `output file is suspiciously small (${st.size} bytes)`);
});

test('aggregated schema has the expected shape', async () => {
  const raw = await readFile(TMP_OUTPUT, 'utf8');
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.source_fixtures) && data.source_fixtures.length >= 4, 'at least 4 fixtures');
  assert.equal(typeof data.element_counts.total, 'number');
  assert.ok(data.element_counts.total >= 6, 'at least 6 elements aggregated');
  assert.ok(typeof data.element_counts.per_widget_type === 'object');
  // All 6 atomic widget/container types we expect from the fixtures:
  for (const t of ['e-flexbox', 'e-div-block', 'e-heading', 'e-paragraph', 'e-button', 'e-image']) {
    assert.ok(
      data.element_counts.per_widget_type[t] > 0 || data.element_counts.per_elType[t] > 0,
      `expected ${t} in element counts`
    );
  }
  assert.ok(Array.isArray(data.responsive.breakpoints_observed), 'breakpoints array present');
  assert.ok(data.responsive.breakpoints_observed.includes('desktop'), 'desktop breakpoint observed');
  assert.ok(Array.isArray(data.invariant_violations));
  const hardViolations = data.invariant_violations.filter((v) => v.severity !== 'warn');
  assert.equal(hardViolations.length, 0, 'no working fixture should violate a hard invariant');
});

test('inspect-v4-schemas --strict fails when a fixture violates an invariant', async () => {
  const badDir = join(ROOT, 'tmp', 'test-bad-fixtures');
  await rm(badDir, { recursive: true, force: true });
  const { mkdir, writeFile: wf } = await import('node:fs/promises');
  await mkdir(badDir, { recursive: true });
  // Craft a fixture that violates fix-3-4 (e-heading.title is a plain string)
  const bad = {
    source: 'test',
    post_id: 9999,
    element: {
      id: 'bad-heading',
      elType: 'widget',
      widgetType: 'e-heading',
      settings: {
        title: 'plain string, not html-v3',
        classes: { $$type: 'classes', value: [] },
      },
      elements: [],
      styles: {},
    },
  };
  await wf(join(badDir, 'bad-heading.json'), JSON.stringify(bad));

  const res = spawnSync(process.execPath, [
    SCRIPT,
    '--fixtures', 'tmp/test-bad-fixtures',
    '--output', 'tmp/test-bad-schema.json',
    '--strict',
  ], { encoding: 'utf8', cwd: ROOT });

  assert.notEqual(res.status, 0, 'CLI should exit non-zero on a violation');
  assert.ok(/invariant violation/i.test(res.stderr + res.stdout), 'CLI should report the violation');
});
