---
name: client-design-token-setup-protocol
version: "1.0.0"
description: >
  Strukturiertes Protokoll zum Aufsetzen von Design Tokens für neue Client-Projekte in Elementor V4.
  Checkliste, JSON-Templates für Marken-Tokens, Reihenfolge und Best Practices.
  Dies ist ein LOKALER SPIEGEL des Server-Skills. Bei MCP-Zugriff stattdessen `novamira/skill-get slug=client-design-token-setup-protocol` laden.
---

# Client Design Token Setup Protocol

Standardisierter Ablauf für das Aufsetzen eines neuen Elementor V4 Design Systems.

---

## Phase 0: Environment Check

1. `novamira/elementor-check-setup` → Versions-Kompatibilität prüfen
2. `novamira/elementor-list-variables` → Bestehende Variablen inventarisieren
3. `novamira/elementor-list-global-classes` → Bestehende Klassen inventarisieren
4. `novamira/elementor-list-v3-styles` → V3-Altlasten identifizieren (Farben, Typografie)

**Entscheidung:** Wenn V3 Global Colors/Typography existieren → `novamira/adrians-kit-convert-v3-to-v4` zuerst ausführen. Wenn schon V4-Variablen existieren → nur fehlende ergänzen.

---

## Phase 1: Design Tokens (Variables)

### Reihenfolge (wichtig — spätere Schritte referenzieren frühere)

1. **Farben** — primary, secondary, accent, neutrals
2. **Fonts** — body, heading
3. **Größen** — type scale, spacing scale

### 1a. Farb-Tokens (Minimum)

```json
[
  {"label":"brand-primary",   "type":"color", "value":"#HEX"},
  {"label":"brand-secondary",  "type":"color", "value":"#HEX"},
  {"label":"brand-accent",     "type":"color", "value":"#HEX"},
  {"label":"brand-white",      "type":"color", "value":"#FFFFFF"},
  {"label":"brand-black",      "type":"color", "value":"#000000"},
  {"label":"brand-gray-100",   "type":"color", "value":"#HEX"},
  {"label":"brand-gray-200",   "type":"color", "value":"#HEX"},
  {"label":"brand-gray-300",   "type":"color", "value":"#HEX"},
  {"label":"brand-gray-900",   "type":"color", "value":"#HEX"}
]
```

Verwende `novamira/adrians-batch-create-variables` für alle Farben auf einmal (nicht einzeln mit create-variable).

### 1b. Font-Tokens (Minimum)

```json
[
  {"label":"font-body",      "type":"font", "value":"Inter"},
  {"label":"font-heading",   "type":"font", "value":"Inter"}
]
```

⚠️ Font-Name muss exakt dem Namen in Elementors Font-Liste entsprechen. Für Google Fonts: `"Inter"` nicht `"Inter Tight"` wenn nicht verfügbar.

### 1c. Größen-Tokens (Type Scale)

```json
[
  {"label":"size-xs",   "type":"size", "value":"12px"},
  {"label":"size-sm",   "type":"size", "value":"14px"},
  {"label":"size-base", "type":"size", "value":"16px"},
  {"label":"size-md",   "type":"size", "value":"20px"},
  {"label":"size-lg",   "type":"size", "value":"24px"},
  {"label":"size-xl",   "type":"size", "value":"32px"},
  {"label":"size-2xl",  "type":"size", "value":"48px"},
  {"label":"size-3xl",  "type":"size", "value":"64px"}
]
```

**Type-Scale-Strategie:**
- Marketing/Landing-Page: Größere Sprünge (1.25–1.33 Ratio)
- Dashboard/Tool: Kleinere Sprünge (1.125–1.2 Ratio)
- Mobile-First denken: size-3xl auf Mobile kleiner wählen

---

## Phase 2: Foundation Classes

### setup-v4-foundation (IMMER als erstes)

```
novamira/adrians-setup-v4-foundation
```

Das erstellt `e-flexbox-base` + `e-div-block-base` (padding:0) und gibt ALLE IDs zurück.

**Output merken!** Die Variable-IDs und Class-IDs aus dem Response werden in allen späteren Schritten gebraucht.

### Prüfen was automatisch erstellt wurde

Nach setup-v4-foundation: `novamira/elementor-list-global-classes` → es sollten mindestens `e-flexbox-base` und `e-div-block-base` existieren.

---

## Phase 3: Semantic Global Classes

### Reihenfolge (Abhängigkeiten beachten)

1. **Typografie-Klassen** — referenzieren font- + size-Variablen
2. **Layout-Klassen** — section-wrapper, card-grid
3. **Komponenten-Klassen** — buttons, badges, form-inputs

### 3a. Typografie-Klassen (Minimum)

