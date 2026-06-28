# PIPELINE.md — Vollständiger Build-Ablauf

> Kompakte Referenz für die Reihenfolge der Pipeline-Scripts. Ersetzt das
> Zusammensuchen aus `SESSION-STATE.md`, `tasks/todo.md` und einzelnen
> Script-Headern. Bei Änderungen an der Reihenfolge bitte hier nachziehen.

## 0. Session-Start (einmal pro Agent-Session)

```bash
# Live e-gv-*/gc-*-IDs vom MCP-Server abrufen, Foundation-Setup
node scripts/session-init.js --read-vars

# Optional: SESSION-STATE.md auf aktuellen Stand bringen
npm run session-init:update-state
```

## 1. XML-Quelle besorgen

```bash
# Normalfall: Unframer MCP getProjectXml() liefert XML oder JSON
# (Format wird in Schritt 2 automatisch erkannt, siehe Fix #4)

# Fallback, falls Unframer MCP offline ist oder keine Styles liefert (Fix #11):
npm run css-fallback:url -- https://my-site.framer.app/ --output-dir FramerExport/tokens/
# oder mit lokalem Export-HTML:
npm run css-fallback:html -- FramerExport/index.html --output-dir FramerExport/tokens/
```

## 2. Style-Map extrahieren

```bash
npm run extract-tokens -- --html FramerExport/index.html --output FramerExport/tokens/style-map.json
# erkennt automatisch XML vs. JSON-Input (Fix #4)
```

## 3. Components expandieren (falls Component-Instanzen vorhanden)

```bash
# Mode A (Plan-only, kein components-dir):
node scripts/expand-components.js --xml input.xml --output expanded-plan.json

# Mode B (Inline-Expansion, components-dir vorhanden):
node scripts/expand-components.js --xml input.xml --components-dir FramerExport/components/ --output expanded.xml
```

## 4. XML → V4-Tree konvertieren

Zwei Modi für den GC-Konflikt (Fix #1) — **nicht mischen**:

```bash
# Standard-Modus: background.color wird LOKAL gesetzt (Bug-3-Fix)
node scripts/convert-xml-to-v4.js \
  --xml expanded.xml \
  --tokens FramerExport/tokens/token-mapping.json \
  --style-map FramerExport/tokens/style-map.json \
  --output FramerExport/v4-tree/page.json \
  --validate

# ODER --prefer-gc-Modus: background.color NICHT lokal, GC übernimmt
# (schreibt zusätzlich page.gc-candidates.json)
node scripts/convert-xml-to-v4.js \
  --xml expanded.xml \
  --prefer-gc \
  --tokens FramerExport/tokens/token-mapping.json \
  --style-map FramerExport/tokens/style-map.json \
  --output FramerExport/v4-tree/page.json \
  --validate
```

CSS-Fallback kann auch direkt hier automatisch greifen, wenn style-map leer ist:

```bash
node scripts/convert-xml-to-v4.js --xml expanded.xml --framer-url https://my-site.framer.app/ --output page.json
```

Optionale WP-Theme-Defaults als letzter RC-11-Fallback (Punkt #7), falls weder
styleMap noch CSS-Fallback einen Wert liefern. Muss von einem Agenten mit
Live-WP/MCP-Zugriff befüllt werden — dieses Script fragt WordPress nicht
selbst ab:

```bash
node scripts/convert-xml-to-v4.js --xml expanded.xml --theme-defaults theme-defaults.json --output page.json
# Schema: { "heading": { "fontFamily", "fontSize", "fontWeight", "color" }, "body": {...} }
```

## 5. Responsive Breakpoints integrieren

```bash
npm run responsive -- --tree FramerExport/v4-tree/page.json --css FramerExport/index.html
# --skip-if-present verhindert Überschreiben bereits vorhandener Varianten (Default: an)
```

## 6. Global Classes generieren

**Muss zum Modus aus Schritt 4 passen:**

```bash
# Wenn Schritt 4 OHNE --prefer-gc lief (Standard):
npm run gc-generate -- --tree FramerExport/v4-tree/page.json --local-bg-set

# Wenn Schritt 4 MIT --prefer-gc lief:
npm run gc-generate -- --tree FramerExport/v4-tree/page.json \
  --gc-candidates FramerExport/v4-tree/page.gc-candidates.json
```

## 7. Validierung vor dem Push

```bash
npm run schema-validate -- --input FramerExport/v4-tree/page.json
npm run check-v4
npm run cross-validate
```

## 8. MCP-Export-Plan erzeugen

```bash
npm run export-mcp-plan -- --project-xml expanded.xml --node-id <root-id>
```

## 9. Animationen injizieren (Batch, Fix #2)

```bash
npm run inject-code -- --plan animation-plan.json
# läuft standardmäßig als 1 Batch-Call (adrians-batch-inject-snippets)
```

## 10. Post-Build Visual QA (Fix #13)

```bash
npm run post-build -- --post-id 4943 \
  --framer-url https://my-site.framer.app/ \
  --elementor-url http://solar.local/?p=4943
# Exit 0 = Build akzeptiert, Exit 1 = kritischer Fehler (Diff ≥ 10% oder QA-Fail)

# Ohne Browser-Zugriff: nur QA-Audits
npm run post-build:qa-only -- --post-id 4943
```

## Kurzreferenz: Welches Script für welchen Zweck?

| Zweck | Script | npm-Alias |
|-------|--------|-----------|
| XML → V4-Tree | `convert-xml-to-v4.js` | `convert` |
| Global Classes | `generate-global-classes.js` | `gc-generate` |
| Style-Map extrahieren | `design-token-extractor.js` | `extract-tokens` |
| CSS-Fallback (Offline-Schutz) | `css-fallback-extractor.js` | `css-fallback` |
| Responsive-Varianten | `integrate-responsive.js` | `responsive` |
| Components expandieren | `expand-components.js` | — |
| Tree-Validierung | `validate-v4-tree.js` | `schema-validate` |
| MCP-Export-Plan | `export-mcp-xml.js` | `export-mcp-plan` |
| Animationen (Batch) | `inject-animation-code.js` | `inject-code` |
| Post-Build QA + Screenshot-Diff | `post-build-hook.js` | `post-build` |
| Session-State aktualisieren | `session-init.js` | `session-init:update-state` |

Für CLI-Flag-Namenskonventionen siehe `CONVENTIONS.md`.
