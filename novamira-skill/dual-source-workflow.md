---
name: framer-dual-source-to-v4
version: "1.1.0"
description: See SKILL.md content.
---
# Framer Dual-Source to V4 Converter

## Fallback wenn Unframer MCP nicht erreichbar (NEU — SCHWÄCHE 7 / P3-C)

**Symptom:** `scripts/preflight/check-unframer-connectivity.js` return `ok: false`
(Timeout oder `Host not in allowlist: mcp.unframer.co`).

**Reihenfolge der Fallback-Strategien:**

### Option A — Framer-Seite manuell via `web_fetch` (EMPFOHLEN wenn erreichbar)

```bash
# 1. Framer-Seite als HTML laden (in Claude-Sandbox)
web_fetch("https://<framer-site>.framer.app/") → HTML-String

# 2. CSS-Links aus HTML extrahieren
grep -oP 'href="[^"]*\.css[^"]*"' | sed 's/href="//; s/"//'

# 3. Jeden CSS-Link fetchen (Framer splittet CSS oft in mehrere Dateien)
for href in <css_links>:
  web_fetch(href) → CSS-Text

# 4. Design-Tokens manuell mappen
#    --token-very-dark-green → #061D13 (aus RGB(6,29,19))
# 5. In token-mapping.json eintragen als "source": "web-fetch-fallback"

# 6. CSS-Datei lokal in extract-framer-css-tokens.js nutzen
node scripts/extract-framer-css-tokens.js --html <(echo "FAKE_HTML_MIT_INLINE_CSS") --output token-mapping.json
```

Wichtige Heuristiken beim manuellen Mapping:
- **Var-Fallback nutzen:** Framer-XML enthält `backgroundColor="/Theme Color/Very Dark Green"`
  → der eigentliche Wert steht in CSS als `var(--token-XXX, rgb(6,29,19))`. Den Fallback
  extrahieren.
- **Erste Hauptseite zuerst:** Falls Subpages andere Farben haben, je nach Variant frisch mappen.
- **Cross-Validate mit Screenshot:** Nimm einen Screenshot der Framer-Seite, vergleiche Hex-Töne.

### Option B — Gecachte `homepage.xml` (NUR mit Projekt-Match-Check!)

```bash
# Pflicht: Erst verify-xml-project-match.js — sonst MIX-UP mit fremden Projekten!
node scripts/preflight/verify-xml-project-match.js \
  --xml tools/framer-export/homepage.xml \
  --target-url https://<framer-site>.framer.app/
# Exit 0 = passt, weiter mit convert-xml-to-v4.js
# Exit 1 = MISMATCH → andere homepage.xml suchen oder Option A/C
```

**Wenn XML existiert aber kein `framer-project-id` Kommentar hat:**
Kommentar selbst hinzufügen (vor `<?xml ...?>` oder als erste Zeile):

```xml
<!-- framer-project-id="<id>" framer-url="<full-url>" exported-at="<iso>" -->
```

Dann `verify-xml-project-match.js` erneut ausführen.

### Option C — Build auf Basis von Screenshot + Design-Analyse (letzter Ausweg)

Wenn weder Unframer MCP noch eine korrekte homepage.xml verfügbar sind:
1. **Screenshot** der Framer-Seite (`agent-browser screenshot`)
2. **Manuelle Design-Analyse:** Welche Sections sind vorhanden? Welche
   Farben dominieren? Welche Fonts? Welches Layout-Pattern?
3. **Manuell** einen minimalen V4-Tree in `v4-tree.json` schreiben
   (Hero + 1-2 nachgelagerte Sections reichen für ein MVP).

### In allen drei Fällen: WARNUNG in SESSION-STATE.md

```markdown
## ⚠️ Unframer MCP war nicht erreichbar — Fallback-Pfad aktiviert

- Strategie: [Option A / B / C]
- Aktiviert am: 2026-06-17
- Daten-Source: [Framer-URL / XML-Pfad / Screenshot-Pfad]
- Post-Build-QA verschärft: ✅ (Pixel-Diff Pflicht: `npm run section-compare -- --dry-run` als Minimum)
```

→ **Post-Build-QA verschärfen** in allen Fällen:
- **Pflicht:** `section-compare.js` mit Cross-Check nach Framer-Original
- **Pflicht:** `adrians-layout-audit` UND `adrians-visual-qa`
- **Pixel-Diff:** `visual-qa.js --skip-a11y` für schnellen Render-Check

## Original Skill-Content (v1.1.0)


Converts Framer designs into Elementor V4 Atomic Widget pages using TWO independent sources:
1. **Unframer MCP** — structural XML (component tree, props, color/text styles)
2. **Local Framer Export** — assets (images, fonts) and CSS token reference

The dual-source approach eliminates Framer CDN dependency for production and provides cross-validation for design tokens.


## v5 Hybrid Pipeline (ZIP + MCP Symbiose)

FramerExport v5 führt eine echte **Symbiose-Engine** ein, die ZIP-Export und MCP
automatisch kombiniert. Für die ki-2-elementor Pipeline bedeutet das:

### Was v5 gegenüber v4 verbessert:

