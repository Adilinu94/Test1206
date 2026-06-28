# FORTSETZUNG — Stand 2026-06-28 (Session-Ende)

## ✅ Heute erledigt

### Umbauplan — Utility-Module & Integrationen

| Schritt | Aufgabe | Datei | Details |
|---------|---------|-------|---------|
| 7b | Idempotenz-Utility-Modul | `scripts/lib/idempotency.ts` | Call-Dedup per Promise-Sharing + TTL-Cache, 54/54 Tests |
| 7c | Batch Scheduler Utility-Modul | `scripts/lib/batch-scheduler.ts` | Priority-Queue + Concurrency + Retry + Batch-Window, 30/30 Tests |
| — | Circuit Breaker → mcp-bridge.ts | `scripts/lib/mcp-bridge.ts` | `CB_MCP_ENABLED=1`, optional |
| — | Circuit Breaker → unframer-bridge.ts | `scripts/lib/unframer-bridge.ts` | `CB_UNFRAMER_ENABLED=1`, optional |
| — | Idempotency → mcp-bridge.ts | `scripts/lib/mcp-bridge.ts` | `IDEM_MCP_ENABLED=1`, Layering: CB → Idempotency → HTTP |
| — | BatchScheduler → mcp-bridge.ts | `scripts/lib/mcp-bridge.ts` | `BS_MCP_ENABLED=1`, greift bei `priority`-Feld in `CallItem[]` |
| — | Idempotency → unframer-bridge.ts | `scripts/lib/unframer-bridge.ts` | `IDEM_UNFRAMER_ENABLED=1` |
| — | BatchScheduler → unframer-bridge.ts | `scripts/lib/unframer-bridge.ts` | `BS_UNFRAMER_ENABLED=1` |
| — | Typ-Dedup aufgelöst | `src/converter/{v4-tree-builder,framer-utils}.ts` + `scripts/lib/*` Proxies | 8 lokale Interface-Deklarationen durch Imports aus `src/types/{elementor-v4,framer,common}.ts` ersetzt; Proxies um `export type *` ergänzt; Typecheck Zero Errors |

### TypeScript-Migration — 27 Scripts migriert

| # | Datei | JS | TS | Status |
|---|-------|----|----|--------|
| 1 | `auto-scale-responsive.js` | — | 329 | ✅ |
| 2 | `convert-xml-to-v4.js` | 1.656 | 1.352 | ✅ |
| 3 | `generate-global-classes.js` | 980 | 1.030 | ✅ |
| 4 | `section-compare.js` | 956 | ~780 | ✅ |
| 5 | `validate-v4-tree.js` | 875 | ~750 | ✅ |
| 6 | `cross-validate-sources.js` | 757 | ~620 | ✅ |
| 7 | `framer-pre-build-validate.js` | 731 | ~510 | ✅ |
| 8 | `framer-animation-extractor.js` | 713 | ~650 | ✅ |
| 9 | `visual-qa.js` | 608 | ~580 | ✅ |
| 10 | `extract-framer-dark-mode.js` | 589 | ~470 | ✅ |
| 11 | `extract-framer-styles.js` | 584 | ~520 | ✅ |
| 12 | `post-build-auto-fix.js` | 532 | ~480 | ✅ |
| 13 | `build-dependency-graph.js` | 516 | ~430 | ✅ |
| 14 | `asset-to-wp-media.js` | 499 | ~400 | ✅ |
| 15 | `inject-animation-code.js` | 479 | ~320 | ✅ |
| 16 | `lint-test-count.js` | 442 | ~380 | ✅ |
| 17 | `extract-framer-css-tokens.js` | 408 | ~350 | ✅ |
| 18 | `generate-component-cache.js` | 388 | ~360 | ✅ |
| 19 | `integrate-responsive.js` | 157 | ~145 | ✅ |
| 20 | `extract-responsive-breakpoints.js` | 383 | ~340 | ✅ |
| 21 | `extract-framer-interactions.js` | 362 | ~380 | ✅ |
| 22 | `extract-framer-forms.js` | 346 | ~370 | ✅ |
| 23 | `design-token-extractor.js` | 394 | ~380 | ✅ |
| 24 | `build-quality-gate.js` | 360 | ~340 | ✅ |
| 25 | `verify-build-binding.js` | 110 | ~125 | ✅ |
| 26 | `resolve-fonts.js` | 225 | ~260 | ✅ |
| 27 | `html-to-widget-plan.js` | 280 | ~340 | ✅ |
| 28 | `run-post-build-qa.js` | 300 | ~330 | ✅ |
| 29 | `deduplicate-visual-qa.js` | 340 | ~330 | ✅ |
| 30 | `post-build-hook.js` | 280 | ~300 | ✅ |
| 31 | `expand-components.js` | 260 | ~280 | ✅ |
| 32 | `session-init.js` | 270 | ~290 | ✅ |
| 33 | `design-system-builder.js` | 295 | ~320 | ✅ |
| 34 | `extract-image-urls.js` | 291 | ~340 | ✅ |
| 35 | `check-v4-requirements.js` | 270 | ~290 | ✅ |
| 36 | `css-fallback-extractor.js` | 200 | ~230 | ✅ |
| 37 | `export-mcp-xml.js` | 296 | ~310 | ✅ |
| 38 | `extract-framer-components.js` | 287 | ~300 | ✅ |
| 39 | `inspect-v4-schemas.js` | 287 | ~320 | ✅ |
| 40 | `extract-style-map.js` | 263 | ~250 | ✅ |
| 41 | `profile-pipeline.js` | 238 | ~200 | ✅ |
| 42 | `generate-color-token-mapping.js` | 232 | ~190 | ✅ |
| 43 | `sync-schema.js` | 218 | ~190 | ✅ |
| 44 | `quarterly-audit.js` | 216 | ~200 | ✅ |
| 45 | `measure-quality-metrics.js` | 171 | ~160 | ✅ |
| 46 | `patch-v4-tree-media-ids.js` | 102 | ~110 | ✅ |
| 47 | `parallel-pre-build.js` | 92 | ~100 | ✅ |
| 48 | `preflight-check.js` | 55 | ~60 | ✅ |

