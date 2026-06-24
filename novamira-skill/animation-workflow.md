---
slug: animation-workflow
title: GSAP Animation Injection Workflow
description: Vollständiger Workflow für GSAP/CSS-Animations-Injection nach einem Framer → Elementor V4 Build. Deckt Extraktion aus Framer HTML-Export, Plan-Generierung via inject-animation-code.js und Batch-Injection via adrians-batch-inject-snippets ab. Inkl. Conflict-Strategie, Plugin-Erkennung und Debugging via --single-mode.
version: "0.7.0"
pipeline_min_version: "0.7.0"
tags: [gsap, animation, inject, wpcode, framer, batch, scrolltrigger]
---

# GSAP Animation Injection Workflow

## Wann diesen Skill verwenden
Nach jedem Framer → Elementor V4 Build wenn Animationen aus dem Framer-Export
übernommen werden sollen, oder wenn manuell GSAP-Code auf eine Seite aufgespielt
werden soll. Dieser Skill beschreibt den gesamten Ablauf von Extraktion bis Live.

---

## Kritische Regeln

1. Animations-Injection IMMER nach dem Build — nie davor (GC-Klassen müssen existieren)
2. Snippet-Titel sind der Lookup-Key — identischer Titel = Update (upsert), nie Duplikat
3. `adrians-batch-inject-snippets` statt N Einzelcalls — max. 20 Snippets pro Batch
4. `on_conflict: "replace"` als Standard — verhindert veraltete Animations-Code-Rückstände
5. GSAP wird via WPCode als PHP-Snippet enqueued — KEIN direktes `<script>` in Elementor HTML
6. Nach Injection: Browser-Cache leeren und Seite im Inkognito-Tab verifizieren

---

## Animations-Typen

Der Extraktor erkennt 4 Typen aus Framer HTML-Exporten:

| Typ | Quelle | WPCode-Typ | Location |
|-----|--------|-----------|---------|
| `gsap` | Inline `<script>` mit `gsap.`, `ScrollTrigger` etc. | `js` (mit PHP-Enqueue) | `site_wide_footer` |
| `css` | `@keyframes`, `animation:`, `transition:` Regeln | `css` | `site_wide_header` |
| `js` | Andere Inline-Scripts ohne GSAP | `js` | `site_wide_footer` |
| `framer` | `data-framer-appear-id` Scroll-Trigger Elemente | `gsap` (konvertiert) | `site_wide_footer` |

---

## 3+1-Schritt Workflow

### Schritt 0: GSAP Global Enqueue (Automatisch)

`inject-animation-code.js` stellt **automatisch** ein GSAP Global Enqueue PHP-Snippet
voran, sobald der Plan `type: "gsap"` Snippets enthält.

**Was passiert:**
1. `inject-animation-code.js` lädt das CJS-Modul `scripts/lib/gsap-enqueue-snippet.cjs`
2. Prüft: `snippetSpecs.some(s => s.type === 'gsap')`
3. Wenn GSAP-Snippets existieren: `snippetSpecs.unshift(GSAP_ENQUEUE)`
4. Der Enqueue erscheint als **erstes** Snippet im MCP-Plan (priority 10)

**Snippet-Schema:**
```
title:       "GSAP Global Enqueue"
type:        "php"
code:         wp_enqueue_script('gsap-core', '...gsap@3.12.5/dist/gsap.min.js', ...)
              wp_enqueue_script('gsap-st', '...gsap@3.12.5/dist/ScrollTrigger.min.js', ['gsap-core'], ...)
              add_action('wp_enqueue_scripts', 'enqueue_gsap_global')
location:    "site_wide_header"
priority:    10
on_conflict: "skip"        ← verhindert Duplikate bei wiederholten Builds
tags:        ["gsap", "enqueue", "global", "critical"]
```

**Verhalten im Detail:**
- Nur GSAP-Snippets? → Enqueue wird vorangestellt
- Keine GSAP-Snippets? → Kein Enqueue (GSAP nicht unnötig laden)
- `on_conflict: "skip"` → Sicher bei wiederholtem Aufruf (keine Duplikate)
- `priority: 10` → Lädt vor allen Animations-Snippets (die haben priority ≥15)
- Version `3.12.5` gepinnt via jsDelivr CDN

> **Kein manuelles Eingreifen nötig** — der Enqueue ist vollautomatisch Teil jedes GSAP-Plans.

---

### Schritt 1: Animation-Plan aus Framer-Export extrahieren

