---
name: framer-source-extraction
version: "1.0.0"
description: Pre-Build Workflow für Live-Extraktion von Layout, Design-Tokens und Fonts aus einer publizierten Framer-Seite.
---

# Framer Source Extraction — Pre-Build Workflow

## Wann dieser Workflow läuft

- **Vor jedem Build** — immer wenn eine Framer-URL bekannt ist
- **Phase 2.5** im Pipeline-Ablauf (zwischen Token-Mapping und Konvertierung)
- **Nicht** wenn nur ein HTML-Export ohne Live-URL vorliegt

---

## Schritt 0: Tools bereitstellen

```bash
# Prüfen ob Playwright installiert ist
npx playwright --version || npm install playwright

# Pfade
FRAMER_URL="https://meine-seite.framer.app/"
EXPORT_DIR="FramerExport"
TOKENS_DIR="$EXPORT_DIR/tokens"
mkdir -p "$TOKENS_DIR"
```

---

## Schritt 1: Layout-Architektur extrahieren

```bash
node scripts/analyze-framer-layout.js \
  --url "$FRAMER_URL" \
  --output "$TOKENS_DIR/layout-map.json" \
  --verbose
```

**Liefert:**
- Positionierung jedes Abschnitts (absolute/relative/static)
- Flex-Rows vs Flex-Columns
- Z-Index-Werte > 0
- Section-Backgrounds (Bild/Farbe)
- Border-Radius (Pill-Detection)
- Verwendete Font-Familien

---

## Schritt 2: Design-Tokens live extrahieren

```bash
node scripts/design-token-extractor.js \
  --url "$FRAMER_URL" \
  --output "$TOKENS_DIR/token-mapping.json"
```

**Liefert:**
- CSS-Variablen mit Hex-Werten
- Farb-Palette (dedupliziert)
- Schriftgrößen und -gewichte
- Abstands-Werte (Spacing)

---

## Schritt 3: Fonts auflösen

```bash
node scripts/resolve-fonts.js \
  --html "$EXPORT_DIR/index.html" \
  --url "$FRAMER_URL" \
  --fonts-dir "$EXPORT_DIR/assets/fonts" \
  --output "$TOKENS_DIR/font-resolution.json"
```

**Liefert:**
- Font-Familien mit Import-URLs (Google Fonts)
- Font-Gewichte pro Familie
- Lokale Font-Dateien (falls vorhanden)

---

## Schritt 4: Ergebnisse konsolidieren

```bash
node scripts/cross-validate-sources.js \
  --tokens "$TOKENS_DIR/token-mapping.json" \
  --layout "$TOKENS_DIR/layout-map.json" \
  --fonts "$TOKENS_DIR/font-resolution.json" \
  --output "$TOKENS_DIR/source-validation.json"
```

**Prüft:**
- Alle Token-Referenzen in der Layout-Map existieren
- Fonts in layout-map sind in font-resolution aufgelöst
- Farben in layout-map stimmen mit Token-Farben überein

---

## Schritt 5: Layout-Map an Converter übergeben

```bash
node scripts/convert-xml-to-v4.js \
  --xml "$EXPORT_DIR/framer.xml" \
  --tokens "$TOKENS_DIR/token-mapping.json" \
  --layout-map "$TOKENS_DIR/layout-map.json" \
  --output "$EXPORT_DIR/v4-output/elements.json"
```

**Effekt:**
- `position: absolute` → Custom CSS auf Container
- `flex-direction: row` → Container mit Flex-Row
- `z-index` → Custom CSS z-index
- `border-radius > 40px` → Pill-Button Mapping
- Section-Backgrounds → Section-Level Background

---

## Fehlerbehandlung

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| Playwright nicht installiert | `npm install playwright` fehlt | `npx playwright install chromium` |
| Timeout bei layout-map | Framer-Seite lädt nicht | `--timeout 60000` erhöhen |
| Kein layout-map output | nth-section existiert nicht | Ohne `--nth-section` laufen lassen |
| Token-Mapping leer | Seite hat no-cors Headers | `extract-framer-css-tokens.js --html` Fallback |

---

## Siehe auch

- `scripts/analyze-framer-layout.js` — Layout-Extraktion
- `scripts/design-token-extractor.js` — Design-Token-Extraktion
- `FRAMER-VS-ELEMENTOR-PATTERNS.md` — Pattern-Mappings
- `AGENTS.md` Golden Rule 8 (Pattern Library Pflicht)
