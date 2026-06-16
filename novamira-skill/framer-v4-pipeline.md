---
slug: framer-v4-pipeline
title: Framer V4 Pipeline Workflow
description: Vollstaendiger Workflow fuer die Konvertierung einer Framer-Seite nach Elementor V4 mit dem framer-v4-pipeline-v2 Repository. Enthaelt alle 18 Schritte, Entscheidungslogik, kritische Invarianten und Fehlerbehandlung. Aktualisiert fuer Novamira Adrians Extra v1.0.0.
version: "0.7.0"
pipeline_min_version: "0.7.0"
tags: [framer, elementor, v4, pipeline, mcp, novamira]
---

# Framer V4 Pipeline Workflow

## Wann diesen Skill verwenden
Immer wenn eine Framer-URL in eine Elementor V4 WordPress-Seite konvertiert werden soll.
Dieser Skill ersetzt das manuelle Nachschlagen in BLUEPRINT.md.

## Kritische Regeln (niemals brechen)

1. NIEMALS adrians-batch-build-page fuer Framer-Trees -> elementor-set-content verwenden
2. setup-v4-foundation NIEMALS cachen (GV-IDs + GC-IDs sind session-live, laufen ab)
   adrians-export-design-system DARF 5 Minuten gecacht werden (read-only, sicher)
   Das Cache-Verbot gilt NUR fuer mutable state, nicht fuer read-only Exports
3. NIEMALS url:null in image-src -> url-Key komplett weglassen (Invariant IV)
4. Style-IDs OHNE Hyphens: shero nicht s-hero (Invariant III)
5. Visuelle Props NUR in styles, nie in settings (Invariant II)
6. Score framer-pre-build-validate.js muss >= 85% sein vor jedem Build
7. MCP-Calls IMMER ueber mcp-adapter-execute-ability (Adapter-Wrapper, nie direkt)

## Die 5 Invarianten

| # | Name | Regel |
|---|------|-------|
| I | Rendering-Gate | Jede ID in element.styles MUSS in settings.classes.value stehen |
| II | No-Settings-Styles | font-size, color, padding etc. NIEMALS in settings |
| III | Style-IDs | Lokale Style-IDs KEINE Hyphens (shero nicht s-hero) |
| IV | Image-Src | Wenn id gesetzt: url-Key komplett weglassen (nie url:null) |
| V | custom_css | Immer {"raw":"..."} Format, nie plain String |

## 18-Schritt Workflow

### Phase 0: MCP-Check (PFLICHT vor jedem Start)
- Pruefe Novamira MCP: novamira/adrians-setup-v4-foundation Test-Call
- Pruefe Unframer MCP: Framer XML abrufbar?
- Fehlt ein MCP -> STOP, User informieren

### Phase 1: Setup
```
node framer-v4-pipeline-v2/wizard.js
```
Fragt: Framer-URL, Scope, WordPress-Umgebung (testseite|treetsshop), Post-ID

### Phase 2: Pre-Build

**Schritt 1** - V4-Tree generieren:
```
node scripts/convert-xml-to-v4.js --xml framer-export.xml --map assets/image-map.json --output v4-tree.json
```

**Schritt 2** - Design-System exportieren (GV-IDs live holen, NIEMALS aus Memory):
```
MCP: novamira/adrians-export-design-system { "what": "all" }
-> als design-system-export.json speichern
```

> **Cache-Hinweis**: `McpDesignSystemCache` (scripts/lib/mcp-cache.js) cached diesen Export
> automatisch unter `.pipeline/design-system.json` (5 Min TTL via `PIPELINE_DESIGN_SYSTEM_CACHE_TTL`).
> Das ist korrekt — `adrians-export-design-system` ist read-only und ändert sich nicht
> während eines Pipeline-Durchlaufs. Nur `adrians-setup-v4-foundation` darf nie gecacht
> werden (GV-IDs und GC-IDs sind session-live und können sich ändern).

