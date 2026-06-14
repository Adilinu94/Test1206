# Roadmap — framer-v4-pipeline-v2

> **Erstellt:** 2026-06-13 | **Quelle:** V4_DESIGN_IMPROVEMENTS_RESEARCH.md (v2)
> **Start:** Sprint 1 | **Ziel:** Design-Score 25% → 90%+
> **Status:** ✅ Alle 7 Sprints abgeschlossen (100 Tests, 26 Requirements)

---

## Phase 1: Sprint 1 — Quick Wins + Root-Cause Fix ✅ Complete

**Geschätzte Dauer:** ~5h | **Tatsächlich:** ~8h
**Erwarteter Impact:** DOM-Tiefe 8→6, Grid ≥10%, GV-Substitution ≥80%, GCs semantisch, Breakpoint-präzises Responsive

| Task | Typ | Aufwand | Datei(en) |
|------|-----|---------|-----------|
| **C2** Strict Grid Mapping | Enhancement | ~1.5h | `convert-xml-to-v4.js` |
| **C4** Semantic GC Naming | Enhancement | ~1h | `generate-global-classes.js` |
| **C5** Breakpoint-bewusstes Scaling | Enhancement | ~2h | `auto-scale-responsive.js` |
| **C6** Token-zu-GV-Substitution | Enhancement | ~2h | `convert-xml-to-v4.js` oder neu |
| **D3** GRID_VS_FLEXBOX_COVERAGE | Validierung | ~0.5h | `validate-v4-tree.js` |
| **Tests** 5 neue Test-Blöcke | Testing | ~1h | `pipeline.test.js` |

### Akzeptanzkriterien
- [x] `display:grid` in Framer-CSS → `e-div-block` im V4-Tree
- [x] GC-Namen folgen BEM-Pattern (`gc-surface-primary` nicht `gc-bg-1`)
- [x] `auto-scale-responsive.js` liest Breakpoints aus `tokens/responsive-breakpoints.json`
- [x] 0 Hardcoded-Hex-Werte im Output — alle Farben via `e-gv-XXXXXXXX`
- [x] `npm test` → 61/61 (+12 Tests)

---

## Phase 2: Sprint 2 — Components & Interactions ✅ Complete

**Geschätzte Dauer:** ~8h | **Tatsächlich:** ~8h
**Erwarteter Impact:** Components ≥5, V4-native Interaktionen, Component-Potential-Erkennung

| Task | Typ | Aufwand | Datei(en) |
|------|-----|---------|-----------|
| **A1** `extract-framer-components.js` | Neues Script | ~3h | Neu |
| **A2** `extract-framer-interactions.js` | Neues Script | ~3h | Neu |
| **C1** Component Preservation | Enhancement | ~2h | `convert-xml-to-v4.js` |
| **C3** V4-Native Routing (Easing + Route) | Enhancement | ~1h | `framer-animation-extractor.js` |
| **B1–B3** Pipeline-Integration | Integration | ~1h | McpBridge-Routing |
| **D1** COMPONENT_REUSE_POTENTIAL | Validierung | ~0.5h | `validate-v4-tree.js` |
| **Tests** 4 neue Test-Blöcke | Testing | ~1h | `pipeline.test.js` |

### Akzeptanzkriterien
- [x] Wiederholte Card-Strukturen → Component-Definition extrahiert
- [x] `data-framer-appear-id` → V4-native Interaction-JSON (kein GSAP)
- [x] `e-component` Widgets mit Properties im V4-Tree
- [x] Easing-Werte sind Elementor-Namen (`ease-out`, nicht `power2.out`)
- [x] `create-component`/`insert-component`/`edit-interaction` via McpBridge erreichbar
- [x] `npm test` → 67/67 (+6 Tests)

---

## Phase 3: Sprint 3 — Forms & Validierungs-Schließung ✅ Complete

**Geschätzte Dauer:** ~8h | **Tatsächlich:** ~3h
**Erwarteter Impact:** Atomic Forms, vollständige V4-Integration, 100% Validierungs-Coverage

| Task | Typ | Aufwand | Datei(en) |
|------|-----|---------|-----------|
| **A3** `extract-framer-forms.js` | Neues Script | ~3h | Neu |
| **B4** `create-atomic-form` Ability | Neue PHP-Ability | ~3h | Plugin |
| **D2** NATIVE_INTERACTION_COVERAGE | Validierung | ~1h | `validate-v4-tree.js` |
| **Tests** 2 neue Test-Blöcke | Testing | ~0.5h | `pipeline.test.js` |

### Akzeptanzkriterien
- [x] `<input>` mit Label → Atomic Form Struktur (`e-field-label` + `e-field-input`)
- [x] `create-atomic-form` Ability via MCP aufrufbar (Dokumentation + MCP-Routing)
- [x] `--animation-plan` Flag in `validate-v4-tree.js`
- [x] GSAP-Animationen die als V4-native mappbar sind → Warning im Validator
- [x] `npm test` → 71/71 (+4 Tests)

---

## Phase 4: Sprint 4 — Code-Review Remediation ✅ Complete

**Geschätzte Dauer:** ~5h | **Tatsächlich:** ~2h
**Quelle:** Sprint 2+3 Code-Review Findings (3 Punkte offen)

| Task | Typ | Aufwand | Datei(en) |
|------|-----|---------|-----------|
| **C3 Native Routing** | Enhancement | ~1.5h | `framer-animation-extractor.js` |
| **structuralHash Dedup** | Refactoring | ~0.5h | `framer-utils.js`, A1, D1 |
| **A2 v4-tree Mode** | Enhancement | ~1h | `extract-framer-interactions.js` |
| **Tests** 3 neue Test-Suiten | Testing | ~0.5h | `pipeline.test.js` |

