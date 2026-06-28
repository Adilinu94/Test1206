# CONVENTIONS.md — Repo-Konventionen

> Erstellt im Rahmen der Repo-Review nach Sprint 19. Dokumentiert den
> aktuellen Stand sowie eine Zielkonvention für künftige Scripts.
> **Keine bestehenden Flags wurden umbenannt** — das wäre ein Breaking
> Change für alle bestehenden Aufrufe, Skill-Dateien und Agent-Workflows,
> die exakte Flag-Namen referenzieren. Diese Datei ist Orientierung für
> neue Scripts, kein Migrations-Auftrag für alte.

---

## 1. CLI-Flag-Namen für Input-Dateien (IST-Zustand)

Eine Bestandsaufnahme über alle `scripts/*.js` zeigt, dass der "Input-Datei"-Flag
historisch gewachsen unterschiedlich benannt wurde:

| Flag | Genutzt von |
|------|-------------|
| `--xml` | `convert-xml-to-v4.js`, `extract-style-map.js` |
| `--tree` | `generate-global-classes.js`, `integrate-responsive.js` |
| `--project-xml` | `export-mcp-xml.js` |
| `--element-tree` | `extract-framer-styles.js`, `extract-image-urls.js` |
| `--unframer-xml` | `build-dependency-graph.js`, `extract-image-urls.js` |
| `--v4-tree` | `extract-framer-components.js`, `extract-framer-interactions.js` |
| `--html` / `--css` / `--css-dir` | `design-token-extractor.js`, `css-fallback-extractor.js` |

**Warum das relevant ist:** Ein Agent, der die Pipeline autonom orchestriert
(Claude Code, Claude Cowork, o.ä.), muss bei jedem Script-Wechsel erneut
`--help` aufrufen oder den Quellcode lesen, um den korrekten Flag-Namen zu
finden. Das ist eine vermeidbare Fehlerquelle — genau das ist mir beim
Testen von Fix #1 in Sprint 19 passiert (`--input` statt `--tree` vermutet).

## 2. Zielkonvention für NEUE Scripts

Ab sofort sollten neue Scripts sich an folgendes Schema halten:

| Zweck | Flag |
|-------|------|
| Primäre XML-Eingabe (Framer-Export, Unframer-Output) | `--input` |
| V4-Tree-JSON-Eingabe (Output von `convert-xml-to-v4.js`) | `--tree` |
| Ausgabe-Datei/-Verzeichnis | `--output` |
| Style-Map (TextStyles/ColorStyles) | `--style-map` |
| Token-Mapping (Farben/Fonts) | `--tokens` |
| Verbose-Logging | `--verbose` |
| Trockenlauf ohne Schreiboperationen | `--dry-run` |
| Hilfe-Text | `--help` |

Bestehende Scripts behalten ihre aktuellen Flag-Namen. Falls ein bestehendes
Script grundlegend überarbeitet wird (Breaking-Change-Anlass ohnehin
vorhanden), sollte die Gelegenheit genutzt werden, gleichzeitig auf diese
Konvention umzustellen — mit einem Eintrag in `CHANGELOG.md` unter "Breaking
Changes".

## 3. GC-Kandidaten-Begleitdateien (Fix #1, generalisiert in Sprint 20)

Wenn ein Script bewusst einen Wert NICHT in die lokalen `props` eines
V4-Tree-Knotens schreibt (z. B. `--prefer-gc` in `convert-xml-to-v4.js`),
ist dieser Wert für nachgelagerte Analyse-Scripts wie
`generate-global-classes.js` unsichtbar, da diese nur vorhandene `props`
scannen.

**Konvention:** Solche Werte werden in einer Begleitdatei
`<output>.gc-candidates.json` mit folgendem generischen Schema abgelegt:

```json
{
  "<category>": [
    { "id": "<element-id>", "prop": "<prop-name>", "value": { "$$type": "...", "value": "..." } }
  ]
}
```

`category` ist eine Style-Kategorie (`background`, `typography`, `structure`,
…) analog zu `propCategory()` in `generate-global-classes.js`. Das Schema
ist seit Sprint 20 generisch (zuvor: nur `background`-spezifisch, siehe
`tasks/todo.md` Sprint-19-Notizen).

## 4. Tests für neue Fixes

Jeder neue Fix, der CLI-Verhalten ändert, sollte mindestens einen Testfall
in `tests/sprint19-fixes.test.js` (oder einer Nachfolge-Datei pro Sprint)
erhalten — manuelle `/tmp`-Smoke-Tests reichen nicht aus, da sie nicht in
`npm test` laufen und stille Regressionen nicht verhindern.

**Lektion aus Sprint 19:** `widgetType`-Attribute in Test-Fixture-XML werden
vom Parser ignoriert — die Widget-Typ-Erkennung läuft ausschließlich über
das `name`-Attribut-Pattern-Matching (`determineWidgetType()` in
`convert-xml-to-v4.js`). Test-Fixtures müssen das berücksichtigen (siehe
Kommentar in `tests/sprint19-fixes.test.js`, Fix-#5-Sektion).

## 5. node_modules in `tools/framer-export/`

Das vendored Tool unter `tools/framer-export/` hat ein eigenes, separates
`package.json` und `node_modules` (gitignored). Es muss **separat**
installiert werden:

```bash
PUPPETEER_SKIP_DOWNLOAD=1 npm install --prefix tools/framer-export
```

Dieser Schritt ist in `.github/workflows/*.yml` bereits korrekt eingebaut.
Bei lokaler Entwicklung/neuen Sandbox-Umgebungen wird er leicht übersehen
(führt zu einem scheinbaren Testfehler durch fehlendes `chalk`-Paket, der
aber kein Repo-Bug ist, sondern ein fehlender Setup-Schritt).