| Feature | v4 | v5 |
|---------|----|----|
| ZIP-Struktur | chunks/ | scripts/vendor/ + scripts/modules/ |
| Videos | Manchmal CDN-only | assets/misc/*.mp4 (zuverlässig) |
| serve.cjs | Minimal | ETag + Route-Manifest-Support |
| Asset-Gaps | Manuell suchen | `findGaps()` automatisch |
| MCP-Integration | Separat | `mergeMcpSnapshot()` automatisch |
| CSS-Struktur | styles.css im Root | Inline in index.html |

### v5 Hybrid-Pipeline für Elementor-Builds:

```
ZIP-Export → extractZip()           → siteDir mit allen Assets
           → populateFromZip()      → Asset-Map rekonstruiert
           → validateAssetRefs()    → Gebrochene Refs erkannt
           → findGaps()             → CDN-URLs ohne lokalen Counterpart
                                      ↓
[Optional] MCP → buildMcpSnapshot() → {liveAssetUrls, cmsData, routes, meta}
               → mergeMcpSnapshot() → Lücken gefüllt
               → finalRewritePass() → Alle CDN-URLs → lokal
                                      ↓
           → framer-html-to-elementor.js → variables.json, section-map.json
           → adrians-batch-create-variables → Elementor Global Colors/Fonts
           → adrians-media-upload  → Assets in WordPress
           → elementor-set-content → V4 Tree bauen
```

### v5 serve.cjs als Visual-QA-Server:

Das neue serve.cjs in v5 hat ETag-Support und ein Route-Manifest.
Für den Elementor-Build nutzen wir es als **Pixel-Referenz**:

```bash
# Starten
nohup node serve.cjs > /tmp/server.log 2>&1 &
# http://localhost:3000 → exakter gerendeter Output als Vergleich
```

### `data/route-manifest.json` (neu in v5):

Wenn MCP verfügbar war, enthält `data/route-manifest.json` alle Subseiten:
```json
{ "routes": ["/", "/about-us", "/contact", "/pricing", "/blog"] }
```
→ Jede Route = eine WordPress-Seite, die mit Elementor gebaut werden muss.

### Asset-Mapping v5 (mapAssetDir):

| URL-Pfad | Lokales Verzeichnis |
|----------|---------------------|
| /images/* | assets/images/ |
| /assets/*.woff2 | assets/fonts/ |
| /assets/*.mp4 | assets/misc/ |
| /sites/*.mjs | scripts/vendor/ |
| /sites/*.json | data/ |
| /sites/*.css | styles/ |
| /modules/*.mjs | scripts/modules/ |
| /modules/*.framercms | data/ |

---
## When to Use

- Converting a Framer design to Elementor V4 for **production deployment**
- You have BOTH Unframer MCP access AND a local Framer export folder
- You need reliable, production-grade asset hosting (no CDN dependency)
- You want design token validation across two independent sources

**Do NOT use for:**
- Quick prototyping (use `framer-to-elementor-v4` single-source skill)
- V3 to V4 migration (use `elementor-v4-conversion` skill)
- Screenshot-based conversion (use `screenshot-to-elementor`)
- Export-only conversion without MCP access (this skill REQUIRES both sources)

---

## Prerequisites

1. **Unframer MCP** configured in `.mcp.json`
2. **Novamira MCP** available for building V4 pages
3. **Local Framer export** folder with `assets/images/`, `assets/fonts/`, and `index.html`
4. **Elementor V4 foundation** (or ability to run `adrians-setup-v4-foundation`)
5. **agent-browser** skill available for visual QA (PRIMARY verification tool)

---

## 🔑 Core Principle: Source Responsibilities

| Data Type | Unframer MCP | Local Export | Source of Truth |
|-----------|:---:|:---:|-------------|
| Component Tree (Parent→Child) | ✅ `getNodeXml` | ❌ Rendered HTML only | **MCP** |
| Component Props (labels, links) | ✅ Hash-based props | ⚠️ Extractable from HTML | **MCP (prioritize)** |
| Design Tokens (colors) | ✅ Color Styles | ✅ CSS `--token-*` | **Both (cross-validate)** |
| Typography Presets | ✅ Text Styles | ✅ CSS `framer-styles-preset-*` | **Both (cross-validate)** |
| Responsive Breakpoints | ✅ Structured | ✅ `@media` queries | **Export (actual rendering)** |
| Images | ⚠️ CDN URLs only | ✅ Local files (PNG/WebP) | **Export** |
| Fonts | ⚠️ CDN URLs only | ✅ Local .woff2 files | **Export** |
| Multi-page structure | ✅ `getProjectXml` | ❌ Single page only | **MCP** |

---

## Workflow Overview (8 Phases)

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 0: Dual-Source Setup                                 │
│  - Verify both sources are available                        │
│  - Create responsibility matrix for this specific project   │
│  - Establish validation rules                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: Extract Framer Structure (MCP)                    │
│  - getProjectXml → Pages, Components, Color/Text Styles     │
│  - getNodeXml → Detailed page/component XML                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: Extract Export Data (Local)                       │
│  - extract-framer-styles.js → CSS design tokens             │
│  - resolve-fonts.js → Font Resolution (@font-face + local)  │
│  - extract-responsive-breakpoints.js --css → V4-Variants    │
│  - extract-image-urls.js → image-manifest.json              │
│  - download-and-map-images.js → image-map.json              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3: Cross-Validate (MCP ↔ Export)                     │
│  - cross-validate-sources.js → Farben, Fonts, Breakpoints   │
│  - validate-token-mapping.js → WP-Variable-Konsistenz       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 4: Upload Assets (Export → WordPress)                │
│  - Upload images via adrians-media-upload                   │
│  - Load fonts via FTP/Plugin/Theme                          │
│  - Create image → attachment-ID mapping table               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 5: Map to V4 Design Tokens                           │
│  - Colors → batch-create-variables (validated by export)    │
│  - Fonts → batch-create-variables (fonts from export)       │
│  - Create Global Classes for repeated patterns              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 6: Build V4 Widget Tree                              │
│  - convert-xml-to-v4.js → XML → V4 Widget-Tree             │
│  - framer-pre-build-validate.js → 12-Guard Check (≥85%)     │
│  - validate-v4-tree.js → 5 allgemeine V4-Guards             │
│  - batch-build-page                                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 7: Validate & QA                                     │
│  - 5 Vital Post-Build Checks                                │
│  - check-binding-after-patch.js                             │
│  - Cross-reference with export HTML (visual match)          │
│  - agent-browser → Visuelle QA (1440/1024/375px)            │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Dual-Source Setup (ALWAYS FIRST)

### 0.1 Verify Both Sources

```bash
# Check Novamira MCP connectivity
novamira/execute-php { code: "echo 'Novamira MCP OK';" }

# Check Unframer MCP connectivity (lightweight verification)
unframer/getProjectXml  # Confirm non-empty response, then proceed

# Check export folder structure
ls -la framer-<project-slug>/assets/images/
ls -la framer-<project-slug>/assets/fonts/
head -c 500 framer-<project-slug>/index.html
```

### 0.2 Decision Matrix

```
Need the component tree?
  → Unframer MCP (getNodeXml)

Need images/fonts for production?
  → Local Export (assets/)

Need a color scheme?
  → MCP (Color Styles) + Export (--token-*) as cross-validation

Need typography values (font-size, line-height)?
  → Export (framer-styles-preset CSS) — has all 3 breakpoints

Need cross-page components?
  → MCP (getProjectXml)
```

### 0.3 Validation Rules

1. **Token Consistency:** MCP Color Styles MUST match CSS `--token-*` values. If mismatch → MCP wins (but document discrepancy).
2. **Image Matching:** Every `<Image>` in MCP XML MUST have a corresponding local file. Missing images → WARNING, CDN fallback.
3. **Font Matching:** Every `font-family` in CSS MUST exist as .woff2 in export. Missing fonts → Google Fonts fallback.
4. **Breakpoint Consistency:** MCP breakpoints MUST match CSS `@media` values. If mismatch → CSS `@media` wins (actual rendering).

### 0.4 Multi-Page Projects

When the Framer project has multiple pages (detected via `getProjectXml`):

1. **List all pages** from MCP: `getProjectXml → <Pages>` section
2. **Plan shared components**: Identify components used on ≥2 pages → build as reusable Global Classes
3. **Build per page**: Process one page at a time through Phases 1–7
4. **Shared assets first**: Upload all images + create all variables/classes once, then build individual pages
5. **Cross-page validation**: Verify shared components render identically across pages

**Build order:** Homepage first (usually most complex), then subpages. Use homepage Global Classes on subpages where patterns match.

### 0.5 Create Local Export (if not already done)

**Tool:** `framer-export` v4.3.8 (Puppeteer-based CLI)

**Install & Run:**
```bash
cd FramerExport
npm install
npm run dev -- https://<your-site>.framer.app
```

**CLI Options:**
- `--setup` — interactive wizard
- `--platform framer` — force platform detection (skip auto-detection)
- `--legacy-mode` — y/n prompts instead of arrow keys

**How it works (10 steps):**
1. SSR Fetch — raw HTTP GET of page HTML
2. Browser Capture — Puppeteer loads page, intercepts all network responses
3. Hydration Wait — waits for Framer SPA rendering (`#main` element, 10s timeout)
4. Lazy Load Scroll — scrolls full page to trigger lazy-loaded assets
5. Asset Download — all intercepted resources downloaded (12 concurrent, 3 retries)
6. Badge Strip — removes Framer badge, analytics, bootstrap scripts
7. Integrity Strip — removes SHA hashes and CORS attributes
8. URL Rewrite — all CDN URLs → local relative paths
9. Pretty-Print — minified JS reformatted with Prettier
10. Output — `index.html` + `serve.cjs` + assets in subdirectories

**Config** (`src/config/index.ts`):
- `timeout: 90000` (90s page load timeout)
- `viewport: 1440x900`
- `scrollStep: 250px, scrollDelay: 60ms`
- `concurrency: 12, retries: 3, dlTimeout: 30000`

**Output Structure:**
```
framer-<project-slug>/
├── index.html          # Single-page HTML (URLs rewritten, badges stripped)
├── serve.cjs           # Local HTTP server
├── styles/             # CSS files
├── scripts/vendor/     # Platform JS (pretty-printed)
├── scripts/modules/    # Component modules
├── assets/images/      # PNG, WebP, JPG, SVG
├── assets/fonts/       # WOFF2, WOFF, TTF
├── assets/videos/      # MP4, WebM
├── assets/misc/        # Other
└── data/               # CMS data, JSON
```

**Additional outputs** (from `clean-export/` workflow):
- `site-info.json` — extracted page structure, fonts, sections, SEO data
- `OPEN-DESIGN-PROMPT.md` — detailed rebuild prompt for AI coding tools
- `sections/*.png` — screenshots of each section for visual reference
- `framer-site-for-open-design.zip` — packaged export for sharing

**Connection Timeout Debugging:**
- If timeout occurs: increase `CFG.timeout` in `src/config/index.ts`
- Try `--platform framer` to skip auto-detection
- Check if site loads in regular browser first
- `networkidle2` wait can be flaky on heavy SPA sites

---

## Phase 1: Extract Framer Structure (MCP)

### Step 1.1: Get Project Overview

```javascript
// Returns: pages, components, color styles, text styles
mcp__unframer__getProjectXml()
```

**What to extract:**

| Data | Location in XML | Example |
|------|-----------------|---------|
| Pages | `<Pages><Page nodeId="..." path="/..." /></Pages>` | nodeId="augiA20Il", path="/" |
| Components | `<Components><Component nodeId="..." name="..." /></Components>` | nodeId="Y8FLRZ93g", name="Primary Button" |
| Color Styles | `<ColorStyles><ColorStyle path="/..." light="rgb(...)" /></ColorStyles>` | path="/Theme Color/Very Dark Green" |
| Text Styles | `<TextStyles><TextStyle path="/..." font="..." fontSize="..." /></TextStyles>` | path="/Heading/Heading 1", fontSize="68px" |

### Step 1.2: Get Page Structure

```javascript
mcp__unframer__getNodeXml({ nodeId: "PAGE_NODE_ID" })
```

**Returns:** Hierarchical XML with sections, layout properties, text nodes, image nodes, component instances.

### Step 1.3: Get Component Details

```javascript
// For each component used in the page
mcp__unframer__getNodeXml({ nodeId: "COMPONENT_ID" })
mcp__unframer__getComponentInsertUrlAndTypes({ id: "COMPONENT_ID" })
```

---

## Phase 2: Extract Export Data (Local)

### 2.1 Verify Export Structure

Expected directory layout:
```
framer-<project-slug>/
├── index.html          # Single-page HTML (611KB+ typical)
├── assets/
│   ├── images/         # 18+ images (PNG, WebP, JPG)
│   ├── fonts/          # 8+ font files (.woff2)
│   └── misc/           # CSS chunks, JS modules (IGNORE)
├── data/               # Usually empty for single-page export
├── subpages/           # Usually empty for single-page export
├── scripts/            # Framer JS (IGNORE)
└── serve.cjs           # Local preview server
```

### 2.2 Extract Design Tokens from CSS

```bash
# Option 1: Automated extraction (recommended)
node scripts/extract-framer-styles.js --html index.html --output FramerExport/tokens/extracted-styles.json

# Option 2: Manual extraction
grep -oP -- '--token-[a-f0-9-]+:\s*[^;]+' index.html | sort -u
```

**extract-framer-styles.js Output:**
- `fonts` — @font-face declarations (family, variants, source)
- `colors` — Unique colors with hex/rgb values + occurrences
- `typography` — Font sizes, weights, line-heights, letter-spacings
- `spacing` — Paddings, gaps, border-radii, max-widths
- `layout` — Flex directions, justify-content, align-items
- `css_variables` — Framer token system (--token-xxx with fallback values)

**Example output (Nick Webdesign project):**
```css
--token-d98a4c00: #d7ff6f   /* Primary Lime Green */
--token-31ac618e: #fff       /* White */
--token-8303387e: #2f2f2f   /* Dark Gray (Text) */
--token-f9eada81: #111       /* Near-Black (Footer BG) */
--token-5b23898e: #f8f8f8   /* Light Gray */
--token-661b1d86: #8cff2e   /* Bright Green (Accent) */
```

### 2.3 Font Resolution (NEU: resolve-fonts.js)

```bash
node scripts/resolve-fonts.js \
  --html FramerExport/index.html \
  --fonts-dir FramerExport/assets/fonts/ \
  --mcp-json FramerExport/tokens/mcp-colors.json \
  --output FramerExport/tokens/font-resolution.json
