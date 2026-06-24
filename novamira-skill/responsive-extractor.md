---
name: framer-responsive-extractor
version: "1.0.0"
description: >
  Extrahiert Responsive-Overrides aus Framer-Node-Daten und konvertiert sie
  in das Elementor V4 Variants-Format ($$type-Objekte, Breakpoint-Varianten).
  Verwende diesen Skill immer wenn:
  - Framer-Breakpoints (Desktop/Tablet/Mobile) nach V4-Variants konvertiert werden sollen
  - jemand fragt "wie mache ich das responsive in V4?"
  - adrians-batch-build-page-Daten Responsive-Variants benoetigen
  - V3-Styles mit _mobile Suffixen auf V4-Variants migriert werden sollen
  - der Unterschied zwischen Mandatory und Optional Responsive-Props relevant ist
  - scripts/extract-responsive-breakpoints.js erwaehnt wird
  - Framer-Nodes via Unframer MCP (getNodeXml) analysiert werden sollen
  Lese diesen Skill BEVOR du V4-Variants fuer Responsive-Layouts erstellst.
---

# Framer Responsive Breakpoint Extractor

Tool zur Konvertierung von Framer-Responsive-Daten in Elementor V4 Variants.

---

## Was das Tool tut

`scripts/extract-responsive-breakpoints.js`:
1. Liest Framer-Node-Daten (JSON oder XML von Unframer MCP)
2. Berechnet Property-**Deltas** relativ zur Desktop-Baseline
3. Klassifiziert Props als **Mandatory** (Browser passt NIE an) oder **Optional**
4. Konvertiert alle Werte in V4 `$$type`-Objekte
5. Gibt fertige `variants`-Arrays aus, die direkt in `styles` eintragbar sind

---

## CLI-Verwendung

### Modus A: Framer-Node-Daten (--input)

```bash
# Standard: JSON mit desktop/tablet/mobile Properties
node scripts/extract-responsive-breakpoints.js --input FramerExport/element-tree/hero.json

# Markdown-Report
node scripts/extract-responsive-breakpoints.js --input nodes.json --format markdown

# Nur Mandatory-Props extrahieren (flex-direction, width, padding, min-height)
node scripts/extract-responsive-breakpoints.js --input nodes.json --only-mandatory

# Base-Breakpoint = null (fuer lokale Styles statt Global Classes)
node scripts/extract-responsive-breakpoints.js --input nodes.json --base-breakpoint null

# Einzelne Component filtern
node scripts/extract-responsive-breakpoints.js --input nodes.json --component "Hero Section"

# Output in Datei
node scripts/extract-responsive-breakpoints.js --input nodes.json --output reports/variants.json

# Mit Verbose-Logging (zeigt fehlende Mandatory-Variants)
node scripts/extract-responsive-breakpoints.js --input nodes.json --verbose
```

### Modus B: CSS-Export (--css) — NEU

```bash
# HTML-Datei mit <style>-Blöcken:
node scripts/extract-responsive-breakpoints.js \
  --css FramerExport/index.html \
  --output FramerExport/tokens/responsive-breakpoints.json

# Mehrere CSS-Dateien:
node scripts/extract-responsive-breakpoints.js \
  --css styles/main.css --css styles/tokens.css \
  --output FramerExport/tokens/responsive-breakpoints.json

# CSS-Verzeichnis:
node scripts/extract-responsive-breakpoints.js \
  --css-dir FramerExport/assets/css/ \
  --output FramerExport/tokens/responsive-breakpoints.json
```

**CSS-Modus Features:**
- Parst @media-Queries mit min-width/max-width
- Klassifiziert Breakpoints automatisch: mobile (<810px), tablet (810–1199px), desktop (≥1200px)
- **Delta-Logik:** Tablet/Mobile-Varianten enthalten NUR geänderte Properties (nicht alle)
- Akzeptiert HTML mit `<style>`-Blöcken oder reine CSS-Dateien
- Auto-Breakpoint-Detection aus den vorhandenen CSS-Werten
- Gibt auch Base-Rules (outside @media) als Desktop-Basis aus

---

## Input-Formate

### Format 1: Standard Node-Array (empfohlen)
```json
[
  {
    "name": "Hero Section",
    "properties": {
      "desktop": { "flex-direction": "row", "padding": "70px 60px", "font-size": "68px" },
      "tablet":  { "flex-direction": "row", "padding": "50px 30px", "font-size": "48px" },
      "mobile":  { "flex-direction": "column", "padding": "40px 20px", "font-size": "36px" }
    }
  }
]
```

### Format 2: V3-Style mit _mobile/_tablet Suffixen (Migration)
```json
{
  "name": "Hero Card",
  "flex-direction": "row",
  "flex-direction_mobile": "column",
  "padding": "60px 40px",
  "padding_mobile": "30px 16px",
  "font-size": "52px",
  "font-size_mobile": "32px"
}
```
Das Tool erkennt die Suffixe automatisch und migriert sie zu korrekten Deltas.

