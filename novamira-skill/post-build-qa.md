---
slug: post-build-qa
title: Post-Build QA Workflow
description: Vollständiger QA-Workflow nach jedem Framer → Elementor V4 Build. Definiert die Reihenfolge aller 7 QA-Schritte (layout-audit, visual-qa, responsive-audit, variable-audit, browser-qa, section-compare, auto-fix), ihre Exit-Codes, Fehler-Interpretation und den Patch-Workflow bei Issues. Deckt run-post-build-qa.js, visual-qa.js, section-compare.js und post-build-auto-fix.js ab.
version: "0.7.0"
pipeline_min_version: "0.7.0"
tags: [qa, layout-audit, visual-qa, responsive, wcag, section-compare, auto-fix]
---

# Post-Build QA Workflow

## Wann diesen Skill verwenden
IMMER nach `elementor-set-content` oder `adrians-batch-build-page`. Kein Build
gilt als abgeschlossen ohne vollständige QA. Die QA-Kette ist Pflicht, nicht optional.

---

## Kritische Regeln

1. QA NACH dem Build — nie überspringen oder auf „später" verschieben
2. `adrians-layout-audit` ist PFLICHT (Schritt 1) — ohne Layout-Audit fehlt der Server-seitige Check
3. `run-post-build-qa.js` generiert NUR einen Report — er führt keine MCP-Calls aus
4. Patches via `adrians-patch-element-styles` — nie Tree rebuilden für Style-Fixes
5. `section-compare.js` braucht Playwright oder Puppeteer — in CI: `--dry-run`

---

## 7-Schritt QA-Reihenfolge

```
Build fertig
    │
    ├── 1. adrians-layout-audit      (Server, Pflicht)
    ├── 2. adrians-visual-qa         (Server, Pflicht)
    ├── 3. adrians-responsive-audit  (Server, Pflicht)
    ├── 4. adrians-variable-audit    (Server, empfohlen)
    ├── 5. visual-qa.js              (Browser, empfohlen)
    ├── 6. section-compare.js        (Browser, optional)
    └── 7. post-build-auto-fix.js    (Konsolidierung + Auto-Patch)
```

---

## Schritt 0 — Rendering-Sanity-Check (NEU — P1-D / vor allem anderen)

**Hintergrund:** Nach `elementor-set-content` oder `batch-build-page` kann die
Seite **leer** erscheinen trotz `success: true`. Mögliche Ursachen:
1. **e_atomic_elements deaktiviert** (separat von `runtime_available`) — siehe
   Session-Start Schritt 2c / `ensure-elementor-experiments.js`
2. **CSS-Cache nicht neu gebaut** — insbesondere nach `set-content`. Siehe
   `framer-v4-pipeline.md` Schritt 11.
3. Empty Build (Element ohne Children aber mit `variants:[]`).

Dieser Step fängt alle 3 früh ab:

```bash
Tool: novamira/execute-php
code: |
  $content = \Elementor\Plugin::$instance->frontend->get_builder_content(<POST_ID>, true);
  return [
    'renders'      => strlen($content) > 500,
    'length'       => strlen($content),
    'has_atomic'   => str_contains($content, 'e-') || str_contains($content, 'elementor-widget'),
    'has_classes'  => str_contains($content, 'class="'),
    'http_status'  => wp_remote_get(get_permalink(<POST_ID>))['response']['code'] ?? 0,
    'experiment_check' => \Elementor\Plugin::$instance->experiments->is_feature_active('e_atomic_elements'),
  ];
```

**Interpretation:**

| Rückgabe                 | Bedeutung                              | Aktion |
|--------------------------|---------------------------------------|--------|
| `renders: false`         | Experiment inaktiv ODER Cache leer    | Schritt 2c (`ensure-elementor-experiments`) + Schritt 11 (CSS-Rebuild) |
| `length < 500`           | Empty Build / kein V4-Output          | `elementor-get-content` → Tree prüfen |
| `http_status != 200`     | 500/404 oder Permalink falsch         | Browser manuell prüfen |
| `experiment_check: false`| Atomic Experiment inaktiv             | Schritt 2c sofort ausführen |

Wenn dieser Check PASST → weiter mit Schritt 1 (Layout-Audit).

⚠️ **NICHT überspringen:** Die häufigste Ursache für "war sieht die Seite
aus wie vorher / build hat nichts gemacht" ist genau dieser Check, der nie
ausgeführt wurde.

## Schritt 1 — Layout-Audit (Server-seitig, PFLICHT)

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/adrians-layout-audit"
  parameters: { "post_id": POST_ID }