```json
{
  "label": "heading-xl",
  "variants": [{
    "meta": {"breakpoint": "desktop", "state": null},
    "props": {
      "font-family": {"$$type": "global-font-variable", "value": "e-gv-FONT_HEADING_ID"},
      "font-size": {"$$type": "global-size-variable", "value": "e-gv-SIZE_3XL_ID"},
      "font-weight": "700",
      "text-transform": "uppercase",
      "text-align": "center",
      "line-height": 1.1
    }
  }]
}
```

**Typische Typografie-Hierarchie:**
| Klasse | role | font-size (var) | font-weight |
|--------|------|-----------------|-------------|
| `heading-xl` | Hero h1 | size-3xl (64px) | 700–800 |
| `heading-lg` | Section h2 | size-2xl (48px) | 700 |
| `heading-md` | Card h3 | size-xl (32px) | 600–700 |
| `heading-sm` | Subheading h4 | size-lg (24px) | 600 |
| `body-lg` | Intro-Text | size-md (20px) | 400 |
| `body-base` | Fließtext | size-base (16px) | 400 |
| `body-sm` | Caption/Label | size-sm (14px) | 400 |

Erstelle mindestens `heading-xl`, `heading-md`, `body-base` — der Rest nach Bedarf.

### 3b. Button-Klassen (Minimum)

```json
{
  "label": "btn-primary",
  "variants": [
    {
      "meta": {"breakpoint": "desktop", "state": null},
      "props": {
        "background": {"$$type": "background", "value": {"background-overlay": {"$$type": "background-overlay", "value": [{"$$type": "background-color-overlay", "value": {"color": {"$$type": "global-color-variable", "value": "e-gv-PRIMARY_ID"}}}]}}},
        "color": {"$$type": "global-color-variable", "value": "e-gv-WHITE_ID"},
        "padding": {"block-start": 14, "block-end": 14, "inline-start": 32, "inline-end": 32},
        "border-radius": 6,
        "font-weight": "700",
        "text-align": "center"
      }
    },
    {
      "meta": {"breakpoint": "desktop", "state": "hover"},
      "props": {"opacity": 0.85}
    }
  ]
}
```

**Typische Button-Hierarchie:**
| Klasse | Rolle |
|--------|-------|
| `btn-primary` | Haupt-CTA (gefüllte Markenfarbe) |
| `btn-secondary` | Alternative (Outline) |
| `btn-ghost` | Tertiär (kein Hintergrund, nur Farbe) |

---

## Phase 4: Token-Map dokumentieren

Nach dem Setup die finale Token-Map als Referenz speichern:

```
novamira/elementor-list-variables → als Referenz-Tabelle notieren
novamira/elementor-list-global-classes → alle IDs + Labels dokumentieren
```

Diese Tabelle wird in späteren Builds als Platzhalter-Ersetzung genutzt (siehe Section Snippets Skill).

---

## Phase 5: Verifikation

1. `novamira/adrians-class-audit` → Prüft ob alle Klassen genutzt werden
2. Eine Test-Seite mit batch-build-page bauen (Hero + Heading + Button)
3. Frontend prüfen: Farben, Fonts, Abstände

---

## Checkliste (kompletter Ablauf)

- [ ] check-setup: V4-fähig?
- [ ] V3-Altlasten identifiziert (list-v3-styles)
- [ ] Falls V3-Kit vorhanden: kit-convert-v3-to-v4
- [ ] Farb-Variablen erstellt (batch-create-variables, min. 5)
- [ ] Font-Variablen erstellt (min. 1)
- [ ] Größen-Variablen erstellt (min. Type Scale 6 Stufen)
- [ ] setup-v4-foundation ausgeführt
- [ ] Typografie-Klassen erstellt (min. heading-xl, heading-md, body-base)
- [ ] Button-Klassen erstellt (min. btn-primary)
- [ ] Token-Map dokumentiert (Variablen + Klassen IDs)
- [ ] Testseite gebaut und visuell geprüft
- [ ] class-audit: Keine ungenutzten Klassen

---

## Anti-Patterns (was NICHT tun)

| Falsch | Richtig |
|--------|---------|
| Alle Farben als Hex in jede Klasse schreiben | Farben als Variablen referenzieren |
| Für jede Überschrift eigene Klasse bauen | Type-Scale nutzen: heading-xl, heading-md, heading-sm |
| 50 Variablen anlegen bevor erste Seite gebaut wird | Minimum Viable Token Set: 5 Farben + 1 Font + 6 Größen + 3 Typografie-Klassen + 1 Button = 16 Tokens |
| Variablen nachträglich umbenennen (delete + recreate) | Label von Anfang an durchdacht wählen |
| Jede Section bekommt eigene Padding-Klasse | `section-py` Global Class für wiederholte Section-Paddings |
