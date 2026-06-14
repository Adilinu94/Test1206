# tasks/todo.md — framer-v4-pipeline-v2 Audit

> **Erstellt:** 2026-06-12 (Claude Sonnet 4.6 — vollständige Repo-Analyse)  
> **Zuletzt aktualisiert:** 2026-06-12 (alle Fixes committed)  
> **Basis:** Gründliche Analyse aller 40 JS-Dateien, 3 PHP-Files, CI-Workflow, Doku  
> **Repo:** https://github.com/Adilinu94/Test1206  
> **Pipeline-Version:** v0.7.0

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
- [ ] `PIPELINE_AUDIT_REPORT.md`: P0-1 und P0-2 als `[x] erledigt` markieren — optional/manuell

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
- [ ] `inject-animation-code.js` anpassen: N einzelne Calls → 1 Batch-Call (JS-seitige Optimierung, separater Task)

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

### DX-4 — Novamira Skill-Version `"1.0"` passt nicht zu Pipeline-Version `0.7.0`
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

- [ ] `inject-animation-code.js`: JS-seitig auf `adrians-batch-inject-snippets` umstellen (N→1 Calls)
- [ ] `PIPELINE_AUDIT_REPORT.md`: P0-Einträge als erledigt markieren
- [ ] `lint:version`-ähnliches Script: Test-Count in README automatisch prüfen

---

> **Hinweis:** Alle Fixes wurden in einem einzigen Commit gepusht (2026-06-12).  
> Live-Tests gegen solar.local wurden nicht durchgeführt.
