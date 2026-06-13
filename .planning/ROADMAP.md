# Roadmap — framer-v4-pipeline-v2

> **Erstellt:** 2026-06-13 | **Quelle:** V4_DESIGN_IMPROVEMENTS_RESEARCH.md (v2)
> **Start:** Sprint 1 | **Ziel:** Design-Score 25% → 90%+

---

## Phase 1: Sprint 1 — Quick Wins + Root-Cause Fix

**Geschätzte Dauer:** ~5h
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
- [ ] `display:grid` in Framer-CSS → `e-div-block` im V4-Tree
- [ ] GC-Namen folgen BEM-Pattern (`gc-surface-primary` nicht `gc-bg-1`)
- [ ] `auto-scale-responsive.js` liest Breakpoints aus `tokens/responsive-breakpoints.json`
- [ ] 0 Hardcoded-Hex-Werte im Output — alle Farben via `e-gv-XXXXXXXX`
- [ ] `npm test` → ≥54/54 (5 neue Tests)

---

## Phase 2: Sprint 2 — Components & Interactions

**Geschätzte Dauer:** ~8h
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
- [ ] Wiederholte Card-Strukturen → Component-Definition extrahiert
- [ ] `data-framer-appear-id` → V4-native Interaction-JSON (kein GSAP)
- [ ] `e-component` Widgets mit Properties im V4-Tree
- [ ] Easing-Werte sind Elementor-Namen (`ease-out`, nicht `power2.out`)
- [ ] `create-component`/`insert-component`/`edit-interaction` via McpBridge erreichbar
- [ ] `npm test` → ≥58/58 (4 neue Tests)

---

## Phase 3: Sprint 3 — Forms & Validierungs-Schließung

**Geschätzte Dauer:** ~8h
**Erwarteter Impact:** Atomic Forms, vollständige V4-Integration, 100% Validierungs-Coverage

| Task | Typ | Aufwand | Datei(en) |
|------|-----|---------|-----------|
| **A3** `extract-framer-forms.js` | Neues Script | ~3h | Neu |
| **B4** `create-atomic-form` Ability | Neue PHP-Ability | ~3h | Plugin |
| **D2** NATIVE_INTERACTION_COVERAGE | Validierung | ~1h | `validate-v4-tree.js` |
| **Tests** 2 neue Test-Blöcke | Testing | ~0.5h | `pipeline.test.js` |

### Akzeptanzkriterien
- [ ] `<input>` mit Label → Atomic Form Struktur (`e-field-label` + `e-field-input`)
- [ ] `create-atomic-form` Ability via MCP aufrufbar mit `post_id` + `form`-Parameter
- [ ] `--animation-plan` Flag in `validate-v4-tree.js`
- [ ] GSAP-Animationen die als V4-native mappbar sind → Warning im Validator
- [ ] `npm test` → ≥60/60 (2 neue Tests)

---

## Qualitätssprung (Metriken)

| Metrik | Vorher | Sprint 1 | Sprint 2 | Sprint 3 |
|--------|--------|----------|----------|----------|
| DOM-Tiefe | 8 | ≤6 | ≤4 | ≤3 |
| Global Class % | 0% | ≥60% | ≥80% | ≥90% |
| GV-Substitution % | 0% | ≥80% | ≥90% | ≥95% |
| Grid-Nutzung | 0 | ≥10% | ≥25% | ≥35% |
| Components | 0 | 0 | ≥5 | ≥10 |
| Interaktionen | 0 | 0 | V4-native | V4-native |
| Tests | 49 | ≥54 | ≥58 | ≥60 |

---

## Abgeschlossene Phasen

| Phase | Beschreibung | Status |
|-------|-------------|--------|
| 0 | Repo-Setup + Infrastruktur | ✅ v0.9.0 |
| 0.5 | Security & QA | ✅ |
| 0.2 | Schema-Dedup | ✅ |
| 1.2–1.4 | Resilienz & Integration | ✅ |
| 1.5 | Post-Build Auto-Fix | ✅ |
| 2.0 | Integration Fixes A-H | ✅ |
| 1.4+ | CI, Performance, UX, A11y | ✅ |
