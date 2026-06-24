# AGENTS.md — Framer → Elementor V4 Pipeline

> **Master Agent Instructions** — Read this before working on this codebase.

---

## Golden Rules

1. **Teste vor dem Löschen**: Jedes Script ist über `npm run` oder `wizard.js` referenziert. Nicht voreilig löschen.
2. **Pipeline-Steps sind sequenziell**: Extraktion → Token-Mapping → Konvertierung → Validierung → Build → QA
3. **V4 Atomic Widgets sind Pflicht**: `$$type`-Annotationen müssen den Schemas in `schemas/` entsprechen.
4. **Global Classes > Inline Styles**: `generate-global-classes.js` VOR dem Build ausführen.
5. **Score ≥ 85% (doppeltes Gate)**: `framer-pre-build-validate.js` UND `design-diff` müssen VOR jeder Build-Freigabe ≥ 85% erreichen. `npm run design-diff -- --framer-url <URL> --elementor-url <URL>` ist Pflicht vor jedem Build.
6. **Kein Hardcoded-Hex**: Alle Farben als GV-Referenzen (`e-gv-*`), nicht als Hex-Werte.
7. **Framer→Elementor Pattern Library**: Vor jedem Build `FRAMER-VS-ELEMENTOR-PATTERNS.md` lesen. Kein Raten bei Layout-Übersetzungen (absolute/relative, flex-row, z-index, Pill-Buttons).

---

## Projektstruktur

```
├── wizard.js                  # Entry Point — interaktiver CLI-Wizard
├── scripts/
│   ├── convert-xml-to-v4.js   # ⭐ Zentral: Framer XML → V4 Widget Tree
│   ├── framer-pre-build-validate.js  # 12-Guard Pre-Build-Validation
│   ├── validate-v4-tree.js    # V4-Schema-Validator
│   ├── generate-global-classes.js    # GC-Vorschläge + Execution
│   ├── design-token-extractor.js     # CSS → Token-Mapping
│   ├── extract-framer-styles.js      # CSS aus HTML-Export
│   ├── extract-image-urls.js         # Asset-URLs aus HTML
│   ├── resolve-fonts.js              # Font-Referenzen auflösen
│   ├── extract-responsive-breakpoints.js  # Breakpoints aus CSS
│   ├── extract-framer-css-tokens.js  # Dual-Source CSS-Extraktion
│   ├── css-fallback-extractor.js     # Offline CSS-Fallback
│   ├── cross-validate-sources.js     # Quellen-Konsistenzcheck
│   ├── auto-scale-responsive.js      # Mobile/Tablet Varianten
│   ├── integrate-responsive.js       # Responsive-Orchestrator
│   ├── asset-to-wp-media.js          # Media-Upload-Queue
│   ├── patch-v4-tree-media-ids.js    # URLs → WP Media IDs
│   ├── build-dependency-graph.js     # Kahn-Algorithmus Build-Reihenfolge
│   ├── expand-components.js          # Framer-Components expandieren
│   ├── framer-animation-extractor.js # Animationen extrahieren
│   ├── inject-animation-code.js      # Animationen via WPCode injecten
│   ├── visual-qa.js                  # Browser-Visual-QA + A11y
│   ├── section-compare.js            # Framer-vs-Elementor Screenshot-Diff
│   ├── design-diff.js                # ⭐ Framer-vs-Elementor CSS-Vergleich (Post-Build Gate)
│   ├── analyze-framer-layout.js       # ⭐ Framer-Live-Layout-Analyse (Pre-Build)
│   ├── apply-design-diff-fixes.js     # Design-Diff → CSS Auto-Fix Generator
│   ├── run-post-build-qa.js          # Post-Build QA Report
│   ├── post-build-auto-fix.js        # QA → Auto-Fix MCP-Plan
│   ├── post-build-hook.js            # Automatischer Post-Build Hook
│   ├── build-quality-gate.js         # QA-Pipeline-Orchestrator
│   ├── verify-build-binding.js       # Invariant I Post-Build-Check
│   ├── sync-schema.js                # Schema-Sync vom V2-Plugin
│   ├── check-v4-requirements.js      # V4 Atomic Requirements Check
│   ├── session-init.js               # Session-Start Preflight
│   ├── wizard/
│   │   ├── cmd-pipeline.js           # 14-Step Full Pipeline
│   │   ├── cmd-batch.js              # Batch-Build
│   │   ├── cmd-preflight.js          # System-Checks
│   │   ├── cmd-doctor.js             # Erweiterte Diagnose
│   │   └── shared.js                 # Shared Helpers
│   └── lib/
│       ├── mcp-bridge.js             # MCP-Client
│       ├── framer-cache.js           # FramerExport-Cache
│       ├── elementor-version.js      # Elementor-Version-Detection
│       ├── wp-theme.js               # Theme-Detection
│       ├── rollback.js               # Rollback-Manager
│       └── pipeline-waves.js         # Wave-basierte Parallelisierung
├── novamira-skill/                   # AI-Agent Skills (Workflow-Anleitungen)
│   ├── elementor-v4-atomic-builder.md # V4 Atomic Widget Build (wichtigster Skill)
│   ├── framer-v4-pipeline.md         # Haupt-Pipeline-Skill
│   ├── dual-source-workflow.md       # Dual-Source (Unframer + FramerExport)
│   ├── animation-workflow.md         # GSAP/CSS-Animationen
│   ├── font-workflow.md              # Font-Management
│   ├── post-build-qa.md              # QA-Workflow
│   └── design-token-protocol.md      # Design-Token-Protokoll
├── schemas/                          # V4 JSON-Schemas
├── tests/                            # 430+ Unit/E2E-Tests
└── tools/framer-export/              # Externes FramerExport-CLI (vendored)
```

