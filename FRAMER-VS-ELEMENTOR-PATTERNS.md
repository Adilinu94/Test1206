# Framer → Elementor V4 Pattern Library

> **Pflichtlektüre vor jedem Build.** Dieses Dokument beschreibt, wie spezifische
> Framer-Layout-Muster auf Elementor V4 Atomic Widgets abgebildet werden.
> Kein Raten — jedes Pattern hat genau ein Elementor-Äquivalent.

---

## Stil-Legend: V4-Atomic-Widget-Notation

In diesem Dokument werden V4-Atomic-Widgets mit **einem einheitlichen Schema** dargestellt:

```
e-<widget-type> (<property>=<value>, <property>=<value>, …)
├── e-<child-widget-type> (...)
└── …
```

**Atomare Widget-Typen** (vollständige Properties siehe `novamira-skill/style-props-quickref.md`):

| Widget | Verwendung | Beispiel |
|---|---|---|
| `e-flexbox` | Layout-Container mit `direction`, `gap`, `justify-content`, `padding`, `settings.tag` (section/header/footer/div/article/aside) | `e-flexbox (direction:row, gap:24, settings.tag=section)` |
| `e-heading` | Headline / H-Tag | `e-heading (h1="Titel", tag=h1)` |
| `e-paragraph` | Lauftext ohne Link | `e-paragraph (Body-Text, color:e-gv-text)` |
| `e-button` | Interaktives Element mit `link`-Setting (Pill/Low-emph/Standard) | `e-button (CTA, link=/x, type=link-only, border-radius:50px)` |
| `e-link` | Reiner Text-Link ohne Button-Style | `e-link (Imprint, link=/imprint)` |
| `e-image` | Bild mit `src` (Invariant IV: nie als Container-Background) | `e-image (Hero-Img, width:1400)` |
| `e-svg` | Inline-SVG mit `viewBox` | `e-svg (Logo)` |
| `e-divider` | Trennlinie mit `weight` und `color` | `e-divider (weight:1, color:e-gv-border)` |
| `e-html` | Container für rohen HTML-Markup (Forms, Swiper-Carousels) | `e-html (Form-Wrapper)` |

**Plain-Container-Notation ist VERBOTEN.** Elementor V4-Atomic kennt **kein** generisches `Container`-Widget. Die alten Bezeichnungen (`Container (Flex Column)`, `Container (Section)`, `Container (z-index: N)`, `Button Widget`) sind ungültige V3-/WordPress-Begriffe und werden von `scripts/validate-v4-tree.js` als Schema-Verletzung abgelehnt. **Jedes Layout-Element MUSS ein `e-*`-Widget mit Klammer-Properties sein** — siehe Patterns #1–#14 für lebende Beispiele.

**`settings.tag`-Enum für `e-flexbox`:** erlaubt sind `section`, `header`, `footer`, `div`, `article`, `aside`, `main`. **`nav` ist im e-flexbox-Enum NICHT erlaubt** (BLOCKADE 6 in `style-props-quickref.md`).

**Farben/Fonts als `e-gv-*`-Variablen** (statt Hex-Literal oder Family-String) — siehe Sektion #15 für die 5-stufige Hydration-Chain (`token-mapping.json` → MCP-Foundation → Substitution im V4-Tree).

---

## 1. Absolute Positionierung (Header-Overlay)

**Framer:**
```xml
<Frame position="absolute" top="0" left="0" width="100%" height="80" z-index="10" />
```

**Elementor V4:**
```
e-flexbox (settings.tag=header, position:relative via Parent, customCss: position:absolute; top:0; left:0; z-index:10)
└── e-flexbox (Inner Container, width:100%, max-width:1170px)
    ├── e-image (Logo, width:140)
    ├── e-flexbox (Menu, direction:row, gap:24) — Nav-Items
    └── e-button (CTA, type=link-only)  — Sign-up / Action
```

**Regel:** Framer `position:absolute` → IMMER `custom_css` (`position:absolute; top:0; left:0`) auf einem `e-flexbox` mit entsprechendem `settings.tag` (üblicherweise `header` / `nav`) plus `position:relative` auf dem Parent.

---

## 2. Flex Row (Button-Gruppen, horizontale Layouts)

**Framer:**
```xml
<Frame layout="stack" direction="row" gap="12" width="100%" />
```

**Elementor V4:**
```
e-flexbox (direction:row, gap:12, flex-wrap:wrap, justify-content:flex-start)
├── e-button (Primary Action, height:48, background:e-gv-button-primary, color:e-gv-text-on-primary)
├── e-button (Secondary Action, height:48, type=link-only, no-bg, no-border, text-only)
└── …
```

