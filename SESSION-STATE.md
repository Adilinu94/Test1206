# SESSION-STATE.md — framer-v4-pipeline-v2

> **Letzte Aktualisierung:** 2026-06-20  
> **Pipeline-Version:** v0.20.0  
> **Repo:** https://github.com/Adilinu94/Framer-to-Elementor-V4-Pipeline  
> **Primäre MCP-Verbindung:** `novamira-solar-local` → `http://solar.local/wp-json/mcp/novamira`

---

## Aktueller Status

| Bereich | Status |
|---------|--------|
| CI-Workflow | ✅ Aktiv (Node 18/20/22) |
| Unit-Tests | 407 / 408 grün (1 Fail = vorbestehender `chalk`-Import-Fehler in `tools/framer-export`, unabhängig von dieser Session) |
| Fix #1 (GC-Konflikt) | ✅ `--prefer-gc`/`--local-bg-set` + Begleitdatei-Mechanismus (e2e-getestet) |
| Fix #2 (inject-animation Batch) | ✅ Bereits Standard — Batch ist Default |
| Fix #3 (SESSION-STATE Auto-Update) | ✅ `session-init.js --update-session-state` (verifiziert, funktioniert) |
| Fix #4 (JSON-Format-Detektion) | ✅ `extract-style-map.js` erkennt JSON + XML |
| Fix #5 (RC-11 smart Fallback) | ✅ styleMap-Heuristik in `convert-xml-to-v4.js` |
| Fix #6 (Mode-B Test-Fixture) | ✅ `tests/fixtures/component-mode-b.xml` |
| Fix #11 (CSS-Fallback) | ✅ `css-fallback-extractor.js` + `--framer-url` Auto-Trigger |
| Fix #12 (Responsive Integration) | ✅ `integrate-responsive.js` Orchestrator |
| Fix #13 (Visual QA Auto-Hook) | ✅ `post-build-hook.js` mit Diff-Threshold |

---

## Neue Befehle (diese Session)

```bash
# Fix #3: SESSION-STATE.md automatisch aktualisieren
npm run session-init:update-state

# Fix #11: CSS-Fallback manuell testen
npm run css-fallback -- --url https://my-site.framer.app/ --output-dir FramerExport/tokens/
npm run css-fallback -- --html FramerExport/index.html --output-dir FramerExport/tokens/

# Fix #12: Responsive Breakpoints in V4-Tree integrieren
npm run responsive -- --tree FramerExport/v4-tree/hero.json --css FramerExport/index.html

# Fix #13: Post-Build Visual QA Hook
npm run post-build -- --post-id 4943 \
  --framer-url https://my-site.framer.app/ \
  --elementor-url http://solar.local/?p=4943

# Fix #13: Nur QA-Audits (kein Browser nötig)
npm run post-build:qa-only -- --post-id 4943

# Fix #1: Koordinierter GC-Modus (background als GC statt lokal)
npm run convert -- --prefer-gc --xml input.xml --output v4-tree.json
# → schreibt zusätzlich v4-tree.gc-candidates.json (background-Werte, da nicht in props)
npm run gc-generate -- --tree v4-tree.json --gc-candidates v4-tree.gc-candidates.json

# Fix #1: Standard-Modus (Bug-3-Fix aktiv, background lokal)
npm run convert -- --xml input.xml --output v4-tree.json
npm run gc-generate -- --tree v4-tree.json --local-bg-set
```

---

## Offene Tasks

Siehe `tasks/todo.md` für die vollständige Aufgabenliste.

Kurzübersicht noch offene Punkte:
- **Fix #8** (Helpers-Guard in `batch-create-variables`): offen
- **Novamira Fixes 4–8** (batch-get-content, variable-audit, memory-auto-fill, patch-element-styles multi-post, skill-list): offen

---

## Wichtige IDs & Sessions

> **Hinweis:** Session-abhängige IDs (`e-gv-*`, `gc-*`) werden NICHT hier gespeichert.  
> Diese ändern sich pro MCP-Session. Immer frisch via `adrians-setup-v4-foundation` abrufen.

---

## Environment

- **Lokale WP-Sites:** `solar.local` (LocalWP), `treetsshop.local`
- **Node-Version:** 18 / 20 / 22 (CI-Matrix)
- **Primärer Branch:** `main`
