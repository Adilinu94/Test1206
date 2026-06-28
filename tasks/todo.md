# tasks/todo.md — Framer-to-Elementor-V4-Pipeline Audit

> **Erstellt:** 2026-06-12 (Claude Sonnet 4.6 — vollständige Repo-Analyse)  
> **Zuletzt aktualisiert:** 2026-06-26
> **Basis:** Gründliche Analyse aller 40 JS-Dateien, 3 PHP-Files, CI-Workflow, Doku  
> **Repo:** https://github.com/Adilinu94/Framer-to-Elementor-V4-Pipeline  
> **Pipeline-Version:** 0.2.0

---

## Legende

| Symbol | Bedeutung |
|--------|-----------|
| `[ ]` | offen |
| `[x]` | erledigt |
| `🔴 P0` | Kritisch — Build/CI bricht, fatale PHP-Fehler |
| `🟡 P1` | Wichtig — falsche Logik, veraltete Docs, Performance |
| `🔵 PHP` | Novamira Ability — fehlendes Feature |
| `🟢 DX` | Developer Experience / Dokumentation |

---

## 🔴 P0 — Kritische Bugs (sofort fixen)

### P0-1 — CI-Workflow: falsches `working-directory`, alle 7 Jobs schlagen lautlos fehl
- [x] `working-directory`-Zeilen aus allen 7 Jobs entfernt
- [x] `paths:`-Trigger auf tatsächliche Projektstruktur angepasst (`scripts/**`, `tests/**`, `wizard.js`, `package.json`)
- [x] Fix committed

### P0-2 — PHP Fatal Error: `adrians-delete-snippet.php` ruft undefinierte Funktion
- [x] `adrians-helpers.php` mit `novamira_find_wpcode_snippet()` angelegt
- [x] Funktion aus `adrians-code-injector.php` entfernt (Duplikat vermieden)
- [x] `require_once` in `adrians-code-injector.php` und `adrians-delete-snippet.php`
- [x] Fix committed

### P0-3 — Doppeltes Test-Fixture: `homepage.xml` = `hero-section.xml` (identisch)
- [x] `hero-section.xml` durch strukturell unterschiedlichen Export ersetzt (3×2 Feature-Grid statt Hero-Flexbox)
- [x] MD5-Hashes verifiziert: differ ✓
- [x] Fix committed

---

## 🟡 P1 — Wichtige Issues

### P1-1 — GSAP-Snippet: `addslashes()` bricht bei modernem JS
- [x] `adrians-code-injector.php`: `addslashes()` → `wp_json_encode()`
- [x] String-Interpolation `'{$inline_escaped}'` → direkter `wp_json_encode()`-Output
- [x] Fix committed

### P1-2 — `mcp-cache.js`: Cache cached Design-System statt MCP-Discovery
- [x] Klasse umbenannt: `McpCache` → `McpDesignSystemCache`
- [x] Methode umbenannt: `getOrDiscover()` → `getOrFetchDesignSystem()`
- [x] Default-Pfad korrigiert: `.pipeline/design-system.json`
- [x] TTL auf 300s (5min, session-appropriate) gesetzt
- [x] Deprecated Aliases für Rückwärtskompatibilität beibehalten
- [x] Fix committed

### P1-3 — README: Test-Anzahl veraltet
- [x] `README.md`: alle Vorkommen auf aktuellen Zähler aktualisiert (33 → 49, 10 Suiten)
- [x] `BLUEPRINT.md`: Test-Anzahl aktualisiert
- [x] Fix committed

### P1-4 — GC-Generierung ist "Optional" in `wizard.js`
- [x] `wizard.js`: GC-Generierung aus "Optional" in Pflichtschritt upgraden
- [x] `validate-v4-tree.js`: `checkDomDepth()` als C7 hinzugefügt (warning ≥4, error ≥6)
- [x] 2 neue Tests in `tests/pipeline.test.js` für DOM-Depth-Check (Suite 10)
- [x] `PIPELINE_AUDIT_REPORT.md`: P0-1 und P0-2 als `[x] erledigt` markieren — archiviert in docs/archive/

