# STATE — framer-v4-pipeline-v2

> **Letztes Update:** 2026-06-13 — GSD-Projekt initialisiert

---

## Aktueller Status

```
Phase:     Sprint 1 (bereit)
Branch:    main
HEAD:      48d044e (fix(runde-2): namespace-korrektur, 4 neue PHP-Abilities...)
Tests:     49/49 ✅
Remote:    origin https://github.com/Adilinu94/Test1206.git
```

---

## Aktiver Fokus

**Sprint 1 — Quick Wins + Root-Cause Fix (~5h)**

1. ENH-1 (C2): Strict Grid Mapping in `convert-xml-to-v4.js`
2. ENH-2 (C4): Semantic GC Naming in `generate-global-classes.js`
3. ENH-3 (C5): Breakpoint-bewusstes Scaling in `auto-scale-responsive.js`
4. ENH-4 (C6): Token-zu-GV-Substitutions-Pass (Root-Cause Fix)
5. VAL-1 (D3): GRID_VS_FLEXBOX_COVERAGE in `validate-v4-tree.js`
6. Tests: 5 neue Test-Blöcke → 49→54

---

## Bekannte Issues

| Issue | Schwere | Status |
|-------|---------|--------|
| `#111111 × 45` Hardcoded-Hex | 🔴 Kritisch | Wird durch C6 gefixt |
| DOM-Tiefe 8 | 🔴 Kritisch | Teilfix in Sprint 1, vollständig in Sprint 2 |
| 0% Global Classes | 🔴 Kritisch | GC-Generator existiert, muss nur ausgeführt werden |
| auto-scale nutzt Hardcode-Faktoren | 🟡 Mittel | Wird durch C5 gefixt |
| Keine Components | 🟡 Mittel | Sprint 2 (A1 + C1) |
| Keine nativen Interaktionen | 🟡 Mittel | Sprint 2 (C3) |
| Keine Atomic Forms | 🟢 Niedrig | Sprint 3 (A3 + B4) |

---

## Letzte Änderungen

- **2026-06-13**: Repo auf Test1206 HEAD (48d044e) aktualisiert
- **2026-06-13**: V4_DESIGN_IMPROVEMENTS_RESEARCH.md v2 — Analyse integriert, Sprints umgeordnet
- **2026-06-13**: GSD-Projekt initialisiert (.planning/)

---

## Offene Entscheidungen

- [ ] C6: Eigenes Script oder Pass in `convert-xml-to-v4.js`?
- [ ] D2: `--animation-plan` Flag oder Wizard-Integration?

---

## Nächster Schritt

```
/gsd-plan-phase 1     # Sprint 1 detailliert planen
/gsd-execute-phase 1  # Sprint 1 ausführen
```
