---
slug: elementor-screenshot-to-v4
title: Screenshot to Elementor V4
description: Workflow zur Konvertierung von Screenshots, Mockups oder Design-Referenzen in Elementor V4 Seiten mit Novamira AdrianV2 Abilities. Verwenden wenn ein Screenshot oder Design-Mockup in eine Elementor V4 Seite umgesetzt werden soll, oder wenn der User sagt "baue das Design nach", "screenshot to elementor", "design to v4".
version: "1.0"
tags: [elementor, v4, screenshot, design, atomic, novamira, adrianv2]
---

# Screenshot to Elementor V4

## Wann diesen Skill verwenden

Wenn ein Screenshot, Mockup oder Design-Referenzbild in eine Elementor V4 Seite
konvertiert werden soll. Dieser Skill ist die "ground truth" fuer Novamira AdrianV2
Ability-Namen auf solar.local.

## Architektur-Entscheidung

Screenshot-Seiten werden mit `novamira-adrianv2/batch-build-page` gebaut
(NICHT elementor-set-content — das ist nur fuer Framer-Trees).

## Kritische Regeln

1. Immer zuerst `novamira-adrianv2/setup-v4-foundation` aufrufen
2. NIEMALS url:null in image-src
3. Style-IDs OHNE Hyphens
4. Visuelle Props NUR in styles, nie in settings
5. custom_css immer {"raw":"..."} Format
6. Vor Build: Screenshot analysieren → Widget-Plan erstellen → User bestaetigen lassen

## Workflow

### Schritt 1: Screenshot analysieren

1. Screenshot/Design genau betrachten
2. Layout-Struktur identifizieren: Welche Sektionen? Welches Grid/Flexbox-Layout?
3. Farbpalette extrahieren (Hintergrund, Text, Akzente)
4. Typografie erkennen (Font-Familien, Groessen, Gewichte)
5. Abstaende schaetzen (Padding, Gap, Margins)
6. UI-Elemente katalogisieren: Buttons, Icons, Cards, Images

### Schritt 2: Widget-Plan erstellen

```
Option A: HTML-Rekonstruktion → Widget-Plan
  1. Screenshot als HTML/CSS rekonstruieren
  2. novamira-adrianv2/html-to-elementor-widget-plan { html: "...", mode: "full" }
     → Widget-Plan mit native_widget_ratio und Element-Tree
  3. Plan reviewen und anpassen

Option B: Manueller Widget-Plan
  1. Element-Tree direkt als JSON aufbauen
  2. Jedes Element mit elType, widgetType, settings, styles definieren
```

### Schritt 3: Foundation + Design System

```
3. novamira/elementor-check-setup → V4 verfuegbar?
4. novamira-adrianv2/setup-v4-foundation { create_missing: true }
   → GV-IDs + GC-IDs sichern

5. Design Tokens anlegen:
   novamira-adrianv2/batch-create-variables {
     variables: [
       { label: "accent", type: "color", value: "#3B82F6" },
       { label: "text-primary", type: "color", value: "#111111" },
       ...
     ],
     strategy: "skip"
   }

6. Optional: Bestehende Tokens checken
   novamira-adrianv2/export-design-system { what: "all" }
```

### Schritt 4: Bild-Assets vorbereiten

```
7. Screenshot-Bilder identifizieren
   - Logos, Icons, Produktbilder, Hintergrundbilder

8. Bilder zu WordPress hochladen:
   novamira-adrianv2/media-upload {
     filename: "hero-bg.jpg",
     content_base64: "...",
     mime_type: "image/jpeg"
   }
   → wp_media_id merken

   ODER Batch:
   novamira-adrianv2/batch-media-upload {
     files: [
       { filename: "logo.png", mime_type: "image/png", content_base64: "..." },
       ...
     ]
   }

9. Bestehende Medien durchsuchen:
   novamira-adrianv2/list-media { search: "logo", mime_type: "image" }
```

### Schritt 5: Global Classes anlegen

```
10. Wiederkehrende Styles identifizieren:
    - Typografie (Heading 1/2/3, Body, Caption)
    - Layout (Section-Padding, Card-Styles, Button-Styles)
    - Background (Section-BGs, Card-BGs)

11. Global Classes via Kit-Editor oder elementor-create-global-class:
    novamira/elementor-create-global-class { label: "gc-heading-xl", ... }
```

### Schritt 6: Seite bauen

