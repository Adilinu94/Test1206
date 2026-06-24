# Handoff: Framer → Elementor V3 E2E-Test

> **Datum:** 2026-06-24
> **Projekt:** `Framer-to-Elementor-V4-Pipeline-main` — aber gebaut wird in **Elementor V3**
> **Ziel:** Framer-Seite `https://easier-train-154753.framer.app/` → Header + Hero als neue Seite `Framer-E2E-Test` auf `rundmund.local`

---

## 1. MCP-Konfiguration (`.mcp.json`)

```json
{
  "mcpServers": {
    "novamira-rundmund-local": {
      "command": "npx",
      "args": ["-y", "@automattic/mcp-wordpress-remote@latest"],
      "env": {
        "WP_API_URL": "http://rundmund.local/wp-json/mcp/novamira",
        "WP_API_USERNAME": "Adrian",
        "WP_API_PASSWORD": "NDQJvceHMdvSmFPehLN4drEo"
      }
    },
    "framer": {
      "type": "http",
      "url": "https://mcp.unframer.co/mcp?id=e9715ce69cba1208a49d3b86a74b7e876c44f1f002e9ac175befe075c37e4f2b&secret=zk0cxPk87OMhk0xQI6jcoyHOaHzwuxvV"
    }
  }
}
```

**Wichtig:** Der `framer`-Eintrag ist ein **Streamable HTTP MCP Server**. Der MCP-Client muss ggf. neu gestartet werden, damit die Unframer-Tools (`getNodeXml()`) verfügbar sind.

### Verbindungsstatus (vor Handoff)

| MCP | Status |
|-----|--------|
| Novamira (rundmund.local) | ✅ Verbunden & getestet — Elementor v4.1.4 aktiv |
| Framer / Unframer | ⚠️ Nicht im Session-Kontext geladen — Neustart nötig oder Nutzung von `web_fetch` |

---

## 2. Framer-Seite: Oralcare Dental Template

