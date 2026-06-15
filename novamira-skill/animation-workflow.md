---
slug: animation-workflow
title: GSAP/CSS Animation Workflow (novamira-adrianv2)
description: Workflow fuer GSAP- und CSS-Animation-Injection nach einem Framer -> Elementor V4 Build, ausgerichtet auf die nativen novamira-adrianv2 Code-Injection-Abilities (add-custom-js, add-custom-css, add-code-snippet, list-code-snippets). Das WPCode-Snippet-CRUD-System (adrians-code-injector etc.) hat KEIN Live-Aequivalent und wird hier NICHT verwendet.
version: "0.7.0"
pipeline_min_version: "0.7.0"
tags: [gsap, animation, css, novamira, adrianv2, add-custom-js, add-code-snippet]
---

# GSAP/CSS Animation Workflow (novamira-adrianv2)

## Wann diesen Skill verwenden
Nach jedem Framer -> Elementor V4 Build, wenn Scroll-Animationen, Hover-Effekte oder
CSS-Keyframe-Animationen aus dem Framer-Export uebernommen werden sollen.

## Ground Truth

Das fruehere WPCode-Snippet-CRUD-System (`novamira-adrianv2/adrians-code-injector`,
`adrians-batch-inject-snippets`, `adrians-get/update/delete/list-snippets`) hat
**KEIN Live-Aequivalent** auf solar.local. Stattdessen werden 4 native Abilities genutzt:

| Ability | Scope | Wofuer |
|---------|-------|--------|
| `novamira-adrianv2/add-custom-js` | Pro Seite (post_id + parent_id) | Animation-Calls (gsap.from, ScrollTrigger.create, ...) |
| `novamira-adrianv2/add-custom-css` | Page- oder Element-Level | @keyframes, transition, hover-states |
| `novamira-adrianv2/add-code-snippet` | Sitewide (Elementor Pro) | GSAP-Core+Plugins via CDN, globale @keyframes |
| `novamira-adrianv2/list-code-snippets` | Sitewide (Elementor Pro) | Verifikation bestehender Sitewide-Snippets |

## Kritische Regeln

1. **Two-Tier-Architektur**: GSAP-Core+Plugins EINMAL sitewide laden (`add-code-snippet`),
   Animationscode PRO SEITE via `add-custom-js`
2. `add-custom-js` braucht **`parent_id`** (Pflichtfeld!) — eine existierende `element_id`
   aus dem v4-tree (z.B. die Hero-Section-ID aus convert-xml-to-v4.js)
3. `add-custom-js` umschliesst Code AUTOMATISCH mit `<script>` — eigene `<script>`-Tags
   im `js`-Parameter sind FALSCH
4. `add-code-snippet` braucht VOLLE Tags (`<script>`, `<style>`) im `code`-Parameter
5. `add-custom-css`/`add-code-snippet` (sitewide) erfordern **Elementor Pro** —
   `add-custom-js` funktioniert auch ohne Pro
6. `wrap_dom_ready:true` bei `add-custom-js` setzen, wenn GSAP via sitewide-Snippet
   geladen wird (Timing-Sicherheit)

---

## 3-Schritt Workflow

### Schritt 1 — Animationen aus Framer-Export extrahieren (unveraendert gueltig)

```bash
node scripts/framer-animation-extractor.js \
  --html exports/framer-page/index.html \
  --post-id 4943 \
  --types css,gsap,js,framer \
  --output animation-plan.json \
  --verbose
```

**Output `animation-plan.json`** (Format unveraendert):
```json
[
  {
    "title": "Hero — GSAP ScrollReveal",
    "type": "gsap",
    "code": "gsap.from('.s-shero .e-heading', { opacity: 0, y: 80, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '.s-shero', start: 'top 80%', once: true } });",
    "post_id": 4943,
    "gsap_version": "3.12.5",
    "gsap_plugins": ["ScrollTrigger"]
  },
  {
    "title": "Global — Fade-Up Keyframes",
    "type": "css",
    "code": "@keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }"
  }
]
```

> **Hinweis:** `inject-animation-code.js` generiert weiterhin Pläne für
> `novamira-adrianv2/adrians-batch-inject-snippets` — diese Ability existiert NICHT.
> Nutze `animation-plan.json` als Input und führe die MCP-Calls direkt gemäß
> Schritt 2+3 unten aus, statt den generierten Plan zu verwenden.

