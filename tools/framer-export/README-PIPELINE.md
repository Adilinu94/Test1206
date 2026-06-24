# FramerExport — Pipeline Integration

## Was ist FramerExport?

FramerExport ([github.com/danbenba/FramerExport](https://github.com/danbenba/FramerExport)) ist ein
externer Open-Source-Exporter, der **Framer-Sites** in lokale Static-Mirror-Sites crawlt
(HTML, CSS, JS, Assets, Fonts, Design-Tokens, V4-Output).

In diesem Repo ist FramerExport als **fester Bestandteil unter `tools/framer-export/`** integriert.
Es ist der **Upstream-Lieferant** für die Framer-V4-Pipeline.

## Architektur

```
Framer-Site (framer.app)
       ↓
[FramerExport: tools/framer-export/bin/framer-export.js]
       ↓ erzeugt:
       ↓   - index.html (gemirrorte Site)
       ↓   - assets/images/, assets/fonts/
       ↓   - tokens/token-mapping.json
       ↓   - tokens/font-resolution.json
       ↓   - design-system/global-classes.json
       ↓   - design-system/variables.json
       ↓   - v4-output/homepage.json  ← identisch mit Pipeline-Output
       ↓
[Pipeline: scripts/convert-xml-to-v4.js]
       ↓ verarbeitet tokens/, design-system/, image-map
       ↓ erzeugt v4-tree/ → build → Elementor V4
       ↓
[WP-Elementor: novamira-adrianv2 MCP]
       ↓
WordPress-Page
```

## Wichtigste Erkenntnis

**FramerExport und unsere Pipeline produzieren byte-identische V4-Output-Files** für die gleiche
Eingabe. Verifiziert: `v4-output/homepage.json` aus FramerExport (253.791 Bytes) ==
`tmp/pipeline-run-homepage.json` aus der Pipeline (253.791 Bytes).

Damit ist FramerExport eine **vollständige Alternative** zum manuellen XML-Pfad der Pipeline,
und der empfohlene Weg für neue Framer-Exporte.

## Build & CLI

FramerExport ist ein TypeScript-Projekt. Vor dem ersten Lauf muss gebaut werden:

```bash
cd tools/framer-export
npm install        # einmalig
npm run build      # erzeugt dist/cli/index.js
```

Dann ist die CLI direkt nutzbar:

```bash
# Version
node bin/framer-export.js --version
# → 4.4.1

# Site crawlen
node bin/framer-export.js https://mysite.framer.app ./output
# → erzeugt ./output/index.html + alle assets + tokens + v4-output/
```

## Integration in der Pipeline

Die V4-Pipeline (wizard.js / cmd-pipeline.js) erkennt FramerExport automatisch via
`findFramerExportDir()` (in `scripts/wizard/shared.js`):

1. **Prebuilt `dist/cli/index.js` vorhanden?** → direkter Aufruf, schnellste Variante
2. **Nur `package.json` mit `dev`-Script?** → `npm run dev`, langsamer (TypeScript-Transpile zur Laufzeit)
3. **Nur `src/cli/index.ts`?** → `npx tsx src/cli/index.ts`, Fallback
4. **Nichts?** → Pipeline bricht ab mit klarem Error

Die Pipeline cached FramerExport-Outputs: zweiter Lauf mit gleicher URL ist sofort fertig.

## Pipeline-Workflow

```bash
# 1. Framer-Site durch FramerExport crawlen
cd tools/framer-export
node bin/framer-export.js https://mysite.framer.app ./exports/mysite

# 2. Pipeline gegen den FramerExport-Output laufen lassen
cd ../../
node wizard.js pipeline --export-dir tools/framer-export/exports/mysite
# → nutzt tokens/, design-system/ automatisch
# → erzeugt v4-tree/ → baut Elementor-Page via MCP
```

## Versionierung

| Komponente | Version | Stand |
|---|---|---|
| FramerExport (geklont) | 4.4.1 | 2026-06-16 |
| TypeScript-Build via tsup | 8.5.1 | OK |
| Node-Target | node20 | OK (lokal: v24.15.0) |

## Wartung

FramerExport ist ein **geklontes** Projekt. Updates vom Upstream:

```bash
cd tools/framer-export
git remote -v  # ist "upstream" konfiguriert?
git fetch upstream
git merge upstream/main
npm install
npm run build
```

Falls Konflikte mit unseren Pipeline-Anpassungen entstehen, manuell mergen.

## Bekannte Limits

- FramerExport crawled **gerendertes HTML**, nicht die Framer-XML-Source. Damit fehlen
  manche Design-Tokens, die nur in der Framer-Canvas-XML sichtbar sind.
- Große Sites (>100 Sub-Pages) brauchen `--subpages` und entsprechend mehr Crawl-Zeit.
- Externe Framer-Plugins (z.B. Memberstack) werden nicht mit-exportiert.
