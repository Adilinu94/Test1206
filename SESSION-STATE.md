# SESSION-STATE.md — framer-v4-pipeline-v2

> **Letzte Aktualisierung:** 2026-06-21  
> **Pipeline-Version:** v0.20.0  
> **Repo:** https://github.com/Adilinu94/Framer-to-Elementor-V4-Pipeline  
> **Primäre MCP-Verbindung:** `novamira-solar-local` → `http://solar.local/wp-json/mcp/novamira`

---

## Aktueller Status

| Bereich | Status |
|---------|--------|
| CI-Workflow | ✅ Aktiv (Node 18/20/22) |
| Unit-Tests | **434 / 434 grün** (inkl. `tools/framer-export` Subpackage-Deps installiert) |
| Neue Doku | `PIPELINE.md` (vollständiger Build-Ablauf), `CONVENTIONS.md` (CLI-Flag-Konventionen) |

### Sprint 19 — 9 Pipeline-Fixes (Commit `d28ede7`)

| Fix | Status |
|-----|--------|
| #1 GC-Konflikt background.color | ✅ `--prefer-gc`/`--local-bg-set` + generisches `--gc-candidates`-Begleitdatei-Schema |
| #2 inject-animation Batch | ✅ Bereits Standard |
| #3 SESSION-STATE Auto-Update | ✅ `session-init.js --update-session-state` |
| #4 JSON-Format-Detektion | ✅ `extract-style-map.js` |
| #5 RC-11 smart Fallback | ✅ styleMap-Heuristik |
| #6 Mode-B Test-Fixture | ✅ `tests/fixtures/component-mode-b.xml` |
| #11 CSS-Fallback | ✅ `css-fallback-extractor.js` + Auto-Trigger |
| #12 Responsive Integration | ✅ `integrate-responsive.js` |
| #13 Visual QA Auto-Hook | ✅ `post-build-hook.js` |

### Sprint 20 — Repo-Review-Punkte (dieser Commit)

| Punkt | Status |
|-------|--------|
| 1. Automatisierte Tests für Sprint-19-Fixes | ✅ `tests/sprint19-fixes.test.js`, 26 Tests, in `npm test` + `test:all` eingebunden |
| 2. `chalk`-Fehler in `tools/framer-export` | ℹ️ War kein Repo-Bug — CI installiert es bereits korrekt separat (`PUPPETEER_SKIP_DOWNLOAD=1 npm install --prefix tools/framer-export`). Nur in der Sandbox manuell nachgeholt. |
| 3. CLI-Flag-Namenskonvention | ✅ `CONVENTIONS.md` (dokumentiert IST-Zustand + Zielkonvention für neue Scripts, **keine bestehenden Flags umbenannt**) |
| 4. `--gc-candidates` generalisiert | ✅ Schema jetzt `{ "<category>": [...] }` statt nur `background`; Abwärtskompat zu Sprint-19-Schema getestet |
| 5. Pipeline-Dokumentation | ✅ `PIPELINE.md` (kompletter Ablauf inkl. beider GC-Modi) |
| 6. CSS-Extraktor-Konsolidierung | ✅ `css-fallback-extractor.js` nutzt jetzt `fetchPageHtml`/`extractStyleBlocks`/`extractCssVariables`/`extractBreakpoints` aus `extract-framer-css-tokens.js` statt eigener Duplikate |
| 7. WP-Theme-Defaults statt hartkodiert | ✅ `--theme-defaults <file>` Flag für `convert-xml-to-v4.js` als letzter RC-11-Fallback vor den statischen Inter/32px-Werten. **Hinweis:** Liest keine Live-WP-Daten — muss von einem Agenten mit MCP-Zugriff befüllt werden. |

---

## Neue Befehle (Sprint 19 + 20)

```bash
# Fix #3: SESSION-STATE.md automatisch aktualisieren
npm run session-init:update-state

# Fix #11: CSS-Fallback manuell testen (nutzt jetzt geteilte Extraktoren, Sprint 20)
npm run css-fallback -- --url https://my-site.framer.app/ --output-dir FramerExport/tokens/
npm run css-fallback -- --html FramerExport/index.html --output-dir FramerExport/tokens/

# Fix #12: Responsive Breakpoints in V4-Tree integrieren
npm run responsive -- --tree FramerExport/v4-tree/hero.json --css FramerExport/index.html

# Fix #13: Post-Build Visual QA Hook
npm run post-build -- --post-id 4943 \
  --framer-url https://my-site.framer.app/ \
  --elementor-url http://solar.local/?p=4943
npm run post-build:qa-only -- --post-id 4943

# Fix #1: Koordinierter GC-Modus (background als GC statt lokal)
npm run convert -- --prefer-gc --xml input.xml --output v4-tree.json
# → schreibt zusätzlich v4-tree.gc-candidates.json (generisches Kategorie-Schema, Sprint 20)
npm run gc-generate -- --tree v4-tree.json --gc-candidates v4-tree.gc-candidates.json

# Fix #1: Standard-Modus (Bug-3-Fix aktiv, background lokal)
npm run convert -- --xml input.xml --output v4-tree.json
npm run gc-generate -- --tree v4-tree.json --local-bg-set

# Sprint 20 Punkt #7: WP-Theme-Defaults statt hartkodierter RC-11-Fallbacks
npm run convert -- --xml input.xml --theme-defaults theme-defaults.json --output v4-tree.json
```

---

## Offene Tasks

Siehe `tasks/todo.md` für die vollständige Aufgabenliste.

Kurzübersicht noch offene Punkte:
- **Fix #8** (Helpers-Guard in `batch-create-variables`): offen
- **Novamira Fixes 4–8** (batch-get-content, variable-audit, memory-auto-fill, patch-element-styles multi-post, skill-list): offen
- **theme-defaults.json**: muss noch von einem Agenten mit Live-MCP-Zugriff auf `solar.local` mit echten Theme-Werten befüllt werden (aktuell nur Code-Unterstützung vorhanden, keine echten Werte)

---

## Wichtige IDs & Sessions

> **Hinweis:** Session-abhängige IDs (`e-gv-*`, `gc-*`) werden NICHT hier gespeichert.  
> Diese ändern sich pro MCP-Session. Immer frisch via `adrians-setup-v4-foundation` abrufen.

---

## Environment

- **Lokale WP-Sites:** `solar.local` (LocalWP), `treetsshop.local`
- **Node-Version:** 18 / 20 / 22 (CI-Matrix)
- **Primärer Branch:** `main`
