---
name: elementor-v4-style-property-quick-reference
version: "1.0.0"
description: >
  Spickzettel mit den 30 häufigsten CSS-Properties in Elementor V4 —
  exaktes $$type-Format, Enum-Werte und Auto-Wrap-Verhalten.
  Spart get-style-schema-Lookups bei batch-build-page, patch-element-styles und create-global-class.
  Dies ist ein LOKALER SPIEGEL des Server-Skills. Bei MCP-Zugriff stattdessen `novamira/skill-get slug=elementor-v4-style-property-quick-reference` laden.
---

# Elementor V4 Style Property Quick Reference

Direkter Spickzettel — kein get-style-schema-Lookup nötig für diese 30 Properties.

> **⛔ AUTO-WRAP FALLE — line-height** (NEU — SCHWÄCHE 1 / P2-B)
>
> ```
> ❌ FALSCH:  "line-height": 1.5    → wird zu {"size":1.5,"unit":"px"} → CSS: line-height: 1.5px (KAPUTT!)
> ✅ RICHTIG: "line-height": {"$$type":"size","value":{"size":1.5,"unit":"em"}}
> ✅ RICHTIG: "line-height": "1.5"  → bleibt "1.5" → CSS: line-height: 1.5 (OK)
> ```
>
> Skalare Floats ohne `$$type`-Wrapper werden IMMER in px gewrappt. Das
> ergibt `line-height: 1.5px` — faktisch kein Zeilenabstand.
>
> Der Validator `framer-pre-build-validate.js` hat Guard G13, der das
> blockiert (line-height als number oder px mit size<5).

> **📷 EXAKTES e-image Format** (NEU — SCHWÄCHE 5 / P2-D)
>
> ```json
> // Externe URL (Framer CDN, eigener CDN):
> "image": {
>   "$$type": "image",
>   "value": {
>     "src": {
>       "$$type": "image-src",
>       "value": {
>         "url": { "$$type": "url", "value": "https://example.com/img.webp" }
>       }
>     }
>   }
> }
>
> // WordPress Media Library (attachment-id):
> "image": {
>   "$$type": "image",
>   "value": {
>     "src": {
>       "$$type": "image-src",
>       "value": {
>         "id": { "$$type": "image-attachment-id", "value": 42 }
>       }
>     }
>   }
> }
> ```
>
> ⚠️ **Invariant IV:** Wenn `id` gesetzt ist, `url`-Key **KOMPLETT weglassen** (nie `url: null`).
>   PHP's `array_filter()` strippt `null`-Werte → Elementor Server sieht das als
>   "beide gesetzt = Fehler".
>
> Die 3-fach-verschachtelte `$$type`-Chain (`image` → `image-src` → `url`/`image-attachment-id`)
> ist **nirgendwo** in Elementor dokumentiert, aber aus `tools/framer-export/phase7/hero-section.json`
> reverse-engineered. Bleibt stabil ab Elementor 4.0.

> **🏷️ Container-Tag Enums** (NEU — BLOCKADE 6 / P2-A)
>
> | Widget          | Erlaubte Tags                                              | NICHT erlaubt |
> |-----------------|-----------------------------------------------------------|----------------|
> | `e-flexbox`     | `div, header, section, article, aside, footer, a, button` | **`nav`, `main`, `span`** |
> | `e-div-block`   | `div, header, section, article, aside, footer, span`      | **`nav`, `main`, `a`** |
>
> **Remap-Logik in `convert-xml-to-v4.js` (`sanitizeContainerTag()`):**
> - `nav`  → `header`  (nächste semantische Alternative für Navbars)
> - `main` → `section`
> - `span` → `div` (Block-Variante in e-flexbox)
>
> Für `<nav>`-Semantik: `header` verwenden + aria-label="Navigation"-Attribut setzen.