**Regel:** Framer `direction="row"` → **Niemals** separate Columns für jedes Element. Ein einziger `e-flexbox` mit `direction:row` und `gap`.

---

## 3. Section Background Image (Hero)

**Framer:**
```xml
<Frame background="url(hero.jpg)" background-size="cover" />
```

**Elementor V4:**
```
e-flexbox (settings.tag=section, background:url(hero.jpg) size:cover position:center)
└── e-flexbox (Text-Column, width:50%, padding:80, column-gap entspricht Framer)
    ├── e-heading (h1="Hero-Headline", tag=h1)
    ├── e-paragraph (Sub-Text)
    └── e-flexbox (Action-Row, direction:row, gap:16)
        ├── e-button (Primary CTA)
        └── e-button (Secondary CTA)
```

**Regel:** Background-image IMMER auf Section-Ebene (settings.tag=section), **kein zusätzlicher farbiger Background auf derselben Section**. Bei Hero mit overlayed Text: Section hat column-gap entspricht Framer — `e-heading`/`e-paragraph`/`e-button` werden in eine separate Text-`e-flexbox` (column) gelegt.

---

## 4. Pill-Buttons

**Framer:**
```xml
<Frame border-radius="50" padding="12 24" background="#595e5c">
  <Text>Button Text</Text>
</Frame>
```

**Elementor V4:**
```
e-button (Pill-Button, height:48, border-radius:50px, padding:12px 24px,
         background:e-gv-button-primary, color:e-gv-text-on-primary)
```

**Regel:** Jeder Button wird als `e-button` annotiert **mit Label-Prefix** (z. B. `Pill-Button`, `Primary Action`, `Sign up`), `height: 48` und `border-radius: 50px` **explizit** als Properties gesetzt — kein Elementor-Default (8px) akzeptieren. Die Notation `(label, height, type, …)` ist konsistent mit Pattern #11 Footer-Links und Pattern #12 Navigation-Menüs.

---

## 5. Z-Index (Überlappungen)

**Framer:**
```xml
<Frame z-index="5" />
<Frame z-index="1" />
```

**Elementor V4:**
```
e-flexbox (settings.tag=section, customCss: position:relative; z-index:5)   ← höherer Wert oben
e-flexbox (settings.tag=section, customCss: position:relative; z-index:1)   ← niedrigerer Wert unten
```

**Regel:** Framer `z-index > 0` → IMMER `customCss: position:relative; z-index:N` auf einem `e-flexbox`-Widget. Höherer `z-index` rendert über niedrigerem.

---

## 6. Komponenten-Instanzen

**Framer:** Eine Component wird via `componentId` referenziert, kann Props haben.

**Elementor V4:**
```
Beispiel: Framer-Component "ButtonGroup" → V4 Global Class + V4-Atomic-Tree:
├── Global Class: gc-button-group  (= wiederverwendbare Style-Definition via adrians-setup-v4-foundation)
├── V4-Atomic-Tree:
│   e-flexbox (classes=[gc-button-group], direction:row, gap:8)
│   ├── e-button (Primary Action, classes=[gc-button-primary], link=/x, border-radius:50px)
│   └── e-button (Secondary Action, classes=[gc-button-secondary], link=/y, type=link-only, no-bg, no-border, text-only)
└── Instanzen: Dieselbe gc-button-group-Klasse wird auf mehreren e-flexbox-Widgets referenziert
```

**Regel:** Framer-Components werden zu **Global-Class-Definitionen + V4-Atomic-Tree-Kombinationen**. Props mappen auf e-flexbox-/e-button-Settings (z. B. `direction`, `gap`, `border-radius`), Instanzen referenzieren die Global-Class per `classes=[gc-...]`-Property. Keine Duplizierung von Styles — eine Klasse, viele Widget-Verwendungen.

---

## 7. Responsive Breakpoints

**Framer:** Breakpoints sind variabel (z.B. 1200px, 768px, 480px).

**Elementor V4:**
```
Elementor V4 akzeptiert nur 3 Breakpoints:
├── DESKTOP: ≥ 1025px
├── TABLET: 768px - 1024px
├── MOBILE: ≤ 767px
└── Falls Framer abweicht (z.B. 1200px): nächstgelegenen Elementor-Breakpoint verwenden
```

**Regel:** Framer-Breakpoints werden auf die nächstgelegenen Elementor-Breakpoints gemappt. Bei Abweichungen > 50px → `Custom CSS Media Query` schreiben.

---

## 8. Farben (Global Variables)

**Framer:** `--token-xxx: #595e5c`