---

### Schritt 2 — GSAP-Core sitewide laden (EINMAL pro Projekt)

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/add-code-snippet"
  parameters:
    title: "GSAP Core + ScrollTrigger (CDN)"
    code: |
      <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
      <script>
        gsap.registerPlugin(ScrollTrigger);
      </script>
    location: "head"
    priority: 1
    status: "publish"
```

> **GSAP-Plugins aus `animation-plan.json`**: `gsap_plugins` Feld enumeriert benoetigte
> Plugins (`ScrollTrigger`, `SplitText`, `Flip`, `Observer`, ...). Fuer jedes zusaetzlich
> ein `<script src=".../PluginName.min.js">` Tag + im `registerPlugin()`-Call ergaenzen.

**Verifikation:**
```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/list-code-snippets"
  parameters:
    location: "head"
    status: "any"
```

---

### Schritt 3 — Animationscode pro Seite injizieren

Fuer jeden `type:"gsap"` Eintrag aus `animation-plan.json`:

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/add-custom-js"
  parameters:
    post_id: 4943
    parent_id: "hero-section"   ← element_id aus v4-tree.json (Root der Section)
    js: |
      gsap.from('.s-shero .e-heading', {
        opacity: 0, y: 80, duration: 1.2, ease: 'power3.out',
        scrollTrigger: { trigger: '.s-shero', start: 'top 80%', once: true }
      });
    wrap_dom_ready: true
```

> **Kein `<script>`-Tag im `js`-Parameter!** `add-custom-js` wrapped automatisch.
> `parent_id` bestimmt nur WO das unsichtbare HTML-Widget im DOM liegt — die
> GSAP-Selektoren (`.s-shero ...`) greifen unabhaengig davon global.

---

### Schritt 4 — CSS-Keyframes injizieren

**Global (auf allen Seiten verfuegbar)** — `type:"css"` ohne `post_id`:
```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/add-code-snippet"
  parameters:
    title: "Global — Fade-Up Keyframes"
    code: "<style>@keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }</style>"
    location: "head"
    priority: 2
```

**Page-Level** — `type:"css"` mit `post_id`:
```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/add-custom-css"
  parameters:
    post_id: 4943
    css: "@keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } } .fade-up { animation: fadeUp 0.6s ease-out; }"
```

**Element-Level** (mit `selector`-Platzhalter):
```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/add-custom-css"
  parameters:
    post_id: 4943
    element_id: "hero-heading"
    css: "selector:hover { transform: scale(1.05); transition: transform 0.3s ease; }"
```

---

## GSAP Plugin-Erkennung (aus framer-animation-extractor.js, unveraendert)

`gsap_plugins` im `animation-plan.json` erkennt automatisch:

```
ScrollTrigger, SplitText, ScrollToPlugin, Flip, Observer, Draggable, MotionPathPlugin
```

Jedes erkannte Plugin -> zusaetzliches `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/{Plugin}.min.js">`
im sitewide GSAP-Snippet (Schritt 2) + `registerPlugin(...)` Liste erweitern.

---

## Fehlerbehebung

| Symptom | Ursache | Fix |
|---------|---------|-----|
| `parent_id` Fehler bei add-custom-js | element_id existiert nicht im Tree | element_id aus v4-tree.json / elementor-get-content pruefen |
| `gsap is not defined` | Sitewide-Snippet nicht aktiv oder Reihenfolge falsch | `list-code-snippets` -> priority des GSAP-Snippets < Animation-Snippet |
| Animation laeuft, aber zu frueh/spaet | `wrap_dom_ready` nicht gesetzt | `wrap_dom_ready: true` bei add-custom-js |
| add-custom-css 403/Fehler | Elementor Pro nicht aktiv | `add-custom-js` als Fallback (CSS via `<style>` in JS injizieren) |
| `<script>`-Tags im Output doppelt | Eigene `<script>`-Tags im `js`-Parameter | Tags entfernen — add-custom-js wrapped automatisch |
| Keyframes wirken nicht | `@keyframes` page-level aber Klasse fehlt | `.fade-up { animation: fadeUp ... }` Regel zusaetzlich definieren |

---

## npm-Shortcuts

```bash
npm run extract-animations  # framer-animation-extractor.js (Schritt 1, unveraendert)
```