> **📏 Breakpoint-Meta Format** (NEU — SCHWÄCHE 9 / P3-F)
>
> | `meta.breakpoint` | Bedeutung | Server-normalisiert zu |
> |--------------------|-----------|------------------------|
> | **`null`**        | Basis / Desktop (empfohlen, kanonisch) | `"desktop"` |
> | `"desktop"`       | Desktop (semantisch identisch mit null) | `"desktop"` |
> | `"tablet"`        | Tablet (810–1199px) | `"tablet"` |
> | `"mobile"`        | Mobile (<810px) | `"mobile"` |
> | `"laptop"`        | Laptop (Elementor 4.x neues Breakpoint) | `"laptop"` |
>
> → **Immer `null` für die Basis-Variante.** Der Server akzeptiert `"desktop"`
>   zwar, normalisiert es aber zu sich selbst — das kann auf verschiedenen
>   WP-Setups anders dokumentiert sein als `null`. `null` ist die
>   stable-across-versions Konvention (siehe `framer-pre-build-validate.js`
>   Guard G9).

**Auto-Wrap-Regel:** Scalare Werte werden server-seitig automatisch in `{"$$type":"...","value":...}` verpackt. Die Spalte "Ergonomisch (schreiben)" zeigt was du eingibst, "Expanded (gespeichert)" was daraus wird.

---

## Typografie (6)

| Property | Kind | Ergonomic (schreiben) | Expanded (gespeichert) | Enum / Hinweis |
|----------|------|----------------------|----------------------|----------------|
| `color` | union | `"#FF0000"` | `{"$$type":"color","value":"#FF0000"}` | Auch: `global-color-variable`, `dynamic` |
| `font-family` | union | `"Inter"` | `{"$$type":"string","value":"Inter"}` | Auch: `global-font-variable` |
| `font-size` | union | `72` oder `"72px"` | `{"$$type":"size","value":{"size":72,"unit":"px"}}` | Auch: `global-size-variable`. Units: px,em,rem,vw,vh,% |
| `font-weight` | string | `"700"` | `{"$$type":"string","value":"700"}` | `100`-`900`, `normal`, `bold`, `bolder`, `lighter` |
| `line-height` | union | `1.2` → unit `"em"` | `{"$$type":"size","value":{"size":1.2,"unit":"em"}}` | Auch: `global-size-variable` |
| `letter-spacing` | union | `0.5` → unit `"px"` | `{"$$type":"size","value":{"size":0.5,"unit":"px"}}` | Auch: `global-size-variable` |

---

## Text-Formatierung (3)

| Property | Kind | Ergonomic (schreiben) | Enum |
|----------|------|----------------------|------|
| `text-align` | string | `"center"` | `start`, `center`, `end`, `justify` |
| `text-transform` | string | `"uppercase"` | `none`, `capitalize`, `uppercase`, `lowercase` |
| `text-decoration` | string | `"underline"` | `none`, `underline`, `overline`, `line-through` |

---

## Abstände & Größen (6)

| Property | Kind | Ergonomic (schreiben) | Expanded (gespeichert) |
|----------|------|----------------------|----------------------|
| `padding` | union | `{"block-start":80,"block-end":80}` | `{"$$type":"dimensions","value":{...}}` — jede Seite als size |
| `margin` | union | `{"block-start":24}` | Gleiche Struktur wie padding |
| `gap` | union | `24` | `{"$$type":"size","value":{"size":24,"unit":"px"}}` |
| `width` | union | `50` → unit `"%"` | `{"$$type":"size","value":{"size":50,"unit":"%"}}` |
| `height` | union | `400` | `{"$$type":"size","value":{"size":400,"unit":"px"}}` |
| `opacity` | union | `0.8` | `{"$$type":"size","value":{"size":0.8,"unit":"px"}}` — ⚠️ unit wird ignoriert |

---

## Flexbox-Layout (7)