```

**Erkennt:**
- Pass-through-Container (leere Wrapper ohne Funktion)
- DOM-Tiefe > 3 Level (Performance-Risiko)
- Single-Child-Wrapper (unnötige Verschachtelung)
- Grid-Kandidaten (2D-Layout in Flexbox → sollte Grid sein)
- Redundante Kicker-Rows

**Interpretation:**
```json
{
  "issues": [
    { "type": "deep_nesting", "element_id": "hero-wrapper", "depth": 5, "message": "..." },
    { "type": "pass_through", "element_id": "col-empty", "message": "..." }
  ],
  "passed": false
}
```

**Fix für Layout-Issues:**
```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/adrians-patch-element-styles"
  parameters:
    post_id: POST_ID
    patches:
      - element_id: "hero-wrapper"
        action: "remove"           ← Pass-through Container entfernen
```

---

## Schritt 2 — Visual QA (Server-seitig, PFLICHT)

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/adrians-visual-qa"
  parameters:
    post_id: POST_ID
    breakpoints: ["desktop", "tablet", "mobile"]
```

**Erkennt (ohne Browser):**
- Overflow-Risiken (Element breiter als Container)
- Z-Index-Konflikte (überlappende Elemente)
- Negative Margins (Layout-Bugs)
- Absolut-positionierte Overlaps

**Ausgabe:**
```json
{
  "issues": [],
  "total_issues": 0
}
```

⚠️ **Bekannter Bug: variable-audit False Positives**

`novamira-adrianv2/variable-audit` meldet `defined_count: 0` obwohl die
Variablen existieren. Drift-Warnungen für `e-gv-XXXXX` können False
Positives sein.

**Verifikation wenn Drift gemeldet:**
```bash
# Cross-Check mit elementor-list-variables
novamira/elementor-list-variables → listet ALLE existierenden e-gv-* IDs
```

**Echter Drift:** Variable weder in `elementor-list-variables` noch im
Design-System sichtbar.

**False Positive Pattern:** `audit` meldet `defined: 0` aber `list-variables`
zeigt alle IDs korrekt → audit intern Cache/State-Problem; ggf. Plugin neu
laden oder audit später erneut ausführen (nicht Build-blockierend).

---

## Schritt 3 — Responsive-Audit (Server-seitig, PFLICHT)

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/adrians-responsive-audit"
  parameters: { "post_id": POST_ID }
```

**Fix für fehlende Breakpoints (kein Tree-Rebuild nötig!):**
```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/adrians-add-global-class-variant"
  parameters:
    class_id: "gc-abc123"
    breakpoint: "mobile"
    props:
      font-size: { "$$type": "size", "value": { "size": 28, "unit": "px" } }
      padding: { "$$type": "dimensions", "value": { ... } }
```

---

## Schritt 4 — Variable-Audit / GV-Drift-Check (empfohlen)

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/adrians-variable-audit"
  parameters: { "report": "drift" }
```

**Erkennt:** `e-gv-*` Referenzen im Build die nicht mehr im Design-System existieren.

**Fix bei Drift:**
```bash
# Design-System neu exportieren:
MCP: novamira/adrians-export-design-system { "what": "all" }

# Token-Mapping aktualisieren:
node scripts/design-token-extractor.js \
  --design-system design-system-export.json \
  --existing-tokens token-mapping.json
```

---

## Schritt 5 — Browser QA mit visual-qa.js (empfohlen)

Führt 7 Checks im echten Browser durch (Playwright bevorzugt, Puppeteer als Fallback):

```bash
# Standard-Run:
node scripts/visual-qa.js \
  --url http://solar.local/?p=4943 \
  --output reports/qa-report.json \
  --screenshots reports/screenshots/

# Ohne Browser (CI-Modus):
node scripts/visual-qa.js \
  --url http://solar.local/?p=4943 \
  --dry-run

# Ohne A11y (schneller):
node scripts/visual-qa.js \
  --url http://solar.local/?p=4943 \
  --skip-a11y
```

**7 Checks:**

| Check | Was | Blocker? |
|-------|-----|---------|
| V1 | HTTP-Status nicht 4xx/5xx | ✅ Ja |
| V2 | Kein `elementor-error`/`broken` CSS im DOM | ✅ Ja |
| V3 | Keine sichtbaren Elemente mit `height:0` | ⚠ Warnung |
| V4 | Keine 404 Bilder | ⚠ Warnung |
| V5 | Kein horizontaler Scroll auf Mobile | ⚠ Warnung |
| V6 | Mindestens 3 Elementor-Elemente im DOM | ✅ Ja |
| A1 | WCAG 2.0/2.1/2.2 via axe-core (0 critical) | ⚠ Warnung |

**Exit-Codes:**
- `0` = alle Checks OK
- `1` = ein oder mehr Checks fehlgeschlagen
- `2` = Konfigurationsfehler (URL fehlt etc.)

---

