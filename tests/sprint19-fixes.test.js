/**
 * tests/sprint19-fixes.test.js
 *
 * Deckt die 9 Sprint-19-Fixes ab, die zuvor nur manuell via /tmp-Smoke-Tests
 * verifiziert wurden. Ohne diese Tests könnte ein künftiger Refactor die
 * Fixes stillschweigend brechen, ohne dass CI es bemerkt.
 *
 * Abgedeckt:
 *   Fix #1  — convert-xml-to-v4.js --prefer-gc + generate-global-classes.js
 *             --local-bg-set / --gc-candidates (GC-Konflikt-Koordination)
 *   Fix #3  — session-init.js --update-session-state
 *   Fix #4  — extract-style-map.js JSON-Format-Detektion
 *   Fix #5  — RC-11 styleMap-gestützter Fallback in convert-xml-to-v4.js
 *   Fix #6  — expand-components.js Mode B (Fixture-basiert)
 *   Fix #11 — css-fallback-extractor.js (HTML-Quelle, kein Netzwerk nötig)
 *   Fix #12 — integrate-responsive.js Orchestrator
 *   Fix #13 — post-build-hook.js (--dry-run, --qa-only)
 *
 * Fix #2 (inject-animation Batch) ist reiner Bestandsschutz — keine neue Logik,
 * daher kein eigener Testfall (siehe bestehende inject-animation-code Tests).
 *
 * Laeuft mit: node --test tests/sprint19-fixes.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS   = join(__dirname, '..', 'scripts');
const NODE      = process.execPath;

function run(script, args = [], { expectFail = false, timeout = 20000 } = {}) {
  const result = spawnSync(NODE, [join(SCRIPTS, script), ...args], {
    encoding: 'utf8',
    timeout,
  });
  const code = result.status;
  const ok = code === 0;
  if (!ok && !expectFail) {
    throw new Error(`${script} ${args.join(' ')} failed unexpectedly (exit ${code}):\n${result.stderr || result.error?.message || ''}`);
  }
  return { ok, stdout: result.stdout || '', stderr: result.stderr || '', code };
}

function tmpDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// ─────────────────────────────────────────────────────────────────────────
// Fix #1 — GC-Konflikt: --prefer-gc / --local-bg-set / --gc-candidates
// ─────────────────────────────────────────────────────────────────────────

describe('Fix #1: GC-Konflikt background.color Koordination', () => {
  const dir = tmpDir('sprint19-fix1-');
  const xmlPath = join(dir, 'bg-test.xml');
  writeFileSync(xmlPath, `<?xml version="1.0" encoding="UTF-8"?>
<Page name="BgTest" id="page1">
  <Node id="box1" name="Box" widgetType="e-flexbox" backgroundColor="#ff0000" padding="20" />
</Page>`, 'utf8');

  test('Standard-Modus (ohne --prefer-gc): background wird lokal gesetzt', () => {
    const out = join(dir, 'standard.json');
    run('convert-xml-to-v4.js', ['--xml', xmlPath, '--output', out]);
    const tree = JSON.parse(readFileSync(out, 'utf8'));
    const json = JSON.stringify(tree);
    assert.match(json, /"\$\$type":\s*"background"/, 'background-Prop sollte lokal im Tree stehen');
  });

  test('--prefer-gc: background wird NICHT lokal gesetzt', () => {
    const out = join(dir, 'prefer-gc.json');
    run('convert-xml-to-v4.js', ['--xml', xmlPath, '--prefer-gc', '--output', out]);
    const tree = JSON.parse(readFileSync(out, 'utf8'));
    const json = JSON.stringify(tree);
    assert.doesNotMatch(json, /"\$\$type":\s*"background"/, 'background-Prop darf im --prefer-gc Modus NICHT lokal stehen');
  });

  test('--prefer-gc schreibt Begleitdatei <output>.gc-candidates.json', () => {
    const out = join(dir, 'prefer-gc-2.json');
    run('convert-xml-to-v4.js', ['--xml', xmlPath, '--prefer-gc', '--output', out]);
    const candPath = out.replace(/\.json$/, '') + '.gc-candidates.json';
    assert.ok(existsSync(candPath), 'gc-candidates.json sollte erzeugt werden');
    const cand = JSON.parse(readFileSync(candPath, 'utf8'));
    assert.ok(Array.isArray(cand.background), 'gc-candidates.json sollte ein background[]-Array enthalten');
    assert.equal(cand.background.length, 1);
    // Sprint 20: generisches Schema { category, id, prop, value } statt { id, color }
    assert.equal(cand.background[0].category, 'background');
    assert.equal(cand.background[0].prop, 'background');
    assert.equal(cand.background[0].value.value.color.value, '#ff0000');
  });

  test('generate-global-classes --local-bg-set überspringt Background-GC (kein Doppel-Styling)', () => {
    const out = join(dir, 'standard.json'); // bereits oben erzeugt
    // exit(1) ist hier KORREKT: "0 GC-Vorschläge gefunden" ist das gewollte Ergebnis,
    // da --local-bg-set den background-GC bewusst überspringt (siehe generate-global-classes.js:607).
    const r = run('generate-global-classes.js', ['--tree', out, '--local-bg-set', '--verbose'], { expectFail: true });
    assert.match(r.stderr, /lokaler Style.*Background-GCs werden übersprungen|--local-bg-set aktiv/i);
  });

  test('generate-global-classes mit --gc-candidates erkennt prefer-gc Werte korrekt', () => {
    const out = join(dir, 'prefer-gc-2.json');
    const candPath = out.replace(/\.json$/, '') + '.gc-candidates.json';
    const r = run('generate-global-classes.js', ['--tree', out, '--gc-candidates', candPath]);
    const result = JSON.parse(r.stdout);
    // Output-Key ist snake_case: suggested_classes, Diskriminator-Feld ist "type"
    const bgClasses = (result.suggested_classes || []).filter(c => c.type === 'background');
    assert.ok(bgClasses.length >= 1, 'Mindestens 1 Background-GC sollte aus --gc-candidates erkannt werden');
  });

  test('generate-global-classes OHNE --local-bg-set auf Standard-Output zeigt den Konflikt (Negativ-Beweis)', () => {
    // Demonstriert: ohne den Fix entsteht ein doppelter Background-GC-Vorschlag
    // obwohl background bereits lokal gesetzt ist. Dieser Test beweist, dass
    // --local-bg-set tatsächlich etwas Sinnvolles verhindert.
    const out = join(dir, 'standard.json');
    const r = run('generate-global-classes.js', ['--tree', out]); // kein --local-bg-set
    const result = JSON.parse(r.stdout);
    const bgClasses = (result.suggested_classes || []).filter(c => c.type === 'background');
    assert.ok(bgClasses.length >= 1, 'Ohne --local-bg-set wird background trotz lokalem Style als GC vorgeschlagen (zeigt den Konflikt)');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Sprint 20 — Generalisierung des --gc-candidates Mechanismus (Repo-Review
// Punkt #4: nicht mehr nur background-spezifisch, jede Kategorie möglich)
// ─────────────────────────────────────────────────────────────────────────

describe('Sprint 20: --gc-candidates generisches Kategorie-Schema', () => {
  const dir = tmpDir('sprint20-fix4-');
  const xmlPath = join(dir, 'bg-test.xml');
  writeFileSync(xmlPath, `<?xml version="1.0" encoding="UTF-8"?>
<Page name="GenericTest" id="page1">
  <Node id="box1" name="Box" widgetType="e-flexbox" backgroundColor="#ff0000" padding="20" />
</Page>`, 'utf8');
  const treePath = join(dir, 'tree.json');
  run('convert-xml-to-v4.js', ['--xml', xmlPath, '--output', treePath]);

  test('Altes Sprint-19-Schema { id, color } wird weiterhin korrekt gelesen (Abwärtskompat)', () => {
    const candPath = join(dir, 'legacy-candidates.json');
    writeFileSync(candPath, JSON.stringify({
      background: [{ id: 'box1', color: { '$$type': 'color', value: '#00ff00' } }],
    }), 'utf8');
    const r = run('generate-global-classes.js', ['--tree', treePath, '--gc-candidates', candPath]);
    const result = JSON.parse(r.stdout);
    const bgClasses = (result.suggested_classes || []).filter(c => c.type === 'background');
    assert.ok(bgClasses.length >= 1, 'Legacy-Schema { id, color } sollte weiterhin als Background-GC erkannt werden');
  });

  test('Beliebige neue Kategorie (z.B. "border") wird generisch als GC erkannt, nicht nur "background"', () => {
    const candPath = join(dir, 'generic-candidates.json');
    writeFileSync(candPath, JSON.stringify({
      border: [{ category: 'border', id: 'box1', prop: 'border', value: { '$$type': 'border', value: { width: '2px' } } }],
    }), 'utf8');
    const r = run('generate-global-classes.js', ['--tree', treePath, '--gc-candidates', candPath]);
    const result = JSON.parse(r.stdout);
    const borderClasses = (result.suggested_classes || []).filter(c => c.type === 'border');
    assert.ok(borderClasses.length >= 1, 'Generische Kategorie "border" sollte als eigener GC-Typ erkannt werden (Beweis: Mechanismus ist nicht mehr background-only)');
    assert.equal(borderClasses[0].props.border.value.width, '2px');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fix #3 — SESSION-STATE.md Auto-Update
// ─────────────────────────────────────────────────────────────────────────

describe('Fix #3: session-init.js --update-session-state', () => {
  test('schreibt SESSION-STATE.md mit aktuellem Datum und package.json-Version', () => {
    const dir = tmpDir('sprint19-fix3-');
    // Eigenes Mini-Repo-Layout simulieren: package.json + scripts/session-init.js sind fix,
    // SESSION-STATE.md wird relativ zu scripts/../ geschrieben — wir testen daher gegen
    // das echte Repo-Root, lesen vorher/nachher und stellen den Ursprungszustand wieder her.
    const statePath = join(SCRIPTS, '..', 'SESSION-STATE.md');
    const before = existsSync(statePath) ? readFileSync(statePath, 'utf8') : null;

    try {
      run('session-init.js', ['--update-session-state']);
      assert.ok(existsSync(statePath), 'SESSION-STATE.md sollte existieren');
      const content = readFileSync(statePath, 'utf8');
      const today = new Date().toISOString().split('T')[0];
      assert.match(content, new RegExp(today), 'SESSION-STATE.md sollte das heutige Datum enthalten');
      assert.match(content, /Pipeline-Version:\*\* v\d+\.\d+\.\d+/, 'SESSION-STATE.md sollte eine Versionsnummer enthalten');
      assert.match(content, /github\.com\/Adilinu94\/Framer-to-Elementor-V4-Pipeline/, 'SESSION-STATE.md sollte den korrekten Repo-Link enthalten');
    } finally {
      // Ursprungszustand wiederherstellen, damit der Test keine echten Repo-Dateien dauerhaft ändert
      if (before !== null) writeFileSync(statePath, before, 'utf8');
    }
  });

  test('--repo-url Override wird übernommen', () => {
    const statePath = join(SCRIPTS, '..', 'SESSION-STATE.md');
    const before = existsSync(statePath) ? readFileSync(statePath, 'utf8') : null;
    try {
      run('session-init.js', ['--update-session-state', '--repo-url', 'https://example.com/custom-repo']);
      const content = readFileSync(statePath, 'utf8');
      assert.match(content, /example\.com\/custom-repo/);
    } finally {
      if (before !== null) writeFileSync(statePath, before, 'utf8');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fix #4 — extract-style-map.js JSON-Format-Detektion
// ─────────────────────────────────────────────────────────────────────────

describe('Fix #4: extract-style-map.js JSON-Format-Detektion', () => {
  const dir = tmpDir('sprint19-fix4-');

  test('JSON-Input wird erkannt und korrekt geparst (keine leere Map)', () => {
    const jsonPath = join(dir, 'unframer-output.json');
    writeFileSync(jsonPath, JSON.stringify({
      textStyles: {
        '/Headings/48': { fontSize: '48px', fontWeight: '700', fontFamily: 'Inter' },
        '/Body/16':     { fontSize: '16px', fontWeight: '400', fontFamily: 'Inter' },
      },
      colorStyles: {
        '/Neutrals/950': '#0a0a0a',
      },
    }), 'utf8');

    const out = join(dir, 'style-map-from-json.json');
    run('extract-style-map.js', ['--xml', jsonPath, '--output', out]);
    const styleMap = JSON.parse(readFileSync(out, 'utf8'));

    assert.equal(Object.keys(styleMap.textStyles).length, 2, 'JSON-Input sollte 2 TextStyles liefern, nicht 0');
    assert.equal(Object.keys(styleMap.colorStyles).length, 1, 'JSON-Input sollte 1 ColorStyle liefern, nicht 0');
  });

  test('XML-Input funktioniert weiterhin unverändert (Regression-Schutz)', () => {
    const xmlPath = join(dir, 'plain.xml');
    writeFileSync(xmlPath, '<?xml version="1.0"?><Page name="X" id="p1"></Page>', 'utf8');
    const out = join(dir, 'style-map-from-xml.json');
    // Sollte nicht crashen und sollte NICHT den JSON-Pfad nehmen
    const r = run('extract-style-map.js', ['--xml', xmlPath, '--output', out], {});
    assert.ok(existsSync(out), 'style-map.json sollte auch bei leerem XML geschrieben werden');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fix #5 — RC-11 styleMap-gestützter Fallback
// ─────────────────────────────────────────────────────────────────────────

describe('Fix #5: RC-11 smarter Fallback via styleMap', () => {
  const dir = tmpDir('sprint19-fix5-');

  // WICHTIG: convert-xml-to-v4.js liest den Widget-Typ NICHT aus einem
  // "widgetType"-Attribut, sondern leitet ihn aus dem "name"-Attribut-Pattern
  // ab (COMPONENT_TYPE_MAP / determineWidgetType()). Root-Name darf keine
  // zufälligen Substring-Treffer wie "heading" enthalten (sonst wird der
  // Page-Root selbst fälschlich als e-heading erkannt).
  const xmlPath = join(dir, 'heading-body.xml');
  writeFileSync(xmlPath, `<?xml version="1.0" encoding="UTF-8"?>
<Page name="RC11FallbackTest" id="page1">
  <Node id="h1" name="Heading Element" />
  <Node id="p1" name="Paragraph Element" />
</Page>`, 'utf8');

  const styleMapPath = join(dir, 'style-map.json');
  writeFileSync(styleMapPath, JSON.stringify({
    textStyles: {
      '/Headings/64': { fontSize: '64px', fontWeight: '700', fontFamily: 'Inter', color: '#000000' },
      '/Headings/32': { fontSize: '32px', fontWeight: '600', fontFamily: 'Inter', color: '#111111' },
      '/Body/16':     { fontSize: '16px', fontWeight: '400', fontFamily: 'Inter', color: '#444444' },
    },
    colorStyles: {},
  }), 'utf8');

  // Helper: extrahiert font-size (px-Zahl) eines Elements anhand seiner id.
  // Schema: { size: { value: { size: N, unit: "px" } } } — keine "64px"-Strings im JSON.
  function getFontSizePx(tree, elementId) {
    const found = (tree.elements || []).find(el => el.id === elementId);
    if (!found) return null;
    for (const style of Object.values(found.styles || {})) {
      for (const variant of style.variants || []) {
        const fs = variant.props?.['font-size'];
        if (fs?.value?.size !== undefined) return fs.value.size;
      }
    }
    return null;
  }

  test('Heading-Node ohne inlineTextStyle bekommt den GRÖSSTEN TextStyle aus styleMap (64px statt statischem 32px)', () => {
    const out = join(dir, 'heading-out.json');
    run('convert-xml-to-v4.js', ['--xml', xmlPath, '--style-map', styleMapPath, '--output', out]);
    const tree = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(getFontSizePx(tree, 'h1'), 64, 'Heading sollte den größten verfügbaren TextStyle (64px) übernehmen, nicht den statischen 32px-Fallback');
  });

  test('Paragraph-Node ohne inlineTextStyle bekommt den KLEINSTEN TextStyle aus styleMap (16px)', () => {
    const out = join(dir, 'body-out.json');
    run('convert-xml-to-v4.js', ['--xml', xmlPath, '--style-map', styleMapPath, '--output', out]);
    const tree = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(getFontSizePx(tree, 'p1'), 16, 'Paragraph sollte den kleinsten verfügbaren TextStyle (16px) übernehmen');
  });

  test('Ohne styleMap fällt RC-11 weiterhin auf statische Inter/32px Defaults zurück (Regression-Schutz)', () => {
    const out = join(dir, 'no-stylemap-out.json');
    run('convert-xml-to-v4.js', ['--xml', xmlPath, '--output', out]); // kein --style-map
    const tree = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(getFontSizePx(tree, 'h1'), 32, 'Ohne styleMap sollte weiterhin der statische 32px-Fallback für Headings greifen');
  });

  test('Punkt #7: --theme-defaults überschreibt statische Fallbacks wenn weder styleMap noch CSS-Fallback greifen', () => {
    const themeDefaultsPath = join(dir, 'theme-defaults.json');
    writeFileSync(themeDefaultsPath, JSON.stringify({
      heading: { fontFamily: 'Poppins', fontSize: '40px', fontWeight: '700', color: '#0a0a0a' },
      body:    { fontFamily: 'Poppins', fontSize: '18px', color: '#333333' },
    }), 'utf8');
    const out = join(dir, 'theme-defaults-out.json');
    run('convert-xml-to-v4.js', ['--xml', xmlPath, '--theme-defaults', themeDefaultsPath, '--output', out]);
    const tree = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(getFontSizePx(tree, 'h1'), 40, 'Heading sollte den --theme-defaults Wert (40px) übernehmen, nicht den statischen 32px-Fallback');
    assert.equal(getFontSizePx(tree, 'p1'), 18, 'Body sollte den --theme-defaults Wert (18px) übernehmen, nicht den statischen 16px-Fallback');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fix #6 — expand-components.js Mode B (Fixture-Test)
// ─────────────────────────────────────────────────────────────────────────

describe('Fix #6: expand-components.js Mode B (inline XML expansion)', () => {
  test('Component-Instanzen werden mit echter Fixture korrekt inline expandiert', () => {
    const fixtureXml  = join(__dirname, 'fixtures', 'component-mode-b.xml');
    const componentsDir = join(__dirname, 'fixtures', 'components');
    assert.ok(existsSync(fixtureXml), 'component-mode-b.xml Fixture sollte existieren');
    assert.ok(existsSync(componentsDir), 'components/ Fixture-Verzeichnis sollte existieren');

    const dir = tmpDir('sprint19-fix6-');
    const out = join(dir, 'expanded.xml');

    const r = run('expand-components.js', [
      '--xml', fixtureXml,
      '--components-dir', componentsDir,
      '--output', out,
    ], { expectFail: false });

    assert.ok(existsSync(out), 'Mode B sollte eine expandierte XML-Datei schreiben');
    const expanded = readFileSync(out, 'utf8');
    // Beide Component-Instanzen (2x Feature-Card, 1x CTA) sollten inline expandiert sein
    assert.match(expanded, /Feature Card/, 'Feature-Card-Component sollte inline expandiert sein');
    assert.match(expanded, /CTA/, 'CTA-Block-Component sollte inline expandiert sein');
    // Der ursprüngliche componentId-Verweis sollte ersetzt sein durch echten Inhalt
    assert.doesNotMatch(expanded, /componentId="comp-feature-card"/, 'componentId-Referenz sollte durch echten Inhalt ersetzt sein');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fix #11 — css-fallback-extractor.js
// ─────────────────────────────────────────────────────────────────────────

describe('Fix #11: css-fallback-extractor.js', () => {
  const dir = tmpDir('sprint19-fix11-');
  const htmlPath = join(dir, 'framer-export.html');
  writeFileSync(htmlPath, `<!DOCTYPE html><html><head><style>
    :root { --token-color-primary: #1a73e8; --token-color-bg: #ffffff; }
    .framer-text-heading { font-size: 40px; font-weight: 700; font-family: "Inter", sans-serif; }
    .framer-text-body { font-size: 16px; font-weight: 400; font-family: "Inter", sans-serif; }
    @media (max-width: 810px) { .x { padding: 8px; } }
    @media (max-width: 390px) { .x { padding: 4px; } }
  </style></head><body></body></html>`, 'utf8');

  test('Extrahiert Farb-Tokens und TextStyle-Klassen aus lokalem HTML (kein Netzwerk nötig)', () => {
    const outDir = join(dir, 'tokens-out');
    run('css-fallback-extractor.js', ['--html', htmlPath, '--output-dir', outDir]);

    const styleMapPath = join(outDir, 'style-map.json');
    assert.ok(existsSync(styleMapPath), 'style-map.json sollte geschrieben werden');
    const styleMap = JSON.parse(readFileSync(styleMapPath, 'utf8'));

    assert.ok(Object.keys(styleMap.colorStyles).length >= 1, 'Mindestens 1 Farb-Token sollte gefunden werden');
    assert.ok(Object.keys(styleMap.textStyles).length >= 1, 'Mindestens 1 TextStyle-Klasse sollte gefunden werden');
  });

  test('--dry-run schreibt keine Dateien, gibt aber Zusammenfassung aus', () => {
    const outDir = join(dir, 'should-not-exist');
    const r = run('css-fallback-extractor.js', ['--html', htmlPath, '--output-dir', outDir, '--dry-run']);
    assert.ok(!existsSync(outDir), '--dry-run sollte keine Dateien schreiben');
    assert.match(r.stderr, /Dry-run/i);
  });

  test('Ohne --url und --html: Fehler mit Exit-Code 1', () => {
    const r = run('css-fallback-extractor.js', [], { expectFail: true });
    assert.equal(r.code, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fix #12 — integrate-responsive.js
// ─────────────────────────────────────────────────────────────────────────

describe('Fix #12: integrate-responsive.js Orchestrator', () => {
  test('Fehlt --tree: Exit-Code 1 mit klarer Fehlermeldung', () => {
    const r = run('integrate-responsive.js', [], { expectFail: true });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /--tree/);
  });

  test('--tree nicht gefunden: Exit-Code 1', () => {
    const r = run('integrate-responsive.js', ['--tree', '/tmp/does-not-exist-12345.json'], { expectFail: true });
    assert.equal(r.code, 1);
  });

  test('--skip-if-present überspringt Bäume mit bereits vorhandenen Breakpoint-Varianten', () => {
    const dir = tmpDir('sprint19-fix12-');
    const treePath = join(dir, 'tree-with-bp.json');
    writeFileSync(treePath, JSON.stringify({
      id: 'el1',
      styles: {
        s1: {
          variants: [
            { meta: { breakpoint: null }, props: {} },
            { meta: { breakpoint: 'tablet' }, props: {} },
          ],
        },
      },
      elements: [],
    }), 'utf8');

    const r = run('integrate-responsive.js', ['--tree', treePath, '--skip-if-present']);
    assert.equal(r.code, 0);
    assert.match(r.stderr, /bereits vorhanden|übersprungen/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fix #13 — post-build-hook.js
// ─────────────────────────────────────────────────────────────────────────

describe('Fix #13: post-build-hook.js Visual QA Hook', () => {
  test('Fehlt --post-id: Exit-Code 2 (Konfigurationsfehler)', () => {
    const r = run('post-build-hook.js', [], { expectFail: true });
    assert.equal(r.code, 2);
  });

  test('--dry-run mit --post-id läuft durch und erzeugt build-quality.json', () => {
    const dir = tmpDir('sprint19-fix13-');
    const out = join(dir, 'build-quality.json');
    const r = run('post-build-hook.js', [
      '--post-id', '9999',
      '--output', out,
      '--dry-run',
    ], { expectFail: true }); // qa-results.json fehlt im dry-run-Kontext → kann fail sein, aber Report muss trotzdem existieren

    assert.ok(existsSync(out), 'build-quality.json sollte auch bei fehlenden QA-Daten geschrieben werden');
    const report = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(report.meta.post_id, '9999');
    assert.ok('summary' in report);
    assert.ok('agent_verdict' in report.summary);
  });

  test('--qa-only überspringt Screenshot-Diff', () => {
    const dir = tmpDir('sprint19-fix13b-');
    const out = join(dir, 'build-quality.json');
    run('post-build-hook.js', [
      '--post-id', '9999',
      '--output', out,
      '--qa-only',
    ], { expectFail: true });

    const report = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(report.screenshot_diff, null, '--qa-only sollte screenshot_diff null lassen');
  });
});