**Elementor V4:**
```
├── e-gv-XXXXXXXXXX (Global Variable)
├── Value: #595e5c
└── Referenz: var(--e-global-color-XXXXXXXXXX) oder über MCP adrians-setup-v4-foundation
```

**Regel:** **Niemals** Elementor-Kit-Farben (#4054B2, #23A455, #000000, #FFFFFF) als Ersatz für Framer-Farben verwenden. Immer den exakten Hex-Wert aus dem Token-Mapping nehmen.

---

## 9. Schriftarten

**Framer:** `font-family: "Inter"`

**Elementor V4:**
```
├── font-family: Inter (muss importiert sein: Google Fonts in Elementor > Settings)
├── font-size: exakter Wert aus Framer (px oder rem, nicht raten!)
├── font-weight: exakter Wert aus Framer (400, 500, 600, 700)
└── line-height: exakter Wert aus Framer
```

**Regel:** **Niemals** Schriftarten raten. Nur Fonts aus der Live-Extraktion (`framer-fonts.json`) verwenden. Framer nutzt meist Inter, Figtree, Manrope, oder DM Sans.

---

## 10. Abstände (Spacing)

**Framer:** `padding="24"`, `gap="12"`

**Elementor V4:**
```
├── padding: 24px (oder 24px 24px wenn unterschiedlich)
├── gap: 12px (Container-Gap, nicht Column-Gap)
└── margin: 0 (Default entfernen!)
```

**Regel:** Elementor-Default-Spacing (meist 10px Gap, 0/10px Padding) muss explizit auf Framer-Werte überschrieben werden. Kein "das passt schon".

---

## 11. Footer-Layout (Multi-Column + Bottom-Bar)

**Framer:**
```xml
<Frame name="Footer" padding="60 80" gap="40" background="#0a0a0a" color="#ffffff">
  <Frame name="FooterColumns" layout="stack" direction="row" gap="60" justify-content="space-between">
    <Frame name="BrandColumn">
      <Image name="logo" src="logo.svg" width="140" />
      <Paragraph>Acme Inc. — Building the future.</Paragraph>
    </Frame>
    <Frame name="NavColumn">
      <Heading>Product</Heading>
      <Text>Features</Text>
      <Text>Pricing</Text>
      <Text>Docs</Text>
    </Frame>
    <Frame name="SocialColumn">
      <Frame layout="stack" direction="row" gap="12">
        <Svg name="twitter" />
        <Svg name="linkedin" />
        <Svg name="github" />
      </Frame>
    </Frame>
  </Frame>
  <Divider color="#1a1a1a" weight="1" />
  <Frame name="BottomBar" layout="stack" direction="row" gap="16" justify-content="space-between">
    <Text>© 2026 Acme Inc.</Text>
    <Frame direction="row" gap="24">
      <Text>Imprint</Text>
      <Text>Privacy</Text>
    </Frame>
  </Frame>
</Frame>
```

**Elementor V4:**
```
e-flexbox (settings.tag=footer, padding: 60 80, background: e-gv-footer-bg, color: e-gv-footer-text)
├── e-flexbox (FooterColumns, direction:row, gap:60, justify-content:space-between)
│   ├── e-flexbox (BrandColumn, gap:16)
│   │   ├── e-image (Logo, width:140)
│   │   └── e-paragraph (Tagline)
│   ├── e-flexbox (NavColumn, gap:8) — vertikale Link-Liste
│   │   ├── e-heading (h4="Product")
│   │   ├── e-button (Features, link=/features, type=link-only, no-bg, no-border, text-only)
│   │   ├── e-button (Pricing,  link=/pricing,  type=link-only, no-bg, no-border, text-only)
│   │   └── e-button (Docs,     link=/docs,     type=link-only, no-bg, no-border, text-only)
│   └── e-flexbox (SocialRow, direction:row, gap:12)
│       ├── e-svg (Twitter)
│       ├── e-svg (LinkedIn)
│       └── e-svg (GitHub)
├── e-divider (weight:1, color:e-gv-border-subtle)
└── e-flexbox (BottomBar, direction:row, justify-content:space-between, padding-block-start:24)
    ├── e-paragraph (Copyright "© 2026 Acme Inc.")
    └── e-flexbox (LegalRow, row, gap:24) — Imprint | Privacy
```

**Regeln:**
- Footer ist IMMER eine **eigene Section** (`settings.tag = footer`) mit eigenem `padding-block` & `background` — niemals als generischer Container ohne Spacing oder als Teil einer anderen Section.
- Brand-Spalte links (Logo + Tagline), Nav-Spalten mittig, Social-Spalte rechts — via `justify-content: space-between`.
- **Footer-Links sind `e-button` (low-emphasis, transparenter Hintergrund, borderless text-only)** — NICHT `e-paragraph` + `settings.link`, da e-paragraph in V4-Atomic kein `link`-Setting hat (siehe style-props-quickref.md: e-paragraph kennt nur `paragraph`).
- Copyright-Bar ist eine **separate** Flex-Row darunter mit `justify-content: space-between` — kein leerer Container mit `position: absolute` (das überscrollt auf Mobile).

---

## 12. Navigation-Menüs (Sticky Header + Menu)

**Framer:**
```xml
<Frame name="Header" position="sticky" top="0" z-index="10"
       background="rgba(255,255,255,0.95)" backdrop-blur="10">
  <Frame name="Container" layout="stack" direction="row" gap="32"
         width="100%" max-width="1280" justify-content="space-between">
    <Image name="logo" src="logo.svg" width="140" />
    <Frame name="Menu" layout="stack" direction="row" gap="24">
      <Frame name="MenuItem"><Text>Features</Text></Frame>
      <Frame name="MenuItem"><Text>Pricing</Text></Frame>
      <Frame name="MenuItem"><Text>Docs</Text></Frame>
      <Frame name="MenuItem"><Text>Blog</Text></Frame>
    </Frame>
    <Button href="/signup">Sign up</Button>
  </Frame>
</Frame>
```

**Elementor V4:**

Style-Definition für den Header-Container (Slider-Tag ist `header`):
```json
{
  "id": "s-header-sticky",
  "label": "s-header-sticky",
  "variants": [
    {
      "meta": { "breakpoint": null, "state": null },
      "props": {
        "position": { "$$type": "string", "value": "sticky" },
        "top":      { "$$type": "size",   "value": { "size": 0, "unit": "px" } },
        "z-index":  { "$$type": "string", "value": "10" },
        "background": { "$$type": "background", "value": { "color": { "$$type": "color", "value": "rgba(255,255,255,0.95)" } } }
      },
      "custom_css": { "raw": "backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);" }
    }
  ]
}
```

> ⚠️ **`custom_css` lebt per-Variant** (nicht im `props`-Block) — siehe `variants[i].custom_css: { raw: "..." }` oben. Inhalt kommt als rohe CSS-Deklarationen.

V4-Atomic-Tree:
```
e-flexbox (settings.tag=header, classes=[s-header-sticky])
└── e-flexbox (Container, direction:row, gap:32, width:100%, max-width:1280,
              justify-content:space-between)
    ├── e-image (Logo, width:140)
    ├── e-flexbox (Menu, direction:row, gap:24, align-items:center)
    │   ├── e-button (Features, link=/features, type=link-only, no-bg, no-border, text-only)
    │   ├── e-button (Pricing,  link=/pricing,  type=link-only, no-bg, no-border, text-only)
    │   ├── e-button (Docs,     link=/docs,     type=link-only, no-bg, no-border, text-only)
    │   └── e-button (Blog,     link=/blog,     type=link-only, no-bg, no-border, text-only)
    └── e-button (Sign up, link=/signup, pill-style, border-radius:50px)
```

**Regeln:**
- Sticky-Header braucht `position: sticky` + `top: 0` + **`z-index: ≥ 10`**. Sonst scrollt nachfolgender Content drüber.
- **Backdrop-Blur** (`backdrop-filter: blur(10px)`) als `custom_css` auf der Style-Variant — **nicht im `props`-Block** (kein Standard-V4-Style-Prop dafür).
- `settings.tag = header` (nicht `nav` — `nav` ist im e-flexbox-Enum NICHT erlaubt; siehe style-props-quickref.md BLOCKADE 6).
- Logo ist IMMER `e-image` (nicht als Background eines Containers) — sonst geht es bei `<img alt="" />` kaputt.
- **Menu-Items mit Linkziel** sind `e-button` im `low-emphasis` Style: `type=link-only, no-bg, no-border, text-only` (transparenter Hintergrund, ohne Border, nur Text-Inhalt). Bei mehreren Projekten empfohlen: global-class `gc-link-only` wiederverwenden, statt den Spec pro Pattern zu duplizieren.
- **Ausnahme — Items ohne Linkziel:** Reine Label-Texte ohne Klickziel (z. B. Dropdown-Header wie „Resources", Section-Anker-Labels ohne href) bleiben als `e-paragraph`. Die `link-only`-Konvention gilt nur für klickbare Items mit `settings.link`.
- e-paragraph hat in V4-Atomic kein `link`-Setting und wird **nicht** als Wrapper um ein `<a>` verwendet — diese Anpassung muss immer über `e-button` (oder ein `link`-fähiges Container-Widget im Atomic-Set) erfolgen.
- **CSS Layer Stack:** backdrop-blur kann von anderen Sections überlagert werden — Container braucht `isolation: isolate` damit kein Streuvalue rendert.

---

## 13. Form-Container (Contact-Form / Newsletter-Signup)

**Framer:**
```xml
<Frame name="ContactForm" padding="32" background="#f9f9f9" gap="16"
       max-width="500" border-radius="16">
  <Heading h2="Contact us" />
  <Frame name="Field" type="form-field"><Text>Name</Text><Frame name="Input" value="" /></Frame>
  <Frame name="Field" type="form-field"><Text>Email</Text><Frame name="Input" type="email" value="" /></Frame>
  <Frame name="Field" type="form-field" multiline="true"><Text>Message</Text><Frame name="Textarea" rows="5" /></Frame>
  <Button submit="true">Send message</Button>
</Frame>
```

> Hinweis: Framer modelliert Form-Felder meist als `<Frame type="form-field">` mit benannten Children (Label + Input/Textarea-Repräsentation) — **nicht** als native `<input>`-Tags.

**Elementor V4:**

`e-html`-Container mit nativem Form-Markup (HTML in eigenem fenced Block isoliert):
```
e-flexbox (Form-Wrapper, padding:32, background:e-gv-surface-soft, gap:16,
          max-width:500, border-radius:16)
├── e-heading (title="Contact us", tag=h2)
└── e-html (settings.html enthält das unten stehende Form-Markup):
```

Innerhalb von `e-html` (`settings.html`):
```html
<form action="/contact" method="POST" novalidate>
  <label class="form-field">
    <span>Name</span>
    <input type="text" name="name" required>
  </label>
  <label class="form-field">
    <span>Email</span>
    <input type="email" name="email" required>
  </label>
  <label class="form-field">
    <span>Message</span>
    <textarea name="message" rows="5" required></textarea>
  </label>
  <button type="submit">Send message</button>
</form>
<style>
  .form-field { display: block; margin-bottom: 16px; }
  .form-field span { display: block; font-weight: 600; margin-bottom: 4px; }
  .form-field input, .form-field textarea {
    width: 100%; padding: 8px 12px; border-radius: 8px;
    border: 1px solid var(--e-gv-border-default, #e5e7eb);
  }
</style>
```

**Regeln:**
- **Elementor V4 hat KEIN natives Form-Widget.** Es gibt kein `e-form` im Atomic-Widget-Set — `elementor-forms` ist V3 (Elementor Pro) und nicht atomic-kompatibel.
- **Atomic-V4-Pfad:** Form ist ein `e-html`-Container mit nativem `<form>`-Markup. Labels als `<label>` + `<span>` + `<input>` — semantisches HTML, kein Div-Soup.
- Spacing zwischen Feldern via inline `<style>` (Form-Subtree ist fremder DOM-Baum, Container-Gap greift nicht):
  `.form-field { display: block; margin-bottom: 16px; }`
- Submit-Button: `<button type="submit">` mit `form action="/contact"` — KEIN separates e-button im Atomic-Pfad (würde das form-`submit`-Event nicht triggern ohne Custom-JS).
- Validation: Clientseitig via HTML5-Attributes (`required`, `type=email`, `minlength`). Server-seitig in MCP-Ability `adrians-create-form-handler` (siehe `novamira-ability-code-injector/`).
- **Elementor-Pro-Pfad (Ausnahme):** Wenn V3-kompatible Container-Roots zulässig UND Elementor Pro Forms aktiv: `adrians-create-form` mit Feldern als JSON-Config. Diesen Pfad NICHT in atomic-only Projekten verwenden.

---

## 14. Slider / Carousel (Image Gallery, Testimonials)

**Framer:**
```xml
<Frame name="Carousel" overflow="hidden" gap="0" position="relative">
  <Frame name="Slides" layout="stack" direction="row" gap="0">
    <Frame name="Slide-1" width="100vw" height="500" background-image="url(slide1.jpg)">
      <Heading>Slide 1</Heading>
    </Frame>
    <Frame name="Slide-2" width="100vw" height="500" background-image="url(slide2.jpg)">
      <Heading>Slide 2</Heading>
    </Frame>
    <Frame name="Slide-3" width="100vw" height="500" background-image="url(slide3.jpg)">
      <Heading>Slide 3</Heading>
    </Frame>
  </Frame>
  <Frame name="Controls" position="absolute" bottom="20" left="50%" transform="translateX(-50%)">
    <Frame name="Dot" active="true" />
    <Frame name="Dot" />
    <Frame name="Dot" />
  </Frame>
</Frame>
```

**Elementor V4:**
Elementor V4 hat **kein natives Carousel-Widget**. Zwei produktive Pfade:

### Pfad A — Atomic e-html mit Swiper.js (EMPFOHLEN für V4-Atomic-Pipeline)

V4-Atomic-Tree:
```
e-flexbox (settings.tag=section, overflow:hidden, height:500, position:relative)
└── e-html (settings.html enthält das unten stehende Slider-Markup):
```

`e-html` `settings.html` (HTML in eigenem fenced Block isoliert):
```html
<div class="swiper acme-carousel">
  <div class="swiper-wrapper">
    <div class="swiper-slide" style="background-image:url(slide1.jpg); background-size:cover; background-position:center;">
      <div class="slide-content"><h2>Slide 1</h2><p>Erste Slide mit sichtbarem Bild.</p></div>
    </div>
    <div class="swiper-slide" style="background-image:url(slide2.jpg); background-size:cover; background-position:center;">
      <div class="slide-content"><h2>Slide 2</h2></div>
    </div>
    <div class="swiper-slide" style="background-image:url(slide3.jpg); background-size:cover; background-position:center;">
      <div class="slide-content"><h2>Slide 3</h2></div>
    </div>
  </div>
  <div class="swiper-pagination"></div>
  <div class="swiper-button-prev"></div>
  <div class="swiper-button-next"></div>
</div>
```

> ⚠️ **Initial-State wichtig:** Das **erste Slide MUSS sichtbares Inhalt+Background-Bild** enthalten — Swiper initialisiert clientseitig. Ohne JS sieht der User sonst eine leere Box.

WPCode-Snippet (site-wide-footer, snippet_type=js/css):
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">
<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    new Swiper('.acme-carousel', {
      loop: true,
      pagination: { el: '.swiper-pagination', clickable: true },
      navigation: { prevEl: '.swiper-button-prev', nextEl: '.swiper-button-next' },
      autoplay: { delay: 5000, disableOnInteraction: false }
    });
  });
