---
slug: elementor-v4-build
title: Elementor V4 Atomic Build — Ground Truth
description: Verbindliche Anleitung für Elementor V4 Atomic Widget Builds via Novamira MCP auf solar.local. Enthält Pflicht-Reihenfolge, Widget-Referenz, Format-Regeln und alle bekannten Verbots-Patterns.
version: "0.7.0"
pipeline_min_version: "0.7.0"
tags: [elementor, v4, atomic, novamira, mcp, widgets, global-classes, global-variables]
---

# Elementor V4 Atomic Build — Ground Truth

## Pflicht-Reihenfolge (jede Session)

```
1. novamira/adrians-setup-v4-foundation   → GV-IDs + GC-IDs holen (NIEMALS cachen)
2. novamira/elementor-create-global-class → Für jede neue Style-Klasse
3. novamira/elementor-create-variable     → Für neue Farben / Fonts
4. novamira/elementor-set-content         → Framer-Tree → Elementor Seite (V4-Roote)
   ODER
   novamira/adrians-batch-build-page      → Für V3-kompatible Container-Roots
5. novamira/adrians-patch-element-styles  → Post-Build Style-Patches (optional)
6. novamira/adrians-layout-audit          → PFLICHT QA nach jedem Build
```

> **Kritisch:** `adrians-setup-v4-foundation` NIEMALS cachen. GV-IDs und GC-IDs sind
> session-live und können sich zwischen Calls ändern. Immer frisch abrufen.

---

## V4 Atomic Widget-Typen

| Widget | widgetType | Primäre Settings-Props |
|--------|-----------|------------------------|
| Flexbox Container | `e-flexbox` | `direction`, `wrap`, `justify-content`, `align-items`, `gap` |
| Heading | `e-heading` | `title` (html-v3), `tag` (h1–h6), `link` |
| Paragraph | `e-paragraph` | `paragraph` (html-v3) |
| Button | `e-button` | `text` (html-v3), `link` (link-type), `button_type` |
| Image | `e-image` | `image` (image-type), `image_size`, `link`, `alt` |
| SVG | `e-svg` | `svg` (svg-type), `width` (size) |
| Divider | `e-divider` | `weight` (size), `color` (color) |
| HTML (raw) | `e-html` | `html` (string) — nur als letzter Ausweg |

---

## $$type Wrapper-Format (V4-Pflicht)

Alle Settings-Werte MÜSSEN in `$$type`-Objekte verpackt sein:

```json
{
  "title": { "$$type": "html-v3", "value": { "content": { "$$type": "string", "value": "Hero Heading" } } },
  "color": { "$$type": "color", "value": "e-gv-abc123" },
  "width": { "$$type": "size", "value": { "size": 100, "unit": "%" } },
  "padding": { "$$type": "dimensions", "value": { "block-start": { "$$type": "size", "value": { "size": 80, "unit": "px" } }, "block-end": { "$$type": "size", "value": { "size": 80, "unit": "px" } } } }
}
```

---

## elementor-set-content Wire-Format (6 Invarianten)

1. `styles[id].type` ist IMMER `"class"` — niemals `"id"` oder fehlen
2. Größen-Props nutzen nested shape: `{ "$$type": "size", "value": { "size": N, "unit": "px" } }`
3. Background-Color wrapped in `{ "$$type": "color", "value": "e-gv-*" }`
4. Dimensionen (padding, margin) als `{ "$$type": "dimensions", ... }` mit logical props
5. Tree-Kinder heißen `elements`, NICHT `children`
6. Breakpoint-Key ist `"desktop"`, NICHT `null`

---

## Global Variables (GV) — Typen

| GV-Typ | $$type | Beispiel |
|--------|--------|---------|
| Farbe | `color` | `{ "$$type": "color", "value": "#0a0a0a" }` |
| Font-Familie | `font-family` | `{ "$$type": "font-family", "value": "Inter" }` |
| Font-Größe | `size` | `{ "$$type": "size", "value": { "size": 16, "unit": "px" } }` |
| Abstand | `size` | `{ "$$type": "size", "value": { "size": 24, "unit": "px" } }` |

---

## Global Classes (GC) — Struktur

```json
{
  "id": "gc-a1b2c3d4e5f6",
  "label": "s-hero",
  "variants": [
    {
      "meta": { "breakpoint": "desktop", "state": null },
      "props": {
        "background-color": { "$$type": "color", "value": "e-gv-abc123" },
        "padding": { "$$type": "dimensions", "value": { ... } }
      }
    }
  ]
}
```

---

## elementor-set-content vs adrians-batch-build-page

| | `elementor-set-content` | `adrians-batch-build-page` |
|--|------------------------|---------------------------|
| Root-Typ | `e-flexbox` (V4 nativ) | Container (V3-kompatibel) |
| Framer-Konvertierung | ✅ Bevorzugt | ❌ Nicht für Framer-Trees |
| `content` Parameter | Array (NIEMALS Object) | Sections-Array |
| GC-IDs nötig | ✅ Ja | ✅ Ja |

---

## Verbotene Patterns (niemals tun)

```
❌ HTML-Widget (e-html) statt e-heading/e-paragraph
❌ elementor-set-content für Framer-Trees (→ adrians-batch-build-page)
❌ Inline-Styles statt Global Classes
❌ Hardcoded Hex-Farben (#ffffff) statt GV-Referenzen
❌ adrians-setup-v4-foundation cachen
❌ style IDs mit Bindestrichen (nur Unterstriche erlaubt)
❌ custom_css als String (muss { "raw": "..." } sein)
❌ DOM-Tiefe > 5 (server-timeout bei elementor-set-content)
```

## Framer→Elementor Forbidden Patterns (Design-Fidelity)

```
❌ Elementor-Kit-Farben (#4054B2, #23A455, #000) statt exakter Framer-Hex-Werte
   → Immer token-mapping.json konsultieren
❌ Schriftarten raten (Arial, Helvetica, Manrope default) statt Framer-Source
   → Nur Fonts aus framer-fonts.json / framer-colors.json verwenden
❌ Elementor-Defaults für border-radius/Spacing akzeptieren
   → Jeden border-radius, padding, margin, gap explizit aus Framer übernehmen
```

> **Siehe auch:** `FRAMER-VS-ELEMENTOR-PATTERNS.md` im Repository-Root für
> die vollständige Pattern-Referenz (absolute Positionierung, Flex-Row, Pill-Buttons, Z-Index).

---

## Post-Build QA Pflicht-Checklist

```
□ validate-v4-tree.js ausführen → Score ≥ 85%
□ adrians-layout-audit → keine kritischen Layout-Fehler
□ visual-qa → keine Overflow-Issues
□ design-diff (npm run design-diff) → Score ≥ 85% gegen Framer-Live-URL
□ Alle GV-IDs gültig (aus Setup-Foundation)
□ Alle GC-IDs vorhanden in elementor-set-content styles{}
```

---

## Known Bugs & Workarounds

| Bug | Symptom | Fix |
|-----|---------|-----|
| GC transform-functions | PHP Warning: Array to string | GC mit `{ "$$type": "transform-functions", "value": [...] }` Wrapper speichern |
| elementor-set-content | 401/419 | Session abgelaufen → neu initialisieren, max ~25-30min TTL |
| adrians-batch-build-page | Leere Seite | GV-IDs stale → adrians-setup-v4-foundation neu aufrufen |