```

**Was es macht:**
- Parst @font-face aus dem HTML
- Scannt `/assets/fonts/` nach lokalen .woff2-Dateien
- Merged MCP-JSON-Font-Daten
- Generiert `font-resolution.json` mit RESOLVED/MISSING Status
- Erstellt Google Fonts Fallback-URLs für fehlende Fonts

**Exit-Code:** 0 = alle Fonts gefunden, 1 = fehlende Fonts vorhanden

### 2.4 Extract Typography Presets

```bash
# Extract Framer text style presets
grep -oP 'framer-styles-preset-[a-z0-9]+' index.html | sort -u
```

Each preset contains: `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing` — with all 3 breakpoints.

### 2.5 Identify Breakpoints

```bash
# NEU: Automated CSS-Mode (recommended)
node scripts/extract-responsive-breakpoints.js \
  --css FramerExport/index.html \
  --output FramerExport/tokens/responsive-breakpoints.json

# Mehrere CSS-Dateien:
node scripts/extract-responsive-breakpoints.js \
  --css styles/main.css --css styles/tokens.css \
  --output FramerExport/tokens/responsive-breakpoints.json

# Manual extraction
grep -oP '@media[^{]+' index.html | sort -u
```

**extract-responsive-breakpoints.js (CSS-Modus) Output:**
- Parst @media-Queries mit min-width/max-width
- Klassifiziert Breakpoints: mobile (<810px), tablet (810–1199px), desktop (≥1200px)
- **Delta-Logik:** Tablet/Mobile-Varianten enthalten nur geänderte Properties
- Auto-Breakpoint-Detection aus den vorhandenen CSS-Werten
- Akzeptiert HTML mit `<style>`-Blöcken oder reine CSS-Dateien

**Typical Framer breakpoints:**
- Desktop: ≥1200px
- Tablet: 810px–1199px
- Mobile: <810px (usually 390px container)

**V4 Breakpoint Mapping:**

| Framer CSS `@media` | V4 Variant `breakpoint` | Viewport |
|---------------------|------------------------|----------|
| ≥1200px (desktop) | `null` (base variant) | Desktop |
| 810px–1199px | `"tablet"` | Tablet |
| <810px | `"mobile"` | Mobile |

**CRITICAL:** Base variant breakpoint MUST be `null`, not `"desktop"`!

### 2.6 Create Image Inventory

```bash
ls -la assets/images/
```

→ Create mapping table: filename → expected role → future attachment-ID

---

## Phase 3: Cross-Validate (MCP ↔ Export)

### 3.1 Token Validation

| Check | MCP Source | Export Source | Match? |
|-------|-----------|---------------|--------|
| Colors | Color Styles (rgb values) | `--token-*` (hex values) | Must be identical hex |
| Fonts | Text Styles (font names) | .woff2 files in `assets/fonts/` | Must exist |
| Breakpoints | Variant breakpoints | `@media` queries | Must be consistent |

**Rule for discrepancies:**
- Color mismatch: MCP hex wins (source of truth for design intent)
- Font missing in export: Google Fonts fallback with EXACT same weight
- Breakpoint mismatch: CSS `@media` wins (actual rendering behavior)

### 3.2 Image Matching

For every `<Image>` node in MCP XML:
1. Extract the `backgroundImage` URL
2. Derive expected filename from URL pattern
3. Check if file exists in `assets/images/`

Missing images → flag as WARNING, use CDN URL as fallback.

### 3.3 Font Matching

For every `font-family` in export CSS:
1. Check if corresponding .woff2 exists in `assets/fonts/`
2. If missing → queue for Google Fonts download
3. If present → ready for WordPress upload

---

## Phase 4: Upload Assets (Export → WordPress)

### 4.1 Extract and Download Images

```bash
# Step 1: Extract all image URLs from Framer HTML + Element Tree
node scripts/extract-image-urls.js \
  --html FramerExport/framer-passionate-papaya-042575/index.html \
  --element-tree FramerExport/element-tree/homepage-element-tree.json \
  --output FramerExport/assets/image-manifest.json

# Step 2: Download images locally (with MD5 hashes)
node scripts/download-and-map-images.js \
  --manifest FramerExport/assets/image-manifest.json \
  --outdir FramerExport/assets/images/ \
  --output FramerExport/assets/image-map.json
