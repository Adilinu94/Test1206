---
slug: font-workflow
title: Font Resolution & Enqueue Workflow (novamira-adrianv2)
description: Font-Workflow fuer den Framer -> Elementor V4 Build. Deckt resolve-fonts.js (Extraktion + Mapping auf .woff2 oder Google Fonts) und die Enqueue-Abilities von novamira-adrianv2 (media-upload fuer lokale .woff2, add-code-snippet fuer Google Fonts/@font-face) ab. Verhindert FOUT und fehlende Fonts nach dem Build.
version: "0.7.0"
pipeline_min_version: "0.7.0"
tags: [fonts, google-fonts, woff2, novamira, adrianv2, media-upload, add-code-snippet]
---

# Font Resolution & Enqueue Workflow (novamira-adrianv2)

## Wann diesen Skill verwenden
Nach dem Framer-XML-Export und vor dem Elementor-Build, wenn Fonts korrekt
geladen werden muessen. Auch bei Fallback-Font statt Custom-Font oder FOUT
(Flash of Unstyled Text) nach dem Build.

## Ground Truth

Fonts werden **sitewide** via `novamira-adrianv2/add-code-snippet` (location: head)
geladen — entweder als Google-Fonts-`<link>` oder als lokales `@font-face` mit
`media-upload`-URLs. Es gibt KEINE dedizierte `font-enqueue`-Ability.

| Ability | Wofuer |
|---------|--------|
| `novamira-adrianv2/media-upload` | .woff2-Datei in Mediathek hochladen (base64) |
| `novamira-adrianv2/batch-media-upload` | Mehrere Font-Dateien auf einmal |
| `novamira-adrianv2/add-code-snippet` | `<link>` (Google Fonts) oder `<style>@font-face` (lokal), sitewide, location:head |
| `novamira-adrianv2/list-code-snippets` | Bestehende Font-Snippets verifizieren |

---

## Kritische Regeln

1. Fonts IMMER vor dem Build laden — FOUT entsteht im ersten Page-Load
2. `.woff2` bevorzugen, `font-display: swap` IMMER setzen
3. `media-upload` erwartet **base64-encodierten** Dateiinhalt — Datei vorher encodieren
4. Google Fonts: `&display=swap` an die URL anhaengen
5. Mehrere Weights eines Fonts in EINEM Google-Fonts-URL kombinieren (`wght@400;500;700`)

---

## 3-Schritt Workflow

### Schritt 1 — Fonts aus Framer-Export auflösen (unveraendert gueltig)

```bash
node scripts/resolve-fonts.js \
  --html exports/framer-page/index.html \
  --fonts-dir exports/framer-page/assets/fonts/ \
  --output tokens/font-resolution.json \
  --verbose
```

**Output `font-resolution.json`** (Format unveraendert):
```json
{
  "fonts": [
    {
      "family": "Inter", "weight": "400", "framerPrefix": "Inter-Regular",
      "localFile": "Inter-Regular.woff2",
      "localPath": "./exports/framer-page/assets/fonts/Inter-Regular.woff2",
      "status": "RESOLVED",
      "googleFontsUrl": "https://fonts.googleapis.com/css2?family=Inter:wght@400"
    },
    {
      "family": "Clash Display", "weight": "600", "framerPrefix": "ClashDisplay-Semibold",
      "localFile": null, "status": "MISSING",
      "googleFontsUrl": "https://fonts.googleapis.com/css2?family=Clash+Display:wght@600"
    }
  ],
  "summary": { "resolvedCount": 1, "missingCount": 1 }
}
```

---

### Schritt 2A — Option Google Fonts (fuer `MISSING` Fonts oder generell bevorzugt)

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/add-code-snippet"
  parameters:
    title: "Framer Fonts — Google Fonts"
    code: |
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Clash+Display:wght@600&display=swap" rel="stylesheet">
    location: "head"
    priority: 1
    status: "publish"