</script>
```

### Pfad B — Elementor Pro Loop-Grid (nur wenn V3-kompatibel)

```
Loop-Grid Widget (Elementor Pro)
├── Query: Custom Post-Type "Testimonials" ODER statische Bildliste
├── Layout: slides-to-show:1, slides-to-scroll:1
└── Style: autoplay:5000, pagination:dots, navigation:arrows
```

**Regeln:**
- **Atomic-V4:** Carousel IMMER als `e-html` mit Swiper-CDN (oder lokal gebundelt via `wp_enqueue_script`). Initial-Markup muss das erste Slide sichtbar zeigen — Swiper initialisiert clientseitig.
- **Overflow:** `overflow: hidden` auf Wrapper verhindert horizontalen Scroll während Swipe-Geste.
- **Pagination/Controls:** `.swiper-pagination`, `.swiper-button-prev`, `.swiper-button-next` müssen **als leere Container-Elemente im Markup vorhanden** sein — Elementor fasst sie nicht selbst an.
- **Swiper-Version:** `swiper@11` oder höher — ältere Versionen haben Bundle-Breaking-Changes.
- **Custom-Klasse:** IMMER eigene Klasse wie `acme-carousel` statt generic `.swiper` — sonst kollidieren mehrere Carousels auf einer Seite.
- **`DOMContentLoaded`:** Swiper-Init in den DOMContentLoaded-Handler wrappen, sonst rendert Swiper bevor e-html gemounted ist.
- **Loop-Pfad (V3):** Nur wenn Projekt V3-kompatibel ist UND Elementor Pro aktiv. Nicht in atomic-only Kontexten mischen.

---

## 15. Framer → e-gv-* Variable-Mapping-Chain

`e-gv-*`-Referenzen im V4-Tree werden in einer **5-stufigen Pipeline** aufgelöst. Build-Agents jeder Stufe MÜSSEN die exakte Ein- und Ausgabe-Form kennen — sonst entstehen Drifts zwischen `token-mapping.json` und dem WordPress-Kit.

### Stage 1: Framer CSS/HTML → Token-Extraktion

**Verantwortlich:** `scripts/design-token-extractor.js` (Output: `tokens/token-mapping.json`)

Das Script liest die Framer-Export-`index.html` (mit eingebettetem CSS) und ermittelt pro Color-/Font-Token:
- Hex-Wert (z. B. `#595e5c`)
- Label (aus dem Framer-CSS-Token-Namen, z. B. `--token-color-primary`)
- Frequenz (wie oft im Framer-Tree verwendet)