```

**extract-image-urls.js** extracts URLs from:
- `<img src="...">` and `srcset="..."`
- `background-image: url(...)`
- `<video src="...">` and `<source src="...">`
- Element-Tree `image_src.url` fields

**download-and-map-images.js** creates:
- Local copies in `FramerExport/assets/images/`
- MD5 hashes for deduplication
- `image-map.json` with `wp_media_id: null` (to be filled after WP upload)

### 4.2 Upload Images to Media Library

```javascript
// For EACH image in image-map.json:
novamira/adrians-media-upload {
  "file_path": "./FramerExport/assets/images/<filename>",
  "title": "<descriptive title>"
}
```

**Response:**
```json
{
  "id": 4544,
  "url": "https://yoursite.local/wp-content/uploads/2026/05/<filename>"
}
```

**Create Image Mapping Table:**

| Export File | Attachment-ID | WP URL |
|-------------|:---:|--------|
| `hero-main.png` | 4544 | `.../uploads/.../hero-main.png` |
| `icon-star.svg` | 4545 | `.../uploads/.../icon-star.svg` |

### 4.2 Load Fonts into WordPress (Elementor Custom Fonts)

**PRIMARY method: `adrians-upload-custom-font` ability**

```javascript
// For EACH font file in assets/fonts/:
novamira/adrians-upload-custom-font {
  "file_path": "./framer-<project>/assets/fonts/InterDisplay-SemiBold.woff2",
  "font_family": "Inter Display",
  "font_weight": "600",
  "font_style": "normal"
}
```

**This creates:** Elementor → Custom Fonts entry, auto-registers `@font-face`, no FTP or manual CSS needed.

**Font name rules:**
- Multi-word names MUST be quoted: `"Inter Display"` not `Inter Display`
- Match exactly with Framer font-family from CSS extraction
- Each weight/style combination needs a separate upload

**Fallback methods (if `adrians-upload-custom-font` unavailable):**
- **Option B: FTP** — Copy .woff2 to `/wp-content/fonts/`, add `@font-face` in theme CSS
- **Option C: Theme functions.php** — Enqueue font CSS via `wp_enqueue_scripts`

**Critical:** Set `font-display: swap` for all fonts (FOUT > FOIT).

### 4.3 Image-Src Invariant (CRITICAL)

**⛔ INVARIANT IV:** When using attachment-ID, OMIT the `url` key entirely.

```json
// ✅ CORRECT — url key absent
"src": {
  "$type": "image-src",
  "value": {
    "id": {"$type": "image-attachment-id", "value": 4544}
  }
}

// ❌ FATAL — url:null gets stripped by PHP array_filter()
"src": {
  "$type": "image-src",
  "value": {
    "id": {"$type": "image-attachment-id", "value": 4544},
    "url": null
  }
}
```

### 4.4 Alt-Text via Attributes (Bug 4)

e-image has NO `alt` control in settings. MUST use `attributes`:

```json
"attributes": {
  "$type": "attributes",
  "value": [
    {"_id": "attr1", "name": "alt", "value": "Professional plumbing service technician"}
  ]
}
```

---

## Phase 5: Map to V4 Design Tokens

### 5.1 Colors → Global Variables

**Source:** MCP Color Styles, validated against Export `--token-*` values.

```javascript
novamira/adrians-batch-create-variables {
  "variables": [
    {"name": "very-dark-green", "$type": "global-color-variable", "value": "#061d13"},
    {"name": "light-lime-green", "$type": "global-color-variable", "value": "#dfffa3"},
    {"name": "white", "$type": "global-color-variable", "value": "#ffffff"},
    {"name": "secondary-text", "$type": "global-color-variable", "value": "#c2c2c2"}
  ]
}
```

**CRITICAL:** Use hex values (not rgb()) for V4 variables. Convert `rgb(6, 29, 19)` → `#061d13`.

### 5.2 Fonts → Font Variables

**Source:** MCP Text Styles, validated against Export .woff2 files.

```javascript
novamira/adrians-batch-create-variables {
  "variables": [
    {"name": "inter-display", "$type": "global-font-variable", "value": "Inter Display"},
    {"name": "inter", "$type": "global-font-variable", "value": "Inter"}
  ]
}
```

**CRITICAL:** Font names with spaces MUST be quoted in CSS: `font-family: 'Inter Display'`.

### 5.3 Framer Font Prefix Decoding

| Framer Font String | CSS font-family | Weight |
|-------------------|-----------------|--------|
| `FR;InterDisplay-SemiBold` | 'Inter Display' | 600 |
| `Inter-SemiBold` | 'Inter' | 600 |
| `Inter-Medium` | 'Inter' | 500 |
| `Inter` | 'Inter' | 400 |
| `GF;Roboto-700` | 'Roboto' | 700 |

### 5.4 Create Global Classes

**Background color MUST be in Global Classes (Bug 3: Core 4.0.9 Array-to-String Warning).**

```javascript
// Global Class for hero background (MUST be separate from structure)
novamira/elementor-create-global-class {
  "name": "gc-hero-bg",
  "type": "class",
  "props": {
    "background-color": {"$type":"global-color-variable","value":"e-gv-VERY_DARK_GREEN_ID"}
  }
}

// Global Class for primary button
novamira/elementor-create-global-class {
  "name": "gc-btn-primary",
  "type": "class",
  "props": {
    "background-color": {"$type":"global-color-variable","value":"e-gv-LIGHT_LIME_GREEN_ID"},
    "color": {"$type":"global-color-variable","value":"e-gv-VERY_DARK_GREEN_ID"},
    "border-radius": {"$type":"size","value":{"size":42,"unit":"px"}},
    "padding": {
      "$type":"dimensions","value":{
        "block-start":{"$type":"size","value":{"size":12,"unit":"px"}},
        "block-end":{"$type":"size","value":{"size":12,"unit":"px"}},
        "inline-start":{"$type":"size","value":{"size":16,"unit":"px"}},
        "inline-end":{"$type":"size","value":{"size":16,"unit":"px"}}
      }
    },
    "font-size": {"$type":"size","value":{"size":18,"unit":"px"}},
    "font-weight": {"$type":"string","value":"500"}
  }
}
```

**Pattern:** Separate structure GC + color GC. Example: `gc-hero-structure` (padding, flex) + `gc-hero-bg` (background-color).

---

## Phase 6: Build V4 Widget Tree

### 6.0 Automated XML → V4 Conversion (NEU: convert-xml-to-v4.js)

```bash
# XML von getNodeXml in Datei speichern, dann konvertieren:
node scripts/convert-xml-to-v4.js \
  --xml FramerExport/hero-section.xml \
  --tokens FramerExport/tokens/token-mapping.json \
  --fonts FramerExport/tokens/font-resolution.json \
  --image-map FramerExport/assets/image-map.json \
  --output FramerExport/v4-tree/hero-section.json
```

**Was es macht:**
- Custom XML-Tokenizer (character-by-character, kein npm)
- Auto-Widget-Detection: `text` → `e-heading`/`e-paragraph`, `backgroundImage` → `e-image`, sonst `e-flexbox`
- Token-Auflösung: CSS-Var `var(--token-*)` → `e-gv-*` gv_id via token-mapping
- $$type-Wrapping: wrapGvColor, wrapGvFont, wrapSize, wrapDimensions
- Style-ID-Deduplizierung: `sheading`, `sheading2`, `sheading3`...
- Optionales `--image-map` für WP attachment IDs

**Output:** V4 Widget-Tree JSON, bereit für Pre-Build Validation.

### 6.0.1 Pre-Build Validation (NEU: framer-pre-build-validate.js)

```bash
node scripts/framer-pre-build-validate.js \
  --tree FramerExport/v4-tree/hero-section.json \
  --tokens FramerExport/tokens/token-mapping.json \
  --fonts FramerExport/tokens/font-resolution.json \
  --breakpoints FramerExport/tokens/responsive-breakpoints.json \
  --output FramerExport/tokens/pre-build-validation.json
```

**12 Guards:**

| Guard | Severity | Was geprüft |
|---|---|---|
| `TOKEN_EXISTENCE` | error | Alle `e-gv-*` in tokenMapping |
| `COLOR_CONSISTENCY` | error | Alle gv_ids haben gültige Hex-Werte |
| `FONT_RESOLUTION` | error | Alle `global-font-variable` refs bekannt |
| `BREAKPOINT_CONSISTENCY` | warning | Nur null/tablet/mobile/desktop |
| `STYLE_CLASSES_BINDING` | error | styleId in `settings.classes.value[]` |
| `NO_HARDCODED_HEX` | error | Kein `#XXXXXX` in styles |
| `NO_PLAIN_STRINGS` | error | `e-gv-*` immer $$type-gewrappt |
| `FONT_NAMES_QUOTED` | warning | Multi-word font names |
| `BASE_VARIANT_NULL` | error | Erste Variant hat `breakpoint: null` |
| `TABLET_VARIANTS` | warning | Mobile → auch Tablet vorhanden |
| `BACKGROUND_COLOR_GC` | error | Kein `$$type:"color"` bei `background.color` |
| `IMAGE_SRC_FORMAT` | error | `id` vorhanden, kein `url: null` |

**Exit-Code:** 0 = Score ≥85% (Build ok), 1 = Build blockiert.