**Schritt 3** - Tokens extrahieren + GV-IDs mappen:
```
node scripts/design-token-extractor.js \
  --css exports/papaya/styles.css \
  --design-system design-system-export.json \
  --output token-mapping.json \
  --variables-plan variables-plan.json
```
variables-plan.json enthaelt fertige MCP-Calls mit strategy:"skip"

**Schritt 4** - Cross-Validation + GV-ID Drift Check (empfohlen):
```
node scripts/cross-validate-sources.js \
  --mcp-json mcp-tokens.json \
  --export-dir exports/papaya/ \
  --design-system design-system-export.json \
  --tree v4-tree.json
```
Check 7 prueft GV-ID Drift: im Tree referenziert aber nicht mehr im Kit.

**Schritt 5** - Global Classes generieren (bei Duplikat-Styles):
```
node scripts/generate-global-classes.js --tree v4-tree.json --output gc-plan.json
```
gc-plan.json: MCP-Calls via novamira/execute-php + adrians-add-global-class-variant

**Schritt 6** - Assets zu WP hochladen:
```
node scripts/asset-to-wp-media.js --dir exports/papaya/images/ --output image-map.json
```

**Schritt 7** - Media IDs patchen (Invariant IV):
```
node scripts/patch-v4-tree-media-ids.js v4-tree.json image-map.json v4-tree.json
```
Schreibt { "$$type": "image-attachment-id", "value": WP_ID } - url-Key FEHLT (Invariant IV).

**Schritt 8** - Pre-Build Validation (PFLICHT, Score >= 85%):
```
node scripts/framer-pre-build-validate.js --tree v4-tree.json --output validate-report.json
```
Score < 85% = Build wird blockiert. Alle 12 Guards muessen gruen sein.

### Phase 3: Build

**Schritt 9** - Foundation aufrufen (IMMER live, nie aus Memory):
```
MCP: novamira/adrians-setup-v4-foundation { "post_id": POST_ID }
```
Gibt e-gv-* IDs und gc-* IDs zurueck. NUR diese IDs verwenden!

**Schritt 10** - Build ausfuehren:
```
MCP: novamira/elementor-set-content { "post_id": POST_ID, "content": V4_TREE }
```
Bei grossen Trees: erst per build-dependency-graph.js nach Sections aufteilen.

### Phase 4: Post-Build QA

**Schritt 11** - Dump holen + Invariant I Check:
```
MCP: novamira/elementor-get-content { "post_id": POST_ID }
-> als elementor-dump.json speichern

node scripts/verify-build-binding.js elementor-dump.json
```
gc-* Global Classes werden korrekt ignoriert (kein false positive).

**Schritt 12** - Vollstaendige Schema-Validation (Invariant I-V):
```
node scripts/validate-v4-tree.js --tree elementor-dump.json
```
Unterstuetzt MCP snake_case (widget_type) und Pipeline camelCase (widgetType).

**Schritt 13** - Layout-Audit (NEU - Adrians Extra v1.0.0, PFLICHT):
```
MCP: novamira/adrians-layout-audit { "post_id": POST_ID }
```
Erkennt serverseitig: Pass-through-Container, Deep-Nesting >3, Single-Child-Wrapper,
Grid-Kandidaten (2D-Layout), Kicker-Row-Redundanz.
Bei Fehlern -> adrians-patch-element-styles mit add_style oder settings.
Tipp: element_id in adrians-add-element setzen -> element_ids bleiben stabil fuer Patches.

**Schritt 14** - Visual QA (NICHT ueberspringen!):
```
MCP: novamira/adrians-visual-qa { "post_id": POST_ID, "breakpoints": ["desktop","tablet","mobile"] }
```
Prueft: overflow, z-index Konflikte, negative margins, absolute overlap.

**Schritt 15** - Responsive-Audit:
```
MCP: novamira/adrians-responsive-audit { "post_id": POST_ID }
```
Bei fehlenden Breakpoints -> adrians-add-global-class-variant (kein Tree-Rebuild noetig):
```
MCP: novamira/adrians-add-global-class-variant { "class_id": "gc-xxx", "breakpoint": "mobile", "props": {...} }
```