### P1-5 — `adrians-list-snippets.php`: DB-Query-Filter statt PHP-Filter
- [x] WP_Query um `meta_query` für `filter_type` erweitert
- [x] PHP-Loop-Filter-Block entfernt
- [x] `total` im Response jetzt korrekt (DB-Zähler via `$q->found_posts`)
- [x] Fix committed

---

## 🔵 PHP-Abilities — Fehlende Features

### PHP-1 — `adrians-get-snippet` fehlt
- [x] `adrians-get-snippet.php` angelegt (lookup via Titel oder snippet_id)
- [x] Capability-Check + `require_once` helpers
- [x] Fix committed

### PHP-2 — `adrians-batch-inject-snippets` (Batch-Modus für Animations-Workflow)
- [x] `adrians-batch-inject-snippets.php` implementiert (max 20 Snippets, delegiert an code-injector)
- [x] Fix committed
- [x] `inject-animation-code.js`: Batch ist Default (`adrians-batch-inject-snippets`), `--single-mode` nur noch Debug (Fix #2)

### PHP-3 — `adrians-delete-snippet`: `mode: "activate"` fehlt
- [x] `activate`-Branch in `adrians-delete-snippet.php` hinzugefügt (inkl. WPCode-Transient-Clear)
- [x] Fix committed

### PHP-4 — Fehlende Capability-Checks (Defense-in-Depth)
- [x] `adrians-code-injector.php`: Capability-Check nach Parameter-Lesen
- [x] `adrians-list-snippets.php`: Capability-Check
- [x] `adrians-delete-snippet.php`: Capability-Check
- [x] `adrians-get-snippet.php` und `adrians-batch-inject-snippets.php`: von Anfang an eingebaut
- [x] Fix committed

### PHP-5 — `wrapHtmlContent()` nicht in `framer-utils.js` exportiert
- [x] `wrapHtmlContent()` in `framer-utils.js` exportiert
- [x] Lokale Definition in `convert-xml-to-v4.js` entfernt
- [x] Import-Zeile in `convert-xml-to-v4.js` erweitert
- [x] 3 neue Tests in `tests/pipeline.test.js` (normaler Text, leerer String, HTML-Tags)
- [x] Fix committed

---

## 🟢 DX & Dokumentation

### DX-1 — `SESSION-STATE.md` und `tasks/todo.md` nicht im Repo
- [x] `tasks/todo.md` angelegt (diese Datei)
- [x] `SESSION-STATE.md` angelegt
- [x] Fix committed

### DX-2 — `mcp-server-config.example.json` fehlt
- [x] `mcp-server-config.example.json` angelegt (inkl. Remote-Server-Beispiel + Base64-Hinweis)
- [x] Fix committed

### DX-3 — `.gitignore`: Mehrere Pipeline-Artefakte fehlen
- [x] `reports/`, `animation-plan.json`, `rollback-plan.json`, `.pipeline/`, `mcp-server-config.json` ergänzt
- [x] Fix committed

### DX-4 — Novamira Skill-Version `"1.0"` passt nicht zu Pipeline-Version `0.2.0`
- [x] `framer-v4-pipeline.md`: `version: "0.7.0"` + `pipeline_min_version: "0.7.0"` gesetzt
- [x] Cache-Hinweis: `McpDesignSystemCache` statt `mcp-bridge.js` + korrekter Pfad
- [x] Fix committed

---

## Status-Übersicht

| Priorität | Anzahl | Erledigt | Offen |
|-----------|--------|----------|-------|
| 🔴 P0 Kritisch | 3 | 3 | 0 |
| 🟡 P1 Wichtig | 5 | 5 | 0 |
| 🔵 PHP-Abilities | 5 | 5 | 0 |
| 🟢 DX / Docs | 4 | 4 | 0 |
| **Gesamt** | **17** | **17** | **0** |

**Test-Zähler:** 49 Unit-Tests in 10 Suiten — alle grün ✅

---

## Offene Nice-to-have (nicht im ursprünglichen Audit)

- [x] `inject-animation-code.js`: JS-seitig auf `adrians-batch-inject-snippets` umgestellt — Batch ist Standard (Fix #2)
- [x] `PIPELINE_AUDIT_REPORT.md`: P0-Einträge als erledigt markieren — archiviert in docs/archive/
- [x] `lint:version`-ähnliches Script: Test-Count in README automatisch prüfen — `scripts/lint-test-count.js` existiert

---

> **Hinweis:** Alle Fixes wurden in einem einzigen Commit gepusht (2026-06-12).  
> Live-Tests gegen solar.local wurden nicht durchgeführt.

---

## ✅ Sprint 19 Fixes (2026-06-19)

### Fix #1 — GC-Konflikt background.color koordiniert
- [x] `convert-xml-to-v4.js`: `--prefer-gc` Flag (background NICHT lokal → GC übernimmt)
- [x] `generate-global-classes.js`: `--local-bg-set` Flag (Background-GC überspringen wenn lokal gesetzt)
- [x] Beide Modes explizit koordiniert, kein Doppel-Styling möglich

### Fix #2 — inject-animation-code.js Batch
- [x] Batch war bereits Default — als Done markiert + todo.md bereinigt

### Fix #3 — SESSION-STATE.md Auto-Update
- [x] `session-init.js`: `--update-session-state` Flag schreibt SESSION-STATE.md neu
- [x] Version aus `package.json`, Repo-URL korrigiert, Datum automatisch
- [x] npm-Script: `session-init:update-state`

### Fix #4 — extract-style-map.js JSON-Format-Detektion
- [x] `detectFormat()` am Anfang: erkennt JSON vs XML
- [x] Bei JSON: direkter Parse von `{ textStyles, colorStyles }` ohne leere Map

### Fix #5 — RC-11 smarter Fallback via styleMap
- [x] Node-Name-Heuristik: heading → größter TextStyle, body → kleinster
- [x] Statische Fallbacks (Inter/32px) nur noch wenn styleMap leer

### Fix #6 — expand-components.js Mode-B Test-Fixture
- [x] `tests/fixtures/component-mode-b.xml`: Page mit 2x Feature-Card + CTA
- [x] `tests/fixtures/components/comp-feature-card.xml`
- [x] `tests/fixtures/components/comp-cta-block.xml`

### Fix #11 — CSS-Fallback automatisch
- [x] `scripts/css-fallback-extractor.js`: crawlt Framer-URL oder liest HTML
- [x] `convert-xml-to-v4.js`: Auto-Trigger via `--framer-url` / `--framer-html` wenn styleMap leer
- [x] npm-Scripts: `css-fallback`, `css-fallback:url`, `css-fallback:html`

### Fix #12 — Responsive Breakpoints Pipeline-Integration
- [x] `scripts/integrate-responsive.js`: Orchestriert extract-responsive-breakpoints + auto-scale-responsive
- [x] `--skip-if-present` Guard: überschreibt keine vorhandenen Breakpoints
- [x] npm-Scripts: `responsive`, `responsive:with-css`

### Fix #13 — Visual QA Post-Build-Hook automatisch
- [x] `scripts/post-build-hook.js`: Screenshot-Diff + QA-Audits in einem Schritt
- [x] Diff-Threshold (Default 10%), exit 0/1 für Agent-Signal
- [x] `build-quality.json` mit `agent_verdict` Klartext
- [x] npm-Scripts: `post-build`, `post-build:qa-only`, `post-build:dry`

### Offen (nächste Session)
- [x] Fix #8: Helpers-Guard in `batch-create-variables` — implementiert in class-batch-create-variables.php (v1.1.0)
- [x] Novamira Fixes 4–8: batch-get-content, variable-audit, memory-auto-fill, patch-element-styles multi-post, skill-list — alle in novamira-adrianv2 implementiert und gepusht

---

## ✅ Sprint 20 Fixes (2026-06-21) — Repo-Review-Punkte

### Punkt #1 — Automatisierte Tests für Sprint-19-Fixes
- [x] `tests/sprint19-fixes.test.js`: 26 Tests für alle 9 Sprint-19-Fixes
- [x] In `npm test` + `npm run test:all` eingebunden (lief vorher nirgends!)
- [x] 2 echte Bugs während Test-Entwicklung gefunden & gefixt:
  - `session-init.js --update-session-state` traf den falschen von zwei `process.exit(0)`-Aufrufen und lief nie
  - `--prefer-gc` machte background für `generate-global-classes.js` komplett unsichtbar (kein `--gc-candidates`-Mechanismus vorhanden)

### Punkt #2 — chalk-Fehler in tools/framer-export
- [x] Kein Repo-Bug — CI installiert bereits korrekt separat. Nur Sandbox-Setup-Schritt nachgeholt.
- [x] Dokumentiert in `CONVENTIONS.md` Abschnitt 5, damit es nicht wieder verwechselt wird.

### Punkt #3 — CLI-Flag-Namenskonvention
- [x] `CONVENTIONS.md`: IST-Zustand dokumentiert (--xml/--tree/--project-xml/--element-tree/--unframer-xml)
- [x] Zielkonvention für neue Scripts festgelegt (--input/--tree/--output/--style-map/--tokens)
- [x] Bewusst KEINE bestehenden Flags umbenannt (Breaking Change, hoher Blast-Radius für Skills/Agent-Workflows)

### Punkt #4 — --gc-candidates generalisiert
- [x] Schema von `{ background: [{id,color}] }` auf `{ "<category>": [{category,id,prop,value}] }` generalisiert
- [x] Abwärtskompatibilität zum alten Sprint-19-Schema getestet
- [x] Synthetischer Test mit frei erfundener Kategorie "border" beweist Generalisierung

### Punkt #5 — Pipeline-Dokumentation
- [x] `PIPELINE.md`: vollständiger Build-Ablauf, beide GC-Modi, Script-Kurzreferenz-Tabelle

### Punkt #6 — CSS-Extraktor-Konsolidierung
- [x] `css-fallback-extractor.js` nutzt jetzt `fetchPageHtml`/`extractStyleBlocks`/
      `extractCssVariables`/`extractBreakpoints` aus `extract-framer-css-tokens.js`
      (jetzt exportiert, `main()` hinter Entry-Point-Guard abgesichert)
- [x] Bonus: externe Stylesheet-Auflösung (`<link rel="stylesheet">`) jetzt automatisch mit dabei
- [x] Eigenständige `.framer-text-*`-Klassen-Extraktion bleibt (einziger echter Mehrwert ggü. bestehenden Extraktoren)

### Punkt #7 — WP-Theme-Defaults statt hartkodiert
- [x] `--theme-defaults <file>` Flag für `convert-xml-to-v4.js`
- [x] Greift als letzter RC-11-Fallback, bevor auf statisches Inter/32px/#111111 zurückgefallen wird
- [x] **Wichtige Einschränkung:** Liest KEINE Live-WP-Daten — `theme-defaults.json` muss von
      einem Agenten mit echtem MCP-Zugriff auf `solar.local` befüllt werden. Diese Session
      hatte keinen Live-MCP-Zugriff im Sandbox, daher nur Code-Unterstützung, keine echten Werte.

Test-Status nach Sprint 20: **434 / 434 grün** (vorher 407/431 je nach Sandbox-Setup).