### Akzeptanzkriterien
- [x] `mapEasingToGSAP` → `mapEasingToElementor` umbenannt (alle Referenzen)
- [x] `--native` Flag in `framer-animation-extractor.js` → V4-native JSON (`type: 'v4-native'`)
- [x] Legacy-GSAP-Pfad unverändert (ohne `--native`)
- [x] `structuralHash()` einmalig in `framer-utils.js` (keine Doppel-Definition)
- [x] A1 und D1 importieren `structuralHash` aus `framer-utils.js`
- [x] A2 `--v4-tree` Modus: Walked V4 Tree, erkennt opacity/transform → interactions
- [x] `npm test` → 77/77 (+6 Tests)

---

## Phase 5: Sprint 5 — Audit-Gap Remediation ✅ Complete

**Geschätzte Dauer:** ~4h | **Tatsächlich:** ~4h
**Quelle:** Codebase-Audit (3 kritische Lücken)

| Task | Typ | Aufwand | Datei(en) |
|------|-----|---------|-----------|
| **FIX-7** callParallel() p-limit | Fix | ~1h | `mcp-bridge.js` |
| **ENH-10** `extract-framer-dark-mode.js` | Neues Script | ~1.5h | Neu |
| **ENH-11** convert-xml-to-v4.js JSDoc | Documentation | ~1h | `convert-xml-to-v4.js` |
| **Tests** 3 neue Test-Suiten | Testing | ~0.5h | `pipeline.test.js` |

### Akzeptanzkriterien
- [x] `callParallel()` Worker-Pool mit `concurrency=3` (default)
- [x] `McpBridge.defaultConcurrency` via Constructor + `MCP_CONCURRENCY` env var
- [x] Dark-Mode-CSS → V4 Variable-Set JSON (Brace-Counting, Light-Token-Matching)
- [x] 9 Kernfunktionen in `convert-xml-to-v4.js` mit JSDoc (`@param`, `@returns`)
- [x] `npm test` → 83/83 (+6 Tests)

---

## Phase 6: Sprint 6 — Wizard Modularisierung ✅ Complete

**Geschätzte Dauer:** ~5h | **Tatsächlich:** ~5h
**Quelle:** Codebase-Audit (3 verbleibende Punkte)

| Task | Typ | Aufwand | Datei(en) |
|------|-----|---------|-----------|
| **preflight-check.js** standalone | Refactoring | ~1h | `preflight-check.js`, `cmd-preflight.js` |
| **wizard.js batch** | Neues Feature | ~1.5h | `cmd-batch.js` |
| **Wizard modular** | Refactoring | ~2.5h | `wizard.js` + 7 Module |
| **Tests** 3 neue Test-Suiten | Testing | ~0.5h | `pipeline.test.js` |

### Akzeptanzkriterien
- [x] `node scripts/preflight-check.js` standalone (8 Checks, --help, --json)
- [x] `wizard.js batch --pages a.xml,b.xml --post-ids 42,43`
- [x] Batch: empty-guard + Datei-Existenz-Validation + Batch-Summary JSON
- [x] wizard.js: 905→~300 Zeilen, 8 Module in `scripts/wizard/`
- [x] `npm test` → 88/88 (+5 Tests)

---

## Phase 7: Sprint 7 — Quality Hardening ✅ Complete

**Geschätzte Dauer:** ~3h | **Tatsächlich:** ~3h
**Quelle:** PLAN-6.md (3 Quality-Gaps aus Codebase-Audit)

| Task | Typ | Aufwand | Datei(en) |
|------|-----|---------|-----------|
| **FIX-10** --format markdown | Fix | ~1h | `extract-framer-dark-mode.js` |
| **FIX-11** wizard --help (6 cmd-*.js) | Fix | ~1h | 6 `cmd-*.js` + `wizard.js` |
| **FIX-12** token_name dedup | Fix | ~1h | `extract-framer-dark-mode.js` |
| **Tests** 3 neue Test-Suiten | Testing | ~0.5h | `pipeline.test.js` |

### Akzeptanzkriterien
- [x] `--format markdown` in `extract-framer-dark-mode.js` → Markdown-Tabelle
- [x] Alle 6 Wizard-Subcommands (`cmd-*.js`) mit konsistentem `printHelp()` Export
- [x] `wizard.js help <sub>` und `wizard.js <sub> --help` funktionieren
- [x] `suggestDarkTokenName()` mit Property-Suffix → keine Kollisionen
- [x] `npm test` → 100/100 (+12 Tests)

---

## Qualitätssprung (Metriken)

| Metrik | Vorher | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 | Sprint 5 | Sprint 6 | Sprint 7 |
|--------|--------|----------|----------|----------|----------|----------|----------|----------|
| DOM-Tiefe | 8 | ≤6 | ≤4 | ≤3 | ≤3 | ≤3 | ≤3 | ≤3 |
| Global Class % | 0% | ≥60% | ≥80% | ≥90% | ≥90% | ≥90% | ≥90% | ≥90% |
| GV-Substitution % | 0% | ≥80% | ≥90% | ≥95% | ≥95% | ≥95% | ≥95% | ≥95% |
| Grid-Nutzung | 0 | ≥10% | ≥25% | ≥35% | ≥35% | ≥35% | ≥35% | ≥35% |
| Components | 0 | 0 | ≥5 | ≥10 | ≥10 | ≥10 | ≥10 | ≥10 |
| Interaktionen | 0 | 0 | V4-native | V4-native | V4-native | V4-native | V4-native | V4-native |
| Tests | 49 | 61 | 67 | 71 | 77 | 83 | 88 | 100 |
| structuralHash | 