**Schritt 16** - Variable-Drift-Check (NEU - Fix 5):
```
MCP: novamira/adrians-variable-audit { "report": "drift" }
```
Findet e-gv-* Referenzen die nicht mehr im Design-System existieren.
Bei Drift -> adrians-export-design-system -> design-token-extractor.js --existing-tokens.

**Schritt 17** - Style-Patches bei QA-Fehlern:
```
MCP: novamira/adrians-patch-element-styles { "post_id": POST_ID, "patches": [
  { "element_id": "hero-heading", "props": { "color": "e-gv-xxx" } },
  { "element_id": "cta-btn", "add_class": "gc-btn-primary" }
] }
```
Neu: add_style und add_class Parameter verfuegbar.

**Schritt 18** - Mehrere Posts auf einmal pruefen (NEU - Fix 4):
```
MCP: novamira/adrians-batch-get-content { "post_ids": [ID1, ID2], "mode": "skeleton" }
```
Ersetzt N einzelne elementor-get-content Calls.

## Fehlerbehebung

| Fehler | Ursache | Fix |
|--------|---------|-----|
| class_name_contains_spaces | Style-ID mit Hyphen | generateStyleId() - kein Hyphen |
| STYLE_CLASSES_BINDING FAIL | Style-ID nicht in classes.value | In settings.classes.value eintragen |
| Bild ladet nicht | url:null in image-src | url-Key komplett entfernen |
| Falsche Farben nach Build | GV-ID Drift | Schritt 2+4 erneut ausfuehren |
| elementor-set-content Timeout | Tree zu gross | build-dependency-graph.js -> Section-weise |
| custom_css crasht Site | Plain String statt {raw:...} | {"raw": "..."} Format erzwingen |
| GV-ID Drift | Kit-Update hat IDs verschoben | adrians-export-design-system -> cross-validate |
| GV-ID Drift (schnell) | e-gv-* nicht im Design-System | adrians-variable-audit { report: "drift" } -> Schritt 16 |
| Pass-through nach Build | Zu tiefe Verschachtelung | adrians-layout-audit -> IDs notieren -> patch-element-styles |
| Responsive fehlt | Global Class ohne mobile Variant | adrians-add-global-class-variant (kein Tree-Rebuild) |

## Artefakt-Dateinamen

```
v4-tree.json              <- convert-xml-to-v4 Output
image-map.json            <- Framer-URL -> WP Media ID Mapping
token-mapping.json        <- CSS Tokens -> GV-IDs
variables-plan.json       <- MCP-Calls fuer adrians-batch-create-variables (strategy:skip)
design-system-export.json <- adrians-export-design-system Output
gc-plan.json              <- MCP-Calls fuer Global Classes
validate-report.json      <- framer-pre-build-validate Output
elementor-dump.json       <- elementor-get-content Output
build-manifest.json       <- Wizard Summary mit allen Pfaden
```

## npm-Shortcuts

```bash
npm test               # 33 Regressionstests
npm run validate       # framer-pre-build-validate.js
npm run schema-validate # validate-v4-tree.js
npm run check-binding  # verify-build-binding.js
npm run token-extract  # design-token-extractor.js
npm run gc-generate    # generate-global-classes.js
npm run gc-execute     # generate-global-classes.js --execute (direkt via McpBridge)
npm run cross-validate # cross-validate-sources.js
npm run patch-media    # patch-v4-tree-media-ids.js
npm run auto-scale     # auto-scale-responsive.js
npm run dependency-graph # build-dependency-graph.js
npm run asset-upload   # asset-to-wp-media.js --execute (Batch-Upload via McpBridge)
npm run check-v4-auto  # check-v4-requirements.js --auto-call (elementor-check-setup)
npm run test:bridge    # mcp-bridge.js --self-test
```