```bash
node scripts/framer-animation-extractor.js \
  --html exports/framer-page/index.html \
  --post-id 4943 \
  --types css,gsap,js,framer \
  --output animation-plan.json \
  --verbose
```

**Output `animation-plan.json` (vom Extraktor):**
```json
[
  {
    "title": "Hero — GSAP ScrollReveal",
    "type": "gsap",
    "code": "gsap.from('.s-shero .e-heading', { opacity: 0, y: 80, ... })",
    "post_id": 4943,
    "gsap_version": "3.12.5",
    "gsap_plugins": ["ScrollTrigger"],
    "on_conflict": "replace",
    "tags": ["framer", "hero", "gsap"]
  },
  {
    "title": "Global — Animation CSS Basis",
    "type": "css",
    "code": "@keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }",
    "location": "site_wide_header",
    "on_conflict": "replace",
    "tags": ["framer", "css"]
  }
]
```

> ⚠️ Der Extraktor fügt **keinen** GSAP Enqueue hinzu — das macht erst `inject-animation-code.js` (Schritt 2).

> **Kein Framer-HTML?** Manuellen Snippet direkt via CLI übergeben:
> ```bash
> node scripts/inject-animation-code.js \
>   --title "Hero GSAP" \
>   --type gsap \
>   --code "gsap.from('.e-heading', { opacity:0, y:40, duration:1 })" \
>   --post-id 4943 \
>   --gsap-plugins ScrollTrigger
> ```

---

### Schritt 2: MCP-Plan generieren (Batch — Standard)

```bash
node scripts/inject-animation-code.js \
  --plan animation-plan.json \
  --output animation-mcp-plan.json
```

**Output `animation-mcp-plan.json` (Batch-Modus, mit Auto-Enqueue):**
```json
{
  "description": "Novamira adrians-batch-inject-snippets MCP-Plan (Batch)",
  "mode": "batch",
  "total": 4,
  "steps": [{
    "step": 1,
    "ability": "novamira-adrianv2/adrians-batch-inject-snippets",
    "parameters": {
      "snippets": [
        { "title": "GSAP Global Enqueue", "type": "php", "priority": 10, "on_conflict": "skip" },
        { "title": "Hero — GSAP ScrollReveal", "type": "gsap", ... },
        { "title": "Features — Card Stagger", "type": "gsap", ... },
        { "title": "Global — Animation CSS Basis", "type": "css", ... }
      ]
    }
  }]
}
```

> **`GSAP Global Enqueue`** ist immer das erste Snippet im Batch. Es wird von `inject-animation-code.js` automatisch via `snippets.unshift(GSAP_ENQUEUE)` vorangestellt.

> **Debug-Modus (Einzelschritte):**
> ```bash
> node scripts/inject-animation-code.js --plan animation-plan.json --single-mode
> ```
> Generiert N individuelle `adrians-code-injector` Calls statt 1 Batch-Call.

> **Direkt aus Framer-Export:**
> ```bash
> node scripts/inject-animation-code.js --from-framer-export --dir exports/framer-page/
> ```
> Kombiniert Extraktion + Plan-Generierung in einem Schritt.

---

### Schritt 3: MCP-Batch-Call ausführen

Führe **Step 1** aus `animation-mcp-plan.json` aus:

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira-adrianv2/adrians-batch-inject-snippets"
  parameters:
    snippets:
      - title: "Hero — GSAP ScrollReveal"
        type: "gsap"
        code: "gsap.from('.s-shero .e-heading', { ... })"
        post_id: 4943
        gsap_version: "3.12.5"
        gsap_plugins: ["ScrollTrigger"]
        on_conflict: "replace"
        tags: ["framer", "hero", "gsap"]
      - ...
