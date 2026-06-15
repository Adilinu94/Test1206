---
slug: elementor-v4-build
title: Elementor V4 Build — Ground Truth
description: Kompletter V4 Build-Workflow fuer Elementor Atomic Seiten auf solar.local. Ground Truth fuer Novamira AdrianV2 Ability-Namen (novamira-adrianv2/*, ohne 'adrians-' Praefix). Synced aus dem Live-Skill auf solar.local (novamira/skill-get).
version: "0.7.0"
pipeline_min_version: "0.7.0"
enable_prompt: true
enable_agentic: true
tags: [elementor, v4, atomic, novamira, adrianv2, mcp, build]
---

# Elementor V4 Build — Ground Truth

## Ground Truth fuer solar.local

**Alle `novamira/adrians-*` Ability-Namen existieren NICHT mehr.**
Sie heissen jetzt `novamira-adrianv2/*` (ohne 'adrians-' Praefix).
Das alte Plugin "Novamira Adrians Extra" ist INAKTIV — `novamira/adrians-*` existiert NICHT.

Quelle: live `novamira/skill-get` auf solar.local (slug: elementor-v4-build).

## Layout-Entscheidungsbaum

```
Brauche ich ein 2D-Layout (Reihen UND Spalten)?
  JA  -> e-flexbox mit display:grid (Grid-Kandidat, siehe class-audit)
  NEIN -> weiter

Brauche ich mehrere Items in einer Reihe, die umbrechen sollen?
  JA  -> e-flexbox mit wrap:wrap, gap, flex-basis pro Kind
  NEIN -> weiter

Brauche ich vertikalen Stack mit konsistentem Abstand?
  JA  -> e-flexbox mit direction:column, gap
  NEIN -> e-flexbox mit direction:row (Default)
```

## Anti-Patterns

```
❌ Verschachtelte e-flexbox nur fuer ein einziges Kind (Pass-through-Container)
❌ Mehr als 3 Nesting-Ebenen ohne semantischen Grund (DOM-DEPTH Warning)
❌ Inline-Styles statt Global Classes fuer wiederholte Patterns
❌ Hardcoded Hex-Farben statt e-gv-* Variable-Referenzen
❌ url:null in image-src (Invariant IV — url-Key komplett weglassen)
❌ Style-IDs mit Hyphens (shero nicht s-hero)
❌ novamira-adrianv2/setup-v4-foundation cachen (GV/GC-IDs sind session-live)
❌ elementor-set-content fuer Screenshot/Mockup-Builds (-> batch-build-page)
❌ batch-build-page fuer Framer-Trees (-> elementor-set-content)
```

## Pflicht-Reihenfolge (jede Session)

```
1. novamira/elementor-check-setup              -> V4 Atomic Runtime verfuegbar?
2. novamira-adrianv2/setup-v4-foundation        -> GV-IDs + GC-IDs holen (NIEMALS cachen)
3. novamira-adrianv2/export-design-system       -> Token-Basis (read-only, 5min cache OK)
4. [Build: elementor-set-content ODER batch-build-page]
5. novamira-adrianv2/layout-audit               -> Pflicht-QA nach jedem Build
6. novamira-adrianv2/visual-qa                  -> Pflicht-QA nach jedem Build
7. novamira-adrianv2/responsive-audit           -> Pflicht-QA nach jedem Build
```

> **Kritisch:** `setup-v4-foundation` NIEMALS cachen. GV-IDs und GC-IDs sind
> session-live und koennen sich zwischen Calls aendern. Immer frisch abrufen.

## V4 Atomic Widget-Tree Struktur

```json
{
  "elType": "e-flexbox",
  "widgetType": "e-flexbox",
  "id": "hero-section",
  "settings": {
    "classes": { "$$type": "classes", "value": ["gc-section-hero"] },
    "direction": { "$$type": "string", "value": "column" }
  },
  "styles": {
    "shero": {
      "type": "class",
      "variants": [{
        "meta": { "breakpoint": "desktop", "state": null },
        "props": {
          "padding": { "$$type": "dimensions", "value": { "block-start": {...}, "block-end": {...} } }
        }
      }]
    }
  },
  "elements": [ ... ]
}
```

## $$type Wrapper-Format (Pflicht)

| Wert-Typ | $$type | Beispiel |
|----------|--------|---------|
| String/Text | `string` | `{ "$$type": "string", "value": "Hallo" }` |
| HTML-Content (Heading/Paragraph) | `html-v3` | `{ "$$type": "html-v3", "value": { "content": { "$$type": "string", "value": "..." } } }` |
| Farbe | `color` | `{ "$$type": "color", "value": "#0a0a0a" }` oder GV-Referenz |
| Groesse | `size` | `{ "$$type": "size", "value": { "size": 16, "unit": "px" } }` |
| Dimensionen (Padding/Margin) | `dimensions` | `{ "$$type": "dimensions", "value": { "block-start": {size...}, ... } }` |
| Link | `link` | `{ "$$type": "link", "value": { "destination": {"$$type":"url","value":"..."}, "tag": {"$$type":"string","value":"a"} } }` |
| Klassen-Zuordnung | `classes` | `{ "$$type": "classes", "value": ["gc-xxx"] }` |
| Bild-Attachment | `image-attachment-id` | `{ "$$type": "image-attachment-id", "value": WP_MEDIA_ID }` (KEIN url-Key) |
| Transform-Functions | `transform-functions` | `{ "$$type": "transform-functions", "value": [...] }` |

## Die 5 Invarianten (Framer -> V4)

| # | Name | Regel |
|---|------|-------|
| I | Rendering-Gate | Jede ID in `element.styles` MUSS in `settings.classes.value` stehen |
| II | No-Settings-Styles | font-size, color, padding etc. NIEMALS in `settings`, nur in `styles` |
| III | Style-IDs | Lokale Style-IDs KEINE Hyphens (`shero` nicht `s-hero`) |
| IV | Image-Src | Wenn `id` gesetzt: `url`-Key komplett weglassen (nie `url:null`) |
| V | custom_css | Immer `{"raw":"..."}` Format, nie plain String |

## V3 -> V4 Mapping

| V3 (Legacy) | V4 (Atomic) |
|-------------|-------------|
| Section | e-flexbox (direction:column) |
| Container/Column | e-flexbox |
| Heading Widget | e-heading (title als html-v3) |
| Text Editor | e-paragraph (paragraph als html-v3) |
| Button Widget | e-button (text als html-v3, link als link-type) |
| Image Widget | e-image (image als image-attachment-id) |
| Icon Widget | e-svg |
| Divider Widget | e-divider |
| Spacer Widget | e-divider mit transparent + height |

## Ability-Referenz nach Kategorie

### Foundation & Setup

| Ability | Wann |
|---------|------|
| `novamira/elementor-check-setup` | Einmal pro Session — V4 verfuegbar? |
| `novamira-adrianv2/setup-v4-foundation` | IMMER vor dem ersten Build (nie cachen) |
| `novamira-adrianv2/export-design-system` | Tokens/GCs inspizieren (5min Cache OK) |
| `novamira-adrianv2/detect-elementor-version` | Atomic Widgets Support pruefen |

### Build

| Ability | Wann |
|---------|------|
| `novamira/elementor-set-content` | Framer-Trees (V4 Atomic Root) |
| `novamira-adrianv2/batch-build-page` | Screenshot/Mockup-Seiten (NICHT fuer Framer) |
| `novamira-adrianv2/add-flexbox` | Inkrementeller Build: Container |
| `novamira-adrianv2/add-atomic-heading` | Inkrementeller Build: Heading |
| `novamira-adrianv2/add-atomic-paragraph` | Inkrementeller Build: Paragraph |
| `novamira-adrianv2/add-atomic-button` | Inkrementeller Build: Button |
| `novamira-adrianv2/add-atomic-image` | Inkrementeller Build: Bild |
| `novamira-adrianv2/add-atomic-svg` | Inkrementeller Build: SVG/Icon |
| `novamira-adrianv2/add-atomic-divider` | Inkrementeller Build: Trenner |
| `novamira-adrianv2/add-div-block` | Inkrementeller Build: Div-Block |
| `novamira-adrianv2/update-atomic-widget` | Bestehendes Atomic-Widget aendern |

### Design System

| Ability | Wann |
|---------|------|
| `novamira/elementor-create-global-class` | Neue GC anlegen |
| `novamira/elementor-create-variable` | Neue GV anlegen |
| `novamira-adrianv2/list-global-classes` | Alle GCs auflisten |
| `novamira-adrianv2/add-global-class-variant` | Responsive-Variante zu GC hinzufuegen |
| `novamira-adrianv2/edit-global-class-variant` | GC-Variante aendern |
| `novamira-adrianv2/remove-global-class` | GC entfernen |
| `novamira-adrianv2/apply-variable-to-class` | GV an GC binden |
| `novamira-adrianv2/batch-create-variables` | Mehrere GVs auf einmal |
| `novamira-adrianv2/list-class-variants` | Varianten einer GC auflisten |

### QA (Pflicht nach jedem Build)

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/layout-audit` | Pass-through-Container, Deep-Nesting, Grid-Kandidaten |
| `novamira-adrianv2/visual-qa` | Overflow, Z-Index, negative Margins |
| `novamira-adrianv2/responsive-audit` | Fehlende Breakpoints |
| `novamira-adrianv2/variable-audit` | GV-Drift (e-gv-* nicht mehr im Kit) |
| `novamira-adrianv2/class-audit` | Grid-Kandidaten, ungenutzte GCs |
| `novamira-adrianv2/page-audit` | Content-QA (Leer-Container, Alt-Texte, Heading-Hierarchie) |
| `novamira-adrianv2/audit-page-a11y` | WCAG 2.2 Checks |
| `novamira-adrianv2/audit-page-seo` | SEO-Audit |

### Fixes & Patches

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/patch-element-styles` | Gezielte Style-Korrekturen (element_id + props/add_class/add_style) |
| `novamira-adrianv2/fix-color-contrast` | WCAG-Kontrast-Fix (preview:true -> apply:true) |
| `novamira-adrianv2/add-alt-text-from-context` | Alt-Texte aus Kontext generieren |
| `novamira-adrianv2/generate-meta-tags` | SEO Meta-Tags (Yoast/RankMath) |
| `novamira-adrianv2/generate-schema-markup` | JSON-LD Schema.org |

### Code-Injection (statt WPCode-Snippet-CRUD)

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/add-custom-js` | JS auf einer Seite (HTML-Widget, post_id-scoped) |
| `novamira-adrianv2/add-custom-css` | CSS auf einer Seite oder global |
| `novamira-adrianv2/add-code-snippet` | Sitewide Code-Snippet (Elementor Pro Custom Code) |
| `novamira-adrianv2/list-code-snippets` | Bestehende Sitewide-Snippets auflisten |

### Media

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/media-upload` | Einzelnes Asset hochladen |
| `novamira-adrianv2/batch-media-upload` | Mehrere Assets hochladen |
| `novamira-adrianv2/list-media` | Mediathek durchsuchen |
| `novamira-adrianv2/media-usage` | Wo wird ein Asset verwendet? |
| `novamira-adrianv2/featured-image` | Featured Image setzen |

### Utilities

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/list-elementor-pages` | Alle V4-Seiten finden |
| `novamira-adrianv2/get-page-markdown` | Seiteninhalt als Markdown |
| `novamira-adrianv2/duplicate-page` | Seite klonen |
| `novamira-adrianv2/clone-element` | Element kopieren |
| `novamira-adrianv2/html-to-elementor-widget-plan` | HTML -> V4 Widget-Plan |
| `novamira-adrianv2/kit-convert-v3-to-v4` | V3-Kit nach V4 konvertieren |
| `novamira-adrianv2/batch-get-content` | Mehrere Posts auf einmal (mode:"skeleton") |

## Fehlerbehebung

| Fehler | Ursache | Fix |
|--------|---------|-----|
| `novamira/adrians-*` not found | Altes Plugin "Adrians Extra" inaktiv | Auf `novamira-adrianv2/*` (kein Praefix) umstellen |
| GV-ID Drift | Kit-Update hat IDs verschoben | `export-design-system` neu, `variable-audit { report:"drift" }` |
| Pass-through nach Build | Zu tiefe Verschachtelung | `layout-audit` -> IDs notieren -> `patch-element-styles` |
| Responsive fehlt | GC ohne mobile Variant | `add-global-class-variant` (kein Tree-Rebuild) |
| Bild laedt nicht | `url:null` in image-src | `url`-Key komplett entfernen (Invariant IV) |
| Style-ID Fehler | Hyphen in Style-ID | `shero` statt `s-hero` (Invariant III) |
| elementor-set-content 401/419 | Session abgelaufen (~25-30min) | `setup-v4-foundation` erneut aufrufen |