| Property | Kind | Ergonomic | Enum |
|----------|------|-----------|------|
| `display` | string | `"flex"` | `block`, `inline`, `inline-block`, `flex`, `inline-flex`, `grid`, `inline-grid`, `flow-root`, `none`, `contents` |
| `flex-direction` | string | `"row"` | `row`, `row-reverse`, `column`, `column-reverse` |
| `flex-wrap` | string | `"wrap"` | `wrap`, `nowrap`, `wrap-reverse` |
| `justify-content` | string | `"center"` | `center`, `start`, `end`, `flex-start`, `flex-end`, `left`, `right`, `normal`, `space-between`, `space-around`, `space-evenly`, `stretch` |
| `align-items` | string | `"center"` | `normal`, `stretch`, `center`, `start`, `end`, `flex-start`, `flex-end`, `self-start`, `self-end`, `anchor-center` |
| `align-self` | string | `"center"` | Gleiche Enum wie align-items |
| `flex` | flex | `{"grow":1,"shrink":1}` | `{"$$type":"flex","value":{"grow":1,"shrink":1,"basis":"auto"}}` — basis immer String |

---

## Border & Radius (5)

| Property | Kind | Ergonomic | Expanded / Enum |
|----------|------|-----------|-----------------|
| `border-radius` | union | `12` | `{"$$type":"size","value":{"size":12,"unit":"px"}}` — auch: border-radius mit 4 Ecken |
| `border-radius` (4 Ecken) | border-radius | `{"start-start":12,"start-end":12,...}` | `{"$$type":"border-radius","value":{...}}` |
| `border-width` | union | `1` | `{"$$type":"size","value":{"size":1,"unit":"px"}}` — auch: border-width mit 4 Seiten |
| `border-color` | union | `"#e5e7eb"` | `{"$$type":"color","value":"#e5e7eb"}` — auch: `global-color-variable` |
| `border-style` | string | `"solid"` | `none`, `hidden`, `dotted`, `dashed`, `solid`, `double`, `groove`, `ridge`, `inset`, `outset` |

---

## Hintergrund (2)

| Property | Kind | Ergonomic (Kurzform) | Wichtig |
|----------|------|---------------------|--------|
| `background` (nur Farbe) | background | `"#FF0000"` → auto-wrapt zu color | Einfachste Form — wird zu `{"$$type":"background","value":{"color":{"$$type":"color","value":"#FF0000"}}}` |
| `background` (mit Overlay) | background | Siehe Snippet unten | background-overlay Array mit color-overlay + image-overlay |

**Hintergrund mit Farb-Overlay (ergonomisch):**
```json
{
  "background": {
    "background-overlay": [{
      "$$type": "background-color-overlay",
      "value": { "color": { "$$type": "global-color-variable", "value": "e-gv-ID" } }
    }]
  }
}
```

**Hintergrund mit Bild-Overlay + Farb-Overlay:**
```json
{
  "background": {
    "background-overlay": [
      {
        "$$type": "background-image-overlay",
        "value": {
          "image": { "$$type": "image", "value": { "src": { "$$type": "image-src", "value": { "id": { "$$type": "image-attachment-id", "value": 123 }, "url": null } }, "size": { "$$type": "string", "value": "large" } } },
          "position": { "$$type": "string", "value": "center center" },
          "size": { "$$type": "string", "value": "cover" },
          "repeat": { "$$type": "string", "value": "no-repeat" }
        }
      },
      {
        "$$type": "background-color-overlay",
        "value": { "color": { "$$type": "global-color-variable", "value": "e-gv-ID" } }
      }
    ]
  }
}
```
⚠️ **Reihenfolge wichtig:** image-overlay VOR color-overlay, sonst überdeckt die Farbe das Bild.

---

## Sonstige (3)

| Property | Kind | Ergonomic | Enum / Hinweis |
|----------|------|-----------|----------------|
| `box-shadow` | box-shadow | `[{"hOffset":0,"vOffset":4,"blur":12,"color":"rgba(0,0,0,0.1)"}]` | Array. hOffset/vOffset/blur/spread = size, color = color |
| `position` | string | `"relative"` | `relative`, `absolute`, `fixed`, `sticky` |
| `overflow` | string | `"hidden"` | `visible`, `hidden`, `scroll`, `auto` |

---

## Variable-Referenzen (Design Tokens)

Statt Hardcode-Werten immer Design Tokens referenzieren:

| Token-Typ | $$type | Beispiel |
|-----------|--------|----------|
| Farbe | `global-color-variable` | `{"$$type":"global-color-variable","value":"e-gv-f958850"}` |
| Schrift | `global-font-variable` | `{"$$type":"global-font-variable","value":"e-gv-f32b887"}` |
| Größe | `global-size-variable` | `{"$$type":"global-size-variable","value":"e-gv-5a00143"}` |

**WICHTIG:** Auto-Wrap erkennt KEINE Variable-IDs automatisch. `"color":"e-gv-f958850"` wird als Farblackierung interpretiert, nicht als Token-Referenz. Variable-Referenzen müssen IMMER als `{"$$type":"global-*-variable","value":"e-gv-..."}` geschrieben werden.

---

## Häufige Fehler

### ❌ Falsche Property-Namen (CSS-Standard ≠ V4-Schema)

Diese Properties existieren NICHT als eigenständige Keys im V4 Schema:

| ❌ Falsch | ✅ Richtig | Warum |
|-----------|-----------|-------|
| `"background-color": "#FF0000"` | `"background": {"color": {"$$type":"color","value":"#FF0000"}}` | Nested unter `background` |
| `"background-color": {"$$type":"color",...}` | `"background": {"color": {...}}` | Kein top-level `background-color` Key |
| `"padding-block-start": 80` | `"padding": {"block-start": 80}` | Nested unter `padding` |
| `"padding-block-end": 80` | `"padding": {"block-end": 80}` | Nested unter `padding` |
| `"margin-block-start": 24` | `"margin": {"block-start": 24}` | Nested unter `margin` |
| `"margin-block-end": 24` | `"margin": {"block-end": 24}` | Nested unter `margin` |
| `"border-top-width": 1` | `"border-width": {"top": {"size":1,"unit":"px"}}` | Nested unter `border-width` |

### ❌ Falsche Wert-Typen

| Falsch | Richtig | Grund |
|--------|---------|-------|
| `"color":"e-gv-f958850"` | `"color":{"$$type":"global-color-variable","value":"e-gv-f958850"}` | Auto-Wrap erkennt keine Token-IDs |
| `"font-weight":700` | `"font-weight":"700"` | font-weight ist string, nicht number |
| `"opacity":"0.8"` | `"opacity":0.8` | opacity ist number (auch wenn kind=size) |
| `"flex-direction":"horizontal"` | `"flex-direction":"row"` | horizontal/vertical sind keine gültigen Werte |
| `"text-align":"left"` | `"text-align":"start"` | left/right nicht im Enum, start/end nutzen |
| `"gap":"24px"` | `"gap":24` | Zahl ohne Anführungszeichen |
| `"padding":"80px"` (alle Seiten gleich) | `"padding":{"block-start":80,"block-end":80,"inline-start":80,"inline-end":80}` | Keine String-Kurzform unterstützt |

### ✅ Background — alle Formen auf einen Blick

```json
// Nur Farbe (einfachste Form):
"background": { "color": { "$$type": "global-color-variable", "value": "e-gv-abc" } }

// Farbe als Hex:
"background": { "color": { "$$type": "color", "value": "#1a1a2e" } }

// Farbe + Bild:
"background": {
  "color": { "$$type": "color", "value": "#000000" },
  "background-overlay": [
    { "$$type": "background-image-overlay", "value": {
      "image": { "$$type": "image-src", "value": { "url": { "$$type": "url", "value": "https://..." } } },
      "size": "cover", "position": "center center"
    }},
    { "$$type": "background-color-overlay", "value": {
      "color": { "$$type": "global-color-variable", "value": "e-gv-abc" }
    }}
  ]
}
```

### ✅ Padding/Margin — alle Formen auf einen Blick

```json
// Alle 4 Seiten explizit:
"padding": {
  "block-start": 80, "block-end": 80,
  "inline-start": 40, "inline-end": 40
}

// Nur oben und unten:
"padding": { "block-start": 60, "block-end": 60 }

// Nur links und rechts:
"padding": { "inline-start": 20, "inline-end": 20 }

// Margin funktioniert identisch:
"margin": { "block-start": 24, "block-end": 0 }
```