**KRITISCH:** Erst `framer-pre-build-validate.js`, dann `validate-v4-tree.js` (5 allgemeine Guards), DANN `batch-build-page`.

### 6.1 Layout Mapping

| Framer | V4 | Notes |
|--------|-----|-------|
| `layout="stack"` | `e-flexbox` | Container becomes flexbox |
| `stackDirection="vertical"` | `flex-direction: column` | |
| `stackDirection="horizontal"` | `flex-direction: row` | |
| `gap="30px"` | `gap: 30px` | |
| `padding="60px 30px"` | `padding: 60px 30px` | |
| `stackDistribution="center"` | `justify-content: center` | |
| `stackAlignment="center"` | `align-items: center` | |
| `maxWidth="1280px"` | `max-width: 1280px` | |
| `width="1fr"` | `width: 100%` | |
| `position="absolute"` | `position: absolute` | Use logical properties |
| `top="20px"` | `inset-block-start: 20px` | V4 uses logical props |
| `bottom="-116px"` | `inset-block-end: -116px` | |
| `left="635px"` | `inset-inline-start: 635px` | |
| `borderRadius="16px"` | `border-radius: 16px` | |
| `overflow="clip"` | `overflow: hidden` | |

### 6.2 Typography Mapping

| Framer Text Style | V4 Widget | HTML Tag |
|-------------------|-----------|----------|
| `/Heading/Heading 1` | `e-heading` | `h1` |
| `/Heading/Heading 2` | `e-heading` | `h2` |
| `/Heading/Heading 3` | `e-heading` | `h3` |
| `/Heading/Heading 4` | `e-heading` | `h4` |
| `/Body/*` | `e-paragraph` | `p` |

### 6.3 Image Mapping (using Attachment-ID)

```json
{
  "widgetType": "e-image",
  "settings": {
    "image": {
      "$type": "image",
      "value": {
        "src": {
          "$type": "image-src",
          "value": {
            "id": {"$type": "image-attachment-id", "value": 4544}
          }
        },
        "size": {"$type": "string", "value": "full"}
      }
    },
    "attributes": {
      "$type": "attributes",
      "value": [
        {"_id": "attr1", "name": "alt", "value": "Hero image description"}
      ]
    },
    "classes": {"$type": "classes", "value": ["heroimg"]}
  },
  "styles": {
    "heroimg": {
      "$type": "image",
      "width": {"$type": "size", "value": {"size": 620, "unit": "px"}},
      "height": {"$type": "size", "value": {"size": 620, "unit": "px"}},
      "border-radius": {"$type": "size", "value": {"size": 16, "unit": "px"}},
      "position": "absolute",
      "inset-block-end": {"$type": "size", "value": {"size": -116, "unit": "px"}},
      "inset-inline-start": {"$type": "size", "value": {"size": 635, "unit": "px"}}
    }
  }
}
```

### 6.4 Tablet Breakpoint Pattern (MANDATORY)

**Rule:** Every responsive element that changes on mobile MUST also have a `"tablet"` variant.

**Why:** Without tablet variant, layout jumps directly from desktop (1440px) to mobile (375px) at 810px breakpoint — no smooth transition at 810–1199px.

**Pattern:**
```json
{
  "variants": [
    {"meta": {"breakpoint": null, "state": null}, "props": { /* desktop base */ }},
    {"meta": {"breakpoint": "tablet", "state": null}, "props": { /* 810-1199px */ }},
    {"meta": {"breakpoint": "mobile", "state": null}, "props": { /* <810px */ }}
  ]
}
```

**Common tablet adjustments:**
- `flex-direction: row` → `column` (children get squashed otherwise)
- `font-size: 68px` → `48px` (still too large for tablet)
- `padding: 151px 30px` → `100px 24px` (reduce vertical/horizontal)
- `width: 50%` → `100%` (columns need full width on tablet)

**Source:** Extract tablet values from Framer CSS `@media (min-width: 810px) and (max-width: 1199px)` or from Framer responsive preview.

### 6.5 Pre-Flight Gate (MANDATORY before batch-build-page)

- [ ] **Dual-Source validation complete** — MCP tokens match Export CSS
- [ ] Pattern analysis complete — repeated elements → Global Classes
- [ ] Container classes planned — no empty containers (`classes: []`)
- [ ] Zero hardcoded colors — all `#` → `e-gv-*` references
- [ ] `e-gv-*` references wrapped with explicit `$type`
- [ ] **`$type` with SINGLE dollar** (not `$$type`!)
- [ ] **Font names with quotes**: `'Inter Display'` not `Inter Display`
- [ ] **Font files loaded** (from export or Google Fonts)
- [ ] **Base variant = `null`** in all local styles (not `"desktop"`!)
- [ ] **Tablet variants present** for all responsive elements (flex-direction, width, font-size, padding)
- [ ] **No `background.color` in local styles** — ONLY in Global Classes (Core 4.0.9 Bug)
- [ ] `overflow:hidden` removed OR image positioning adjusted (stacking context)
- [ ] **Images already in Media Library** (attachment-IDs known)
- [ ] **Alt-text via `attributes` array** (Bug 4)
- [ ] Regenerate CSS & Data after all create operations

### 6.5 Build

