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
  ├── 1. mcp-adapter-discover-abilities      → Verbindung OK?
  ├── 2. elementor-check-setup               → V4 runtime_available?
  ├── 3. adrians-setup-v4-foundation         → Frische GV/GC-IDs
  ├── 4. (optional) wpcode check             → WPCode aktiv?
  └── 5. adrians-export-design-system        → Token-Basis für Build
         │
         └── [Build starten → framer-v4-pipeline Skill]
```