**Beispiel-Eintrag** (auf dieser Stufe hat `gv_id: null`, weil noch nichts im WP-Kit angelegt wurde):
```json
{
  "colors": {
    "primary":  { "hex": "#595e5c", "label": "--token-color-primary", "count": 34, "gv_id": null },
    "footer-bg":{ "hex": "#0a0a0a", "label": "--token-color-footer",  "count": 12, "gv_id": null }
  },
  "fonts": {
    "inter": { "family": "Inter", "weight_count": 3, "gv_id": null }
  },
  "meta": { "extractedCount": 14, "mappedCount": 0, "unmappedCount": 14 }
}
```

### Stage 2: MCP-Foundation — WordPress-Kit initialisieren

**Verantwortlich:** MCP-Ability `novamira/adrians-setup-v4-foundation` (siehe `scripts/lib/mcp-bridge.js:691`)

Die Ability **legt die e-gv-* Variablen im WordPress-Elementor-Kit an** und liefert die frisch erzeugten IDs zurück:
```json
{
  "classes":    { "gc-section-default": "abc12345", ... },
  "variables":  { "color-primary": "e-gv-ef6c8f0", "color-footer-bg": "e-gv-a3f2b1c", ... },
  "session_id": "s-2026-06-24-xyz"
}
```

**Reihenfolge ist kritisch:**
1. `adrians-setup-v4-foundation` aufrufen BEVOR der V4-Tree gebaut wird.
2. Antwort enthält frische e-gv-IDs — müssen in `token-mapping.json` zurückgeschrieben werden.
3. IDs sind **session-abhängig** (`session-init.js:117`). Nach Re-Login / Cache-Invalidation ändern sie sich → immer frisch abrufen.

