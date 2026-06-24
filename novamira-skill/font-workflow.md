---
slug: font-workflow
title: Font Resolution & Enqueue Workflow
description: Vollständiger Font-Workflow für den Framer → Elementor V4 Build. Deckt resolve-fonts.js (Extraktion + Mapping auf .woff2-Dateien oder Google Fonts URLs), adrians-font-enqueue (WordPress wp_enqueue_style Registrierung als WPCode-Snippet) und Fallback-Strategien ab. Verhindert FOUT und fehlende Fonts nach dem Build.
version: "0.7.0"
pipeline_min_version: "0.7.0"
tags: [fonts, google-fonts, woff2, enqueue, resolve, wpcode, fout]
---

# Font Resolution & Enqueue Workflow

## Wann diesen Skill verwenden
Nach dem Framer-XML-Export und vor dem Elementor-Build, wenn Fonts aus dem
Framer-Projekt korrekt in WordPress enqueued werden müssen. Auch bei:
- Falsch angezeigten Fonts nach dem Build (Fallback-Font statt Custom Font)
- FOUT (Flash of Unstyled Text) auf der gebauten Seite
- Neuen Fonts die zum Design-System hinzugefügt wurden

---

## Kritische Regeln

1. Fonts IMMER vor dem Build enqueuen — nie danach (FOUT entsteht im ersten Load)
2. `.woff2` bevorzugen — `.ttf`/`.otf` nur als Fallback
3. Google Fonts: `https://fonts.googleapis.com/css2?family=Inter:wght@400;700` Format
4. `adrians-font-enqueue` nutzt WPCode-Snippets — `on_conflict: "replace"` immer setzen
5. Font-Dateinamen folgen Framer-Prefix-Konvention: `Inter-Regular.woff2`, `Inter-Bold.woff2`

---

## 3-Schritt Workflow

### Schritt 1 — Fonts aus Framer-Export auflösen

`resolve-fonts.js` liest `@font-face`-Blöcke aus dem Framer-HTML-Export und
mappt sie auf lokale `.woff2`-Dateien oder generiert Google Fonts Fallback-URLs.

```bash
node scripts/resolve-fonts.js \
  --html exports/framer-page/index.html \
  --fonts-dir exports/framer-page/assets/fonts/ \
  --output tokens/font-resolution.json \
  --verbose
```

**Mit Design-System-JSON (wenn Fonts dort definiert):**
```bash
node scripts/resolve-fonts.js \
  --mcp-json design-system-export.json \
  --fonts-dir exports/framer-page/assets/fonts/ \
  --output tokens/font-resolution.json
```

**Output `font-resolution.json`:**
```json
{
  "meta": {
    "totalFonts": 4,
    "resolved": 3,
    "missing": 1
  },
  "fonts": [
    {
      "family": "Inter",
      "weight": "400",
      "framerPrefix": "Inter-Regular",
      "localFile": "Inter-Regular.woff2",
      "localPath": "./exports/framer-page/assets/fonts/Inter-Regular.woff2",
      "status": "RESOLVED",
      "action": null,
      "googleFontsUrl": "https://fonts.googleapis.com/css2?family=Inter:wght@400"
    },
    {
      "family": "Inter",
      "weight": "700",
      "framerPrefix": "Inter-Bold",
      "localFile": "Inter-Bold.woff2",
      "localPath": "./exports/framer-page/assets/fonts/Inter-Bold.woff2",
      "status": "RESOLVED",
      "action": null,
      "googleFontsUrl": "https://fonts.googleapis.com/css2?family=Inter:wght@700"
    },
    {
      "family": "Clash Display",
      "weight": "600",
      "framerPrefix": "ClashDisplay-Semibold",
      "localFile": null,
      "localPath": null,
      "status": "MISSING",
      "action": "Download from Google Fonts: https://fonts.googleapis.com/css2?family=Clash+Display:wght@600"
    }
  ],
  "summary": {
    "resolvedCount": 3,
    "missingCount": 1,
    "missingFonts": [
      {
        "family": "Clash Display",
        "weight": "600",
        "googleFontsUrl": "https://fonts.googleapis.com/css2?family=Clash+Display:wght@600"
      }
    ]
  }
}
```

---

### Schritt 2 — Fehlende Fonts beschaffen

**Option A: Google Fonts (für missing Fonts)**

Fehlende Fonts werden in Schritt 3 direkt via Google Fonts CDN eingebunden.
Kein manueller Download nötig.

**Option B: Font-Datei hochladen (für custom `.woff2`)**

```bash
# Font-Datei in WP-Mediathek hochladen:
node scripts/asset-to-wp-media.js \
  --files "exports/framer-page/assets/fonts/ClashDisplay-Semibold.woff2" \
  --output font-upload-result.json \
  --execute
```

```
# Oder via MCP:
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/adrians-media-upload"
  parameters:
    file_path: "./fonts/ClashDisplay-Semibold.woff2"
    filename: "ClashDisplay-Semibold.woff2"
    mime_type: "font/woff2"
```

---

### Schritt 3 — Fonts in WordPress enqueuen

