# framer-v4-pipeline-v2

> **Version:** v0.9.0 | **Stand:** 2026-06-13
> **GSD:** Phase 1 (Sprint 1 startbereit)

---

## What This Is

Ein **Standalone Node.js ESM Projekt** (18+ Scripts), das Framer-Website-Designs automatisiert in Elementor V4 Atomic Widget Trees konvertiert. Zielgruppe: WordPress-Agenturen und Entwickler, die Framer-Designs pixelgenau in Elementor V4 umsetzen wollen.

Die Pipeline orchestriert eine **3-Wege-Symbiose**: Unframer MCP (Live-Struktur-Reader) → Lokale Pre-Build-Processing-Pipeline (18+ Scripts) → Novamira MCP (WordPress Build-Execution). Output ist eine voll funktionsfähige V4-Seite mit Global Classes, Global Variables, Responsive Variants und Animationen.

---

## Core Value

**Token-effizienter, stabiler Framer→V4-Workflow** — eine einzige `wizard.js`-Ausführung wandelt eine Framer-URL in eine V4-Seite. Ohne manuelle Zwischenschritte, ohne V3-Wrapper-Fehler, mit voller Schema-Validierung und Rollback-Sicherheit.

---

## Requirements

### Validated (bereits implementiert & getestet)
- [x] Framer XML → V4 Widget-Tree Konvertierung (`convert-xml-to-v4.js`)
- [x] CSS-Extraktion & Design-Token-Mapping (`design-token-extractor.js`, `extract-framer-styles.js`)
- [x] Global Class Generator mit Duplikat-Erkennung (`generate-global-classes.js`)
- [x] Responsive Auto-Scaling (`auto-scale-responsive.js`)
- [x] Pre-Build-Validierung mit 12 Guards + Score ≥85% (`framer-pre-build-validate.js`)
- [x] MCP-Bridge: JSON-RPC 2.0 + Session-Handshake (`lib/mcp-bridge.js`)
- [x] Asset-Batch-Upload via McpBridge (`asset-to-wp-media.js --execute`)
- [x] Schema-Sync vom V2-Plugin (`sync-schema.js`)
- [x] Rollback & Split-Large-Tree (`lib/rollback.js`, `lib/split-large-tree.js`)
- [x] Animation-Extraktion aus Framer HTML (`framer-animation-extractor.js`)
- [x] Interaktiver CLI-Wizard (`wizard.js`) mit Phase 0–1.4
- [x] 49 Pipeline-Tests + 12 E2E-Tests + 4 Integration-Tests
- [x] GitHub CI (7 Jobs)

### Active (Sprint 1 — aktuell)

> Quelle: `V4_DESIGN_IMPROVEMENTS_RESEARCH.md` (v2, 2026-06-13)

| ID | Feature | Kategorie |
|----|---------|-----------|
| C2 | Strict Grid Mapping (RC-09 Upgrade) — echtes CSS-Grid-Parsing | Enhancement |
| C4 | Semantic GC Naming — BEM/Semantic-Naming mit Token-Bezug | Enhancement |
| C5 | Breakpoint-bewusstes Scaling — `auto-scale-responsive.js` liest `breakpoints.json` | Enhancement |
| C6 | Token-zu-GV-Substitutions-Pass — Root-Cause Fix für `#111111 × 45` | Enhancement |
| D3 | GRID_VS_FLEXBOX_COVERAGE Validierungs-Check | Validierung |

### Active (Sprint 2 — geplant)

| ID | Feature | Kategorie |
|----|---------|-----------|
| A1 | `extract-framer-components.js` — Component-Definitionen erkennen | Neues Script |
| A2 | `extract-framer-interactions.js` — V4 Pro Interactions | Neues Script |
| C1 | Component Preservation in `convert-xml-to-v4.js` | Enhancement |
| C3 | V4-Native Routing in `framer-animation-extractor.js` (Easing-Map + Route) | Enhancement |
| B1–B3 | Pipeline-Integration existierender Abilities (kein neues PHP) | Integration |
| D1 | COMPONENT_REUSE_POTENTIAL Validierungs-Check | Validierung |

### Active (Sprint 3 — geplant)

| ID | Feature | Kategorie |
|----|---------|-----------|
| A3 | `extract-framer-forms.js` — Atomic Forms | Neues Script |
| B4 | `create-atomic-form` Ability (PHP — einzige neue Ability) | Neue Ability |
| D2 | NATIVE_INTERACTION_COVERAGE (mit `--animation-plan` Flag) | Validierung |

### Out of Scope (v2+)

| Feature | Grund |
|---------|-------|
| Loop Grid Support | Dynamische Listendarstellung — kein Framer-Pendant in aktuellen Designs |
| Motion Effects (entrance_animation) | V4-API noch nicht stabil dokumentiert |
| Live-Preview im Wizard | Bereits als `wizard.js preview` implementiert |

---

## Context

### Technische Umgebung
- **Runtime:** Node.js ≥18, ESM (`"type": "module"`)
- **MCP-Server:** Unframer MCP (Live-Struktur-Reader) + Novamira MCP (WordPress-Build)
- **WordPress:** solar.local mit `novamira-adrianv2` Plugin (Elementor V4 Atomic)
- **Testing:** Node native test runner (`node --test`), pixelmatch + axe-core
- **CI:** GitHub Actions (7 Jobs)

### Projekt-Historie
- **v0.7.0**: Initiales Pipeline-Repo, 44 Tests, alle Integration-Fixes A-H
- **v0.8.0**: PIPELINE_AUDIT_REPORT — 15 Verbesserungen, Ability-Migration
- **v0.9.0**: Repo-Cleanup, Rollback-Cleanup, Split-Large-Tree Timeout-Fallback, Plugin CI/CD

### Aktuelle Post-4943 Analyse
- DOM-Tiefe 8 (Ziel: ≤3), 0% Global Classes (Ziel: ≥90%), 0 Grid, 0 Components
- `#111111` 45× dupliziert — Root-Cause: fehlender Token-zu-GV-Substitutions-Pass

---

## Constraints

| Constraint | Rationale |
|-----------|-----------|
| **Node.js ≥18** | ESM + native test runner + fetch API |
| **Kein V3-Wrapper** | `elementor-set-content` statt `adrians-batch-build-page` für Framer |
| **5 V4-Invarianten** | Style-Bindung (I), Style-Location (II), ID-Format (III), Image-Src (IV), Custom-CSS (V) |
| **Score ≥85%** | Pre-Build-Validierung blockiert Build bei Score <85% |
| **Keine globale npm-Installation** | Alle Packages via `package.json` devDependencies |
| **JSON-RPC 2.0 MCP** | Alle MCP-Calls via Adapter-Wrapper + Session-Handshake |

---

## Key Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| Standalone Pipeline (nicht WP-Plugin) | Entkopplung von WordPress, testbar ohne WP | Good |
| ESM Module | Zukunftssicher, native fetch/assert | Good |
| McpBridge statt direkter HTTP-Calls | Einheitliches JSON-RPC 2.0 Protokoll | Good |
| GC-Generator vor Build | Verhindert `#111111 × 45` Duplikate | Good |
| B1–B3 als existierend identifiziert | Kein neues PHP nötig (Plugin-Analyse) | Good |
| Sprint-Reihenfolge korrigiert (C1→Sprint 2) | C1 braucht A1 (Component-Extraktion) | Good |
| C6 als Root-Cause-Fix priorisiert | GV-Substitutions-Pass ist der fehlende Link | Pending |

---

> **Last Updated:** 2026-06-13 — GSD-Projekt initialisiert, Sprint 1 startbereit
