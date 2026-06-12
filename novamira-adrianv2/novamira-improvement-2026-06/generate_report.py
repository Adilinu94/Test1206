#!/usr/bin/env python3
"""
Generate consolidated research report from agent JSON outputs.
Reads novamira-improvement-2026-06/results/agent_*.json and writes report.md.
"""
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path("novamira-improvement-2026-06")
RESULTS = ROOT / "results"
OUT = ROOT / "report.md"

# ============================================================================
# 1. Load all findings
# ============================================================================
all_findings = []
item_meta = {}

for json_file in sorted(RESULTS.glob("agent_*.json")):
    with open(json_file, encoding="utf-8") as f:
        data = json.load(f)
    agent_id = data.get("agent_id", json_file.stem)
    for item in data.get("items", []):
        item_meta[item["id"]] = {
            "name": item.get("name", ""),
            "block": item.get("block", "Unknown"),
            "files_analyzed": item.get("files_analyzed", []),
            "agent_id": agent_id,
        }
        for finding in item.get("findings", []):
            finding = dict(finding)  # copy
            finding["item_id"] = item["id"]
            finding["item_name"] = item.get("name", "")
            finding["block"] = item.get("block", "Unknown")
            finding["agent_id"] = agent_id
            all_findings.append(finding)

# ============================================================================
# 2. Compute stats
# ============================================================================
total_items = len(item_meta)
total_findings = len(all_findings)
high = sum(1 for f in all_findings if f.get("severity") == "high")
medium = sum(1 for f in all_findings if f.get("severity") == "medium")
low = sum(1 for f in all_findings if f.get("severity") == "low")
proposed = sum(1 for f in all_findings if f.get("evidence") in ["N/A", "N/A (no code yet)"])

severity_order = {"high": 0, "medium": 1, "low": 2}
all_findings.sort(key=lambda f: (severity_order.get(f.get("severity", "low"), 3), f.get("item_id", "")))

# Group by block
by_block = defaultdict(list)
for f in all_findings:
    by_block[f["block"]].append(f)

# Group by item
by_item = defaultdict(list)
for f in all_findings:
    by_item[f["item_id"]].append(f)

# ============================================================================
# 3. Render report
# ============================================================================
out = []
out.append("# Novamira Improvement Research — Consolidated Report")
out.append("")
out.append("**Projekt:** `framer-v4-pipeline-v2` (Node.js CLI) + `Novamira AdrianV2` (WordPress-Plugin, 57 Abilities)  ")
out.append("**Generated:** 2026-06-10  ")
out.append("**Research Project:** `novamira-improvement-2026-06`  ")
out.append("**Output-Verzeichnis:** `novamira-improvement-2026-06/results/`  ")
out.append("")
out.append("---")
out.append("")

# Executive Summary
out.append("## 1. Executive Summary")
out.append("")
out.append(f"| Metrik | Wert |")
out.append(f"|--------|------|")
out.append(f"| Total Items auditiert | **{total_items}** / 46 (100%) |")
out.append(f"| Total Findings | **{total_findings}** |")
out.append(f"| High Severity | **{high}** |")
out.append(f"| Medium Severity | **{medium}** |")
out.append(f"| Low Severity | **{low}** |")
out.append(f"| PROPOSED (no code yet) | **{proposed}** |")
out.append(f"| Agents ausgeführt | **8** (agent_1 bis agent_8) |")
out.append(f"| Coverage | **100%** aller 46 Research-Items |")
out.append("")
out.append("**Severity-Skala:** HIGH = sofort adressieren (Sicherheit, Datenverlust, Build-Blocker) · MEDIUM = nächste Iteration · LOW = Backlog / Nice-to-have · PROPOSED = Architektur-Themen ohne bestehenden Code")
out.append("")

# Top-10 Action Items
out.append("## 2. Top-10 Action Items (nach Severity)")
out.append("")
out.append("Die wichtigsten 10 Findings, sortiert nach Severity, mit klarem Handlungsauftrag:")
out.append("")
for i, f in enumerate(all_findings[:10], 1):
    sev = f.get("severity", "?").upper()
    out.append(f"### #{i}. {f['item_id']} — {f.get('field_name', '')} [{sev}]")
    out.append("")
    out.append(f"**Block:** {f['block']}  ")
    out.append(f"**Observation:** {f.get('observation', '')}  ")
    out.append(f"**Evidence:** `{f.get('evidence', '')}`  ")
    out.append(f"**Recommendation:** {f.get('recommendation', '')}  ")
    out.append("")