⚠️ Fehlende Seiten werden NICHT automatisch auf 0 gesetzt — sie bleiben unverändert.
Explizit 0 setzen wenn nötig: `"block-start": 0`

---

## Settings vs Styles — Die Grenze

| Gehört in `settings` | Gehört in `styles` |
|------------------------|---------------------|
| `tag` (h1, p, a) | `color`, `font-size`, … (alles Visuelle) |
| `title` / `paragraph` / `text` (Inhalt) | `padding`, `margin`, `gap` |
| `classes` (Global Class IDs) | `background`, `border-*` |
| `link` (URL + Target) | `display`, `flex-direction`, … (Layout) |
| `image` (Bild-Auswahl) | `width`, `height`, `opacity` |
| `attributes` (data-*, aria-*) | `box-shadow`, `transform` |

⚠️ Bei V4-Containern (e-flexbox, e-div-block): ALLES Visuelle/Layout in `styles` — `settings` hat NUR `tag`, `classes`, `link`, `attributes`.


---

## Ergänzungen aus Session Mai 2026

### margin: auto — horizontale Zentrierung

`unit: "auto"` ist ein gültiger Wert im dimensions-Schema für `margin`. Wird für `margin: 0 auto` (horizontale Zentrierung) benötigt:

```json
"margin": {
  "$$type": "dimensions",
  "value": {
    "block-start":  { "$$type": "size", "value": { "size": 0, "unit": "px" } },
    "block-end":    { "$$type": "size", "value": { "size": 0, "unit": "px" } },
    "inline-start": { "$$type": "size", "value": { "size": 0, "unit": "auto" } },
    "inline-end":   { "$$type": "size", "value": { "size": 0, "unit": "auto" } }
  }
}
```

| Property | unit: "auto" erlaubt? | Hinweis |
|----------|----------------------|---------|
| `margin`  | Ja, auf allen 4 Seiten | Standard-CSS margin: auto |
| `padding` | Nein | Nur px, %, em, rem, vw, vh |
| `width`   | Nein | Nur px, %, em, rem, vw, vh |

---

### background: ergonomische Kurzformen

Der Server akzeptiert folgende Kurzformen für `background` (werden automatisch expandiert):

```json
// Nur Farbe (einfachste Form):
"background": "#043333"
// wird zu: { "$$type": "background", "value": { "background-overlay": { ... color-overlay ... } } }

// Mit Global Variable:
"background": { "$$type": "global-color-variable", "value": "e-gv-xxx" }
// Achtung: Nur zuverlässig bei patch-element-styles, nicht immer bei set-content
```

**Sicherste Form für set-content (immer vollständig ausschreiben):**
```json
"background": {
  "$$type": "background",
  "value": {
    "background-overlay": {
      "$$type": "background-overlay",
      "value": [
        {
          "$$type": "background-color-overlay",
          "value": { "color": { "$$type": "global-color-variable", "value": "e-gv-xxx" } }
        }
      ]
    }
  }
}
```

---

### e-heading: tag-Enum vollständig

Erlaubte Werte: `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `div`, `span`

**Nicht erlaubt:** `p` — Tree-Validation-Fehler. Für Fliesstext `div` verwenden oder `e-paragraph` Widget.

---

### Häufige Fehler (ergänzt)

| Falsch | Richtig | Grund |
|--------|---------|-------|
| `"classes": { "value": ["navwrap"] }` | `"classes": { "$$type": "classes", "value": ["navwrap"] }` | $$type Pflicht bei e-flexbox |
| `"tag": "p"` auf e-heading | `"tag": "div"` | p nicht im Enum |
| `"margin-inline-start": "auto"` | `"margin": { ... "inline-start": { "size": 0, "unit": "auto" } ... }` | Nur über dimensions-Objekt |
| `adrians-batch-build-page` für Root | `elementor-set-content` | batch-build-page erzeugt V3-Container auf Root-Ebene |
