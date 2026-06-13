---
slug: framer-pipeline-debug
title: Framer Pipeline Debug — Guided Troubleshooting
description: Strukturierte Diagnose-Anleitung für fehlgeschlagene framer-v4-pipeline Läufe. Deckt alle bekannten Fehlermuster ab inkl. CI-Bugs, PHP-Fatals, MCP-Fehler und Score-Probleme.
version: "0.7.0"
pipeline_min_version: "0.7.0"
tags: [debug, troubleshooting, framer, pipeline, mcp, ci]
---

# Framer Pipeline Debug — Guided Troubleshooting

## Schritt 1: Welcher Schritt hat gefailt?

```bash
# rollback-plan.json lesen:
cat rollback-plan.json | jq '.steps[] | select(.status == "failed")'

# validate-report.json:
cat validate-report.json | jq '.summary, .stats'

# MCP-Bridge Log:
cat .pipeline/bridge.log 2>/dev/null | tail -50
```

---

## Diagnose-Entscheidungsbaum

```
Fehler bei PHP-Abilities?
  → Ist WPCode aktiv? post_type_exists('wpcode_snippet') → false → Plugin deaktiviert
  → novamira_find_wpcode_snippet undefined? → adrians-helpers.php nicht geladen (require_once fehlt)

Fehler: "novamira-extra/..." 404 oder not found?
  → ❌ FALSCHER NAMESPACE — das Plugin heißt novamira-adrianv2, nicht novamira-extra
  → Fix: Alle Calls auf novamira-adrianv2/ umstellen
  → Betrifft: post-build-auto-fix.js (gefixt in Commit 5bb2d3d)

CI alle Jobs grün aber nichts läuft?
  → Prüfe working-directory in .github/workflows/ci.yml (gefixt in Commit 5bb2d3d)
  → paths-Filter feuert auf falsches Verzeichnis?

Score < 85% in validate-v4-tree.js?
  → node scripts/validate-v4-tree.js v4-tree.json --verbose
  → Häufigste Ursache: style IDs mit Bindestrichen (HYPHEN-IN-STYLE-ID)
  → Häufigste Ursache: GV-Farbe als Hardcode (#ffffff statt e-gv-*)
  → DOM-Tiefe ≥ 4? → C7 Check: flatten tree

Score 0%?
  → homepage.xml = hero-section.xml? md5sum prüfen (gefixt in Commit 5bb2d3d)
  → v4-tree.json leer oder kein Array? → convert-xml-to-v4.js direkt debuggen

elementor-set-content gibt 401 zurück?
  → MCP-Session abgelaufen (TTL ~25-30min)
  → Neu initialisieren: mcp-bridge.js → session handshake
  → adrians-setup-v4-foundation erneut aufrufen (gibt neue GV/GC-IDs)

elementor-set-content gibt leere Seite?
  → GV-IDs stale: e-gv-* IDs aus vorheriger Session
  → adrians-setup-v4-foundation nie cachen → fresh IDs holen
  → GC-IDs in styles{} aber nicht in elements? → styles[] muss parallel zu elements[] sein

adrians-batch-inject-snippets schlägt fehl?
  → >20 Snippets? Batch-Limit ist 20
  → Nutze --single-mode Flag für Debugging einzelner Snippets

GC transform-functions PHP Warning?
  → Bekannter Bug: gc-* mit malformiertem transform-functions prop
  → Fix-Skript: wp-content/novamira-sandbox/gc-transform-validator.php
  → Ursache: GC als raw PHP Array gespeichert statt { $$type, value[] } Wrapper
```

---

## Häufige Fehler & Fixes

| Symptom | Ursache | Fix | Commit |
|---------|---------|-----|--------|
| CI alle Jobs "green" aber nichts geprüft | working-directory: framer-v4-pipeline-v2-main | CI fix | 5bb2d3d |
| PHP Fatal: undefined function novamira_find_wpcode_snippet | require_once helpers fehlt | adrians-helpers.php | 5bb2d3d |
| Score 0% beide Fixtures identisch | homepage.xml = hero-section.xml (identisch) | Fixture fix | 5bb2d3d |
| novamira-extra/* 404 | Falscher Namespace — Plugin heißt novamira-adrianv2 | post-build-auto-fix.js fix | Runde 2 |
| GSAP-Snippet bricht bei Backticks | addslashes() statt wp_json_encode() | Code-Injector fix | 5bb2d3d |
| inject-animation N×MCP-Calls | forEach loop statt Batch-Ability | inject-animation-code.js fix | Runde 2 |
| DOM-Depth kein Check | validate-v4-tree.js fehlte C7 | checkDomDepth() | 5bb2d3d |
| GC-Generierung wird übersprungen | wizard.js Step 5 war "Optional" | Pflichtschritt | 5bb2d3d |
| meta-tags/schema nicht gesetzt | novamira-extra PHP fehlte | adrians-generate-*.php | Runde 2 |

---

## Debug-Befehle

```bash
# Vollständige Syntax-Prüfung aller Skripte:
for f in scripts/**/*.js wizard.js; do node --check "$f" && echo "OK: $f"; done

# Unit-Tests:
node --test tests/pipeline.test.js

# validate-v4-tree verbose:
node scripts/validate-v4-tree.js v4-tree.json --mode=warn

# inject-animation single-mode (Debug):
node scripts/inject-animation-code.js --plan animation-plan.json --single-mode

# McpBridge self-test:
node scripts/lib/mcp-bridge.js --self-test

# MD5-Check Fixtures (müssen verschieden sein):
md5sum tools/framer-export/homepage.xml tools/framer-export/hero-section.xml
```

---

## MCP-Session Handshake Debug

```bash
# Manueller Session-Test gegen solar.local:
curl -s -X POST http://solar.local/wp-json/mcp/novamira \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'user:password' | base64)" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"debug","version":"1.0"}}}'
```

Expected: `{"jsonrpc":"2.0","id":1,"result":{"sessionId":"...","capabilities":{...}}}`

---

## Eskalations-Checkliste (wenn nichts hilft)

1. `git log --oneline -5` — aktuellsten Commit prüfen
2. `node -e "import('./scripts/convert-xml-to-v4.js')"` — direkt ausführen
3. `mcp-adapter-discover-abilities` live abfragen — Ability-Liste verifizieren
4. `tasks/todo.md` öffnen — bekannte offene Issues
5. `PIPELINE_AUDIT_REPORT.md` und `V4_DESIGN_SCHEMA_REPORT.md` lesen