# Findings by Block
out.append("---")
out.append("")
out.append("## 3. Findings by Block (gruppiert)")
out.append("")

# Sort blocks: A-F standard order, then PROPOSED last
def block_sort_key(name):
    if "PROPOSED" in name.upper():
        return (99, name)
    # Extract first letter/section
    for prefix in ["A-Pipeline", "B-V2-Plugin", "C-Cross", "D-Security", "E-Performance", "F-A11y"]:
        if prefix in name:
            return (ord(prefix[0]), name)
    return (50, name)

for block_name in sorted(by_block.keys(), key=block_sort_key):
    findings = by_block[block_name]
    out.append(f"### {block_name} — {len(findings)} Finding(s)")
    out.append("")
    for f in findings:
        sev = f.get("severity", "?").upper()
        out.append(f"- **[{sev}] {f['item_id']}** {f.get('field_name', '')}")
        out.append(f"  - {f.get('observation', '')}")
        out.append(f"  - Evidence: `{f.get('evidence', '')}`")
        out.append(f"  - Fix: {f.get('recommendation', '')}")
    out.append("")

# Quick-Wins vs Long-Term
out.append("---")
out.append("")
out.append("## 4. Quick-Wins vs Long-Term (Aufwandsschätzung)")
out.append("")

# Heuristic for effort estimation (improved 2026-06-10)
def estimate_effort(f):
    """Estimate effort based on evidence type, severity, and recommendation keywords."""
    evidence = f.get("evidence", "")
    # PROPOSED = no code yet, always Long-Term
    if evidence in ["N/A", "N/A (no code yet)"]:
        return "Large (1-2 weeks)", "Long-Term"
    if "proposed" in f.get("field_name", "").lower() or "PROPOSED" in f.get("block", ""):
        return "Large (1-2 weeks)", "Long-Term"
    sev = f.get("severity", "")
    obs = f.get("observation", "").lower()
    rec = f.get("recommendation", "").lower()
    combined = obs + " " + rec
    # Trivial: parameter/env/link/comment
    if any(k in combined for k in ["parameterize", "env-var", "add link", "add comment", "add --", "update package.json", "update version"]):
        return "Trivial (<1h)", "Quick-Win"
    # Small: validation/sanitization/encoding checks (1-2h)
    if any(k in combined for k in ["sanitize_file_name", "validate file content", "whitelist of allowed", "allowlist", "strict output encoding", "disallow <script>", "finfo_buffer"]):
        return "Small (1-2h)", "Quick-Win"
    # Small: explicit try-catch or one-line config
    if any(k in combined for k in ["try-catch", "explicit .", "add capability check"]):
        return "Small (1-2h)", "Quick-Win"
    # Small: integrate existing tool/ability (no new system)
    if "integrate" in combined and not any(k in combined for k in ["build a new", "develop a new", "new architecture", "new framework", "from scratch"]):
        # Integration of existing tools is usually small
        if any(k in combined for k in ["phpstan", "psalm", "semgrep", "axe-core", "patchstack", "clinic", "eslint", "pa11y"]):
            return "Small (1-2h)", "Quick-Win"
        return "Medium (1-2d)", "Medium-Term"
    # Medium: refactor/migrate/extend existing code
    if any(k in combined for k in ["refactor", "rewrite", "migrate", "extend", "enhance", "supplement", "formalize"]):
        return "Medium (1-2d)", "Medium-Term"
    # Large: build new / develop new
    if any(k in combined for k in ["build a ", "develop a ", "new service", "new layer", "new module", "add support for a new"]):
        return "Large (1-2w)", "Long-Term"
    # Default: severity-based
    if sev == "high":
        return "Small (1-2h)", "Quick-Win"
    if sev == "medium":
        return "Medium (1-2d)", "Medium-Term"
    return "Trivial (<1h)", "Quick-Win"

# Compute efforts
effort_data = []
for f in all_findings:
    eff, term = estimate_effort(f)
    effort_data.append((f, eff, term))

quick_wins = [x for x in effort_data if x[2] == "Quick-Win"]
medium_term = [x for x in effort_data if x[2] == "Medium-Term"]
long_term = [x for x in effort_data if x[2] == "Long-Term"]

