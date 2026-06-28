---
slug: session-start-checklist
title: Session-Start Checkliste
description: Pflicht-Checkliste für den Beginn jeder Claude Desktop Session mit Novamira MCP. Definiert welche Checks, Calls und Verifikationen vor dem ersten Pipeline-Schritt durchgeführt werden müssen. Verhindert stale Session IDs, fehlende MCP-Verbindungen und falsche GV/GC-Referenzen.
version: "0.7.0"
pipeline_min_version: "0.7.0"
tags: [session, checklist, mcp, preflight, solar-local, setup]
---

# Session-Start Checkliste

## Wann diesen Skill verwenden
IMMER am Beginn einer neuen Claude Desktop Session, bevor irgendein Pipeline-Script,
MCP-Call oder Elementor-Build gestartet wird. Auch nach einer Pause von >30 Minuten
(Session-Timeout) oder wenn ein MCP-Call unerwartet mit 401/419 antwortet.

---

## Kritische Invarianten

- `adrians-setup-v4-foundation` gibt Session-live IDs zurück — diese ändern sich bei jedem Call
- GV-IDs (`e-gv-*`) und GC-IDs (`gc-*`) aus der letzten Session sind UNGÜLTIG
- MCP-Session-TTL: ~25–30 Minuten — danach neu initialisieren
- Beim ersten 401 oder 419: sofort neu initialisieren, nicht wiederholen

---

## 5-Schritt Checkliste (in dieser Reihenfolge)

### ✅ Schritt 1 — MCP-Verbindung verifizieren

Prüfe ob `novamira-solar-local` ansprechbar ist:

```
Tool: novamira-solar-local:mcp-adapter-discover-abilities
Parameters: {}
```

**Erwartetes Ergebnis:** Liste von ≥100 Abilities. Mindestens diese müssen vorhanden sein:
- `novamira/adrians-setup-v4-foundation`
- `novamira/elementor-set-content`
- `novamira/adrians-export-design-system`
- `novamira-adrianv2/adrians-code-injector`

**Bei Fehler (Verbindung tot):**
1. LocalWP → `solar.local` läuft? → starten
2. Claude Desktop neu starten
3. `.mcp.json` Credentials prüfen

---

### ✅ Schritt 2b — AdrianV2 Guards-Klasse verfügbar? [NEU — P1-B]

**Hintergrund:** Ohne `Novamira\AdrianV2\Helpers\Guards` schlagen alle
`novamira-adrianv2/adrians-*` Abilities mit PHP Fatal fehl
(`Class "Novamira\AdrianV2\Guards" not found`).
Betroffen u.a.: `batch-build-page`, `page-settings`, `batch-create-variables`,
`patch-element-styles`. Dann muss der Fallback-Pfad genutzt werden.

```bash
Tool: novamira-solar-local:mcp-adapter-execute-ability
ability_name: "novamira/execute-php"
parameters:
  code: "return class_exists('Novamira\\AdrianV2\\Helpers\\Guards') ? 'OK' : 'FEHLT';"
```

**Bei `OK`:** Weiter mit Schritt 2c.

**Bei `FEHLT`:** Fallback-Pfad aktivieren (siehe `framer-v4-pipeline.md` Schritt 9a):

1. `novamira/create-post` (title, slug, status, post_type: page)
2. `novamira/execute-php` → `_wp_page_template` setzen (z.B. `elementor_canvas`)
3. `novamira/elementor-set-content` (Parameter: `content`, `post_id` — **Array!**)

In `SESSION-STATE.md` vermerken: `BATCH_BUILD_PAGE_UNAVAILABLE=true`.

### ✅ Schritt 2c — V4-Experiments aktiv? [NEU — P1-A / BLOCKADE 4]

**Hintergrund:** Ohne `e_atomic_elements` rendern V4-Widgets nicht (HTTP 200,
leerer Body, kein Konsolen-Error). `elementor-check-setup` bestätigt nur
`atomic.runtime_available: true` (PHP-Klassen geladen), prüft aber NICHT
ob die Experimente aktiv sind. Daher separater Gate.

Pflicht-Experiments:
- `e_atomic_elements` (V4 Atomic Widgets)
- `e_opt_in_v4`       (V4 Rendering-Stack)
- `e_variables`       (e-gv-* Variablen-Auflösung)
- `e_classes`         (Global Classes gc-*)

```bash
# Preflight-Script mit MCP auto-call:
node scripts/preflight/ensure-elementor-experiments.js --post-id TARGET_POST_ID

# Dry-Run (nur Status):
node scripts/preflight/ensure-elementor-experiments.js --dry-run
```

**Erwartetes Ergebnis (dry-run):**
```json
{
  "ok": true, "dry_run": true,
  "state": {
    "e_atomic_elements": { "is_active": true,  "in_options": "active" },
    "e_opt_in_v4":       { "is_active": true,  "in_options": "active" },
    "e_variables":       { "is_active": true,  "in_options": "active" },
    "e_classes":         { "is_active": true,  "in_options": "active" }
  }
}
```

Wenn `activated: ["..."]` zurückgegeben → Scripts hat die Experimente
gerade aktiviert; CSS-Cache wurde ebenfalls neu gebaut (wenn `--post-id`).

**Bekannte Einschränkung — e_css_grid:** Hat `release_status: "dev"`.
Aktivierung via Option wird von Elementor auf Default "inactive"
zurückgesetzt. Workaround im Build: `grid-template-columns` als
`$$type:"string"` Style-Prop setzen — CSS rendert trotzdem inline.

