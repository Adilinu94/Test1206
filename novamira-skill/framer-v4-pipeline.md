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

**Reihenfolge (alle neu seit Sprint 17-E2E):**

```
0a. Unframer MCP erreichbar?     → node scripts/preflight/check-unframer-connectivity.js
0b. XML-Projekt-Match?           → node scripts/preflight/verify-xml-project-match.js --xml tools/framer-export/homepage.xml --target-url <framer-url>
0c. Guards-Klasse verfügbar?     → siehe session-start-checklist.md Schritt 2b
0d. V4-Experiments aktiv?        → siehe session-start-checklist.md Schritt 2c → ensure-elementor-experiments.js
0e. Novamira MCP erreichbar?     → novamira/adrians-setup-v4-foundation (oder elementor-check-setup als günstigen Call)
0f. Framer XML abrufbar?         → aus 0a ableitbar; bei FEHLER → web_fetch Fallback (siehe dual-source-workflow.md)
```

**Wenn ein MCP-Check fehlschlägt (STOP — User informieren):**

- **Unframer nicht erreichbar:** Fallback A/B/C aus `dual-source-workflow.md` "Fallback wenn Unframer MCP nicht erreichbar".
- **XML-Mismatch:** Frisches XML vom aktuellen Projekt erstellen — siehe `verify-xml-project-match.js` Output für Anleitung.
- **Guards fehlen:** Fallback-Pfad 9a/10a-c aktivieren.
- **V4-Experiments inaktiv:** `ensure-elementor-experiments.js` ausführen, danach ggf. erneut Phase-3.
- **Novamira MCP down:** Diagnose (siehe Fehlerbehebung-Tabellen), Recovery A/B/C.

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

**Schritt 2.6** — Animation-Extraktion (Live-Page, parallel zu Schritt 5-8) [NEU — Phase 1 Animation Pipeline]:

> **Pflicht-Schritt.** Extrahiert `data-framer-appear-id` Elemente von der Framer-Live-URL
> via Playwright und generiert einen GSAP-Animation-Plan. Komplementär zum statischen
> Export-Extraktor. Vollständiger Workflow: siehe `animation-workflow.md`.

```bash
# Live-Page Extraktion (Playwright — besucht die echte Framer-Seite):
node scripts/extract-framer-animations-live.js \
  --live-url <FRAMER_LIVE_URL> \
  --post-id POST_ID \
  --types framer,css \
  --output animation-plan-live.json \
  --verbose

# Statische Export-Extraktion (aus Framer HTML-Export):
node scripts/framer-animation-extractor.js \
  --html FramerExport/index.html \
  --post-id POST_ID \
  --types css,gsap,js,framer \
  --output animation-plan-export.json \
  --verbose
```

**Warum beide Extraktoren?**
| Extraktor | Quelle | Erfasst |
|-----------|--------|---------|
| `extract-framer-animations-live.js` | Live-Framer-URL (Playwright) | Computed-Style-Delta, tatsächliche Animation-Parameter |
| `framer-animation-extractor.js` | HTML-Export (statisch) | @keyframes, Inline-Scripts, alle CSS-Regeln |

> **Ohne Framer-Live-URL:** Nur der statische Export-Extraktor wird ausgeführt.
> Die Live-Extraktion produziert einen Dry-Run-Report (kein Fehler).
> In `SESSION-STATE.md` vermerken: `LIVE_ANIMATION_EXTRACTION_SKIPPED=true`.

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

**Schritt 9a** — Guards-Check (NEU — P1-B / BLOCKADE 3)
```
MCP: novamira/execute-php { code: "return class_exists('Novamira\\AdrianV2\\Helpers\\Guards') ? 'OK' : 'FEHLT';" }
```

**Bei `OK`:** Weiter mit Schritt 10.

**Bei `FEHLT`:** Fallback-Pfad aktivieren:

```
10a. novamira/create-post { title, slug, status, post_type: page }  → POST_ID
10b. novamira/execute-php { code: "update_post_meta(<id>, '_wp_page_template', 'elementor_canvas'); return true;" }
     → Hinweis: 'elementor_header_footer' ist ohne Pro fragiler → canvas bevorzugen.
10c. novamira/elementor-set-content { post_id, content: V4_TREE_ARRAY }
     → ⚠️ ACHTUNG: Parameter heißt `content`, NICHT `elements`! (Falle)
```

In `SESSION-STATE.md` vermerken: `BATCH_BUILD_PAGE_UNAVAILABLE=true`.

**Schritt 9** — Foundation aufrufen (IMMER live, nie aus Memory):
```
MCP: novamira/adrians-setup-v4-foundation { "post_id": POST_ID }
```
Gibt e-gv-* IDs und gc-* IDs zurueck. NUR diese IDs verwenden!

**Schritt 10** — Build ausführen:

**Template-Auswahl (nach Pro-Status — NEU P3-G):**