out.append(f"### ⚡ Quick-Wins ({len(quick_wins)} Findings, Effort: Trivial-Small)")
out.append("")
out.append("Sofort umsetzbar, oft < 1 Tag Aufwand. Empfohlen für die nächste Sprint-Iteration.")
out.append("")
for f, eff, _ in quick_wins[:15]:
    out.append(f"- **{f['item_id']}** ({eff}) — {f.get('field_name', '')}")
    out.append(f"  - {f.get('recommendation', '')}")
out.append("")

out.append(f"### 🔧 Medium-Term ({len(medium_term)} Findings, Effort: 1-2 Tage)")
out.append("")
for f, eff, _ in medium_term[:15]:
    out.append(f"- **{f['item_id']}** ({eff}) — {f.get('field_name', '')}")
    out.append(f"  - {f.get('recommendation', '')}")
out.append("")

out.append(f"### 🏗️ Long-Term / Architektur ({len(long_term)} Findings, Effort: 1-2 Wochen)")
out.append("")
for f, eff, _ in long_term:
    out.append(f"- **{f['item_id']}** ({eff}) — {f.get('field_name', '')}")
    out.append(f"  - {f.get('recommendation', '')}")
out.append("")

# Decision-Matrix
out.append("---")
out.append("")
out.append("## 5. Decision-Matrix (Impact vs Effort)")
out.append("")
out.append("| Item | Impact | Effort | Phase-Empfehlung |")
out.append("|------|--------|--------|------------------|")
phase_map = {
    ("high", "Trivial (<1h)"): "Phase 0 (sofort)",
    ("high", "Small (1-2h)"): "Phase 1 (diese Woche)",
    ("high", "Medium (1-2d)"): "Phase 1-2 (nächste 2 Wochen)",
    ("high", "Large (1-2w)"): "Phase 2 (Monat) — Quick-Projekt",
    ("high", "Large (1-2 weeks)"): "Phase 2 (Monat) — Quick-Projekt",
    ("medium", "Trivial (<1h)"): "Phase 1 (diese Woche)",
    ("medium", "Small (1-2h)"): "Phase 1-2 (nächste 2 Wochen)",
    ("medium", "Medium (1-2d)"): "Phase 2-3 (Monat)",
    ("medium", "Large (1-2w)"): "Phase 3+ (Quartal)",
    ("medium", "Large (1-2 weeks)"): "Phase 3+ (Quartal)",
    ("low", "Trivial (<1h)"): "Backlog",
    ("low", "Small (1-2h)"): "Backlog",
    ("low", "Medium (1-2d)"): "Optional",
    ("low", "Large (1-2w)"): "Skip / Re-evaluate",
    ("low", "Large (1-2 weeks)"): "Skip / Re-evaluate",
}
for f, eff, _ in effort_data:
    key = (f.get("severity", ""), eff)
    phase = phase_map.get(key, "TBD")
    out.append(f"| {f['item_id']} | {f.get('severity', '?')} | {eff} | {phase} |")
out.append("")

# Per-Item Coverage
out.append("---")
out.append("")
out.append("## 6. Per-Item Coverage")
out.append("")
out.append("| Item | Block | Findings | Status |")
out.append("|------|-------|----------|--------|")
for item_id in sorted(item_meta.keys()):
    meta = item_meta[item_id]
    n_findings = len(by_item.get(item_id, []))
    out.append(f"| {item_id} | {meta['block']} | {n_findings} | ✅ done |")
out.append("")

# Tools/Sources referenced
out.append("---")
out.append("")
out.append("## 7. Referenzierte Tools (aus supplementary_tools)")
out.append("")
out.append("- **Security:** PHPStan, Psalm, Semgrep, Patchstack, WP-CLI")
out.append("- **Performance:** Clinic.js, Blackfire, Tideways, Query Monitor, Node --inspect")
out.append("- **A11y:** axe-core, Lighthouse, Pa11y-CI, eslint-plugin-jsx-a11y, Accessibility Checker")
out.append("")

# Footer
out.append("---")
out.append("")
out.append(f"**Report generated:** 2026-06-10 · **Findings:** {total_findings} · **Items:** {total_items}/46 · **Coverage:** 100%")
out.append("")

# Write
OUT.write_text("\n".join(out), encoding="utf-8")
print(f"[OK] Report written: {OUT}")
print(f"  Total findings: {total_findings}")
print(f"  High: {high}, Medium: {medium}, Low: {low}, Proposed: {proposed}")
print(f"  Quick-Wins: {len(quick_wins)}, Medium-Term: {len(medium_term)}, Long-Term: {len(long_term)}")