### Stage 3: gv_id-Hydration — IDs zurück in token-mapping.json

**Verantwortlich:** `scripts/design-token-extractor.js --existing-tokens FILE` (Re-Run mit Filter `by hex + by label`).

Nach dem Foundation-Schritt werden die e-gv-IDs aus Stage 2 in `token-mapping.json` zurückgeschrieben:
```json
{
  "colors": {
    "primary":  { "hex": "#595e5c", "label": "--token-color-primary", "count": 34, "gv_id": "e-gv-ef6c8f0" },
    "footer-bg":{ "hex": "#0a0a0a", "label": "--token-color-footer",  "count": 12, "gv_id": "e-gv-a3f2b1c" }
  },
  "fonts": {
    "inter": { "family": "Inter", "weight_count": 3, "gv_id": "e-gv-font-inter" }
  },
  "meta": { "extractedCount": 14, "mappedCount": 14, "unmappedCount": 0 }
}
```

> ⚠️ **Pflicht-Check nach Hydration:** `framer-pre-build-validate.js` Guard `TOKEN_EXISTENCE` prüft `unmappedCount: 0` — sonst Build blockiert (Exit 1).

### Stage 4: Konvertierung — `convert-xml-to-v4.js` substituiert Hardcodes

**Verantwortlich:** `scripts/convert-xml-to-v4.js` (Pass `--tokens tokens/token-mapping.json`, Guard C6, Zeile 1229).