> The complete Hero section JSON is shown in the [Hero Section Pattern](#hero-section-pattern-complete-v4-json) section below. Use it as a template, replacing placeholder IDs with actual values from Phase 5.

```javascript
novamira/adrians-batch-build-page {
  "page_id": TARGET_PAGE_ID,
  "elements": [
    // Complete V4 widget tree
    {
      "widgetType": "e-flexbox",
      "settings": {
        "tag": "section",
        "classes": {"$type": "classes", "value": ["shero"]}
      },
      "styles": {
        "shero": {
          "$type": "flexbox",
          "variants": [
            {
              "meta": {"breakpoint": null, "state": null},
              "props": {
                "flex-direction": "column",
                "gap": {"$type": "size", "value": {"size": 10, "unit": "px"}},
                "padding": {
                  "$type": "dimensions",
                  "value": {
                    "block-start": {"$type": "size", "value": {"size": 151, "unit": "px"}},
                    "block-end": {"$type": "size", "value": {"size": 112, "unit": "px"}},
                    "inline-start": {"$type": "size", "value": {"size": 30, "unit": "px"}},
                    "inline-end": {"$type": "size", "value": {"size": 30, "unit": "px"}}
                  }
                },
                "background": {
                  "color": {"$type": "global-color-variable", "value": "e-gv-VERY_DARK_GREEN_ID"}
                }
              }
            }
          ]
        }
      },
      "children": [
        // ... nested elements
      ]
    }
  ]
}
```

---

## Phase 7: Validate & QA

### 7.1 Four Vital Post-Build Checks

```
1. elementor-get-content {full_dump:true}
   → Verify: ∀ style-ID in styles.keys() → in settings.classes.value[]

2. custom_css Type Check
   → All values null or {raw: "..."} — NO plain strings

3. Hyphen Check
   → No "-" in local style IDs — valid namespace: [a-z0-9_]+ only

4. image-src Check
   → When id is set → url key COMPLETELY ABSENT
```

### 7.2 Additional QA

```javascript
// Responsive audit
novamira/adrians-responsive-audit { page_id: TARGET_PAGE_ID }

// Visual QA
novamira/adrians-visual-qa { page_id: TARGET_PAGE_ID }

// Page audit (heading hierarchy, alt texts)
novamira/adrians-page-audit { page_id: TARGET_PAGE_ID }
```

### 7.3 Browser Verification (agent-browser PRIMARY)

**Use `agent-browser` skill as PRIMARY visual QA tool.**

```bash
# Step 1: Hard refresh to clear Elementor CSS cache
agent-browser navigate "https://yoursite.local/page-slug/"
agent-browser execute "location.reload(true)"

# Step 2: Desktop screenshot (1440px)
agent-browser screenshot --width 1440 --output "qa-desktop.png"

# Step 3: Tablet screenshot (1024px)
agent-browser screenshot --width 1024 --output "qa-tablet.png"

# Step 4: Mobile screenshot (375px)
agent-browser screenshot --width 375 --output "qa-mobile.png"
```

**Comparison workflow:**
1. Open Framer export `index.html` locally (`serve.cjs`)
2. Take screenshots at same breakpoints
3. Compare side-by-side: V4 vs Framer export
4. Check: layout, spacing, colors, fonts, image placement

**Common issues to catch visually:**
- Missing tablet variant → layout jumps desktop→mobile
- Wrong font rendering → font not loaded
- Color mismatch → token not applied
- Image overflow → missing `overflow:hidden` or wrong positioning
- Stacking context issues → absolute positioned elements clipped

### 7.4 Binding Check After Patch (MANDATORY)

**After EVERY `adrians-patch-element-styles` call, verify styles↔classes binding.**

```javascript
// After patching, immediately check:
novamira/elementor-get-content { full_dump: true }

// For the patched element, verify:
// 1. All local style IDs still present in settings.classes.value[]
// 2. No styles orphaned (defined but not in classes)
// 3. No classes referencing deleted styles
```

**Why:** `patch-element-styles` can corrupt the classes array (Bug 1 in AGENTS.md). If `add_class` was used with local style IDs, the build freezes.

**Quick verification script:**
```bash
# Extract patched element's classes and styles
# Compare: every style ID must appear in classes array
# Any mismatch → immediate patch via elementor-edit-element (merge mode)
```

---

## Complete Step-by-Step Checklist (23 Steps)

### Preparation (Local)
- [ ] 1. Verify export directory structure (`assets/images/`, `assets/fonts/` exist?)
- [ ] 2. Extract design tokens from export CSS (`--token-*` variables)
- [ ] 3. Extract typography presets from export CSS (`framer-styles-preset-*`)
- [ ] 4. Create image inventory (filename → expected role)
- [ ] 5. Identify breakpoints from export CSS (`@media` queries)

### Extraction (MCP)
- [ ] 6. **Multi-page planning** — list all pages, identify shared components, plan build order
- [ ] 7. `unframer/getProjectXml` → project overview (colors, text styles, components)
- [ ] 8. `unframer/getNodeXml(targetSection)` → complete XML structure
- [ ] 9. `unframer/getNodeXml(components)` → resolve component props

### Validation (Dual-Source)
- [ ] 10. Token cross-check: MCP Color Styles == Export `--token-*` values?
- [ ] 11. Font cross-check: MCP fonts exist as .woff2 in export?
- [ ] 12. Image cross-check: MCP image nodes have local files?

### WordPress Setup
- [ ] 13. `adrians-setup-v4-foundation` (if not already on target page)
- [ ] 14. **Upload fonts via `adrians-upload-custom-font`** (Elementor Custom Fonts)
- [ ] 15. `adrians-batch-create-variables` (colors + fonts, validated with export)
- [ ] 16. Upload images to Media Library → `adrians-media-upload` → note attachment-IDs
- [ ] 17. `elementor-create-global-class` (btn-primary + others as needed)
- [ ] 18. **Regenerate CSS & Data** (after ALL create operations!)

### Build & QA
- [ ] 19. `adrians-pre-build-validate` → score ≥ 85% REQUIRED
- [ ] 20. `adrians-batch-build-page` with complete tree
- [ ] 21. `elementor-get-content {full_dump:true}` → 4 Vital Checks
- [ ] 22. **Binding check after any `adrians-patch-element-styles`** (Phase 7.4)
- [ ] 23. **agent-browser screenshots** at 1440px, 1024px, 375px + compare with export

---

## Pitfall Reference (40 Entries)

### 🔴 CRITICAL — Must Fix Immediately (18)

| # | Pitfall | Prevention | Source |
|---|---------|-----------|--------|
| 1 | Styles-Classes-Binding forgotten → page unstyled | After build, immediately run `elementor-get-content` | Internal |
| 2 | `e-gv-*` without `$type` → token updates never work | Always wrap: `{"$type":"global-*-variable","value":"e-gv-xxx"}` | Internal |
| 3 | Absolute positioning without relative parent | Parent container needs `position: relative` | Internal |
| 4 | `url:null` in image-src with id → PHP deletes key | Omit `url` key entirely when `id` is set | Internal |
| 5 | `background.color` in local styles → Array-to-String Warning | ONLY use in Global Classes (Bug in Core 4.0.9) | Internal |
| 6 | `add_class` in `patch-element-styles` with local style IDs | Use `elementor-edit-element` (merge mode) instead | Internal |
| 7 | Framer CDN URLs directly in V4 → break on project deletion | **Use export images** (stored locally) | Internal |
| 8 | Media upload AFTER batch-build-page → missing attachment-ID | Upload media BEFORE build | Internal |
| 9 | Alt-text directly in settings instead of attributes | e-image has no alt → MUST use `attributes` array | Internal |
| 10 | Stacking context: `overflow:hidden` clips absolute positioned image | Remove `overflow:hidden` OR restructure layout | Internal + Research |
| 12 | `$$type` with double dollar → properties invisible | Correct is `$type` (single dollar) | Internal |
| 13 | Base variant `"desktop"` in local styles → wrong renderer path | Page element styles: base variant = `null` | Internal + Research |
| 23 | Font license: Framer fonts not transferrable | **Use export fonts** (.woff2) or Google Fonts | Research |
| 24 | Font name without quotes → browser mismatch | MUST: `font-family: 'Font Name'` with quotes | Research |
| 25 | Elementor CSS cache after font/class changes | After EVERY create: Regenerate CSS & Data | Research |
| 36 | **MCP token ≠ Export token** → wrong colors in build | Extract tokens from BOTH sources and cross-check | Dual-Source |
| 37 | **Export images don't match MCP image nodes** → wrong images | Create image mapping table before build | Dual-Source |
| 38 | **Export font missing for MCP font** → fallback to system font | Load missing fonts via Google Fonts (exact same weight) | Dual-Source |

### 🟠 MEDIUM — Check Before Build (14)

| # | Pitfall | Prevention | Source |
|---|---------|-----------|--------|
| 11 | Gap between elements lost after wrapper removal | Keep text-wrapper OR set gap on container | Internal + Research |
| 14 | Font not loaded in WordPress | Font variable alone insufficient → use `adrians-upload-custom-font` to create Elementor Custom Fonts entry | Research |
| 15 | `e-paragraph` with `<p>` wrapper → double `<p><p>` | Only plain text or inline tags (`<strong>`, `<em>`, `<br>`) | Internal |
| 16 | `custom_css` as plain string → Site Crash 500 | MUST be `{raw: "..."}` format | Internal |
| 17 | `background-color` standalone doesn't exist | MUST be `background: {color: ...}` as container property | Internal + Research |
| 19 | Post-patch binding gap: styles without classes after patch | Run `check-binding-after-patch.js` after every patch | Internal + Research |
| 26 | Editor preview shows old CSS after variable update | Page refresh or CSS regeneration before QA | Research |
| 28 | srcset in flexbox: browser loads wrong image size | Explicit `sizes` attributes or `<picture>` element | Research |
| 29 | `object-fit:cover` doesn't recalculate on resize | Workaround: background-image div instead of `<img>` | Research |
| 30 | Image optimization plugins destroy page builder markup | Exclude Smush/Imagify from page builder containers | Research |
| 34 | z-index locking: `position:relative` locks child z-indices | No `position:relative` when children must float over siblings | Research |
| 35 | flex-direction row→column: axes swap on justify/align | Explicitly reset justify-content/align-items in mobile variant | Research |
| 39 | **MCP has component missing in export HTML** → layout divergence | MCP wins (source of truth), but document the discrepancy | Dual-Source |
| 40 | **Export HTML shows different breakpoint values than MCP** | CSS `@media` wins (actual rendering), MCP as reference | Dual-Source |
| 41 | **Tablet breakpoint missing** → layout jumps desktop→mobile | Add `"tablet"` variant for ALL responsive elements (flex-direction, width, font-size, padding) | Dual-Source |

### 🟡 LOW — Document (8)

| # | Pitfall | Prevention | Source |
|---|---------|-----------|--------|
| 18 | Style ID with hyphen → validator failure | Only `[a-z0-9_]+`, e.g. `sherotitle` not `s-hero-title` | Internal |
| 20 | `inset-inline-start:635px` only correct at exactly 1440px | Use percentage or calc()-based positioning | Internal + Research |
| 21 | `background-color` Core Bug in 4.0.9 (Array-to-String) | `background.color` ONLY in Global Classes | Internal |
| 22 | Breakpoint mapping: Framer 810px ≠ V4 Tablet | Map Framer responsive values to V4 breakpoints | Research |
| 27 | Pro interactions not disabled on mobile | Explicitly disable animations per breakpoint | Research |
| 31 | `custom_css` error: `$type` missing in CSS injection object | Always include `$type` in CSS injection values | Internal |
| 32 | Framer Stack ≠ CSS Flexbox (internal absolute positioning) | Treat as visual prototype, rebuild natively | Research |
| 33 | V4 Mobile-First paradigm ignored → CSS bloat | Define base styles on mobile, scale up | Research |

---

## Hero Section Pattern (Complete V4 JSON)

> **NOTE:** Replace all `e-gv-*_ID` placeholders with actual variable IDs from Phase 5 (e.g., `e-gv-a1b2c3d`). Global Class names like `gc-btn-primary` come from Phase 5.4.

```json
{
  "widgetType": "e-flexbox",
  "id": "hero-section",
  "settings": {
    "tag": "section",
    "classes": {"$type": "classes", "value": ["shero", "gc-hero-bg"]}
  },
  "styles": {
    "shero": {
      "$type": "flexbox",
      "variants": [
        {
          "meta": {"breakpoint": null, "state": null},
          "props": {
            "flex-direction": "column",
            "gap": {"$type": "size", "value": {"size": 10, "unit": "px"}},
            "padding": {
              "$type": "dimensions",
              "value": {
                "block-start": {"$type": "size", "value": {"size": 151, "unit": "px"}},
                "block-end": {"$type": "size", "value": {"size": 112, "unit": "px"}},
                "inline-start": {"$type": "size", "value": {"size": 30, "unit": "px"}},
                "inline-end": {"$type": "size", "value": {"size": 30, "unit": "px"}}
              }
            }
            // NOTE: background.color REMOVED — now in gc-hero-bg Global Class (Bug 3)
          }
        },
        {
          "meta": {"breakpoint": "tablet", "state": null},
          "props": {
            "padding": {
              "$type": "dimensions",
              "value": {
                "block-start": {"$type": "size", "value": {"size": 100, "unit": "px"}},
                "block-end": {"$type": "size", "value": {"size": 80, "unit": "px"}},
                "inline-start": {"$type": "size", "value": {"size": 24, "unit": "px"}},
                "inline-end": {"$type": "size", "value": {"size": 24, "unit": "px"}}
              }
            }
          }
        },
        {
          "meta": {"breakpoint": "mobile", "state": null},
          "props": {
            "padding": {
              "$type": "dimensions",
              "value": {
                "block-start": {"$type": "size", "value": {"size": 80, "unit": "px"}},
                "block-end": {"$type": "size", "value": {"size": 60, "unit": "px"}},
                "inline-start": {"$type": "size", "value": {"size": 24, "unit": "px"}},
                "inline-end": {"$type": "size", "value": {"size": 24, "unit": "px"}}
              }
            }
          }
        }
      ]
    }
  },
  "children": [
    {
      "widgetType": "e-flexbox",
      "id": "hero-container",
      "settings": {
        "tag": "div",
        "classes": {"$type": "classes", "value": ["sherocontainer"]}
      },
      "styles": {
        "sherocontainer": {
          "$type": "flexbox",
          "variants": [
            {
              "meta": {"breakpoint": null, "state": null},
              "props": {
                "max-width": {"$type": "size", "value": {"size": 1280, "unit": "px"}},
                "flex-direction": "column",
                "align-items": "center",
                "position": "relative"
              }
            }
          ]
        }
      },
      "children": [
        {
          "widgetType": "e-flexbox",
          "id": "hero-content",
          "settings": {
            "tag": "div",
            "classes": {"$type": "classes", "value": ["sherocontent"]}
          },
          "styles": {
            "sherocontent": {
              "$type": "flexbox",
              "variants": [
                {
                  "meta": {"breakpoint": null, "state": null},
                  "props": {
                    "flex-direction": "row",
                    "align-items": "center",
                    "justify-content": "space-between",
                    "width": {"$type": "size", "value": {"size": 100, "unit": "%"}}
                  }
                },
                {
                  "meta": {"breakpoint": "tablet", "state": null},
                  "props": {
                    "flex-direction": "column",
                    "gap": {"$type": "size", "value": {"size": 40, "unit": "px"}}
                  }
                },
                {
                  "meta": {"breakpoint": "mobile", "state": null},
                  "props": {
                    "flex-direction": "column",
                    "gap": {"$type": "size", "value": {"size": 40, "unit": "px"}}
                  }
                }
              ]
            }
          },
          "children": [
            {
              "widgetType": "e-flexbox",
              "id": "text-wrapper",
              "settings": {
                "tag": "div",
                "classes": {"$type": "classes", "value": ["stextwrapper"]}
              },
              "styles": {
                "stextwrapper": {
                  "$type": "flexbox",
                  "variants": [
                    {
                      "meta": {"breakpoint": null, "state": null},
                      "props": {
                        "flex-direction": "column",
                        "gap": {"$type": "size", "value": {"size": 30, "unit": "px"}},
                        "width": {"$type": "size", "value": {"size": 50, "unit": "%"}}
                      }
                    },
                    {
                      "meta": {"breakpoint": "tablet", "state": null},
                      "props": {
                        "width": {"$type": "size", "value": {"size": 100, "unit": "%"}}
                      }
                    },
                    {
                      "meta": {"breakpoint": "mobile", "state": null},
                      "props": {
                        "width": {"$type": "size", "value": {"size": 100, "unit": "%"}}
                      }
                    }
                  ]
                }
              },
              "children": [
                {
                  "widgetType": "e-heading",
                  "id": "hero-title",
                  "settings": {
                    "tag": "h1",
                    "title": {"$type": "string", "value": "Fast reliable plumbing solutions"},
                    "classes": {"$type": "classes", "value": ["sherotitle"]}
                  },
                  "styles": {
                    "sherotitle": {
                      "$type": "heading",
                      "variants": [
                        {
                          "meta": {"breakpoint": null, "state": null},
                          "props": {
                            "font-size": {"$type": "size", "value": {"size": 68, "unit": "px"}},
                            "font-family": {"$type": "global-font-variable", "value": "e-gv-INTER_DISPLAY_ID"},
                            "font-weight": {"$type": "string", "value": "600"},
                            "color": {"$type": "global-color-variable", "value": "e-gv-WHITE_ID"},
                            "line-height": {"$type": "string", "value": "1.1em"}
                          }
                        },
                        {
                          "meta": {"breakpoint": "tablet", "state": null},
                          "props": {
                            "font-size": {"$type": "size", "value": {"size": 48, "unit": "px"}}
                          }
                        },
                        {
                          "meta": {"breakpoint": "mobile", "state": null},
                          "props": {
                            "font-size": {"$type": "size", "value": {"size": 36, "unit": "px"}}
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  "widgetType": "e-paragraph",
                  "id": "hero-desc",
                  "settings": {
                    "tag": "p",
                    "title": {"$type": "string", "value": "Expert plumbing services for your home and business."},
                    "classes": {"$type": "classes", "value": ["sherodesc"]}
                  },
                  "styles": {
                    "sherodesc": {
                      "$type": "paragraph",
                      "variants": [
                        {
                          "meta": {"breakpoint": null, "state": null},
                          "props": {
                            "font-size": {"$type": "size", "value": {"size": 20, "unit": "px"}},
                            "font-family": {"$type": "global-font-variable", "value": "e-gv-INTER_ID"},
                            "font-weight": {"$type": "string", "value": "500"},
                            "color": {"$type": "global-color-variable", "value": "e-gv-SECONDARY_TEXT_ID"}
                          }
                        },
                        {
                          "meta": {"breakpoint": "tablet", "state": null},
                          "props": {
                            "font-size": {"$type": "size", "value": {"size": 18, "unit": "px"}}
                          }
                        },
                        {
                          "meta": {"breakpoint": "mobile", "state": null},
                          "props": {
                            "font-size": {"$type": "size", "value": {"size": 16, "unit": "px"}}
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  "widgetType": "e-button",
                  "id": "hero-cta",
                  "settings": {
                    "tag": "a",
                    "title": {"$type": "string", "value": "Get Free Estimate"},
                    "link": {
                      "$type": "link",
                      "value": {
                        "href": {"$type": "string", "value": "/contact"},
                        "isTargetBlank": {"$type": "boolean", "value": false}
                      }
                    },
                    "classes": {"$type": "classes", "value": ["gc-btn-primary"]}
                  }
                }
              ]
            },
            {
              "widgetType": "e-image",
              "id": "hero-image",
              "settings": {
                "image": {
                  "$type": "image",
                  "value": {
                    "src": {
                      "$type": "image-src",
                      "value": {
                        "id": {"$type": "image-attachment-id", "value": 4544}
                      }
                    },
                    "size": {"$type": "string", "value": "full"}
                  }
                },
                "attributes": {
                  "$type": "attributes",
                  "value": [
                    {"_id": "attr1", "name": "alt", "value": "Professional plumbing service"}
                  ]
                },
                "classes": {"$type": "classes", "value": ["sheroimage"]}
              },
              "styles": {
                "sheroimage": {
                  "$type": "image",
                  "variants": [
                    {
                      "meta": {"breakpoint": null, "state": null},
                      "props": {
                        "position": "absolute",
                        "width": {"$type": "size", "value": {"size": 620, "unit": "px"}},
                        "height": {"$type": "size", "value": {"size": 620, "unit": "px"}},
                        "inset-block-end": {"$type": "size", "value": {"size": -116, "unit": "px"}},
                        "inset-inline-start": {"$type": "size", "value": {"size": 635, "unit": "px"}},
                        "border-radius": {"$type": "size", "value": {"size": 16, "unit": "px"}}
                      }
                    },
                    {
                      "meta": {"breakpoint": "tablet", "state": null},
                      "props": {
                        "position": "relative",
                        "inset-block-end": null,
                        "inset-inline-start": null,
                        "width": {"$type": "size", "value": {"size": 100, "unit": "%"}},
                        "height": {"$type": "size", "value": {"size": 400, "unit": "px"}}
                      }
                    },
                    {
                      "meta": {"breakpoint": "mobile", "state": null},
                      "props": {
                        "position": "relative",
                        "inset-block-end": null,
                        "inset-inline-start": null,
                        "width": {"$type": "size", "value": {"size": 100, "unit": "%"}},
                        "height": {"$type": "size", "value": {"size": 300, "unit": "px"}}
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

---

## Prop Resolution (Cryptic Framer Hashes)

Framer uses auto-generated 9-char hashes for component props:
```xml
<PrimaryButton ycw27fUKm="Get Free Estimate" hM59WZCdN="/contact" />
```

**Resolution methods:**
1. `getNodeXml(COMPONENT_ID)` → internal XML shows how each prop is used
2. `getComponentInsertUrlAndTypes({ id: "COMPONENT_ID" })` → prop type definitions
3. Cross-reference multiple instances → same hash with different values reveals purpose

---

## Related Skills

- `agent-browser` — **PRIMARY visual QA tool** for screenshots, responsive testing, and comparison with Framer export
- `elementor-v4-visual-qa` — Browser screenshots and responsive QA (use alongside agent-browser)
- `framer-to-elementor-v4` — Single-source (MCP-only) conversion for quick prototyping
- `elementor-v4-atomic-builder` — V4 widget patterns and examples
- `elementor-v4-conversion` — V3 to V4 migration
- `elementor-v4-architecture` — V4 `$type` system reference
- `design-system-reference` — Concrete token IDs for nick-webdesign.de


---

## FramerExport v5 Symbiose-Ergänzungen (Mai 2026)

### v5 Hybrid-Pipeline — wie ZIP und MCP zusammenarbeiten

FramerExport v5 hat eine eingebaute Symbiose-Engine (`src/hybrid/pipeline.ts`):

```
ZIP-Export                           unframer MCP
    │                                     │
    │ Liefert:                            │ Liefert:
    │ - Alle Assets (Fonts/Bilder/Videos) │ - CMS-Daten → data/*.json
    │ - Pretty-printed JS-Chunks          │ - Alle Seiten-Routen
    │ - Lokale Dateistruktur              │ - SEO-Meta (echter canonical)
    │ - serve.cjs (Port 3000)             │ - Asset-URLs die ZIP verpasst hat
    │                                     │
    └──────────────────┬──────────────────┘
                       │
                       ▼
              Gap-Analyse + CDN-Patch
              → 0 CDN-URLs im finalen HTML
```

**Für Elementor-Builds gilt:**
- `pipeline.ts` zeigt: ZIP-Gaps werden von MCP gepatcht
- `mcp-adapter.ts` zeigt: MCP hat `getAssetUrls()`, `getRoutes()`, `getCmsCollection()`
- `zip-extractor.ts` zeigt: Asset-URL-Mapping via `inferCdnUrl()` (images/ fonts/ videos/)

### Reihenfolge für Elementor-Build mit v5

```
Phase 0: Beide Quellen bereitstellen
  └─ ZIP exportieren: framer-export https://seite.framer.app --zip site.zip --mcp http://localhost:7331
  └─ unframer MCP: getProjectXml + getNodeXml (Struktur)

Phase 1: ZIP analysieren (Python-Skript auf JS-Chunks)
  └─ Grössten hash-Chunk identifizieren
  └─ CSS-Blöcke mit 100vh-Anker extrahieren
  └─ Design-Token-IDs aus lN5HIBgJm.*.mjs
  └─ Videos aus assets/misc/*.mp4 (grösstes = Hero)

Phase 2: MCP abfragen (Struktur + Inhalte)
  └─ getNodeXml(heroSectionId) → Hierarchie
  └─ Text-Inhalte, Links, Video-URLs
  └─ CMS-Daten aus data/*.json (wenn vorhanden)

Phase 3: Cross-Mapping
  └─ MCP-Komponente ↔ ZIP-CSS-Klasse zuordnen
  └─ Token-IDs aus ZIP → e-gv-* IDs aus setup-v4-foundation

Phase 4: Assets hochladen
  └─ novamira/adrians-media-upload für Bilder + Videos

Phase 5: elementor-set-content mit exakten Werten
  └─ Struktur von MCP, Pixel-Werte von ZIP
```

### batch-build-page ist veraltet für Root-Level

**Kritische Korrektur zu älteren Skill-Versionen:**

```
batch-build-page   → Erzeugt V3-Container auf Root-Ebene → Validator-Fehler
elementor-set-content → Korrekt: echte e-flexbox auf Root-Ebene (IMMER verwenden)
```

### Bekannte CSS-Werte aus Zohco-Export

Aus den JS-Chunks extrahiert (keine Schätzungen):

| Element | Property | Wert |
|---|---|---|
| Hero Section | border-radius | 20px |
| Hero Section | padding-top | 160px |
| Hero Section | padding-inline | 47px |
| Hero Overlay | background | rgba(4,51,51,0.6) |
| Hero Overlay | opacity | 0.44 |
| Hero Bottom gap | gap | 50px |
| Beschreibung max-width | max-width | 447px |
| Nav Wrapper padding | padding | 100px 60px |
| CTA Button radius | border-radius | 40px |
| CTA Button padding | padding | 5px 20px 5px 5px |
| Page Wrapper padding | padding | 10px 10px 0px 10px |

### AI Prompt Assistant (v5 Feature)

v5 hat einen eingebauten `ai/prompt-assistant.ts` der nach dem Export einen strukturierten Konversions-Prompt generiert. Für Elementor-Builds ist dieser Prompt nicht direkt verwendbar (er zielt auf React/Next.js), aber er liefert:

```bash
# Nach dem Export interaktiv:
# → Stack wählen: React, Next.js, Vue, Svelte, Astro
# → AI-Tool wählen: Claude Code, Codex, OpenCode
# → Konversionsziel: pixel-perfect, clean rebuild, component system, performance

# Output: ai/claude-code-react-vite-pixel-perfect-prompt.md
```

Die generierten Prompts enthalten exakte Asset-Pfade, Datei-Counts und Export-Struktur — nützlich als Kontext-Dokument für den Elementor-Build.

### v5 serve.cjs — verbessert

Das neue `serve.cjs` hat:
- ETag-Cache-Headers (schnellere Wiederholungs-Requests)
- Security Headers (X-Content-Type-Options, etc.)
- Route-Manifest aus `data/route-manifest.json`
- SPA-Fallback auf index.html für alle unbekannten Routen

```bash
cd framer-meine-seite
node serve.cjs
# → http://localhost:3000
# WICHTIG: CSS-Analyse via JS-Chunk-Dateien direkter als HTTP-Request
```