**Live-URL:** `https://easier-train-154753.framer.app/`
**Name:** Oralcare — Dentist Framer Template
**Style:** Zahnarzt-Praxis Template, dunkles Grün (#003b2e-ish) + Creme/Weiß

### Header (was nachgebaut werden muss)

- Logo (vermutlich "Oralcare" Text-Logo links)
- Navigation: "Home", "About", "Services", "Blog", "Team", etc.
- CTA-Button: "Book Appointment" rechts
- Sticky/Pinned Header über dem Hero

### Hero (was nachgebaut werden muss)

- **Hintergrundfarbe:** Sehr dunkles Grün (`/Theme Color/Very Dark Green`)
- **Layout:** Zentriert, vertikaler Stack, Padding ca. 150px oben / 110px unten
- **Inhalt:**
  - Badge/Subtext: "Trusted by Thousands of Homeowners" (aus alter XML — Live-Seite zeigt "Test")
  - Überschrift: "Prepare to enhance your smile with dental treatments that boost your confidence and brighten your day!"
  - Zwei Buttons: "Book Appointment" (Primary) und "Our Services" (Secondary/Link)
  - Rechte Seite: Bild einer lächelnden Person (Portrait)
- **Max Width:** 1280px Container

### Farben (geschätzt aus Crawl)

| Rolle | Farbe | Hinweis |
|-------|-------|---------|
| Hero-BG | Sehr dunkles Grün | `/Theme Color/Very Dark Green` |
| Text (Header/Nav) | Weiß/Creme | Auf dunklem Hintergrund |
| Text (Hero) | Weiß | |
| Buttons | Akzentfarbe (Orange/Gold?) | — |
| Page-BG | Weiß | |

### Schriftarten

Framer-typisch: Inter oder DM Sans — muss aus der Unframer-XML sauber extrahiert werden.

### Bilder (Header/Hero-relevant)

| Datei | URL |
|-------|-----|
| Hero Portrait | `https://framerusercontent.com/images/W02fPVnN9nPY9w2TjWKX0hVUMWg.png` |

---

## 3. Bisher erledigt

- [x] Repo-Struktur analysiert
- [x] MCP-Konfiguration geschrieben und geprüft (`.mcp.json`)
- [x] Novamira MCP-Verbindung getestet (✅)
- [x] Aktuelle Framer-Seite gecrawlt via `web_fetch` (Inhalt erfasst)
- [x] Vorhandene XMLs (`homepage.xml`, `hero-section.xml`) identifiziert — sind aber **alt** (MasterCare/Plumbing-Theme, nicht das aktuelle Oralcare-Dental-Theme)
- [x] FramerExport Tool (`tools/framer-export/`) ist gebaut und einsatzbereit
- [x] Entscheidungen getroffen:
  - **Elementor V3** (nicht V4) bauen
  - **Header + Hero** beide nachbauen
  - Seite heißt **"Framer-E2E-Test"**
  - **Global Colors & Typography** im V3-Kit anlegen
  - **Original-Bilder** von framerusercontent.com herunterladen & über Novamira in die Mediathek hochladen

---

## 4. Nächste Schritte (Todo)

### Phase 1: Framer-Daten beschaffen

1. **Unframer MCP nutzen** (nach Neustart verfügbar) oder `web_fetch` auf die Live-URL:
   - Rufe `getNodeXml()` auf, um die komplette Seitenstruktur zu erhalten
   - Extrahiere **Header** und **Hero** als vollständige Node-Bäume
2. Alternativ: **FramerExport CLI** nutzen:
   ```bash
   cd tools/framer-export
   node bin/framer-export.js https://easier-train-154753.framer.app/ ./exports/framer-e2e-test
   ```
   Das erzeugt tokens/, design-system/ und v4-output/ — aber auf V4-Format.

### Phase 2: Assets vorbereiten

3. **Bilder herunterladen** (wichtigste für Header+Hero):
   - `W02fPVnN9nPY9w2TjWKX0hVUMWg.png` (Hero Portrait)
4. **Bilder über Novamira MCP in die Mediathek laden**
5. **Fonts identifizieren** (aus der Unframer-XML extrahieren)

### Phase 3: Elementor V3 Setup

6. **Prüfen, ob Elementor V3 aktiv ist** oder V3-Modus erzwungen werden kann
   - `novamira-adrianv2/detect-elementor-version` meldet v4.1.4 — Ziel ist aber V3
   - Ggf. die Seite im **V3-Editor-Modus** anlegen (Classic Editor statt Flexbox Container)
7. **Neue Seite anlegen:** "Framer-E2E-Test" über Novamira MCP

### Phase 4: Global Styles (Elementor V3 Kit)

8. **Global Colors** im V3-Kit anlegen:
   - Primary: Very Dark Green (Hero-BG)
   - Secondary: Weiß/Creme
   - Accent: (aus Button-Farbe extrahieren)
   - Text: Dunkel für weiße Bereiche
9. **Global Typography** im V3-Kit anlegen:
   - Heading 1: Hero-Headline-Stil
   - Body: Fließtext
   - Button: CTA-Button-Stil
10. **Kit speichern und zuweisen**

### Phase 5: Header bauen (Elementor V3)

11. **Section** erstellen: Volle Breite, fixed/sticky
12. **Inner Section** (2 Columns): Logo | Navigation + CTA
13. **Widgets**: Heading (Logo), Nav Menu, Button (Book Appointment)
14. **Styling**: Global Colors + Typography aus Kit

### Phase 6: Hero bauen (Elementor V3)

15. **Section** erstellen: Volle Breite, Hintergrundfarbe = Very Dark Green
16. **Inner Section** (2 Columns): Text links | Bild rechts
17. **Widgets** (linke Spalte):
    - Heading (H1): Hero-Überschrift
    - Text: Hero-Description
    - Button: Book Appointment
    - Button/Link: Our Services
18. **Widget** (rechte Spalte): Image (aus Mediathek)
19. **Styling**: Padding, Abstände, Max-Width

### Phase 7: QA & Test

20. Seite visuell prüfen (Abgleich mit Framer-Original)
21. Responsive-Verhalten testen
22. E2E-Test abschließen und Ergebnisse dokumentieren

---

## 5. Verfügbare Tools im Repo

| Tool | Pfad | Status |
|------|------|--------|
| FramerExport CLI | `tools/framer-export/bin/framer-export.js` | ✅ Installiert & gebaut (v4.4.1) |
| Pipeline Scripts | `scripts/*.js` | ✅ Vorhanden |
| Novamira MCP | MCP-Tools verfügbar | ✅ Verbunden |
| Unframer MCP | MCP-Konfiguration vorhanden | ⚠️ Neustart nötig |
| Tests | `tests/*.test.js` | ✅ Vorhanden |

### Nützliche Novamira MCP-Abilities

- `novamira-adrianv2/detect-elementor-version` — Elementor-Version prüfen
- `novamira-adrianv2/create-page` — Neue Seite anlegen
- `novamira-adrianv2/upload-image` — Bild in Mediathek laden
- `novamira-adrianv2/add-v3-section` — V3 Section hinzufügen
- `novamira-adrianv2/add-v3-widget` — V3 Widget hinzufügen
- `novamira-adrianv2/create-global-color` — Global Color anlegen
- `novamira-adrianv2/create-global-typography` — Global Typography anlegen
- `novamira-adrianv2/save-kit` — Kit speichern

---

## 6. Wichtige Constraints

1. **NUR Elementor V3** — keine Atomic Widgets, keine Flexbox Container, keine V4-Global-Classes
2. **Header + Hero** — kein Footer, keine anderen Sections
3. **Original-Bilder** von framerusercontent.com herunterladen, nicht placeholders
4. **Global Colors & Typography** im Elementor V3 Kit-Stil anlegen (nicht V4 Global Classes)
5. Seite heißt **"Framer-E2E-Test"** auf rundmund.local

---

## 7. Bekannte Fallstricke

- Die `homepage.xml` im Repo ist von einem **älteren Projekt (MasterCare/Plumbing)** — nicht die aktuelle Oralcare-Dental-Seite. Neue XML muss via Unframer MCP oder FramerExport gezogen werden.
- Elementor v4.1.4 ist installiert — V3-Modus muss aktiv erzwungen werden (Classic Sections statt Flexbox)
- Framer MCP ist ein `type: "http"` Server — manche MCP-Clients unterstützen das erst ab neueren Versionen. Falls nicht, `web_fetch` auf die Framer-URL als Fallback.
