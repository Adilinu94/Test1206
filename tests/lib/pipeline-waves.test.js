/**
 * tests/lib/pipeline-waves.test.js  —  v1.0.0
 *
 * UMBAUPLAN v2.0 Phase 5.3 — Pipeline-Wave-Tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runWave1FramerSource,
  runWave3Build,
  runWave4DeployQa,
} from '../../scripts/lib/pipeline-waves.js';

function makeFetcher(map) {
  return async (ability) => {
    if (map[ability]) return map[ability];
    throw new Error('no fetcher result for ' + ability);
  };
}

test('runWave1FramerSource: parallel fetcher calls + cache stats', async () => {
  const fetcher = makeFetcher({
    getProjectXml: { root: { id: 'p1' } },
    getColorStyles: [{ name: 'Primary' }],
    getTextStyles: [{ name: 'H1' }],
  });
  const r = await runWave1FramerSource({
    framerUrl: 'https://example.framer.app/',
    fetcher,
    options: { cacheRoot: './tmp-wave-test-1' },
  });
  assert.equal(r.results.length, 3);
  for (const op of r.results) {
    assert.equal(op.status, 'ok');
  }
  const projectXmlOp = r.results.find((o) => o.name === 'getProjectXml');
  assert.equal(projectXmlOp.result.xml.root.id, 'p1');
});

test('runWave1FramerSource: error in one op does not block others', async () => {
  const fetcher = async (ability) => {
    if (ability === 'getProjectXml') throw new Error('framer down');
    if (ability === 'getColorStyles') return [];
    if (ability === 'getTextStyles') return [];
    throw new Error('unknown');
  };
  const r = await runWave1FramerSource({
    framerUrl: 'https://x.framer.app/',
    fetcher,
    options: { cacheRoot: './tmp-wave-test-1e' },
  });
  const projectXml = r.results.find((o) => o.name === 'getProjectXml');
  assert.equal(projectXml.status, 'error');
  assert.match(projectXml.error, /framer down/);
  const colors = r.results.find((o) => o.name === 'colorStyles');
  assert.equal(colors.status, 'ok');
});

test('runWave3Build: sequential, stops at first failure', async () => {
  const calls = [];
  const r = await runWave3Build({
    runConvert: async () => { calls.push('convert'); return { v: 1 }; },
    runValidate: async () => { calls.push('validate-v4-tree'); throw new Error('validate fail'); },
    runFixStyles: async () => { calls.push('fix'); },
  });
  assert.deepEqual(calls, ['convert', 'validate-v4-tree']);
  assert.equal(r.failedAt, 'validate-v4-tree');
  const convertOp = r.results.find((o) => o.name === 'convert-xml-to-v4');
  assert.equal(convertOp.status, 'ok');
  const validateOp = r.results.find((o) => o.name === 'validate-v4-tree');
  assert.equal(validateOp.status, 'error');
  assert.equal(r.results.find((o) => o.name === 'fix-styles'), undefined);
});

test('runWave3Build: all success returns all 3 results', async () => {
  const calls = [];
  const r = await runWave3Build({
    runConvert: async () => { calls.push('convert'); return { v: 1 }; },
    runValidate: async () => { calls.push('validate'); return { v: 2 }; },
    runFixStyles: async () => { calls.push('fix'); return { v: 3 }; },
  });
  assert.deepEqual(calls, ['convert', 'validate', 'fix']);
  assert.equal(r.results.length, 3);
  assert.ok(r.results.every((o) => o.status === 'ok'));
  assert.equal(r.failedAt, undefined);
});

test('runWave3Build: skipped ops are not invoked', async () => {
  const calls = [];
  const r = await runWave3Build({
    runConvert: async () => { calls.push('convert'); return { v: 1 }; },
    runValidate: null,
    runFixStyles: null,
  });
  assert.deepEqual(calls, ['convert']);
  assert.equal(r.results.length, 1);
});

test('runWave4DeployQa: parallel execution with all 5 ops', async () => {
  const order = [];
  const r = await runWave4DeployQa({
    postId: 42,
    runBuild: async () => { await new Promise((r) => setTimeout(r, 30)); order.push('build'); return { ok: 1 }; },
    runVisualQa: async () => { await new Promise((r) => setTimeout(r, 10)); order.push('qa'); return { score: 95 }; },
    runLayoutAudit: async () => { await new Promise((r) => setTimeout(r, 20)); order.push('layout'); return {}; },
    runA11yFallback: async () => { await new Promise((r) => setTimeout(r, 15)); order.push('a11y'); return {}; },
    runSeoFallback: async () => { await new Promise((r) => setTimeout(r, 25)); order.push('seo'); return {}; },
    options: { concurrency: 5 },
  });
  assert.equal(r.results.length, 5);
  for (const op of r.results) {
    assert.equal(op.status, 'ok');
  }
  assert.equal(order.length, 5);
});

test('runWave4DeployQa: empty when no ops provided', async () => {
  const r = await runWave4DeployQa({ postId: 1 });
  const results = Array.isArray(r) ? r : (r.results || []);
  assert.equal(results.length, 0);
});