### Format 3: Named-Nodes-Map
```json
{
  "Hero Section": { "desktop": { ... }, "mobile": { ... } },
  "Nav Link":     { "desktop": { ... } }
}
```

### Format 4: Unframer MCP XML
XML-Output von `getNodeXml` wird direkt akzeptiert (`.xml`-Datei oder XML-String).

---

## Output: V4 Variants-Format

```json
{
  "meta": { "totalNodes": 2, "nodesWithResponsive": 1 },
  "nodes": [
    {
      "name": "Hero Section",
      "hasResponsive": true,
      "mandatoryMissing": [],
      "variants": [
        {
          "meta": { "breakpoint": "desktop", "state": null },
          "props": {
            "flex-direction": { "$$type": "string", "value": "row" },
            "padding":        { "$$type": "string", "value": "70px 60px" },
            "font-size":      { "$$type": "size",   "value": { "size": 68, "unit": "px" } }
          },
          "custom_css": null
        },
        {
          "meta": { "breakpoint": "tablet", "state": null },
          "props": {
            "padding":   { "$$type": "string", "value": "50px 30px" },
            "font-size": { "$$type": "size",   "value": { "size": 48, "unit": "px" } }
          },
          "custom_css": null
        },
        {
          "meta": { "breakpoint": "mobile", "state": null },
          "props": {
            "flex-direction": { "$$type": "string", "value": "column" },
            "font-size":      { "$$type": "size",   "value": { "size": 36, "unit": "px" } }
          },
          "custom_css": null
        }
      ]
    }
  ]
}
```

**Wichtig:** Das Tool gibt nur echte Deltas aus. Gap bleibt gleich -> kein Mobile-Gap-Eintrag.

---

## Framer Breakpoints -> V4 Breakpoints

| Framer | Breite | V4 |
|--------|--------|----|
| Desktop | 1440px | `"desktop"` (Global Classes) oder `null` (lokale Styles) |
| Tablet | 810px | `"tablet"` |
| Phone | 390px | `"mobile"` |

**Base-Breakpoint-Wahl:**
- `--base-breakpoint desktop` (default) -> fuer Global Classes (`adrians-add-class-variant`)
- `--base-breakpoint null` -> fuer lokale Style-IDs im `styles`-Objekt eines Widgets

---

## Mandatory vs. Optional Props

### Mandatory (Browser passt NICHT automatisch an -> Variant PFLICHT)
- `flex-direction` (row -> column auf Mobile!)
- `width`, `min-height`, `max-width`
- `padding` (wenn horizontaler Wert > 20px)
- `padding-block-*`, `padding-inline-*`
- `display`, `position`, `overflow`
- `grid-template-columns`, `grid-template-rows`

### Optional (Browser passt automatisch an -> nur bei signifikantem Delta)
- `font-size`, `font-weight`, `font-family`, `line-height`
- `text-transform`, `text-align`, `color`
- `object-fit`, `aspect-ratio`, `background-size`
- `gap` (prozentuale Gaps skalieren automatisch)
- `border-radius`, `opacity`

Mit `--only-mandatory` werden Optional-Props aus den Delta-Variants gefiltert.

---

## Integration in den V4-Build-Workflow

Die extrahierten `variants` direkt in ein lokales Style-Objekt eintragen:

```json
{
  "id": "sherobox",
  "elType": "widget",
  "widgetType": "e-flexbox",
  "settings": {
    "classes": { "$$type": "classes", "value": ["gc-02f248648cd932c1", "sherobox"] }
  },
  "styles": {
    "sherobox": {
      "id": "sherobox",
      "type": "class",
      "label": "Hero Box",
      "variants": [
        ... // <- Hier den Output von extract-responsive-breakpoints.js einfuegen
      ]
    }
  }
}
```

**Invariante pruefen:** Jede Style-ID im `styles`-Objekt muss auch in `settings.classes.value` stehen. Sonst wird sie nie gerendert (Invariante I aus AGENTS.md).

---

## Automatische Typ-Konvertierung

Das Tool erkennt Wert-Typen und wrappt automatisch:

| Eingabe | $$type | Beispiel |
|---------|--------|---------|
| `"68px"` bei font-size/gap/width | `size` | `{"size":68,"unit":"px"}` |
| `"#0E2A3B"` | `color` | `{"$$type":"color","value":"#0E2A3B"}` |
| `"e-gv-ef6c8f0"` | `global-color-variable` | Variable-Referenz |
| `"row"`, `"column"`, `"center"` | `string` | Direkter Wert |
| Bereits `$$type`-Objekte | durchgereicht | Keine Doppel-Konvertierung |

---

## Exit-Codes

| Code | Bedeutung |
|------|-----------|
| 0 | Alles ok, keine fehlenden Mandatory-Variants |
| 1 | Fehlende Mandatory-Variants gefunden (Warnung, kein Abbruch) |
| 1 | Parse-Fehler oder Datei nicht gefunden |

---

## Das Script hinzufuegen

Gehoert in `scripts/extract-responsive-breakpoints.js` im Novamira-Projektverzeichnis.
Kein `npm install` noetig -- nur Node.js built-ins.