### Infrastruktur

| Änderung | Datei | Grund |
|----------|-------|-------|
| `"dom"` zu `lib` hinzugefügt | `tsconfig.json` | Browser-Globals (`document`/`window`) in `page.evaluate()`-Callbacks |

---

## 📊 Aktueller Migrationsstand

| Ort | JS | TS | Migriert |
|-----|----|----|----------|
| `scripts/` | 0 | 48 | **48/48 TS (100%)** — JS-Altbestand gelöscht ✅ |
| `scripts/lib/` | 0 | 26 | **26/26 TS** — JS-Altbestand gelöscht ✅ |
| **Gesamt** | **0 JS** | **74 TS** | **Projekt 100% TypeScript** ✅ |

**Typecheck: ZERO ERRORS im gesamten Projekt** 🎉

**Alle Self-Tests grün:**
- Circuit Breaker: 58/58 ✅
- Idempotency: 54/54 ✅
- Batch Scheduler: 30/30 ✅

---

### Umbaplan Phase 1.2 — Modulare Restrukturierung (Strangler Fig)

| Schritt | Status | Was |
|---------|--------|-----|
| 1 | ✅ | `src/`-Verzeichnisstruktur angelegt (types/, extractor/, converter/, validator/, builder/, orchestrator/, cli/, skills/) |
| 2 | ✅ | `tsconfig.json` um `src/**/*.ts` erweitert |
| 3 | ✅ | `src/types/common.ts` — TokenMapping, StructuralHashOptions, PipelineState |
| 4 | ✅ | `src/types/elementor-v4.ts` — AtomicContainerOptions, TypedValue-Hierarchie, GuardResult |
| 5 | ✅ | `src/types/framer.ts` — ParsedFontPrefix, UnframerBridgeOptions, FramerExportManifest |
| 6 | ✅ | `src/types/novamira.ts` — McpBridgeOptions, JsonRpcRequest, WpPost, DesignSystemExport |
| 7 | ✅ | `framer-utils.ts` → `src/converter/framer-utils.ts` + Proxy in `scripts/lib/` |
| 8 | ✅ | `v4-tree-builder.ts` → `src/converter/v4-tree-builder.ts` + Proxy in `scripts/lib/` |
| 9 | ✅ | Typecheck: Zero Errors · Pipeline-Tests: 128/128 |
| 10 | ✅ | **State Manager ausgebaut** — SHA-256 Artifact-Integrität, Resume-Fähigkeit (UMBAUPLAN Phase 1.3) |
| 11 | ✅ | **V4 Novamira Abilities** — 6 neue MCP-Abilities in `v4-management/` (UMBAUPLAN Novamira Phase 1) |
| 12 | ✅ | Typ-Duplikation auflösen (Quell-Dateien auf `src/types/` umstellen) |
| 13 | ⬜ | Nächste Module verschieben (mcp-bridge, unframer-bridge, circuit-breaker, ...) |
| 14 | ⬜ | `wizard.js` + `scripts/wizard/*.js` → `src/cli/` als TypeScript |

## ⬜ Noch offen

### Umbauplan

| Schritt | Aufgabe | Wer |
|---------|---------|-----|
| 1 | GitHub Token revoke + .env Setup | User |
| 6 | TypeScript-Migration **ABGESCHLOSSEN** (48/48 = 100%) ✅ | Buffy |
| — | **State Manager Phase 1.3** — Hash-Integrität + Resume ✅ | Buffy |
| — | Modulare Restrukturierung `scripts/` → `src/` — Schritt 11-13 offen | Buffy |

### Offene Tasks

| # | Aufgabe |
|---|--------|
| 2 | Nächste Strangler-Fig-Module: mcp-bridge.ts → `src/builder/`, unframer-bridge.ts → `src/extractor/` |
| 3 | `wizard.js` + Subcommands zu TypeScript migrieren und nach `src/cli/` verschieben |

---

### V4 Novamira Abilities (Umbauplan Novamira Phase 1)

