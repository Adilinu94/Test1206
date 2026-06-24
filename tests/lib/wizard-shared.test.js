/**
 * tests/lib/wizard-shared.test.js
 * Unit-Tests für shared.js — runParallel() + findFramerExportDir()
 *
 * Deckt ab:
 *   - findFramerExportDir: CLI-Priorität (package.json), FRAMER_EXPORT_DIR env,
 *     Fallback auf data-only dir, null-Rückgabe bei keinen Kandidaten
 *   - runParallel: parallele Ausführung, required/optional Fehlerbehandlung,
 *     Rückgabeformat {description, ok, error}, nie-throwing
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  findFramerExportDir,
  runParallel,
  nodeBin,
  findWorkspaceRoot,
} from '../../scripts/wizard/shared.js';

// ─────────────────────────────────────────────
// findFramerExportDir
// ─────────────────────────────────────────────

test('findFramerExportDir: FRAMER_EXPORT_DIR env var takes priority', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-test-'));
  try {
    process.env.FRAMER_EXPORT_DIR = tmp;
    const result = findFramerExportDir('/nonexistent');
    assert.equal(path.resolve(result), path.resolve(tmp));
  } finally {
    delete process.env.FRAMER_EXPORT_DIR;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('findFramerExportDir: prefers CLI directory (with package.json) over data-only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-root-'));
  try {
    // Create data-only dir (no package.json)
    const dataDir = path.join(root, 'FramerExport');
    fs.mkdirSync(dataDir, { recursive: true });

    // Create CLI dir (with package.json)
    const cliDir = path.join(root, 'tools', 'framer-export');
    fs.mkdirSync(cliDir, { recursive: true });
    fs.writeFileSync(path.join(cliDir, 'package.json'), '{}');

    const result = findFramerExportDir(root);
    assert.equal(path.resolve(result), path.resolve(cliDir),
      'Should prefer tools/framer-export with package.json');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('findFramerExportDir: falls back to data-only dir when no package.json exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-root-'));
  try {
    const dataDir = path.join(root, 'FramerExport');
    fs.mkdirSync(dataDir, { recursive: true });

    const result = findFramerExportDir(root);
    assert.equal(path.resolve(result), path.resolve(dataDir),
      'Should fall back to FramerExport dir without package.json');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('findFramerExportDir: returns null when no candidates exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-root-'));
  try {
    const result = findFramerExportDir(root);
    assert.equal(result, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('findFramerExportDir: skips falsy FRAMER_EXPORT_DIR values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-root-'));
  try {
    // Empty string should be filtered out via .filter(Boolean)
    process.env.FRAMER_EXPORT_DIR = '';
    const result = findFramerExportDir(root);
    assert.equal(result, null);
  } finally {
    delete process.env.FRAMER_EXPORT_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('findFramerExportDir: CLI dir with both FramerExport and tools/framer-export picks tools/framer-export', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-root-'));
  try {
    // Both exist but only tools/framer-export has package.json
    const feDir = path.join(root, 'FramerExport');
    fs.mkdirSync(feDir, { recursive: true });

    const toolsDir = path.join(root, 'tools', 'framer-export');
    fs.mkdirSync(toolsDir, { recursive: true });
    fs.writeFileSync(path.join(toolsDir, 'package.json'), '{}');

    const result = findFramerExportDir(root);
    assert.equal(path.resolve(result), path.resolve(toolsDir));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────
// runParallel
// ─────────────────────────────────────────────

test('runParallel: all required tasks succeed → all ok:true', async () => {
  const results = await runParallel([
    { command: nodeBin, args: ['-e', '42'], description: 'task-a' },
    { command: nodeBin, args: ['-e', '84'], description: 'task-b' },
  ]);
  assert.equal(results.length, 2);
  assert.ok(results.every(r => r.ok));
  assert.equal(results[0].description, 'task-a');
  assert.equal(results[1].description, 'task-b');
});

test('runParallel: optional task failure → ok:false, no throw', async () => {
  const results = await runParallel([
    { command: nodeBin, args: ['-e', '42'], description: 'ok-task' },
    {
      command: nodeBin, args: ['-e', 'throw new Error("expected")'], description: 'fail-task',
      optional: true, cwd: process.cwd(),
    },
  ]);
  assert.equal(results.length, 2);
  assert.ok(results[0].ok, 'ok-task should succeed');
  assert.equal(results[0].description, 'ok-task');

  assert.equal(results[1].ok, false, 'fail-task should report failure');
  assert.equal(results[1].description, 'fail-task');
  assert.ok(results[1].error, 'should have error message');
});

test('runParallel: required task failure → ok:false, does NOT throw', async () => {
  // runParallel should never throw — it returns results even for required failures
  const results = await runParallel([
    {
      command: nodeBin, args: ['-e', 'process.exit(1)'], description: 'required-fail',
      optional: false, cwd: process.cwd(),
    },
    { command: nodeBin, args: ['-e', '42'], description: 'also-runs' },
  ]);
  assert.equal(results.length, 2);
  assert.equal(results[0].ok, false, 'required failure should return ok:false');
  assert.equal(results[0].description, 'required-fail');
  assert.ok(results[0].error, 'should have error message');
  // Second task should still run (true parallelism)
  assert.ok(results[1].ok, 'second task should also complete');
  assert.equal(results[1].description, 'also-runs');
});

test('runParallel: mixed required + optional → both run in parallel', async () => {
  const results = await runParallel([
    { command: nodeBin, args: ['-e', '42'], description: 'req-1' },
    {
      command: nodeBin, args: ['-e', 'process.exit(1)'], description: 'opt-fail',
      optional: true, cwd: process.cwd(),
    },
    { command: nodeBin, args: ['-e', '84'], description: 'req-2' },
  ]);
  assert.equal(results.length, 3);
  assert.ok(results[0].ok);
  assert.equal(results[0].description, 'req-1');
  assert.equal(results[1].ok, false);
  assert.equal(results[1].description, 'opt-fail');
  assert.ok(results[2].ok);
  assert.equal(results[2].description, 'req-2');
});

test('runParallel: stdout is not returned (runFile returns stdout, but runParallel returns structured)', async () => {
  const results = await runParallel([
    { command: nodeBin, args: ['-e', 'process.stdout.write("hello")'], description: 'stdout-test' },
  ]);
  assert.equal(results.length, 1);
  assert.ok(results[0].ok);
  // The runParallel result should be {description, ok} — no stdout field
  assert.equal(results[0].stdout, undefined);
});

test('runParallel: empty tasks array → empty results', async () => {
  const results = await runParallel([]);
  assert.equal(results.length, 0);
  assert.ok(Array.isArray(results));
});

test('runParallel: handles absent cwd gracefully', async () => {
  const results = await runParallel([
    { command: nodeBin, args: ['-e', '42'], description: 'no-cwd-task' },
  ]);
  assert.equal(results.length, 1);
  assert.ok(results[0].ok);
});

test('runParallel: preserves insertion order in results', async () => {
  const descriptions = ['alpha', 'beta', 'gamma', 'delta'];
  const results = await runParallel(
    descriptions.map(d => ({ command: nodeBin, args: ['-e', '42'], description: d })),
  );
  assert.equal(results.length, 4);
  for (let i = 0; i < descriptions.length; i++) {
    assert.equal(results[i].description, descriptions[i],
      `Result at index ${i} should be "${descriptions[i]}"`);
  }
});

test('runParallel: optional tasks with zero-length → all required', async () => {
  // All tasks are required (no optional flag) — they should all run
  const tasks = Array.from({ length: 5 }, (_, i) => ({
    command: nodeBin, args: ['-e', String(i)], description: `task-${i}`,
  }));
  const results = await runParallel(tasks);
  assert.equal(results.length, 5);
  assert.ok(results.every(r => r.ok));
});

test('runParallel: all optional failing → all ok:false', async () => {
  const tasks = Array.from({ length: 3 }, (_, i) => ({
    command: nodeBin, args: ['-e', 'process.exit(1)'],
    description: `fail-${i}`, optional: true, cwd: process.cwd(),
  }));
  const results = await runParallel(tasks);
  assert.equal(results.length, 3);
  assert.ok(results.every(r => !r.ok));
  assert.ok(results.every(r => r.error));
});

// ─────────────────────────────────────────────
// Zusatz: findWorkspaceRoot smoke test
// ─────────────────────────────────────────────

test('findWorkspaceRoot: returns a string path that exists', () => {
  const root = findWorkspaceRoot();
  assert.equal(typeof root, 'string');
  assert.ok(root.length > 0);
  // Should resolve to a path containing framer-v4-pipeline-v2-main or the parent
  assert.ok(fs.existsSync(root), `Root path should exist: ${root}`);
});

test('findWorkspaceRoot: respects FRAMER_PIPELINE_ROOT env var', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-root-'));
  try {
    process.env.FRAMER_PIPELINE_ROOT = tmp;
    const root = findWorkspaceRoot();
    assert.equal(path.resolve(root), path.resolve(tmp));
  } finally {
    delete process.env.FRAMER_PIPELINE_ROOT;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
