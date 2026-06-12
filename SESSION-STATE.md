# SESSION-STATE.md — framer-v4-pipeline-v2

> **Letzte Aktualisierung:** 2026-06-12  
> **Pipeline-Version:** v0.7.0  
> **Repo:** https://github.com/Adilinu94/Test1206  
> **Primäre MCP-Verbindung:** `novamira-solar-local` → `http://solar.local/wp-json/mcp/novamira`

---

## Aktueller Status

| Bereich | Status |
|---------|--------|
| CI-Workflow | ✅ Korrigiert (P0-1) |
| PHP Abilities | ✅ Fatal Error behoben (P0-2) |
| Test-Fixtures | ✅ hero-section.xml ersetzt (P0-3) |
| Unit-Tests | 44 / 44 grün |
| E2E-Tests | 12 / 12 grün |

---

## Offene Tasks

Siehe `tasks/todo.md` für die vollständige Aufgabenliste.

Kurzübersicht Restarbeiten:
- `inject-animation-code.js`: N einzelne Calls → 1 `adrians-batch-inject-snippets`-Call refactoren
- Skill-Datei `framer-v4-pipeline.md`: Version und Cache-Hinweis aktualisieren (DX-4)
- `lint:version` Script: Analog dazu Test-Count-Lint prüfen (P1-3)

---

## Wichtige IDs & Sessions

> **Hinweis:** Session-abhängige IDs (e-gv-*, gc-*) werden NICHT hier gespeichert.  
> Diese ändern sich pro MCP-Session. Immer frisch via `adrians-setup-v4-foundation` abrufen.

---

## Environment

- **Lokale WP-Sites:** `solar.local` (LocalWP), `treetsshop.local`
- **Node-Version:** 18 / 20 / 22 (CI-Matrix)
- **Primärer Branch:** `main`
