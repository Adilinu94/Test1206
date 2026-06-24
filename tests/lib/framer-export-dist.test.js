// tests/lib/framer-export-dist.test.js
// Phase 3.4: Verify FramerExport dist-Pfad-Erkennung in cmd-pipeline

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FRAMER_EXPORT_DIR = path.join(ROOT, 'tools', 'framer-export');
const DIST_ENTRY = path.join(FRAMER_EXPORT_DIR, 'dist', 'cli', 'index.js');

test('FramerExport: dist/cli/index.js existiert nach Build', () => {
  assert.equal(existsSync(DIST_ENTRY), true, 'dist/cli/index.js sollte nach tsup-Build existieren');
  const stat = statSync(DIST_ENTRY);
  assert.ok(stat.size > 1000, `dist/cli/index.js sollte >1KB sein, ist ${stat.size} bytes`);
});

test('FramerExport: dist/cli/index.js ist ausfuehrbar (Node ESM)', () => {
  const result = execFileSync(process.execPath, [DIST_ENTRY, '--version'], {
    cwd: FRAMER_EXPORT_DIR,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.match(result.trim(), /^\d+\.\d+\.\d+$/, `Version-Output sollte semver sein, ist: ${result}`);
});

test('FramerExport: package.json hat main=dist/cli/index.js', () => {
  const pkgPath = path.join(FRAMER_EXPORT_DIR, 'package.json');
  const pkg = JSON.parse(execFileSync(process.execPath, ['-e', `console.log(require('fs').readFileSync(${JSON.stringify(pkgPath)}, 'utf8'))`], { encoding: 'utf8' }));
  assert.equal(pkg.main, 'dist/cli/index.js', 'package.json main muss auf dist zeigen');
});

test('FramerExport: bin/framer-export.js existiert und ruft dist auf', () => {
  const binPath = path.join(FRAMER_EXPORT_DIR, 'bin', 'framer-export.js');
  assert.equal(existsSync(binPath), true, 'bin/framer-export.js sollte existieren');
  const content = execFileSync(process.execPath, ['-e', `console.log(require('fs').readFileSync(${JSON.stringify(binPath)}, 'utf8'))`], { encoding: 'utf8' });
  assert.match(content, /dist[\\/]+cli[\\/]+index\.js/, 'bin/framer-export.js muss auf dist/cli/index.js verweisen');
});

test('FramerExport: dist-Eintrag ist juenger als src/cli/index.ts (Cache nutzbar)', () => {
  const distStat = statSync(DIST_ENTRY);
  const srcPath = path.join(FRAMER_EXPORT_DIR, 'src', 'cli', 'index.ts');
  if (existsSync(srcPath)) {
    const srcStat = statSync(srcPath);
    assert.ok(distStat.mtimeMs >= srcStat.mtimeMs - 5000,
      `dist sollte nach src gebaut sein (oder gleich alt, innerhalb 5s Toleranz), dist=${new Date(distStat.mtimeMs).toISOString()}, src=${new Date(srcStat.mtimeMs).toISOString()}`);
  }
});