---

## Wichtige CLI-Befehle

```bash
npm test                    # Alle Tests (430+)
npm run convert             # XML → V4 Tree
npm run validate            # 12-Guard Pre-Build-Validation
npm run schema-validate     # V4-Schema-Validator
npm run gc-generate         # GC-Vorschläge
npm run token-extract       # Design-Token-Extraktion
npm run auto-scale          # Responsive-Varianten
npm run cross-validate      # Quellen-Konsistenzcheck
npm run visual-qa           # Browser QA
npm run section-compare     # Screenshot-Diff
npm run design-diff         # ⭐ Framer-vs-Elementor CSS-Vergleich (Post-Build Gate)
npm run session-init        # Preflight-Checks

node wizard.js pipeline --url <framer-url>   # Full 14-Step Pipeline
node wizard.js preflight                      # System-Checks
node wizard.js doctor                         # Erweiterte Diagnose
```

---

## Konventionen

- **Flags**: `--tree` für V4-Tree-JSON, `--xml` für Framer-XML, `--html` für HTML-Export
- **$$type-Annotationen**: Alle Style-Properties brauchen `$$type` (z.B. `$$type: "background"`, `$$type: "color"`)
- **IDs**: V4-Element-IDs sind 7-stellige Hex-Strings
- **Fehlercodes**: Exit 0 = OK, Exit 1 = Warnungen, Exit 2 = Kritischer Fehler
- **Siehe `CONVENTIONS.md`** für vollständige Konventionen

---

## Wichtige Abilities (Novamira MCP)

| Ability | Zweck |
|---|---|
| `novamira/elementor-check-setup` | V4 Atomic Verfügbarkeit prüfen |
| `novamira/adrians-setup-v4-foundation` | GV-IDs + Global Classes Setup |
| `novamira/elementor-set-content` | V4-Tree in Page deployen |
| `novamira/adrians-batch-build-page` | Batch-Build mit GC-Referenzen |
| `novamira/adrians-export-design-system` | Design-System exportieren |
| `novamira/adrians-batch-inject-snippets` | WPCode-Snippets batch-injecten |
| `novamira/adrians-batch-media-upload` | Medien batch-uploaden |

---

## Workflow: Framer → Elementor V4

```
1. FramerExport (tools/framer-export) → index.html + assets
2. Extraktion: styles, images, fonts, breakpoints, tokens
3. cross-validate-sources.js → Konsistenzcheck
4. convert-xml-to-v4.js → V4 Widget Tree
5. generate-global-classes.js → GC-Plan
6. framer-pre-build-validate.js → Score ≥ 85%
7. MCP: adrians-setup-v4-foundation → GV-IDs anlegen
8. MCP: elementor-set-content → Seite deployen
9. Post-Build QA: verify-build-binding + visual-qa + auto-fix + design-diff --design-diff-min-score 85
```