```

**Erwartete Antwort:**
```json
{
  "success": true,
  "total": 3,
  "failed": 0,
  "results": [
    { "success": true, "snippet_id": 47, "title": "Hero — GSAP ScrollReveal", "action": "created" },
    { "success": true, "snippet_id": 48, "title": "Features — Card Stagger", "action": "updated" },
    { "success": true, "snippet_id": 49, "title": "Global — Animation CSS Basis", "action": "created" }
  ]
}
```

---

## Conflict-Strategie (on_conflict)

| Wert | Verhalten | Wann verwenden |
|------|-----------|---------------|
| `"replace"` | Überschreibt Code komplett (Standard) | Immer bei Framer-Export-Updates |
| `"skip"` | Nichts tun wenn Snippet existiert | Einmalige Basis-Snippets (CSS-Reset) |
| `"append"` | Code anhängen | Nie — führt zu Duplikaten bei wiederholtem Run |

---

## GSAP Plugin-Erkennung (automatisch)

`framer-animation-extractor.js` erkennt folgende Plugins aus dem Code automatisch:

```
ScrollTrigger     → gsap_plugins: ["ScrollTrigger"]
SplitText         → gsap_plugins: ["SplitText"]
ScrollToPlugin    → gsap_plugins: ["ScrollToPlugin"]
Flip              → gsap_plugins: ["Flip"]
Observer          → gsap_plugins: ["Observer"]
Draggable         → gsap_plugins: ["Draggable"]
MotionPathPlugin  → gsap_plugins: ["MotionPathPlugin"]
```

Der generierte PHP-Snippet registriert alle erkannten Plugins automatisch:
```js
gsap.registerPlugin(ScrollTrigger, SplitText);
```

---

## Snippet verifizieren und aktualisieren

```
# Snippet prüfen (vor Update):
novamira-adrianv2/adrians-get-snippet
  title: "Hero — GSAP ScrollReveal"

# Snippet aktualisieren (in-place, ID bleibt erhalten):
novamira-adrianv2/adrians-update-snippet
  title: "Hero — GSAP ScrollReveal"
  new_code: "gsap.from('.s-shero .e-heading', { opacity: 0, y: 60, duration: 1.4 })"

# Snippet temporär deaktivieren:
novamira-adrianv2/adrians-delete-snippet
  title: "Hero — GSAP ScrollReveal"
  mode: "deactivate"

# Snippet wieder aktivieren:
novamira-adrianv2/adrians-delete-snippet
  title: "Hero — GSAP ScrollReveal"
  mode: "activate"

# Alle Animations-Snippets auflisten:
novamira-adrianv2/adrians-list-snippets
  filter_tag: "gsap"
  include_code: false
```

---

## Example: Manuelles Hero-Build (ohne Framer-Export)

```json
// examples/gsap-hero-example.json — Format-Referenz
{
  "snippets": [
    {
      "title": "Framer Hero — GSAP ScrollReveal",
      "type": "gsap",
      "code": "gsap.from('.s-shero .e-heading', { opacity: 0, y: 80, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '.s-shero', start: 'top 80%', once: true } }); gsap.from('.s-shero .e-paragraph', { opacity: 0, y: 40, duration: 1, delay: 0.3, ease: 'power2.out', scrollTrigger: { trigger: '.s-shero', start: 'top 80%', once: true } });",
      "post_id": 0,
      "gsap_version": "3.12.5",
      "gsap_plugins": ["ScrollTrigger"],
      "on_conflict": "replace",
      "tags": ["framer", "hero", "gsap"]
    }
  ]
}
```

---

## Fehlerbehebung

| Symptom | Ursache | Fix |
|---------|---------|-----|
| Animation läuft nicht | WPCode-Snippet inaktiv | `adrians-delete-snippet mode:"activate"` |
| Backtick-JS bricht | `addslashes()` statt `wp_json_encode()` | Bereits gefixt in Commit 5bb2d3d |
| `failed: 1` im Batch | Einzelner Snippet-Fehler | `--single-mode` für Detail-Fehler |
| GSAP nicht geladen | Plugin-Registrierung fehlt | `gsap_plugins` im Plan prüfen |
| Animation auf falscher Seite | `post_id: 0` = sitewide | Korrekten `post_id` setzen |
| Snippet wird nicht gefunden | Titel-Schreibweise | `adrians-list-snippets` → exakten Titel prüfen |
| Doppelte Animation | on_conflict fehlt | Explizit `"on_conflict": "replace"` setzen |

---

## npm-Shortcuts

```bash
# Extraktion
npm run extract-animations       # framer-animation-extractor.js (statischer HTML-Export)
npm run extract-animations-live  # extract-framer-animations-live.js --live-url <URL> (Playwright)

# Injection
npm run inject-code              # inject-animation-code.js (interaktiv)
npm run inject-animations        # inject-animation-code.js --plan animation-plan.json
npm run inject-from-export       # inject-animation-code.js --from-framer-export

# Tests
npm run test:gsap-enqueue        # Unit-Test für GSAP-Enqueue-Modul
```

> **Neu:** `inject-animation-code.js` prependet automatisch den GSAP Global Enqueue
> (Schritt 0), wenn der Plan GSAP-Snippets enthält. Kein manueller Schritt nötig.