| Elementor Pro | Empfohlenes Template   | Grund |
|--------------|----------------------|-------|
| Aktiv         | `elementor_header_footer` | Vollständige Theme-Kontrolle |
| **Nicht aktiv** | **`elementor_canvas`**  | Robuster ohne Pro, weniger Theme-Konflikte |

Prüfe Pro-Status in Session-Start Schritt 2 (`elementor_pro.active`).

```
MCP: novamira-adrianv2/batch-build-page { post_id: POST_ID, elements: [...V4_TREE...] }
```

**Wenn `batch-build-page` nicht verfügbar (siehe Schritt 9a FEHLT):**
```
MCP: novamira/elementor-set-content { content: [...V4_TREE...], post_id: POST_ID }
```

**Ability-Parameter-Unterschiede (NEU P2-E / SCHWÄCHE 3 — Fallstrick-Referenz):**

| Ability                           | Tree-Parameter       | Template             | CSS nach Build       |
|-----------------------------------|---------------------|---------------------|---------------------|
| `novamira-adrianv2/adrians-batch-build-page` | `elements`    | `template: "..."`   | ✅ Auto             |
| `novamira/elementor-set-content`   | **`content`**        | — (separat)         | ❌ Manuell nötig    |

→ **Falle:** `elements` vs `content`! Bei Fallback (set-content) ist `content`
   ein Array, nicht `elements`. Sofortiger Abbruch bei Verwechslung.

Bei grossen Trees: erst per `build-dependency-graph.js` nach Sections aufteilen.

**Schritt 11** — CSS-Cache Force-Rebuild (NEU — P1-C / BLOCKADE 7, PFLICHT nach `set-content`)

Ohne diesen Schritt kann die Seite **leer erscheinen** trotz korrektem Content
(separat von Blockade 4 — kann auch bei korrekten Experiments passieren):

```
Tool: novamira/execute-php
code: |
  \Elementor\Plugin::$instance->files_manager->clear_cache();
  $css = new \Elementor\Core\Files\CSS\Post(<POST_ID>);
  $css->update();
  return ['css_rebuilt' => true];
```

→ `batch-build-page` macht das automatisch.
→ `set-content` NICHT — hier muss manuell rebuildet werden.

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

**Schritt 19** — GSAP Global Enqueue (einmalig, site-wide) [NEU — Phase 1 Animation Pipeline]:

> **NUR beim ersten Build einer Site ausführen.** Erstellt ein PHP-WPCode-Snippet
> das GSAP Core + ScrollTrigger via CDN global enqueued. `on_conflict: "skip"`
> verhindert Duplikate bei wiederholten Builds. Details: siehe `animation-workflow.md`.

```
MCP: novamira-adrianv2/adrians-code-injector { "title": "GSAP Global Enqueue", "type": "php", "code": "function enqueue_gsap_global() { wp_enqueue_script('gsap-core', 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js', [], '3.12.5', true); wp_enqueue_script('gsap-st', 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js', ['gsap-core'], '3.12.5', true); } add_action('wp_enqueue_scripts', 'enqueue_gsap_global');", "location": "site_wide_header", "priority": 10, "on_conflict": "skip", "tags": ["gsap", "enqueue", "global", "critical"] }
```

**Schritt 20** — MCP-Plan aus Live-Extraktion generieren:

```bash
# Live-Extraktions-Plan priorisieren (höhere Confidence):
node scripts/inject-animation-code.js \
  --plan animation-plan-live.json \
  --output animation-mcp-plan.json

# Falls LIVE_ANIMATION_EXTRACTION_SKIPPED=true, statischen Export-Plan verwenden:
node scripts/inject-animation-code.js \
  --plan animation-plan-export.json \
  --output animation-mcp-plan.json
```

**Schritt 21** — MCP-Batch-Call ausführen:

```
MCP: novamira-adrianv2/adrians-batch-inject-snippets { "snippets": <aus animation-mcp-plan.json Step 1> }
```

**Schritt 22** — Ergebnisse verifizieren:

```bash
node scripts/inject-animation-code.js --apply-results injection-results.json
```

> **Fehlerbehebung:** Siehe `animation-workflow.md` → Fehlerbehebung.
> Bei `failed: 1` im Batch: `--single-mode` für detaillierte Fehleranalyse.

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
| **Seite blank trotz `runtime_available: true`** | **e_atomic_elements deaktiviert** | **Pre-Schritt 2c: `ensure-elementor-experiments.js`** |
| **Seite blank DIREKT nach `elementor-set-content`** | **CSS-Cache nicht neu gebaut** | **Schritt 11 manuell ausführen** |
| **`batch-build-page` PHP Fatal: Class "Guards" not found** | **AdrianV2-Plugin veraltet/anders** | **Schritt 9a Guards-Check → Fallback-Pfad (10a-c)** |

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
