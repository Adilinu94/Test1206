/**
 * tests/visual-regression.test.js
 *
 * Testet den section-compare.js Script:
 *   - CLI-Validation (fehlende Args → exit 2)
 *   - Dry-Run erzeugt report.html + compare-report.json
 *   - JSON-Report hat korrekte Struktur
 *   - 4 Screenshot-Einträge (2 Quellen × 2 Breakpoints)
 *   - HTML-Report enthält erwartete Elemente
 *
 * Laeuft mit: node --test tests/visual-regression.test.js
 * Oder via:   npm run test:visual
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const SCRIPT     = join(__dirname, '..', 'scripts', 'section-compare.js');
const NODE       = process.execPath;

function run(extraArgs = [], { expectFail = false } = {}) {
  try {
    const out = execFileSync(NODE, [SCRIPT, ...extraArgs], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    return { ok: true, stdout: out, stderr: '', code: 0 };
  } catch (err) {
    if (expectFail) {
      return { ok: false, stdout: err.stdout || '', stderr: err.stderr || '', code: err.status };
    }
    throw err;
  }
}

// ── Test-Suite ───────────────────────────────────────────────────────────────

describe('section-compare.js: CLI + Dry-Run', () => {

  // VR-1: Fehlende Pflicht-Args → exit 2
  test('VR-1: Fehlende Args → exit 2 + Hilfetext', () => {
    const r = run([], { expectFail: true });
    assert.equal(r.code, 2, 'Exit-Code bei fehlenden Args muss 2 sein');
  });

  // VR-2: Nur framer-url, kein elementor-url → exit 2
  test('VR-2: Nur --framer-url (kein --elementor-url) → exit 2', () => {
    const r = run(['--framer-url', 'https://example.framer.app/'], { expectFail: true });
    assert.equal(r.code, 2, 'Exit-Code bei fehlendem elementor-url muss 2 sein');
  });

  // VR-3: --help → exit 0 + Usage in stdout
  test('VR-3: --help → exit 0', () => {
    const r = run(['--help'], { expectFail: false });
    assert.ok(
      r.stdout.includes('section-compare.js') || r.stdout.includes('USAGE'),
      'Help-Output muss "section-compare.js" oder "USAGE" enthalten'
    );
  });

  // VR-4: Dry-Run erzeugt 4 Platzhalter-Dateien
  test('VR-4: --dry-run erzeugt Screenshot-Platzhalter + Reports', () => {
    const outDir = join(tmpdir(), `sc-vr-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    run([
      '--framer-url',    'https://example.framer.app/',
      '--elementor-url', 'http://solar.local/test/',
      '--section',       'hero',
      '--dry-run',
      '--output',        outDir,
    ]);

    const expected = [
      'framer-desktop.png',
      'framer-mobile.png',
      'elementor-desktop.png',
      'elementor-mobile.png',
      'report.html',
      'compare-report.json',
    ];

    for (const f of expected) {
      assert.ok(
        existsSync(join(outDir, f)),
        `Pflicht-Output fehlt: ${f}`
      );
    }
  });

  // VR-5: compare-report.json hat korrekte Struktur
  test('VR-5: compare-report.json Struktur korrekt', () => {
    const outDir = join(tmpdir(), `sc-vr-struct-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    run([
      '--framer-url',    'https://example.framer.app/',
      '--elementor-url', 'http://solar.local/test/',
      '--section',       'hero',
      '--dry-run',
      '--output',        outDir,
    ]);

    const report = JSON.parse(readFileSync(join(outDir, 'compare-report.json'), 'utf8'));

    assert.equal(report.section, 'hero', 'section muss "hero" sein');
    assert.ok(report.framerUrl, 'framerUrl muss vorhanden sein');
    assert.ok(report.elementorUrl, 'elementorUrl muss vorhanden sein');
    assert.ok(report.timestamp, 'timestamp muss vorhanden sein');
    assert.ok(Array.isArray(report.results), 'results muss Array sein');

    // Bug 7: pixelHashScores muss vorhanden sein
    assert.ok(
      typeof report.pixelHashScores === 'object' && report.pixelHashScores !== null,
      'pixelHashScores muss Objekt sein'
    );
    assert.ok('desktop' in report.pixelHashScores, 'pixelHashScores muss desktop-Eintrag haben');
    assert.ok('mobile'  in report.pixelHashScores, 'pixelHashScores muss mobile-Eintrag haben');

    // Exakt 4 Einträge: 2 Quellen x 2 Breakpoints
    assert.equal(report.results.length, 4,
      `Muss exakt 4 Screenshot-Einträge haben (2x2), hat ${report.results.length}`
    );

    // Alle Pflichtfelder
    for (const r of report.results) {
      assert.ok(r.source, `Eintrag muss "source" haben: ${JSON.stringify(r)}`);
      assert.ok(r.breakpoint, `Eintrag muss "breakpoint" haben`);
      assert.ok(r.filename, `Eintrag muss "filename" haben`);
      assert.ok(typeof r.ok === 'boolean', `Eintrag muss "ok" (boolean) haben`);
    }

    // Korrekte Quellen
    const sources = [...new Set(report.results.map(r => r.source))].sort();
    assert.deepEqual(sources, ['elementor', 'framer'], 'Quellen müssen [elementor, framer] sein');

    // Korrekte Breakpoints
    const bps = [...new Set(report.results.map(r => r.breakpoint))].sort();
    assert.deepEqual(bps, ['desktop', 'mobile'], 'Breakpoints müssen [desktop, mobile] sein');
  });

  // VR-6: report.html ist valides HTML mit erwarteten Elementen
  test('VR-6: report.html enthält Tab-Struktur und Quellen-Labels', () => {
    const outDir = join(tmpdir(), `sc-vr-html-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    run([
      '--framer-url',    'https://example.framer.app/',
      '--elementor-url', 'http://solar.local/test/',
      '--section',       'hero-test',
      '--dry-run',
      '--output',        outDir,
    ]);

    const html = readFileSync(join(outDir, 'report.html'), 'utf8');

    assert.ok(html.includes('<!DOCTYPE html>'), 'Muss DOCTYPE haben');
    assert.ok(html.includes('hero-test'), 'Muss Section-Name "hero-test" enthalten');
    assert.ok(html.includes('Desktop'), 'Muss Desktop-Tab enthalten');
    assert.ok(html.includes('Mobile'), 'Muss Mobile-Tab enthalten');
    assert.ok(html.includes('Original (Framer)'), 'Muss Framer-Label enthalten');
    assert.ok(html.includes('Elementor V4'), 'Muss Elementor-Label enthalten');
    assert.ok(html.includes('1440 × 900'), 'Muss Desktop-Viewport-Info enthalten');
    assert.ok(html.includes('390 × 844'), 'Muss Mobile-Viewport-Info enthalten');
    assert.ok(html.includes('compare-report.json') || html.includes('section-compare'), 'Muss Script-Referenz enthalten');
    // Bug 4: keine hardcoded Hero-Abweichungen mehr
    assert.ok(
      !html.includes('Hero-Section (aus E2E-Analyse)'),
      'Hardcoded Hero-Abweichungs-Liste darf nicht mehr im Report sein'
    );
    // Bug 5: loading=eager statt lazy
    assert.ok(
      !html.includes('loading="lazy"'),
      'Inline-Base64-Bilder dürfen kein loading="lazy" haben'
    );
  });

  // VR-7: --section default = 'section'
  test('VR-7: Ohne --section → default "section" in Report', () => {
    const outDir = join(tmpdir(), `sc-vr-default-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    run([
      '--framer-url',    'https://example.framer.app/',
      '--elementor-url', 'http://solar.local/test/',
      '--dry-run',
      '--output',        outDir,
    ]);

    const report = JSON.parse(readFileSync(join(outDir, 'compare-report.json'), 'utf8'));
    assert.equal(report.section, 'section', 'Ohne --section muss Default "section" sein');
  });

  // VR-8: Filename-Schema korrekt
  test('VR-8: Screenshot-Dateinamen haben korrektes Schema', () => {
    const outDir = join(tmpdir(), `sc-vr-names-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    run([
      '--framer-url',    'https://example.framer.app/',
      '--elementor-url', 'http://solar.local/test/',
      '--section',       'features',
      '--dry-run',
      '--output',        outDir,
    ]);

    const expected = [
      'framer-desktop.png',
      'framer-mobile.png',
      'elementor-desktop.png',
      'elementor-mobile.png',
    ];

    for (const name of expected) {
      assert.ok(
        existsSync(join(outDir, name)),
        `Screenshot-Datei fehlt: ${name}`
      );
    }
  });

  // VR-9: backend="dry-run" im JSON gesetzt
  test('VR-9: backend="dry-run" korrekt im Report', () => {
    const outDir = join(tmpdir(), `sc-vr-backend-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    run([
      '--framer-url',    'https://example.framer.app/',
      '--elementor-url', 'http://solar.local/test/',
      '--dry-run',
      '--output',        outDir,
    ]);

    const report = JSON.parse(readFileSync(join(outDir, 'compare-report.json'), 'utf8'));
    assert.equal(report.backend, 'dry-run', 'backend muss "dry-run" sein');
  });

  // VR-10: npm-Script "section-compare" in package.json vorhanden
  test('VR-10: package.json enthält "section-compare" Script', () => {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.ok(
      'section-compare' in pkg.scripts,
      'package.json muss "section-compare" Script enthalten'
    );
    assert.ok(
      pkg.scripts['section-compare'].includes('section-compare.js'),
      'Script muss auf section-compare.js verweisen'
    );
  });

  // VR-11: dry-run erzeugt KEINE diff-*.png Dateien (Diff nur bei echten PNGs)
  test('VR-11: dry-run erzeugt keine diff-*.png Dateien', () => {
    const outDir = join(tmpdir(), `sc-vr-nodiff-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    run([
      '--framer-url',    'https://example.framer.app/',
      '--elementor-url', 'http://solar.local/test/',
      '--section',       'hero',
      '--dry-run',
      '--output',        outDir,
    ]);

    // Diff-Dateien duerfen im dry-run NICHT existieren
    assert.ok(
      !existsSync(join(outDir, 'diff-desktop.png')),
      'diff-desktop.png darf im dry-run nicht existieren'
    );
    assert.ok(
      !existsSync(join(outDir, 'diff-mobile.png')),
      'diff-mobile.png darf im dry-run nicht existieren'
    );
  });

  // VR-12: compare-report.json hat pixelDiffs-Feld mit korrekter Struktur
  test('VR-12: pixelDiffs-Feld in compare-report.json', () => {
    const outDir = join(tmpdir(), `sc-vr-pixeldiff-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    run([
      '--framer-url',    'https://example.framer.app/',
      '--elementor-url', 'http://solar.local/test/',
      '--section',       'hero',
      '--dry-run',
      '--output',        outDir,
    ]);

    const report = JSON.parse(readFileSync(join(outDir, 'compare-report.json'), 'utf8'));

    assert.ok(
      typeof report.pixelDiffs === 'object' && report.pixelDiffs !== null,
      'pixelDiffs muss Objekt sein'
    );
    assert.ok('desktop' in report.pixelDiffs, 'pixelDiffs muss desktop-Eintrag haben');
    assert.ok('mobile'  in report.pixelDiffs, 'pixelDiffs muss mobile-Eintrag haben');

    // Im dry-run: ok === false mit reason-Feld
    for (const [bp, d] of Object.entries(report.pixelDiffs)) {
      assert.ok(typeof d === 'object' && d !== null, `pixelDiffs.${bp} muss Objekt sein`);
      assert.ok(typeof d.ok === 'boolean', `pixelDiffs.${bp}.ok muss boolean sein`);
      if (!d.ok) {
        assert.ok(typeof d.reason === 'string' && d.reason.length > 0,
          `pixelDiffs.${bp}.reason muss String sein wenn ok=false`);
      }
    }
  });

});
