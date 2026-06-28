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

---

## Neue Symptome aus E2E-Verbesserungsbericht (Sprint 17, 17. Juni 2026)

| Symptom | Ursache | Fix |
|---------|---------|-----|
| **Seite blank trotz `atomic.runtime_available: true`** | **`e_atomic_elements` Experiment inaktiv** (check-setup prüft nur PHP-Klassen, nicht Experimente) | **`node scripts/preflight/ensure-elementor-experiments.js --post-id ID`** (Session-Start Schritt 2c) |
| **Seite blank DIREKT nach `elementor-set-content`** | **CSS-Cache nicht neu gebaut** (separat von Experiment-Issue) | **Schritt 11 in framer-v4-pipeline.md: `files_manager->clear_cache()` + `CSS\Post::update()`** |
| **`batch-build-page` PHP Fatal: Class "Guards" not found** | **AdrianV2-Plugin veraltet/anders** (Guards fehlt im Plugin-Code) | **Schritt 9a Guards-Check → Fallback-Pfad 10a-c (`create-post`+`set-content`)** |
| **`set-content` Error: `content` ist erforderliche Eigenschaft** | **Parameter heißt `content`, nicht `elements`** | **siehe framer-v4-pipeline.md Schritt 9a (Ability-Parameter-Tabelle)** |
| **`nav` als Tag invalid in e-flexbox** | **Tag-Enum unterstützt nur: div,header,section,article,aside,footer,a,button** | **`sanitizeContainerTag()` in convert-xml-to-v4.js aktiv (P2-A)** |
| **Falsche XML produziert komplett falschen V4-Build** | **`homepage.xml` gehört zu anderem Framer-Projekt** | **`node scripts/preflight/verify-xml-project-match.js --xml ... --target-url ...`** |
| **XML ohne `framer-project-id` Kommentar** | **Konsistenz fehlt** | **Kommentar ergänzen + Skript erneut ausführen (siehe `verify-xml-project-match.js` Output)** |
| **Unframer MCP nicht erreichbar** | **Sandbox-Allowlist / 5s Timeout / HTTP-Fehler** | **`node scripts/preflight/check-unframer-connectivity.js` — Fallback A/B/C in dual-source-workflow.md** |
| **MCP-Server 4-Min-Timeout (alle Calls)** | **Novamira-WP-Plugin abgestürzt oder hängt** | **MCP-Resilienz-Strategie unten (P3-D)** |

## MCP-Resilienz-Strategie (NEU — SCHWÄCHE 10 / P3-D)

### Symptom

Alle (oder mehrere) MCP-Calls laufen in 4-Minuten-Timeout. Outputs kommen gar nicht oder nur teilweise zurück. Auch einfache Calls wie `discover-abilities` betroffen.

### Mögliche Ursache

Der MCP-Server (Novamira PHP-Plugin im WP) ist abgestürzt oder hängt. Häufige Auslöser: OOM, PHP-FPM-Pool ausgelastet, lange vorherige Calls ohne sauberes Cleanup, gleichzeitige Calls aus mehreren Agenten.

### Diagnose (Pflicht vor Recovery)

```bash
# Schritt 1: Einfachster möglicher Test-Call
Tool: novamira-adrianv2/greet
Parameters: { name: "test" }

# Antwortet schnell?   → nur die spezifische Ability war kaputt (Bug im Plugin)
# Timeout?             → MCP-Server down — Recovery unten
```

### Recovery-Pfad (in dieser Reihenfolge versuchen)

```
A. Claude Desktop neu starten (reconnect, neue Session)
   → Bei Erfolg: session-start-checklist.md Schritt 1-5 neu durchlaufen
   → KEIN Effekt? Weiter mit B.

B. WP-Admin → Plugins → Novamira deaktivieren + reaktivieren
   → Bei Erfolg: Schritt 1-5 neu durchlaufen (frische GV/GC-IDs!)
   → KEIN Effekt? Weiter mit C.

C. PHP-FPM-Prozesse neu starten
   → NUR möglich wenn SSH-Zugriff zum Server
   → Auf solar.local via LocalWP: Stop + Start in der LocalWP UI
   → Auf test4: Service-Management via Hosting-Panel oder SSH
```

### Retry-Logik für Pipeline-Scripts (Best Practice)

```javascript
// scripts/lib/mcp-retry.js (Pattern für eigene Scripts)
async function mcpCallWithRetry(abilityName, params, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000); // 30s pro Versuch
      const result = await mcp.call(abilityName, params, { signal: ctrl.signal });
      clearTimeout(t);
      return result;
    } catch (e) {
      if (e.name === 'AbortError') {
        // Timeout — bei attempt 0/1: retry (könnte temporäre Last sein)
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); // 2s, 4s backoff
          continue;
        }
      }
      throw e; // andere Fehler: kein Retry
    }
  }
}
```

Wichtig: Retry nur für **Timeout**-Cases, **nicht** für andere Fehler (z.B. 500 PHP Fatal → Retry macht es schlimmer, nicht besser).

### Vermeidung (Best Practice im Build)

1. **Große Calls splitten:** Statt `elementor-set-content` mit 5000 Nodes → `build-dependency-graph.js` → Sections einzeln.
2. **Nicht-parallele MCP-Calls:** Mehrere Calls parallel aus demselben Agent überlasten den PHP-FPM-Pool. Sequentiell halten oder throttle.
3. **Nach `batch-build-page` IMMER 2-3s warten** bevor nächster Call.

---

## Quick-Reference: Welcher Preflight-Script hilft bei welchem Build-Fehler?

| Fehler-Symptom                          | Preflight-Script                                          | Pflicht in Phase 0 / Session-Start? |
|----------------------------------------|-----------------------------------------------------------|-------------------------------------|
| `Class "Guards" not found` Fatal       | `novamira/execute-php { class_exists(...) }` (in Schritt 2b) | Schritt 2b — Session-Start          |
| Seite blank trotz `runtime_available:true` | `ensure-elementor-experiments.js --post-id ID`         | Schritt 2c — Session-Start          |
| V4-Tree passt nicht zur Framer-Seite   | `verify-xml-project-match.js --xml ... --target-url ...`  | Phase 0 (vor Phase 2 Extraction)    |
| Pipeline scheitert in Phase 1 (kein XML) | `check-unframer-connectivity.js` → Fallback A/B/C        | Phase 0 (vor Phase 1 MCP-Aufrufen) |
| C6-Substitution oder G3-Guard Failure  | Kein eigener Preflight (Standard Phase 2)                 | —                                    |
| Post-Build: Seite blank trotz OK-Build | `rendering sanity check` (post-build-qa.md Schritt 0) + Schritt 11 | Post-Build (Pflicht)                 |

→ **Empfehlung:** Vor jedem Wizard-Start:
```bash
node scripts/preflight/ensure-elementor-experiments.js --dry-run
node scripts/preflight/check-unframer-connectivity.js
node scripts/preflight/verify-xml-project-match.js --xml tools/framer-export/homepage.xml --target-url <URL>
```
