---
name: framer-token-validator
version: "1.0.0"
description: >
  Prueft ob token-mapping.json konsistent mit den tatsaechlichen Elementor V4
  Global Variables in WordPress ist. Erkennt fehlende IDs, Farb-Mismatches,
  doppelte Mappings und nicht-gemappte Seiten-Referenzen.
  Verwende diesen Skill immer wenn:
  - token-mapping.json validiert werden soll
  - e-gv-* IDs zwischen Framer-Tokens und WordPress abgeglichen werden muessen
  - vor einem Elementor V4 Build sichergestellt werden soll dass alle Variablen existieren
  - Color-Mismatches zwischen Framer-Design-Tokens und WordPress-Werten gesucht werden
  - scripts/validate-token-mapping.js erwaehnt wird
  - adrians-pre-build-validate fehlschlaegt und Variablen-Existenz geprueft werden soll
  Lese diesen Skill BEVOR du token-mapping.json manuell abgleichst.
---

# Framer Token-Mapping Validator

Prueft `token-mapping.json` gegen die tatsaechlichen Elementor Global Variables in WordPress.

**Vorab:** Extrahiere zuerst die CSS-Properties mit `extract-framer-styles.js`:
```bash
node scripts/extract-framer-styles.js --html index.html --output FramerExport/tokens/extracted-styles.json
```
Dies erstellt `extracted-styles.json` mit allen Farben, Fonts, Spacing und CSS-Variablen aus dem Framer-Export.

---

## Was geprueft wird

| Check | Code | Severity |
|-------|------|----------|
| Jede `e-gv-*` ID im Mapping existiert in WordPress | `GV_NOT_FOUND` | error |
| Keine zwei Tokens mappen auf dieselbe ID | `DUPLICATE_MAPPING` | error |
| Hex-Farben im Mapping stimmen mit WordPress-Werten ueberein | `COLOR_MISMATCH` | error |
| Font-Families stimmen ueberein | `FONT_MISMATCH` | warning |
| Alle in Elementor-Seiten genutzten `e-gv-*` IDs haben ein Mapping | `UNMAPPED_PAGE_REF` | warning |

---

## CLI-Verwendung

```bash
# Standard: gegen Live-WordPress pruefen
node scripts/validate-token-mapping.js \
  --token-map FramerExport/tokens/token-mapping.json \
  --wordpress-url https://testseite.nick-webdesign.de

# Offline: vorher gespeicherter WP-Variablen-Dump
node scripts/validate-token-mapping.js \
  --token-map FramerExport/tokens/token-mapping.json \
  --wp-variables-json reports/wp-variables.json

# Markdown-Report
node scripts/validate-token-mapping.js \
  --token-map FramerExport/tokens/token-mapping.json \
  --wp-variables-json reports/wp-variables.json \
  --format markdown

# Zusaetzlich Elementor-Seiten auf ungemappte Referenzen scannen
node scripts/validate-token-mapping.js \
  --token-map FramerExport/tokens/token-mapping.json \
  --wp-variables-json reports/wp-variables.json \
  --check-pages \
  --pages-json reports/elementor-pages.json

# Report speichern
node scripts/validate-token-mapping.js \
  --token-map FramerExport/tokens/token-mapping.json \
  --wordpress-url https://testseite.nick-webdesign.de \
  --format markdown \
  --output reports/token-validation.md
```

### WP-Variablen offline dumpen (via WP-CLI)

```bash
wp eval "echo json_encode(get_option('elementor_global_variables', []));" \
  > reports/wp-variables.json
```

### Elementor-Seiten offline dumpen

```bash
wp eval "
\$pages = get_posts(['post_type'=>'page','posts_per_page'=>-1]);
\$out = [];
foreach(\$pages as \$p) {
  \$data = get_post_meta(\$p->ID, '_elementor_data', true);
  if(\$data) \$out[] = ['id'=>\$p->ID, 'data'=>\$data];
}
echo json_encode(\$out);
" > reports/elementor-pages.json
```

---

## token-mapping.json Formate

Das Tool akzeptiert zwei Formate:

### Format 1: Flach (Novamira-Standard)
```json
{
  "primary-color":  { "hex": "#0E2A3B", "gv_id": "e-gv-ef6c8f0" },
  "white":          { "hex": "#FFFFFF", "gv_id": "e-gv-465a797" },
  "manrope-font":   { "font": "Manrope", "gv_id": "e-gv-63d6439" },
  "size-52px":      { "size": 52, "gv_id": "e-gv-6bb1dff" },
  "size-42px":      { "size": 42, "gv_id": "e-gv-bfbdf16" }
}
```

### Format 2: Kategorisiert (Style Dictionary kompatibel)
```json
{
  "colors": {
    "primary": { "value": "#0E2A3B", "id": "e-gv-ef6c8f0" }
  },
  "fonts": {
    "heading": { "family": "Manrope", "id": "e-gv-63d6439" }
  },
  "sizes": {
    "h1": { "value": 52, "id": "e-gv-6bb1dff" }
  }
}
```

Akzeptierte Feldnamen fuer die GV-ID: `gv_id`, `id`, `elementor_id`.

---

## Output-Format

### JSON
```json
{
  "meta": {
    "totalTokens": 5,
    "wpVariablesLoaded": true,
    "passed": 5,
    "errors": 0,
    "warnings": 0
  },
  "issues": [],
  "passed": [
    { "token": "primary-color", "gv_id": "e-gv-ef6c8f0", "check": "color", "value": "#0E2A3B" }
  ]
}
```

### Markdown
Report mit Status-Uebersicht, Fehler-Details mit `expected`/`actual`, Passed-Tabelle
und konkreten Naechste-Schritte fuer jeden Fehlertyp.

---

## Integration in den V4-Workflow

Validator laeuft als **Schritt 0.5** -- nach Setup, vor Build:

```
0.   build-dependency-graph.js     -> Build-Reihenfolge
0.5  validate-token-mapping.js     -> Token-Konsistenz sicherstellen
1.   adrians-setup-v4-foundation   -> IDs holen
2.   adrians-batch-build-page      -> Bauen
3.   adrians-patch-element-styles  -> Fixes
```

**Wichtig:** `adrians-pre-build-validate` (Guard 12) prueft Variablen-Existenz
zur Laufzeit -- dieser Validator prueft zusaetzlich Wert-Konsistenz und
Mapping-Vollstaendigkeit im Vorfeld.

---

## Exit-Codes

| Code | Bedeutung |
|------|-----------|
| 0 | Alles konsistent |
| 1 | Nur Warnungen (FONT_MISMATCH, UNMAPPED_PAGE_REF) |
| 2 | Fehler (GV_NOT_FOUND, COLOR_MISMATCH, DUPLICATE_MAPPING) |

---

## Bekannte Testseite-IDs (Stand Mai 2026)

```json
{
  "primary-color": { "hex": "#0E2A3B", "gv_id": "e-gv-ef6c8f0" },
  "white":         { "hex": "#FFFFFF", "gv_id": "e-gv-465a797" },
  "manrope-font":  { "font": "Manrope", "gv_id": "e-gv-63d6439" },
  "size-52px":     { "size": 52,        "gv_id": "e-gv-6bb1dff" },
  "size-42px":     { "size": 42,        "gv_id": "e-gv-bfbdf16" }
}
```

Immer via `adrians-setup-v4-foundation` aktuell abrufen -- IDs koennen sich aendern.