| Ability | Name | Datei | Beschreibung |
|---------|------|-------|-------------|
| `v4-setup-atomic-editor` | V4_Setup_Atomic_Editor | `class-v4-setup-atomic-editor.php` | Elementor-Experimente prüfen/aktivieren, Atomic-Feature-Report |
| `v4-setup-foundation` | V4_Setup_Atomic_Editor | `class-v4-setup-atomic-editor.php` | WordPress-Page mit V4-Root-Container anlegen |
| `v4-batch-build-page` | V4_Batch_Build_Page | `class-v4-batch-build-page.php` | V4-Element-Tree → WordPress Page (mit Tree-Validierung) |
| `v4-set-elementor-content` | V4_Batch_Build_Page | `class-v4-batch-build-page.php` | Direktes `_elementor_data`-Schreiben mit Cache-Purge |
| `v4-validate-security` | V4_Security | `class-v4-security.php` | XSS-Scan in Custom CSS + URLs (10 Pattern-Typen) |
| `v4-sanitize-content` | V4_Security | `class-v4-security.php` | Rekursiver Tree-Sanitizer (script, javascript:, on*, eval, -moz-binding) |

**Code-Review-Fixes:** Null-Safety (``$input ?? []``), XSS-Patterns erweitert, `preg_replace`-Null-Guards, DOTALL-Flag, `items`-Schema

| Funktion | Beschreibung |
|----------|-------------|
| `calculateHash(content)` | SHA-256 Hash für beliebige JSON-serialisierbare Inhalte |
| `addArtifact(state, key, path, statePath?)` | Datei einlesen, hashen, im State registrieren |
| `verifyArtifactIntegrity(state)` | Alle Artifacts re-hashen → `{valid, results[]}` |
| `listArtifacts(state)` | Alle registrierten Artifacts mit Metadaten auflisten |
| `removeArtifact(state, key, statePath?)` | Einzelnes Artifact entfernen |
| `clearArtifacts(state, statePath?)` | Alle Artifacts löschen |

**Tests:** 58/58 (20+ neue Artifact-Tests) ✅ · **Typecheck:** Zero Errors ✅ · **Abwärtskompatibel** ✅

---

## 🔧 Architektur-Übersicht

### Integration Layer (mcp-bridge.ts)

```
call() → CircuitBreaker (outer) → Idempotency (inner) → _callInternal (HTTP)
callParallel() → Worker-Pool oder BatchScheduler (wenn priority)
callSequence() → Sequential via this.call() (alle Protections)
```

### Integration Layer (unframer-bridge.ts)

```
call() → CircuitBreaker → Idempotency → _callInternal (HTTP)
callTool() → this.call() (Single Entry-Point, kein Double-Wrap)
callToolsParallel() → Worker-Pool oder BatchScheduler
```

### Env-Vars

| Variable | Modul | Bridge |
|----------|-------|--------|
| `CB_MCP_ENABLED=1` | CircuitBreaker | mcp-bridge |
| `CB_UNFRAMER_ENABLED=1` | CircuitBreaker | unframer-bridge |
| `IDEM_MCP_ENABLED=1` | Idempotency | mcp-bridge |
| `IDEM_UNFRAMER_ENABLED=1` | Idempotency | unframer-bridge |
| `BS_MCP_ENABLED=1` | BatchScheduler | mcp-bridge |
| `BS_UNFRAMER_ENABLED=1` | BatchScheduler | unframer-bridge |

---

## 🔧 Wichtige Befehle

```bash
# V4-Pipeline Typecheck
cd Framer-to-Elementor-V4-Pipeline-main
npx tsc --noEmit

# Self-Tests
node --import tsx scripts/lib/circuit-breaker.ts --self-test
node --import tsx scripts/lib/idempotency.ts --self-test
node --import tsx scripts/lib/batch-scheduler.ts --self-test

# Pipeline Unit-Tests
node --import tsx --test tests/pipeline.test.js

# site-clone Tests
cd site-clone-to-v3-main
npm install && npx vitest run tests/unit

# Orchestrator
bash orchestrator.sh help
```

## 🚀 Nächste Session starten mit

**Modulare Restrukturierung fortsetzen (Strangler Fig):**
1. Typ-Duplikation auflösen: `v4-tree-builder.ts` Typen aus `src/types/elementor-v4.ts` importieren
2. Nächste Module verschieben: `mcp-bridge.ts` → `src/builder/`, `unframer-bridge.ts` → `src/extractor/`
3. `wizard.js` + `scripts/wizard/*.js` zu TypeScript migrieren → `src/cli/`

**Bereits erledigt:**
- TypeScript-Migration: 48/48 scripts (100%) ✅
- JS-Altbestand `scripts/` + `scripts/lib/`: gelöscht ✅
- Type-Errors gefixt ✅
- Typecheck: ZERO ERRORS ✅
- Tests: 128/128 Pipeline + 142/142 Self-Tests ✅
- `src/`-Struktur + 4 Typ-Dateien + 2 Strangler-Fig-Module ✅
- **State Manager Phase 1.3: SHA-256 Artifact-Integrität + Resume (58/58 Tests)** ✅
- **Typ-Duplikation `src/converter/` ↔ `src/types/` aufgelöst (8 Interfaces)** ✅