## Schritt 6 — Section-Compare: Framer ↔ Elementor (optional)

Visueller Pixel-Diff zwischen Framer-Original und Elementor-Build.
**Braucht Playwright oder Puppeteer installiert.**

```bash
# Hero-Section vergleichen:
node scripts/section-compare.js \
  --framer-url https://remarkable-interface-616594.framer.app/ \
  --elementor-url http://solar.local/framer-e2e-test-hero/ \
  --section hero \
  --above-fold \
  --output reports/section-compare/hero/ \
  --open

# Dry-Run (kein Browser, Platzhalter-Report für CI):
node scripts/section-compare.js \
  --framer-url https://example.framer.app/ \
  --elementor-url http://solar.local/test-page/ \
  --section hero \
  --dry-run
```

**Output:**
- `report.html` — side-by-side Viewer mit base64 Screenshots (selbst-enthaltend)
- `compare-report.json` — maschinenlesbarer Diff-Report für CI

> **npm-Shortcut für Hero:**
> ```bash
> npm run compare:hero
> ```

**Pixel-Diff Interpretation:**
- Rote Cluster = echte Layout-Fehler (fehlende Elemente, falsche Positionierung)
- 15–30% Diff ist normal (Font-Rendering React vs. Elementor)
- Kein Hard-Fail-Threshold — manuelles Review empfohlen

---

## Schritt 7 — Post-Build Auto-Fix (Konsolidierung)

### 7a: QA-Ergebnisse sammeln

```bash
# qa-results.json Format:
{
  "layout":     { /* Ergebnis von adrians-layout-audit */ },
  "visual":     { /* Ergebnis von adrians-visual-qa */ },
  "responsive": { /* Ergebnis von adrians-responsive-audit */ },
  "variables":  { /* Ergebnis von adrians-variable-audit */ },
  "page":       { /* Ergebnis von adrians-page-audit (optional) */ }
}
```

### 7b: Auto-Fix-Plan generieren

```bash
node scripts/post-build-auto-fix.js \
  --post-id 4943 \
  --qa-results qa-results.json \
  --output auto-fix-plan.json \
  --fix-types contrast,alt-text,seo,layout,variables
```

**Fix-Typen:**

| Typ | Ability | Was wird gefixt |
|-----|---------|----------------|
| `contrast` | `novamira-adrianv2/adrians-fix-color-contrast` | WCAG AA Kontrast < 4.5:1 |
| `alt-text` | `novamira-adrianv2/adrians-add-alt-text-from-context` | Bilder ohne Alt-Text |
| `seo` | `novamira-adrianv2/adrians-generate-meta-tags` | Fehlende Meta-Tags |
| `layout` | `novamira/adrians-patch-element-styles` | Fixed Heights, Overflow |
| `variables` | `novamira/adrians-patch-element-styles` | GV-Drift Patches |

### 7c: Auto-Fix-Plan ausführen

Führe die generierten MCP-Calls aus `auto-fix-plan.json` aus.

### 7d: Ergebnisse einlesen

```bash
node scripts/post-build-auto-fix.js \
  --apply-results auto-fix-results.json
```

**Output `auto-fix-summary.json`:**
```json
{
  "applied": 3,
  "dry_run": 0,
  "failed": 0,
  "details": [
    { "ability": "novamira-adrianv2/adrians-fix-color-contrast", "status": "ok" }
  ]
}
```

---

## Schnell-Referenz: QA-Fehler und Fixes

| Symptom | Schritt | Fix |
|---------|---------|-----|
| `passed: false` in layout-audit | 1 | `adrians-patch-element-styles` mit `action:"remove"` für Pass-through |
| Bilder laden nicht (V4) | 5 | `patch-v4-tree-media-ids.js` erneut ausführen |
| Horizontaler Scroll mobil (V5) | 5 | `overflow: hidden` auf Container patchen |
| `axe-core critical: 1` (A1) | 5 | WCAG Fix via `adrians-fix-color-contrast` |
| GV-Drift | 4 | Design-System neu exportieren + `design-token-extractor.js` |
| Fehlende Breakpoints | 3 | `adrians-add-global-class-variant` (kein Tree-Rebuild!) |
| 401/419 während QA | — | Session-Start-Checkliste Schritt 3 wiederholen |
| Score < 85% | validate | `validate-v4-tree.js --mode=warn` für Details |

---

## npm-Shortcuts

```bash
npm run post-build-qa    # run-post-build-qa.js (Report-Generator)
npm run visual-qa        # visual-qa.js (Browser-Checks)
npm run section-compare  # section-compare.js (Pixel-Diff)
npm run auto-fix         # post-build-auto-fix.js (Plan-Generator)
npm run compare:hero     # Section-Compare vorkonfiguriert für Hero
```