Beim Konvertieren wird jeder Hardcoded-Hex (`#595e5c`) und jeder Hardcoded-Font (`Inter`) durch eine e-gv-Referenz ersetzt:
```diff
- props: { color: { "$type": "color", value: "#595e5c" } }
+ props: { color: { "$type": "global-color-variable", value: "e-gv-ef6c8f0" } }
```

**Helper:** `scripts/lib/framer-utils.js:212` → `wrapGvColor(gvId)` und `wrapGvFont(gvId)` erzeugen den korrekten Wrapper.

> ⚠️ **`$$type` PFLICHT:** `validate-v4-tree.js:183` failed jede Prop die wie eine `e-gv-*` ID aussieht OHNE den Wrapper. Plain-Strings (`value: "e-gv-ef6c8f0"` ohne `$$type:global-color-variable`) sind verboten (Guard `NO_PLAIN_STRINGS`).

### Stage 5: Build-QA — Drift-Detection

**Verantwortlich:** `scripts/run-post-build-qa.js:232` (drift check) und `scripts/cross-validate-sources.js:446` (`GV_ID_DRIFT` Check).

Nach dem Build gegen das Live-WP:
- Sammelt alle `e-gv-*` IDs aus dem V4-Tree (Wrapper-Inhalt)
- Lädt aktuelle IDs aus `adrians-export-design-system what=all`
- **Drift-Report:** IDs die im Tree aber NICHT im Kit → Token wurde gelöscht/umgesetzt
- Fix: `adrians-create-or-update-variable` oder re-hydrate Stage 3.

### Chain-Diagram