```
12. Neue Seite anlegen:
    novamira/create-post {
      title: "...",
      status: "draft",
      post_type: "page"
    }

13. Build (EIN Call):
    novamira-adrianv2/batch-build-page {
      post_id: <ID>,
      title: "...",
      elements: [
        {
          elType: "e-flexbox",
          widgetType: "e-flexbox",
          id: "hero-section",
          settings: {
            classes: { "$$type": "classes", "value": ["gc-section-hero"] }
          },
          styles: { ... },
          elements: [ ... ]
        }
      ]
    }

    ODER schrittweise (fuer inkrementelle Builds):
    novamira-adrianv2/add-flexbox { post_id, parent_id, ... }
    novamira-adrianv2/add-atomic-heading { post_id, parent_id, title: "...", ... }
    novamira-adrianv2/add-atomic-paragraph { post_id, parent_id, paragraph: "...", ... }
    novamira-adrianv2/add-atomic-button { post_id, parent_id, text: "...", link: {...} }
    novamira-adrianv2/add-atomic-image { post_id, parent_id, image: {...} }
```

### Schritt 7: Post-Build QA

```
14. Layout pruefen:
    novamira-adrianv2/layout-audit { post_id: <ID> }

15. Visuelle Checks:
    novamira-adrianv2/visual-qa {
      post_id: <ID>,
      breakpoints: ["desktop", "tablet", "mobile"]
    }

16. Responsive-Coverage:
    novamira-adrianv2/responsive-audit { post_id: <ID> }

17. Content-Audit:
    novamira-adrianv2/page-audit { post_id: <ID> }
    → Leer-Container, Alt-Texte, Heading-Hierarchie

18. A11y-Audit:
    novamira-adrianv2/audit-page-a11y { post_id: <ID> }
    → WCAG 2.2 Checks

19. SEO-Audit:
    novamira-adrianv2/audit-page-seo { post_id: <ID> }
```

### Schritt 8: Fixes & Iteration

```
20. Style-Fixes:
    novamira-adrianv2/patch-element-styles {
      post_id: <ID>,
      patches: [
        { element_id: "hero-heading", props: { "font-size": {...} } },
        { element_id: "cta-btn", add_class: "gc-btn-primary" }
      ]
    }

21. Responsive-Varianten:
    novamira-adrianv2/add-global-class-variant {
      class_id: "gc-heading-xl",
      breakpoint: "mobile",
      props: { "font-size": {...} }
    }

22. Kontrast-Fix bei A11y-Problemen:
    novamira-adrianv2/fix-color-contrast {
      post_id: <ID>,
      preview: true  // Erst Vorschau, dann apply:true
    }

23. Element klonen (fuer wiederholte Patterns):
    novamira-adrianv2/clone-element {
      post_id: <ID>,
      element_id: "card-template",
      target_parent: "cards-grid"
    }
```

## Framer-spezifische Build-Regel

⚠️ **WICHTIG:** Screenshot/Design-Seiten werden mit `batch-build-page` gebaut.
Framer-Trees hingegen muessen mit `novamira/elementor-set-content` gebaut werden.
Nicht verwechseln!

```
✅ Screenshot → batch-build-page
✅ Framer    → elementor-set-content
```

## Ability-Quick-Reference

### Pflicht-Einstieg

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/setup-v4-foundation` | IMMER vor dem ersten Build |
| `novamira/elementor-check-setup` | Einmal pro Session |
| `novamira-adrianv2/batch-build-page` | Haupt-Build-Call |

### Image-Handling

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/list-media` | Existierende Bilder suchen |
| `novamira-adrianv2/media-upload` | Einzelnes Bild hochladen |
| `novamira-adrianv2/batch-media-upload` | Mehrere Bilder auf einmal |

### Design System

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/export-design-system` | Tokens + GCs inspizieren |
| `novamira-adrianv2/batch-create-variables` | Neue Tokens anlegen |
| `novamira-adrianv2/apply-variable-to-class` | Token an GC binden |

### QA

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/layout-audit` | Nach jedem Build |
| `novamira-adrianv2/visual-qa` | Nach jedem Build |
| `novamira-adrianv2/responsive-audit` | Nach jedem Build |
| `novamira-adrianv2/page-audit` | Content-QA |
| `novamira-adrianv2/audit-page-a11y` | Accessibility |
| `novamira-adrianv2/audit-page-seo` | SEO-Check |

### Fixes

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/patch-element-styles` | Gezielte Style-Korrekturen |
| `novamira-adrianv2/fix-color-contrast` | A11y-Kontrast-Probleme |
| `novamira-adrianv2/add-global-class-variant` | Responsive-Varianten |
| `novamira-adrianv2/remove-global-class` | GC loesen |

### Utilities

| Ability | Wann |
|---------|------|
| `novamira-adrianv2/list-elementor-pages` | Alle V4-Seiten finden |
| `novamira-adrianv2/duplicate-page` | Seite klonen |
| `novamira-adrianv2/clone-element` | Element kopieren |
| `novamira-adrianv2/get-page-markdown` | Content als Markdown |