```

> **Mehrere Familien kombinieren**: `&family=Inter:wght@400;700&family=Clash+Display:wght@600`
> in EINEM URL statt separate Requests.

---

### Schritt 2B — Option Lokale .woff2 (Performance-optimal)

**2B.1 — Datei base64-encodieren:**
```bash
base64 -w0 exports/framer-page/assets/fonts/Inter-Regular.woff2 > /tmp/inter-regular.b64
```

**2B.2 — Upload via media-upload:**
```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/media-upload"
  parameters:
    base64_content: "<INHALT VON /tmp/inter-regular.b64>"
    filename: "Inter-Regular.woff2"
    title: "Inter Regular (Framer Font)"
```

**Erwartete Antwort:** `{ "success": true, "data": { "id": ATTACHMENT_ID, "url": "https://solar.local/wp-content/uploads/.../Inter-Regular.woff2", ... } }`

**2B.3 — @font-face mit der Upload-URL als sitewide Snippet:**
```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/add-code-snippet"
  parameters:
    title: "Framer Fonts — Local WOFF2"
    code: |
      <style>
        @font-face {
          font-family: "Inter";
          src: url("https://solar.local/wp-content/uploads/.../Inter-Regular.woff2") format("woff2");
          font-weight: 400;
          font-display: swap;
        }
        @font-face {
          font-family: "Inter";
          src: url("https://solar.local/wp-content/uploads/.../Inter-Bold.woff2") format("woff2");
          font-weight: 700;
          font-display: swap;
        }
      </style>
    location: "head"
    priority: 1
```

> **Mehrere Dateien**: `novamira-adrianv2/batch-media-upload` fuer alle `RESOLVED`
> Fonts aus `font-resolution.json` in einem Call, dann EIN `add-code-snippet`
> mit allen `@font-face`-Bloecken.

---

### Schritt 3 — Verifizieren

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/list-code-snippets"
  parameters:
    location: "head"
    status: "any"
```

Pruefen: Font-Snippet vorhanden, `status: "publish"`, korrekte `priority`.

---

## Framer Font-Naming Konvention (unveraendert)

`resolve-fonts.js` erwartet Dateinamen nach diesem Schema:

| Font-Family | Weight | Erwarteter Dateiname |
|------------|--------|---------------------|
| Inter | 400 | `Inter-Regular.woff2` oder `Inter400.woff2` |
| Inter | 700 | `Inter-Bold.woff2` oder `Inter700.woff2` |
| Clash Display | 600 | `ClashDisplay-Semibold.woff2` |

Weight-Namen (`WEIGHT_NAME_MAP` in `framer-utils.js`):

| Numeric | Name | Numeric | Name |
|---------|------|---------|------|
| 100 | Thin | 600 | SemiBold |
| 200 | ExtraLight | 700 | Bold |
| 300 | Light | 800 | ExtraBold |
| 400 | Regular | 900 | Black |
| 500 | Medium | | |

---

## FOUT vermeiden: font-display: swap

Immer in `@font-face` setzen:
```css
@font-face {
  font-family: "Inter";
  src: url("...") format("woff2");
  font-weight: 400;
  font-display: swap;  ← PFLICHT
}
```

Fuer Google Fonts: `&display=swap` an die URL anhaengen.

---

## Fehlerbehebung

| Symptom | Ursache | Fix |
|---------|---------|-----|
| Font zeigt Fallback (Arial) | Snippet inaktiv | `list-code-snippets status:any` -> `status: "publish"`? |
| FOUT beim Laden | `font-display` fehlt | `swap` in @font-face oder `&display=swap` |
| `MISSING` in font-resolution.json | .woff2 nicht im fonts-dir | Google Fonts Fallback (Schritt 2A) |
| media-upload Fehler | base64 falsch encodiert | `base64 -w0` (keine Zeilenumbrueche!) verwenden |
| Font lädt, falscher Weight | Weight-Mismatch | `weight`-Feld in font-resolution.json mit @font-face abgleichen |
| add-code-snippet 403 | Elementor Pro nicht aktiv | Google Fonts via `<link>` ist Pro-unabhaengig in HTML-Widget moeglich (add-custom-js Workaround) |

---

## npm-Shortcuts

```bash
node scripts/resolve-fonts.js --html exports/*/index.html --fonts-dir exports/*/assets/fonts/ --output tokens/font-resolution.json
```