```
┌──────────────────┐   ┌──────────────────┐   ┌─────────────────────┐   ┌──────────────────┐   ┌────────────────┐
│  Framer CSS/HTML │──▶│ token-mapping.json│──▶│ adrians-setup-v4-   │──▶│ token-mapping    │──▶│ V4-Tree (e-gv- │
│  (colors/fonts)  │   │  (gv_id: null)    │   │ foundation (MCP)    │   │ .json (gv_id OK) │   │ * in $type wrap)│
└──────────────────┘   └──────────────────┘   └─────────────────────┘   └──────────────────┘   └────────────────┘
   Stage 1               Stage 1/Output           Stage 2                  Stage 3               Stage 4
                                                                            │
                                                                            ▼
                                                                    ┌──────────────────┐
                                                                    │ framer-pre-      │
                                                                    │ build-validate   │
                                                                    │ (Guard #1)       │
                                                                    └──────────────────┘
```

### Häufige Fehler in der Chain

| # | Fehler | Korrektur |
|---|---|---|
| 1 | Stage 2 vergessen → `gv_id` bleibt null in token-mapping.json | Vor Stage 4 frisch `adrians-setup-v4-foundation` aufrufen |
| 2 | Stage 2-ID in token-mapping.json nicht eingetragen | `design-token-extractor.js --existing-tokens` re-run |
| 3 | Stage 4: Wrapper vergessen → `"value": "e-gv-..."` als plain-string | `wrapGvColor()` / `wrapGvFont()` aus framer-utils.js nutzen |
| 4 | Stage 5: Kit-ID gelöscht nach Framer-Update | `adrians-create-or-update-variable` triggert und Stage 3 re-hydrate |
| 5 | Cache-leak: alte e-gv-IDs aus voriger Session im Tree | `session-init.js` Cache-Reset + erneuter Stage 2-3-Loop |

---

## Forbidden Patterns (NIEMALS tun)

| ❌ | Severity | Pattern | Stattdessen |
|---|---|---|---|
| ❌ | **high** | Elementor-Kit-Farben (#4054B2 etc.) als Ersatz — bricht Framer→WP-Update-Path, da Kit-Farben nicht aus Framer ableitbar sind | Exakte Framer-Hex-Werte aus Token-Mapping (`e-gv-*` Variablen) |
| ❌ | **high** | Schriftarten raten (Arial, Helvetica, system-ui) — komplette Identitäts-Drift | Nur Fonts aus `framer-fonts.json` mit `global-font-variable` |
| ❌ | **mid** | Elementor-Default border-radius (8px) beibehalten — sichtbares Pill-vs-Default-Mismatch bei Buttons | Exakter Framer-Wert (meist 50px für Pill) |
| ❌ | **mid** | Separate Columns für Button-Gruppen — bricht responsives Flex-Layout bei Mobile-Wrap | Ein Flex-Container mit `flex-direction: row` + `gap` |
| ❌ | **mid** | Header als normale Section vor Hero — kein Overlay mehr | Header `position: absolute` über Hero-Section |
| ❌ | **mid** | Footer-Spalten als separate Elementor-Sections — Section-Spacing-Bug zwischen Spalten | Eine Section (`settings.tag=footer`) mit Multi-Column Flex-Row |
| ❌ | **mid** | Sticky-Header ohne `z-index: ≥ 10` — Content scrollt drüber | Sticky + `top: 0` + `z-index: 10` |
| ❌ | **low** | Navbar als `display: block` (vertikal gestapelt) — funktional aber stilistisch veraltet | Flex-Container mit `flex-direction: row` + `gap` |
| ❌ | **high** | Forms als `e-paragraph` / `e-heading` Felder ohne `<input>` — Form-Submission bricht | `e-html` mit nativem `<form>`-Markup + HTML5-Validation |
| ❌ | **low** | Carousel als statischer Elementor-Container ohne JS — kein Swipe/Pagination-Übergang | `e-html` mit Swiper-CDN + WPCode-Snippet (initial Markup sichtbar) |

**Severity-Legende:**
- **high** = Katastrophal (Funktion kaputt, Drift nicht reparierbar). Reject Build sofort.
- **mid** = Sichtbarer Design-Bug oder Layout-Bruch. QA-Fail, Auto-Fix nach `apply-design-diff-fixes.js` möglich.
- **low** = Suboptimal/stilistisch. Kann manuell korrigiert werden, kein Auto-Block.

---

*Erstellt: 2026-06-24 — Erweitert 2026-06-24 um Patterns #11–14 (Footer-Layout, Navigation-Menüs, Form-Container, Slider/Carousel).*
*Lesen vor jedem Build — siehe AGENTS.md Golden Rule 7.*