#### Option A: Google Fonts via WPCode-Snippet (empfohlen für fehlende Fonts)

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/adrians-code-injector"
  parameters:
    title: "Framer Fonts — Google Fonts Enqueue"
    type: "html"
    code: |
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Clash+Display:wght@600&display=swap" rel="stylesheet">
    location: "site_wide_header"
    on_conflict: "replace"
    tags: ["fonts", "google-fonts", "framer"]
```

> **Tipp:** Mehrere Weights in einem URL kombinieren:
> `family=Inter:wght@400;500;700` statt 3 separate Requests

#### Option B: Lokal gecachte .woff2 Files (Performance-optimal)

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/adrians-code-injector"
  parameters:
    title: "Framer Fonts — Local WOFF2 Enqueue"
    type: "php"
    code: |
      <?php
      function framer_fonts_enqueue() {
          $font_url = get_stylesheet_directory_uri() . '/fonts/';
          $css = '
          @font-face {
              font-family: "Inter";
              src: url("' . $font_url . 'Inter-Regular.woff2") format("woff2");
              font-weight: 400;
              font-display: swap;
          }
          @font-face {
              font-family: "Inter";
              src: url("' . $font_url . 'Inter-Bold.woff2") format("woff2");
              font-weight: 700;
              font-display: swap;
          }';
          wp_add_inline_style('elementor-frontend', $css);
      }
      add_action('wp_enqueue_scripts', 'framer_fonts_enqueue');
    location: "site_wide_header"
    on_conflict: "replace"
    tags: ["fonts", "local-woff2", "framer"]
```

#### Option C: Batch-Inject (wenn viele Fonts + anderer Code zusammen)

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/adrians-batch-inject-snippets"
  parameters:
    snippets:
      - title: "Framer Fonts — Preconnect"
        type: "html"
        code: "<link rel='preconnect' href='https://fonts.googleapis.com'><link rel='preconnect' href='https://fonts.gstatic.com' crossorigin>"
        location: "site_wide_header"
        on_conflict: "replace"
      - title: "Framer Fonts — Google Fonts Load"
        type: "html"
        code: "<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap' rel='stylesheet'>"
        location: "site_wide_header"
        on_conflict: "replace"
```

---

## Font-Status verifizieren

```
# Alle Font-Snippets auflisten:
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/adrians-list-snippets"
  parameters:
    filter_tag: "fonts"
    include_code: true
```

```
# Einzelnen Font-Snippet prüfen:
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/adrians-get-snippet"
  parameters:
    title: "Framer Fonts — Google Fonts Enqueue"
```

---

## Framer Font-Naming Konvention

`resolve-fonts.js` erwartet Dateinamen nach diesem Schema:

| Font-Family | Weight | Erwarteter Dateiname |
|------------|--------|---------------------|
| Inter | 400 | `Inter-Regular.woff2` oder `Inter400.woff2` |
| Inter | 700 | `Inter-Bold.woff2` oder `Inter700.woff2` |
| Clash Display | 600 | `ClashDisplay-Semibold.woff2` |
| DM Sans | 500 | `DMSans-Medium.woff2` |
| Plus Jakarta Sans | 300 | `PlusJakartaSans-Light.woff2` |

Weight-Namen (aus `WEIGHT_NAME_MAP` in `framer-utils.js`):

| Numeric | Name |
|---------|------|
| 100 | Thin |
| 200 | ExtraLight |
| 300 | Light |
| 400 | Regular |
| 500 | Medium |
| 600 | SemiBold |
| 700 | Bold |
| 800 | ExtraBold |
| 900 | Black |

---

## FOUT vermeiden: font-display: swap

Immer `font-display: swap` in `@font-face` setzen:
```css
@font-face {
  font-family: "Inter";
  src: url("Inter-Regular.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;  ← PFLICHT
}
```

Für Google Fonts: `&display=swap` an die URL anhängen:
```
https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap
```

---

## Fehlerbehebung

| Symptom | Ursache | Fix |
|---------|---------|-----|
| Font zeigt Fallback (Arial/sans-serif) | Font nicht enqueued | Snippet aktiv? `adrians-list-snippets filter_tag:fonts` |
| FOUT beim Laden | `font-display` fehlt | `swap` in @font-face oder `&display=swap` URL |
| `MISSING` in font-resolution.json | .woff2 nicht im fonts-dir | Google Fonts Fallback nutzen (Option A) |
| Font lädt aber falscher Weight | Weight-Mismatch | font-resolution.json `weight`-Feld mit CSS prüfen |
| `⚠ Keine Fonts gefunden` | HTML hat keine @font-face | Framer-Export: Fonts eingebettet? CSS-Datei prüfen |
| Font-Snippet inaktiv nach Update | WPCode-Cache | WPCode → Snippets → Snippet aktivieren |

---

## npm-Shortcuts

```bash
# Font-Resolution aus HTML:
node scripts/resolve-fonts.js --html exports/*/index.html --fonts-dir exports/*/assets/fonts/ --output tokens/font-resolution.json

# Alle CSS-Dateien nach @font-face durchsuchen:
grep -r "@font-face" exports/ --include="*.css" | head -20
```