Siehe auch `style-props-quickref.md` ("Container-Tag Enums") und
`post-build-qa.md` Schritt 0 (Rendering-Sanity).

### ✅ Schritt 2 — V4 Atomic Runtime verfügbar?

```
node scripts/check-v4-requirements.js --auto-call
```

oder manuell:

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/elementor-check-setup"
  parameters: {}
```

**Erwartetes Ergebnis:**
```json
{
  "atomic": {
    "runtime_available": true,
    "global_classes_available": true,
    "variables_available": true
  }
}
```

**Bei `runtime_available: false`:**
→ Elementor V4 / Atomic Widgets nicht aktiv. Build STOPPEN.
→ In WP-Admin: Elementor → Experimentelle Features → Atomic Widgets aktivieren.

---

### ✅ Schritt 3 — Foundation aufrufen (frische IDs holen)

**IMMER am Session-Start, NIEMALS aus Memory oder Cache:**

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/adrians-setup-v4-foundation"
  parameters: { "post_id": TARGET_POST_ID }
```

**Merke die zurückgegebenen IDs:**
```json
{
  "classes": {
    "s-hero": "gc-a1b2c3d4e5f6",
    "s-features": "gc-b2c3d4e5f678"
  },
  "variables": {
    "color-primary": "e-gv-c3d4e5f6a1b2",
    "font-heading": "e-gv-d4e5f6a1b2c3"
  }
}
```

Diese IDs sind ab jetzt die einzig gültigen für diese Session.
Alle anderen IDs (aus Memory, BLUEPRINT.md, SESSION-STATE.md) sind potentiell veraltet.

---

### ✅ Schritt 4 — WPCode aktiv? (nur bei Animations-Workflow)

Nur relevant wenn Snippets injiziert werden sollen:

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/execute-php"
  parameters:
    code: "return post_type_exists('wpcode_snippet') ? 'active' : 'inactive';"
```

**Bei `inactive`:** WPCode-Plugin in WP-Admin aktivieren.

---

### ✅ Schritt 5 — Design-System exportieren (optional, aber empfohlen)

Für alle Builds die mit Tokens/Farben/Fonts arbeiten:

```
Tool: novamira-solar-local:mcp-adapter-execute-ability
Parameters:
  ability_name: "novamira/adrians-export-design-system"
  parameters: { "what": "all" }
```

→ Als `design-system-export.json` speichern (oder McpDesignSystemCache verwenden).

> **Cache erlaubt:** `adrians-export-design-system` ist read-only, ändert sich nicht
> während einer Session. `McpDesignSystemCache` cached 5 Minuten (`.pipeline/design-system.json`).

---

## Session-Wiederherstellung nach Timeout (401/419)

Wenn ein MCP-Call mit HTTP 401 oder 419 antwortet:

```
1. mcp-bridge.js initialisiert automatisch neu (session handshake)
2. adrians-setup-v4-foundation ERNEUT aufrufen → neue GV/GC-IDs
3. Laufenden Build-Schritt von vorne beginnen (IDs sind ungültig)
4. NIEMALS die alten IDs wiederverwenden
```

---

## Environment-Map (solar.local)

| Was | Wert |
|-----|------|
| MCP-Endpoint | `http://solar.local/wp-json/mcp/novamira` |
| Protokoll | JSON-RPC 2.0 mit `Mcp-Session-Id` Header |
| Auth | `Authorization: Basic <base64(user:app-password)>` |
| Session-TTL | ~25–30 Minuten |
| Config-Datei | `.mcp.json` (nicht im Repo, in .gitignore) |
| Config-Beispiel | `mcp-server-config.example.json` |
| MCP-Server-Name in Claude Desktop | `novamira-solar-local` |

---

## Schnell-Referenz: Was ist session-live, was ist stabil?

| Daten | Status | Caching erlaubt? |
|-------|--------|-----------------|
| GV-IDs (`e-gv-*`) | Session-live | ❌ Niemals |
| GC-IDs (`gc-*`) | Session-live | ❌ Niemals |
| Design-System Export | Read-only | ✅ 5 Minuten |
| Ability-Liste | Stabil | ✅ 1 Stunde |
| Post-ID einer Seite | Stabil | ✅ Dauerhaft |
| Elementor-Content-Dump | Snapshot | ✅ Für aktuellen Build |

---

## Typische Session-Abfolge

```
[Session-Start]
  │
  ├── 1.  mcp-adapter-discover-abilities      → Verbindung OK?
  ├── 2.  elementor-check-setup               → V4 runtime_available?
  ├── 2b. AdrianV2 Guards verfuegbar?         → class_exists Check [NEU P1-B]
  ├── 2c. ensure-elementor-experiments        → 4 Pflicht-Experiments aktiv? [NEU P1-A]
  ├── 3.  adrians-setup-v4-foundation         → Frische GV/GC-IDs
  ├── 4.  (optional) wpcode check             → WPCode aktiv?
  └── 5.  adrians-export-design-system        → Token-Basis für Build
         │
         └── [Build starten → framer-v4-pipeline Skill]
```

**WICHTIG:** Schritt 2b vor 2c! Wenn Guards fehlen, scheitern viele
Abilities im Build — daher zuerst checken, dann ggf. Fallback-Pfad.
