# Elementor V4 Design-Schema — Generalisierte Architektur

> **Erstellt:** 2026-06-12  
> **Referenz-Page:** https://solar.local/framer-e2e-test-hero/ (Post ID: 4943)  
> **Zweck:** Generalisierbares Schema für das Bauen, Analysieren und Validieren  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;jeder beliebigen Elementor V4 Atomic Widget-Seite

---

## Inhaltsverzeichnis

1. [Zusammenfassung & Key Findings](#1-zusammenfassung--key-findings)
2. [Die 3-Schicht-Architektur](#2-die-3-schicht-architektur)
3. [Element-Struktur (Bausteine)](#3-element-struktur-bausteine)
4. [Das $$type System — Vollständige Referenz](#4-das-type-system--vollständige-referenz)
5. [Das Style-System (3 Ebenen)](#5-das-style-system-3-ebenen)
6. [Container-System: Grid vs. Flexbox vs. Block](#6-container-system-grid-vs-flexbox-vs-block)
7. [Widget-Typen & Settings (Katalog)](#7-widget-typen--settings-katalog)
8. [Responsive System (Breakpoints & Varianten)](#8-responsive-system-breakpoints--varianten)
9. [Konvertierungs-Pipeline: Framer → V4](#9-konvertierungs-pipeline-framer--v4)
10. [Post-4943 Detailanalyse](#10-post-4943-detailanalyse)
11. [Validierungs-Schema (Automatisierte Checks)](#11-validierungs-schema-automatisierte-checks)
12. [Anti-Patterns & Goldene Regeln](#12-anti-patterns--goldene-regeln)

---

## 1. Zusammenfassung & Key Findings

Die Analyse von Post 4943 und des Pipeline-Codes ergibt folgende Kernarchitektur:

| Aspekt | Erkenntnis |
|--------|-----------|
| **Datenformat** | Verschachtelter JSON-Baum mit `elType`, `widgetType`, `settings`, `styles`, `elements` |
| **Typsystem** | JEDER Wert ist `{ "$$type": "...", "value": ... }` — keine Plain-Strings |
| **Style-System** | 3-Schichtig: Global Variables → Global Classes → Local Styles |
| **Container** | `e-flexbox` (1D) vs. `e-div-block` (2D-Grid) — bewusste Wahl je Layout |
| **Widgets** | 6 Atomic Widgets: `e-heading`, `e-paragraph`, `e-button`, `e-image`, `e-svg`, `e-divider` |
| **Responsive** | Varianten pro Breakpoint (`desktop`/`tablet`/`mobile`) in `styles[styleId].variants[]` |
| **Content-API** | `elementor-set-content` (ganzer Baum) + `adrians-patch-element-styles` (iterativ) |
| **Invarianten** | 5 harte Regeln, deren Bruch zu Render-Fehlern oder Site-Crash führt |

---

## 2. Die 3-Schicht-Architektur

Jede Elementor V4-Seite ist ein **Baum aus Element-Knoten**. Jeder Knoten hat dieselbe Grundstruktur:

```
┌─────────────────────────────────────────┐
│  ELEMENT KNOTEN                         │
├─────────────────────────────────────────┤
│  id: string          — unique Element-ID│
│  elType: string      — "widget" |       │
│                        "e-flexbox" |     │
│                        "e-div-block"     │
│  widgetType: string  — e-heading |      │
│                        e-flexbox | ...   │
│  settings: object    — Konfiguration    │
│  styles: object      — CSS via Varianten│
│  elements: array     — Kind-Elemente    │
└─────────────────────────────────────────┘
```

### 2.1 Post-4943: Tatsächlicher Seitenbaum

Die analysierte Seite besteht aus einem **Root-Array mit 1 Element**, das 3 Top-Level-Sektionen enthält:

```
[0] e-flexbox (section, wqlkylrf1)          ← Root-Section (Haupt-Layout)
  └── elements:
      [0] e-flexbox (div, cv9xhakut)        ← Hero Wrapper (full-height, padding)
          └── elements:
              [0] e-flexbox (div, e9zurboue) ← Hero Image Container (border-radius:40px)
                  └── elements:
                      [0] e-flexbox (avwpqaow7)  ← Overlay 1: Image-Overlay (absolute, full)
                      │   └── [fvb39t2a3] e-flexbox (absoluter Platzhalter)
                      │   └── [etoocuhkk] e-flexbox (absoluter Platzhalter)
                      │
                      [1] e-flexbox (sfwmfgnrv)   ← Overlay 2: Text-Block (absolute, top:80, left:80)
                      │   └── elements:
                      │       [0] e-flexbox (zcw8uvznh, row)   ← Kicker-Zeile
                      │       │   └── [wwnvycptg] e-flexbox (Icon 20×16)
                      │       │   └── [zwzwajrrv] e-heading "HELPED +200 FOUNDERS..."
                      │       │
                      │       [1] e-flexbox (l8jkvj34o, row)   ← Hero Headline
                      │           └── 7× e-heading ("We", "build", "design on", ...)
                      │
                      [2] e-flexbox (wzkc8njfi)  ← Overlay 3: Footer-Text (absolute, bottom)
                          └── [awmoulxld] e-heading (Beschreibungstext)
                          └── [ww2rotpig] e-heading "See how we work with you"

      [1] e-flexbox (div, uhzfruef6)        ← Info Section (padding 200/60)
          └── elements:
              [0] e-flexbox (zfkid31rt, max-width:1120)
                  └── elements:
                      [0] e-flexbox (sdn2sfiy6, max-width:650)
                      │   └── [dx5pnj-gs] + [fuhzcyogq] e-heading
                      │
                      [1] e-flexbox (rnqwmpaqa, row)  ← 2-Karten Layout
                          └── [tcv5exgb0] e-flexbox (sticky, height:460)
                          │   └── [nbge6zfdh] e-image (absolutes Hintergrundbild)
                          │
                          └── [rv16kjdb6] e-flexbox (Text-Karte 1)
                          │   └── [ndryfochv] e-image (Logo 40×48)
                          │   └── [uifss5aa1] → [u9jhys4mo] → Texte
                          │       └── [jqrbmcms5] → 3× e-heading
                          │       └── [bh2cytokp] e-heading "Learn More About Us"
                          │       └── [ospf1mcne] → 4× e-heading (Platzhalter "1fr")
                          │
                          └── [d2oflv5fs] e-flexbox (Text-Karte 2, sticky, height:460)
                              └── [lel1vg2xo] e-image (absolutes Hintergrundbild)

      [2] e-flexbox (div, renf0pwlx)        ← Trusted-By Section
          └── [yvyig3lih, max-width:800]
              └── [u31nqepod] e-heading "TRUSTED BY MANY, AND YOU"
              └── [xwogxjgjk] e-flexbox (row) ← Logo-Row
                  └── 5× [zoq4jmph-type] e-flexbox (200×100 Kacheln)
```

### 2.2 Wie wurden die Elemente eingefügt?

Der Build-Prozess für Post 4943 verlief über den Novamira MCP Adapter:

```
1. create-post → Post 4943 (draft)
2. adrians-setup-v4-foundation { post_id: 4943 }
   → legt V4-Kit-Grundstruktur an (Variables, CSS-Basis)
3. elementor-set-content { post_id: 4943, content: [<gesamter Baum>] }
   → SCHREIBT ALLE Elemente in EINEM Call in die Datenbank
```

**Kritisch:** `elementor-set-content` akzeptiert ein **Array** von Root-Elementen (nicht ein einzelnes Objekt). Der gesamte Baum wird in einem Batch geschrieben — die PHP-Klasse `class-batch-build-page.php` iteriert über den Baum und registriert:
- Elemente in `wp_postmeta` (serialisiertes JSON)
- Style-Einträge pro Element mit lokalen Class-IDs
- Global Classes, wenn `gc-*` IDs im Tree referenziert werden (automatisch!)

---

## 3. Element-Struktur (Bausteine)

### 3.1 Container-Elemente (`elType = "e-flexbox"` oder `"e-div-block"`)

```json
{
  "elType": "e-flexbox",
  "widgetType": "e-flexbox",
  "id": "unique-id-here",
  "settings": {
    "classes": {
      "$$type": "classes",
      "value": ["slocal-style-id"]
    },
    "tag": "section"   // HTML-Tag: section, div, header, footer, main, nav
  },
  "styles": {
    "slocal-style-id": { /* Style-Definition, siehe §5 */ }
  },
  "elements": [ /* Kind-Elemente */ ]
}
```

**Tag-Werte für Container:**
- `section` — für semantische Sektionen (Root-Level)
- `div` — Standard-Container
- `header`, `footer`, `main`, `nav`, `article`, `aside` — HTML5 semantisch

**Alternative: `e-div-block`**
```json
{
  "elType": "e-div-block",
  "widgetType": "e-div-block",
  "id": "grid-container",
  "settings": {
    "classes": { "$$type": "classes", "value": ["sgrid"] },
    "tag": "div"
  },
  "styles": {
    "sgrid": {
      "variants": [{
        "meta": { "breakpoint": "desktop", "state": null },
        "props": {
          "display": { "$$type": "string", "value": "grid" },
          "grid-template-columns": { "$$type": "string", "value": "1fr 1fr" },
          "gap": { "$$type": "size", "value": { "size": 24, "unit": "px" } }
        },
        "custom_css": null
      }]
    }
  },
  "elements": [ /* Grid-Zellen */ ]
}
```

### 3.2 Widget-Elemente (`elType = "widget"`)

```json
{
  "elType": "widget",
  "widgetType": "e-heading",
  "id": "hero-headline",
  "settings": {
    "classes": { "$$type": "classes", "value": ["sgc-text-xl", "slocal-hero"] },
    "tag": { "$$type": "string", "value": "h1" },
    "title": {
      "$$type": "html-v3",
      "value": {
        "content": { "$$type": "string", "value": "Meine Überschrift" },
        "children": []
      }
    }
  },
  "styles": {
    "slocal-hero": { /* Widget-spezifische Styles */ }
  },
  "elements": []   // Widgets haben KEINE Kinder (außer bei Component-Instanzen)
}
```

### 3.3 Post-4943: e-image Widget mit image-src

```json
{
  "elType": "widget",
  "widgetType": "e-image",
  "id": "nbge6zfdh",
  "settings": {
    "classes": { "$$type": "classes", "value": ["snode510"] },
    "image": {
      "$$type": "image",
      "value": {
        "src": {
          "$$type": "image-src",
          "value": {
            "url": {
              "$$type": "url",
              "value": "https://framerusercontent.com/images/0yswDmxDmoofa2GI3pWMdp3OE.webp"
            }
          }
        },
        "size": { "$$type": "string", "value": "full" }
      }
    }
  },
  "styles": { /* siehe §5 */ }
}
```

**Wichtig — Zwei Modi für image-src:**
1. **URL-Modus:** `"url": { "$$type": "url", "value": "https://..." }` — für externe/Framer-Bilder
2. **ID-Modus:** `"id": 123` — für WordPress Media Library (nach `patch-v4-tree-media-ids.js`)

**Invariant IV:** Wenn `id` gesetzt ist, darf `url` NICHT existieren (auch nicht als `null`).

---

## 4. Das $$type System — Vollständige Referenz

**JEDER Wert** in `settings` und `styles.props` ist ein typisiertes Objekt:

### 4.1 Primitive Typen

| $$type | Value | Beispiel |
|--------|-------|----------|
| `string` | plain string | `{ "$$type": "string", "value": "h1" }` |
| `number` | number | `{ "$$type": "number", "value": 2 }` |
| `boolean` | boolean | `{ "$$type": "boolean", "value": true }` |
| `url` | string | `{ "$$type": "url", "value": "https://..." }` |

### 4.2 Size & Dimensions

| $$type | Value Shape | Beispiel |
|--------|-------------|----------|
| `size` | `{ size: number, unit: string }` | `{ "$$type": "size", "value": { "size": 48, "unit": "px" } }` |

**Erlaubte Units:** `px`, `%`, `em`, `rem`, `vw`, `vh`, `custom`  
**Nicht erlaubt:** `fr` (nur in `grid-template-columns` als string, nicht als size)

| $$type | Value Shape |
|--------|-------------|
| `dimensions` | `{ "block-start": size, "block-end": size, "inline-start": size, "inline-end": size }` |

```json
{
  "$$type": "dimensions",
  "value": {
    "block-start":  { "$$type": "size", "value": { "size": 60, "unit": "px" } },
    "block-end":    { "$$type": "size", "value": { "size": 60, "unit": "px" } },
    "inline-start": { "$$type": "size", "value": { "size": 40, "unit": "px" } },
    "inline-end":   { "$$type": "size", "value": { "size": 40, "unit": "px" } }
  }
}
```

### 4.3 Farben & Variablen

| $$type | Value | Beispiel |
|--------|-------|----------|
| `color` | `"#rrggbb"` | `{ "$$type": "color", "value": "#111111" }` |
| `global-color-variable` | `"e-gv-XXXXXXX"` | `{ "$$type": "global-color-variable", "value": "e-gv-a1b2c3d" }` |
| `global-font-variable` | `"e-gv-XXXXXXX"` | `{ "$$type": "global-font-variable", "value": "e-gv-f1e2d3c" }` |
| `global-size-variable` | `"e-gv-XXXXXXX"` | `{ "$$type": "global-size-variable", "value": "e-gv-7a6b5c4" }` |

### 4.4 Komplexe Typen

| $$type | Struktur |
|--------|----------|
| `border-radius` | `{ "start-start": size, "start-end": size, "end-end": size, "end-start": size }` |
| `image-src` | `{ "id": number }` ODER `{ "url": { "$$type": "url", "value": "..." } }` |
| `image-attachment-id` | `number` (WP Media Library ID) |
| `image` | `{ "src": image-src, "size": string }` |
| `classes` | `string[]` — Array von Style-IDs (`"gc-*"` und `"s*"`) |
| `html-v3` | `{ "content": { "$$type": "string", "value": "..." }, "children": [] }` |
| `link` | `{ "href": string, "isTargetBlank": boolean, "tag": string }` |

### 4.5 Post-4943: Tatsächliche $$type Nutzung

Die Beispielseite verwendet folgende $$types:
- `size` — für width, height, font-size, padding, gap, max-width
- `string` — für position, flex-direction, display, tag
- `dimensions` — für padding
- `border-radius` — für border-radius (vier Ecken)
- `color` — für color (hardcoded #111111, #444444)
- `html-v3` — für title (Inhalte)
- `image` / `image-src` / `url` — für Bilder
- `classes` — für Style-Bindings

---

## 5. Das Style-System (3 Ebenen)

### 5.1 Übersicht

```
EBENE 1: Global Variables (Design Tokens)
  ID: e-gv-XXXXXXX (7 Hex-Chars)
  Typen: color, font, size
  Ort: WordPress e_global_variables Tabelle
  API: elementor-list-variables, adrians-batch-create-variables

EBENE 2: Global Classes (Kit-weit)
  ID: gc-XXXXXXXXXXXXXXXXX (lange Hex-ID)
  Typen: typography, structure
  Ort: WordPress e_global_class CPT
  API: elementor-create-global-class, adrians-batch-class

EBENE 3: Local Styles (Element-spezifisch)
  ID: s* (z.B. snode0, feheroText)
  Ort: Im styles-Objekt des Elements
  API: Automatisch via elementor-set-content
```

### 5.2 VERBOSE Style-Format (Datenbankformat)

Jeder Style-Eintrag im `styles`-Objekt folgt diesem Format:

```json
{
  "id": "slocal-id",
  "type": "class",
  "label": "local",
  "variants": [
    {
      "meta": {
        "breakpoint": "desktop",   // MUSS string sein, nicht null!
        "state": null              // MUSS als Key existieren
      },
      "props": {
        "font-size": { "$$type": "size", "value": { "size": 60, "unit": "px" } },
        "color": { "$$type": "global-color-variable", "value": "e-gv-XXXXXXXX" }
      },
      "custom_css": null           // MUSS existieren, nie plain string!
    },
    {
      "meta": {
        "breakpoint": "mobile",
        "state": null
      },
      "props": {
        "font-size": { "$$type": "size", "value": { "size": 36, "unit": "px" } }
      },
      "custom_css": null
    }
  ]
}
```

### 5.3 ERGONOMIC vs. VERBOSE Format

Das ERGONOMIC Format (mit `$$type` auf der obersten Ebene des Style-Objekts) wird vom Pipeline-Converter produziert, aber **der Server erwartet das VERBOSE Format**:

```json
// ❌ ERGONOMIC (vom Converter produziert)
{ "snode0": { "$$type": "flexbox", "variants": [...] } }

// ✅ VERBOSE (was der Server akzeptiert)
{ "snode0": { "id": "snode0", "type": "class", "label": "local", "variants": [...] } }
```

Die Konvertierung ERGONOMIC → VERBOSE passiert entweder:
- In `class-batch-build-page.php` (serverseitig)
- Oder in der Post-Processing-Phase des Pipeline-Workflows

### 5.4 Referenzierung: `settings.classes`

Das `classes`-Array in `settings` ist das Bindeglied:

```json
"settings": {
  "classes": {
    "$$type": "classes",
    "value": [
      "gc-text-xl",       // ← Global Class (Kit-weit)
      "gc-section-main",  // ← Global Class
      "slocal-hero"       // ← Local Style (dieses Elements styles-Objekt)
    ]
  }
}
```

**Invariant I:** JEDER lokale Style (`s*`) im `styles`-Objekt MUSS in `settings.classes.value[]` stehen. Sonst wird er nie gerendert.

**gc- IDs:** Werden NICHT im lokalen `styles` definiert — sie verweisen auf Global Classes, die separat existieren.

### 5.5 Post-4943: Style-Referenzierung

Auf Post 4943 werden **ausschließlich lokale Styles** verwendet (keine Global Classes). Beispiel:

```json
{
  "id": "tcv5exgb0",
  "settings": {
    "classes": { "$$type": "classes", "value": ["snode49"] }
  },
  "styles": {
    "snode49": {
      "id": "snode49",
      "type": "class",
      "label": "local",
      "variants": [{
        "meta": { "breakpoint": "desktop", "state": null },
        "props": {
          "height": { "$$type": "size", "value": { "size": 460, "unit": "px" } },
          "border-radius": { "$$type": "border-radius", "value": { /* 4× 24px */ } },
          "position": { "$$type": "string", "value": "sticky" },
          "top": { "$$type": "size", "value": { "size": 120, "unit": "px" } }
        },
        "custom_css": null
      }]
    }
  }
}
```

**Erkenntnis:** Die Pipeline von Post 4943 hat KEINE Global Classes generiert — alle Styles sind lokal. Dies ist ein Optimierungspotential (GCs würden Redundanz eliminieren und Token sparen).

---

## 6. Container-System: Grid vs. Flexbox vs. Block

### 6.1 Entscheidungsbaum

```
Brauchst du 2D-Layout (Zeilen UND Spalten)?
  ├─ JA → e-div-block mit display: grid
  └─ NEIN → Brauchst du Layout in EINE Richtung?
       ├─ JA → e-flexbox mit flex-direction: row|column
       └─ NEIN (nur Block-Level, max 1 Kind) → e-div-block (default display: block)
```

### 6.2 e-flexbox (Flexbox Container)

```json
{
  "elType": "e-flexbox",
  "widgetType": "e-flexbox",
  "styles": {
    "sflex": {
      "variants": [{
        "meta": { "breakpoint": "desktop", "state": null },
        "props": {
          "display": { "$$type": "string", "value": "flex" },
          "flex-direction": "row",  // oder "column"
          "gap": { "$$type": "size", "value": { "size": 16, "unit": "px" } },
          "align-items": "center",
          "justify-content": "space-between"
        },
        "custom_css": null
      }]
    }
  }
}
```

**Wann verwenden:**
- Icon + Text in einer Zeile (Kicker)
- Button-Reihe
- Vertikale Widget-Liste
- Navigation

### 6.3 e-div-block (Grid Container)

```json
{
  "elType": "e-div-block",
  "widgetType": "e-div-block",
  "styles": {
    "sgrid": {
      "variants": [{
        "meta": { "breakpoint": "desktop", "state": null },
        "props": {
          "display": { "$$type": "string", "value": "grid" },
          "grid-template-columns": { "$$type": "string", "value": "1fr 1fr" },
          "gap": { "$$type": "size", "value": { "size": 32, "unit": "px" } }
        },
        "custom_css": null
      }]
    }
  }
}
```

**grid-template-columns Patterns:**
- `"1fr 1fr"` — 2 gleich breite Spalten
- `"1fr 1fr 1fr"` — 3 gleich breite Spalten
- `"repeat(3, 1fr)"` — 3 Spalten (identisch)
- `"repeat(auto-fit, minmax(280px, 1fr))"` — Responsive Karten
- `"1fr"` — Auf Mobile: Single Column

### 6.4 Post-4943: Framer-Layouts → V4

Die Hero-Sektion der Beispielseite zeigt ein typisches Framer-Layout-Muster:

```
Framer (absolutes Canvas)          →  V4 (normaler Flow)

Frame (1200px, absolute)           →  e-flexbox (section, width:1200px, position:absolute)
  Frame (padding, 100vh, row)      →  e-flexbox (div, height:100vh, flex-direction:row)
    Frame (border-radius:40px)     →  e-flexbox (div, border-radius:40px)
      Frame (absolute, full)       →  e-flexbox (absolute, top/right/bottom/left:0)
        Text-Frame (absolute, 80)  →  e-flexbox (absolute, top:80, left:80)
          ...Text-Elemente...
```

**Kritische Beobachtung:** Die Pipeline behält Framers absolute Positionierung bei, wo sie intentional ist (Overlays), aber **nicht** wo sie nur Canvas-Default ist. Der RC-08 Fix filtert `position:absolute` ohne explizite Offsets heraus.

---

## 7. Widget-Typen & Settings (Katalog)

### 7.1 e-heading

| Setting | $$type | Pflicht | Beschreibung |
|---------|--------|---------|-------------|
| `title` | `html-v3` | ✅ | Textinhalt |
| `tag` | `string` | Nein | `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `span`, `p`, `div` |
| `link` | `link` | Nein | Verlinkung |
| `classes` | `classes` | Nein | Style-Referenzen |

```json
{
  "settings": {
    "tag": { "$$type": "string", "value": "h2" },
    "title": {
      "$$type": "html-v3",
      "value": {
        "content": { "$$type": "string", "value": "HELPED +200 FOUNDERS RISE THEIR BRANDS" },
        "children": []
      }
    }
  }
}
```

### 7.2 e-paragraph

| Setting | $$type | Pflicht | Beschreibung |
|---------|--------|---------|-------------|
| `paragraph` | `html-v3` | ✅ | Textinhalt |
| `tag` | `string` | Nein | `p` (default), `div`, `span` |

### 7.3 e-button

| Setting | $$type | Pflicht | Beschreibung |
|---------|--------|---------|-------------|
| `text` | `html-v3` | ✅ | Button-Text |
| `link` | `link` | Nein | Ziel-URL |
| `tag` | `string` | Nein | `a` oder `button` |

### 7.4 e-image

| Setting | $$type | Pflicht | Beschreibung |
|---------|--------|---------|-------------|
| `image` | `image` | ✅ | Bildquelle (src + size) |
| `link` | `link` | Nein | Klick-Ziel |

```json
{
  "settings": {
    "image": {
      "$$type": "image",
      "value": {
        "src": {
          "$$type": "image-src",
          "value": {
            "url": { "$$type": "url", "value": "https://..." }
            // ODER: "id": 12345
          }
        },
        "size": { "$$type": "string", "value": "full" }
      }
    }
  }
}
```

### 7.5 e-svg

| Setting | $$type | Pflicht | Beschreibung |
|---------|--------|---------|-------------|
| `svg-icon` | `object` | ✅ | SVG-Markup oder Media-Library-Referenz |

### 7.6 e-divider

| Setting | $$type | Pflicht | Beschreibung |
|---------|--------|---------|-------------|
| — | — | — | Rein über Styles gesteuert |

### 7.7 Post-4943: Verwendete Widgets

| Widget | Anzahl | Anmerkung |
|--------|--------|-----------|
| `e-flexbox` | ~40 | Dominiert — viele Container |
| `e-heading` | ~20 | Hauptsächlich h2-Tags |
| `e-image` | 3 | Mit Framer-URLs (nicht WP Media IDs) |
| `e-div-block` | 0 | Keine Grid-Container verwendet |

**Erkenntnis:** Post 4943 verwendet kein Grid — ein klarer Verstoß gegen die Design-Richtlinien. Der RC-09 Fix im Converter erkennt Grid-Kandidaten, wurde hier aber nicht genutzt (die Seite wurde vor dem Fix gebaut).

---

## 8. Responsive System (Breakpoints & Varianten)

### 8.1 Breakpoints

| Key | Viewport | Typische Anwendung |
|-----|----------|-------------------|
| `desktop` | ≥ 1025px | Basis-Styles |
| `tablet` | 768–1024px | Skalierung 0.75× |
| `mobile` | ≤ 767px | Skalierung 0.6× |

### 8.2 Varianten-Struktur

Jeder Style kann mehrere Varianten haben — eine pro Breakpoint + State-Kombination:

```json
"variants": [
  { "meta": { "breakpoint": "desktop", "state": null },    "props": { ... } },
  { "meta": { "breakpoint": "desktop", "state": "hover" },  "props": { ... } },
  { "meta": { "breakpoint": "tablet",  "state": null },    "props": { ... } },
  { "meta": { "breakpoint": "mobile",  "state": null },    "props": { ... } }
]
```

**States:** `null` (default), `hover`, `focus`, `active`

### 8.3 Auto-Scaling Rules

Die Pipeline skaliert automatisch (via `auto-scale-responsive.js`):

| Property | Desktop Threshold | Tablet | Mobile |
|----------|-------------------|--------|--------|
| `font-size` | > 28px | 0.75× | 0.6× |
| `padding` | > 20px | 0.75× | 0.6× |
| `width` | > 300px | 0.75× | 0.6× |
| `height` | > 200px | 0.75× | 0.6× |
| `gap` | > 24px | 0.75× | 0.6× |
| `border-radius` | > 12px | 0.75× | 0.6× |
| `grid-template-columns` | 3+ cols | halbieren | 1fr |

### 8.4 Post-4943: Responsive Status

Die Beispielseite hat **NUR `desktop`-Varianten** — keine `tablet`/`mobile`-Varianten. Dies bedeutet:
- Große Schriftgrößen (>28px) brechen auf Mobile
- Fixed-Width Container (700px, 1200px) überlaufen 375px-Viewport
- Grid-ähnliche Layouts bleiben mehrspaltig

**Das ist ein kritisches Problem** — der Auto-Scale-Schritt (`auto-scale-responsive.js`) wurde entweder nicht ausgeführt oder hat nicht gegriffen.

---

## 9. Konvertierungs-Pipeline: Framer → V4

### 9.1 Pipeline-Übersicht

```
Framer URL → Unframer MCP (getNodeXml)
    ↓
framer-export/ (HTML, CSS, Bilder)
    ↓
convert-xml-to-v4.js     → v4-tree.json (ERGONOMIC Format)
    ↓
auto-scale-responsive.js  → v4-tree-scaled.json (+ tablet/mobile Varianten)
    ↓
generate-global-classes.js → gc-plan.json (Duplikat-Erkennung)
    ↓
patch-v4-tree-media-ids.js → v4-tree-patched.json (URLs → WP Media IDs)
    ↓
framer-pre-build-validate.js → Score ≥ 85%?
    ↓
elementor-set-content (MCP) → WordPress Datenbank
    ↓
verify-build-binding.js → Invariant I Check
```

### 9.2 Converter-Regeln (convert-xml-to-v4.js)

Der Converter transformiert Framer XML-Attribute in V4 Props:

| Framer Attribut | V4 Prop | $$type |
|-----------------|---------|--------|
| `width` | `width` | `size` (wenn px/%) |
| `height` | `height` | `size` oder `string` (`fit-content`) |
| `position` | `position` | `string` |
| `stackDirection: "vertical"` | `flex-direction: "column"` | `string` |
| `stackDirection: "horizontal"` | `flex-direction: "row"` | `string` |
| `stackGap` | `gap` | `size` |
| `padding` | `padding` | `dimensions` |
| `maxWidth` | `max-width` | `size` |
| `borderRadius` | `border-radius` | `border-radius` |
| `backgroundColor` | `background-color` | `color` (als GC-Warnung) |
| `fontSize` | `font-size` | `size` |
| `fontFamily` | `font-family` | `string` |
| `fontWeight` | `font-weight` | `string` |
| `textColor` | `color` | `color` |
| `opacity` | `opacity` | `size` (unitless) |
| `name` (Framer-Komponente) | `widgetType` | Component-Mapping |

### 9.3 RC-Fixes (im aktuellen Code)

Die Pipeline enthält folgende Bugfixes, die in Post 4943 teils noch nicht aktiv waren:

| Fix | Beschreibung | Status |
|-----|-------------|--------|
| RC-01 | `type`-Feld im Output (für batch-build-page) | ✅ |
| RC-02 | `display: flex` explizit setzen | ✅ |
| RC-04 | XML-Fragmente aus Text-Extraktion filtern | ✅ |
| RC-07 | Pass-Through-Container erkennen (position/width/height Defaults) | ✅ |
| RC-08 | `position: absolute` nur bei expliziten Offsets | ✅ |
| RC-09 | Grid-Erkennung für Multi-Child-Container | ✅ |
| RC-11 | Default-Styles für Widgets mit leeren Props | ✅ |
| RC-12 | Global-Classes-Integration (--gc Flag) | ✅ |
| RC-13 | Token-Usage-Analyzer | ✅ |
| RC-14 | Grid/Border-Radius Responsive Scaling | ✅ |
| RC-16 | Explizites Component-Name → WidgetType Mapping | ✅ |
| RC-19 | Erweiterte Responsive-Scaling-Properties | ✅ |
| RC-20 | CSS-Transition → V4-Interaction-Mapper | ✅ |

---

## 10. Post-4943 Detailanalyse

### 10.1 Seitenstruktur (Komplett)

```
SEITE: framer-e2e-test-hero (Post ID: 4943)
Elemente gesamt: ~70 (davon ~40 e-flexbox, ~20 e-heading, 3 e-image, 0 e-div-block)

SEKTION 1 — Hero (Bild + Overlay-Text)
├── Root-Wrapper (section, 1200px, position:absolute)
│   └── Hero-Wrapper (div, height:100vh, padding, flex-direction:row)
│       └── Image-Container (div, border-radius:40px)
│           ├── Overlay 1: Image-Overlay (absolute, top/right/bottom/left:0)
│           │   └── [Platzhalter-Frames, teils leer]
│           ├── Overlay 2: Text-Overlay (absolute, top:80, left:80, max-width:700px)
│           │   ├── Kicker-Zeile (row: Icon 20×16 + "HELPED +200 FOUNDERS...")
│           │   ├── Headline (row: 7× e-heading "We build design on clarity, speed, and care.")
│           │   └── Footer (absolute, bottom:60, left:80)
│           │       ├── "We create thoughtful work..."
│           │       └── "See how we work with you"
│           └── [Overlay 3 nicht sichtbar?]

SEKTION 2 — Über uns (Text + Sticky-Karten)
├── Section-Wrapper (div, padding:200/60, flex-direction:row)
│   └── Content-Wrapper (div, max-width:1120, flex-direction:column)
│       └── Text-Block (div, max-width:650, flex-direction:column)
│       │   ├── Platzhalter + "A deliberate approach..."
│       │   └── Karten-Row (row)
│       │       ├── Karte 1 (sticky, height:460px, border-radius:24px)
│       │       │   └── e-image (absolute overlay)
│       │       ├── Text-Karte 1 (flex-direction:column, padding)
│       │       │   ├── e-image (Logo 40×48)
│       │       │   └── Text-Block
│       │       │       └── 3× e-heading (Langtext)
│       │       │       └── "Learn More About Us"
│       │       │       └── 4× e-heading (Platzhalter: "1fr")
│       │       └── Karte 2 = Karte 1 (geklont)
│       └── [Weitere Elemente...]

SEKTION 3 — Trusted By
├── Section-Wrapper (div, padding:200, flex-direction:column)
│   └── Content (max-width:800, flex-direction:column)
│       ├── "TRUSTED BY MANY, AND YOU"
│       └── Logo-Row (row)
│           └── 5× Logo-Kachel (200×100px, border-radius:16px)
│               └── e-flexbox (absolute, width:108px, height:20px)
```

### 10.2 Auffälligkeiten & Defizite

| Problem | Beobachtung | Schwere |
|---------|-------------|---------|
| **Kein Grid** | 40+ e-flexbox Container, 0 e-div-block. Spalten-Layouts sind als Flexbox-Reihen realisiert. | 🔴 Hoch |
| **Keine Responsive Varianten** | Nur `desktop`-Breakpoint-Varianten. Mobile View wird broken sein. | 🔴 Kritisch |
| **Leere e-heading** | Mehrere Widgets haben `"value": "true"` oder `"value": "1fr"` — offensichtlich Bug im Text-Extraktor. | 🔴 Kritisch |
| **XML-Fragmente als Text** | `"backgroundColor=\"/Neutral/Opacity/08 20%\" overflow=\"clip\" />"` erscheint als Text-Inhalt. | 🟠 Hoch |
| **Keine Global Classes** | 45 identische Heading-Styles sind lokal dupliziert. | 🟡 Mittel |
| **Hardcoded Farben** | `#111111` 45× dupliziert statt einer Global Variable. | 🟡 Mittel |
| **Keine Design Tokens** | Keine `e-gv-*` Referenzen — alles hardcoded. | 🟡 Mittel |
| **Tiefe Verschachtelung** | DOM-Tiefe 6–7 bei einigen Elementen (Grid-Einsatz würde 3 erreichen). | 🟡 Mittel |
| **Pass-Through Container** | Mehrere Single-Child-Flexboxen ohne Layout-Props. | 🟢 Niedrig |

### 10.3 Was lief schief?

Post 4943 wurde **vor** den meisten RC-Fixes gebaut. Die Verbesserungen, die eine Neukonvertierung bringen würde:

1. **RC-09 (Grid-Erkennung):** Die 2-Karten-Row und 5-Logo-Row würden als `e-div-block` mit `display:grid` exportiert
2. **RC-04 (Text-Fix):** XML-Fragmente würden nicht mehr als Text extrahiert
3. **RC-11 (Default-Styles):** Widgets mit `{}` props bekämen Fallback-Styles
4. **RC-19 (Responsive):** Auto-Scaling würde tablet/mobile-Varianten injizieren
5. **RC-12/13 (GC/Tokens):** Global Classes würden für Duplikate vorgeschlagen

---

## 11. Validierungs-Schema (Automatisierte Checks)

### 11.1 6 Vital Checks (validate-v4-tree.js)

| Check | Name | Gewicht | Was geprüft wird |
|-------|------|---------|-----------------|
| C1 | `$$TYPE-CORRECTNESS` | 17% | Alle Props haben korrektes `$$type`. Keine Plain-Strings in `settings`. `custom_css` nicht als plain string. |
| C2 | `STYLES-CLASSES-BINDING` | 17% | Jede lokale Style-ID in `settings.classes.value[]`. Keine orphaned Class-Referenzen. |
| C3 | `STYLE-ID-HYPHEN` | 17% | Style-IDs ohne Bindestriche (`gc-*` explizit erlaubt). |
| C4 | `RESPONSIVE-COVERAGE` | 16% | Große Werte (>28px font-size, >300px width) haben mobile Variante. |
| C5 | `WIDGET-SETTINGS` | 17% | Widget-Typ hat alle required Settings (`title` für e-heading, etc.). |
| C6 | `VERBOSE-STYLE-FORMAT` | 16% | Styles haben `id`, `type:"class"`, `label:"local"`. Varianten haben `meta.breakpoint` und `meta.state`. Kein ERGONOMIC-Leak. |

**Score-Berechnung:** `(bestandene Checks / 6) × 100`. **Schwelle: ≥ 85%**

### 11.2 Zusätzliche Warnings

| Check | Beschreibung |
|-------|-------------|
| `HARDCODED-HEX` | `#rrggbb` als color-Prop statt `global-color-variable` |
| `ORPHANED-CLASS-REFERENCE` | `settings.classes` referenziert Style-ID, die nicht in `styles` definiert ist |
| `SETTINGS-STYLES-SPLIT` | Visuelle Props in `settings` statt in `styles` |

### 11.3 Post-4943 Score (Schätzung)

Basierend auf der Analyse würde Post 4943 etwa so scoren:

| Check | Status | Grund |
|-------|--------|-------|
| C1: $$TYPE-CORRECTNESS | ✅ | Alle Props korrekt typisiert |
| C2: STYLES-CLASSES-BINDING | ✅ | Jeder lokale Style in classes.value referenziert |
| C3: STYLE-ID-HYPHEN | ✅ | `snode*` IDs sind hyphen-frei |
| C4: RESPONSIVE-COVERAGE | 🔴 FAIL | Keine mobile/tablet Varianten |
| C5: WIDGET-SETTINGS | ✅ | Alle e-heading haben title |
| C6: VERBOSE-STYLE-FORMAT | ✅ | Korrektes VERBOSE Format |

**Score:** 83% (5/6) → **BLOCKED** (Schwelle 85%)

---

## 12. Anti-Patterns & Goldene Regeln

### 12.1 Die 5 Invarianten (niemals brechen)

| # | Name | Regel | Konsequenz bei Bruch |
|---|------|-------|---------------------|
| I | Rendering-Gate | Jede ID in `element.styles` MUSS in `settings.classes.value` | Style wird nie gerendert → Widget sieht falsch aus |
| II | Settings/Styles-Split | Visuelle Props (color, font-size, ...) NUR in `styles`, nie in `settings` | V3-Verhalten, Server lehnt ab |
| III | Style-ID Format | Lokale Style-IDs: `[a-z][a-z0-9_]*` — KEINE Hyphens | Parser-Fehler, Style wird nicht erkannt |
| IV | Image-Src | Wenn `id` gesetzt → `url`-Key komplett weglassen | Bild lädt nicht, Render-Fehler |
| V | custom_css Format | Immer `{"raw":"..."}` nie plain string | **Fataler Site-Crash** (HTTP 500) |

### 12.2 Goldene Layout-Regeln

1. **DOM-Tiefe ≤ 3:** section → grid/flex-cell → widget
2. **Grid für 2D:** 2+ Spalten = `e-div-block` + `display:grid`
3. **Kein Background-Element:** `background`/`background-color` als Style-Prop, nicht als Kind
4. **Kein Overflow-Wrapper:** `overflow:hidden` direkt auf das Element
5. **Kein "Kicker-Wrapper":** Icon+Text direkt mit `flex-direction:row` auf dem Eltern-Element
6. **Kein Single-Child-Wrapper:** Container mit genau 1 Kind ohne eigene Layout-Props → flatten

### 12.3 Goldene Style-Regeln

1. **Variables > Classes > Locals:** Immer die höchste Ebene wählen
2. **Global Classes ohne Hardcode-Hex:** Nur Variable-Referenzen in GCs
3. **Responsive immer mitdenken:** Jeder Style braucht desktop + mobile Variante
4. **setup-v4-foundation NIEMALS cachen:** GV-IDs sind session-live
5. **elementor-set-content content ist Array:** Auch bei nur einem Root-Element

### 12.4 Typische Fehler & ihr Fix

| Fehler | Ursache | Fix |
|--------|---------|-----|
| Widget zeigt keine Styles | Lokaler Style nicht in classes.value | `settings.classes.value[]` ergänzen |
| Farbe ignoriert | Hardcode `#hex` statt Variable | `global-color-variable` verwenden |
| Responsive bricht | Nur desktop Variante | tablet + mobile Varianten hinzufügen |
| Text fehlt | Falsches `$$type` | `html-v3` mit content.children prüfen |
| Bild lädt nicht | `url: null` in image-src | `url`-Key komplett entfernen |
| Site crasht (500) | `custom_css` ist plain string | `{"raw":"..."}` Format |
| class_name_contains_spaces | Hyphen in Style-ID | `generateStyleId()` verwenden |
| GV-ID Drift | Kit-Update hat IDs verschoben | `adrians-variable-audit { report: "drift" }` |

---

## Anhang A: Post-4943 Build-Rezept

So wurde die Seite gebaut:

```bash
# 1. Framer XML extrahieren
Unframer MCP: getNodeXml(projectName="augiA20Il", nodeId="ogzZ6kzo0")
→ tools/framer-export/hero-section.xml

# 2. XML → V4 Tree konvertieren
node scripts/convert-xml-to-v4.js \
  --xml tools/framer-export/hero-section.xml \
  --output v4-tree.json

# 3. Manuelle Post-Processing (VOR den RC-Fixes)
# - "children" → "elements" Key umbenannt
# - ERGONOMIC → VERBOSE Format konvertiert
# - Text-Inhalte manuell korrigiert (teils fehlgeschlagen → "true", "1fr")
# → v4-tree-final.json

# 4. WordPress Build
novamira/adrians-setup-v4-foundation { "post_id": 4943 }
novamira/elementor-set-content {
  "post_id": 4943,
  "content": JSON.parse(fs.readFileSync('v4-tree-final.json'))
}
```

---

## Anhang B: Generalisiertes Schema (JSON Schema Draft)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Elementor V4 Page Schema",
  "definitions": {
    "Element": {
      "type": "object",
      "required": ["id", "elType", "widgetType", "settings", "styles", "elements"],
      "properties": {
        "id": { "type": "string" },
        "elType": { "enum": ["widget", "e-flexbox", "e-div-block"] },
        "widgetType": { "enum": ["e-heading", "e-paragraph", "e-button", "e-image", "e-svg", "e-divider", "e-flexbox", "e-div-block"] },
        "settings": { "$ref": "#/definitions/Settings" },
        "styles": { "$ref": "#/definitions/Styles" },
        "elements": { "type": "array", "items": { "$ref": "#/definitions/Element" } }
      }
    },
    "Settings": {
      "type": "object",
      "required": ["classes"],
      "properties": {
        "classes": { "$ref": "#/definitions/Classes" },
        "tag": { "$ref": "#/definitions/TypedValue" },
        "title": { "$ref": "#/definitions/TypedValue" },
        "paragraph": { "$ref": "#/definitions/TypedValue" },
        "text": { "$ref": "#/definitions/TypedValue" },
        "image": { "$ref": "#/definitions/TypedValue" },
        "link": { "$ref": "#/definitions/TypedValue" }
      }
    },
    "Styles": {
      "type": "object",
      "patternProperties": {
        "^(gc-|s[a-z]|fe[a-z])[a-z0-9_]*$": {
          "type": "object",
          "required": ["id", "type", "label", "variants"],
          "properties": {
            "id": { "type": "string" },
            "type": { "const": "class" },
            "label": { "const": "local" },
            "variants": {
              "type": "array",
              "items": { "$ref": "#/definitions/Variant" }
            }
          }
        }
      }
    },
    "Variant": {
      "type": "object",
      "required": ["meta", "props", "custom_css"],
      "properties": {
        "meta": {
          "type": "object",
          "required": ["breakpoint", "state"],
          "properties": {
            "breakpoint": { "enum": ["desktop", "tablet", "mobile"] },
            "state": { "enum": [null, "hover", "focus", "active"] }
          }
        },
        "props": { "type": "object" },
        "custom_css": {
          "oneOf": [
            { "type": "null" },
            { "type": "object", "required": ["raw"], "properties": { "raw": { "type": "string" } } }
          ]
        }
      }
    },
    "Classes": {
      "type": "object",
      "required": ["$$type", "value"],
      "properties": {
        "$$type": { "const": "classes" },
        "value": { "type": "array", "items": { "type": "string" } }
      }
    },
    "TypedValue": {
      "type": "object",
      "required": ["$$type", "value"],
      "properties": {
        "$$type": { "enum": ["string", "number", "boolean", "size", "dimensions", "color", "border-radius", "image", "image-src", "html-v3", "link", "url", "global-color-variable", "global-font-variable", "global-size-variable", "image-attachment-id", "classes"] }
      }
    }
  }
}
```

---

*Bericht erstellt basierend auf: v4-tree-final.json (Post 4943), validate-v4-tree.js, framer-utils.js, v4-prop-type-schema.json, elementor-v4-atomic-builder Skill, framer-v4-pipeline.md Skill*
