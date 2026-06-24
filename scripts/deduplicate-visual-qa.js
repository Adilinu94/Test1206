#!/usr/bin/env node
/**
 * deduplicate-visual-qa.js
 *
 * FIX 1: Overlap-Deduplizierung für adrians-visual-qa Output.
 *
 * Das Problem:
 *   adrians-visual-qa meldet absolute-positioned Siblings paarweise (N*(N-1)/2).
 *   15 Siblings in einem Container → 105 "Potential overlap" Meldungen.
 *   Das sind 105 identisch klingende info-Zeilen für EIN Problem.
 *   Ein Agent der das liest, verliert die echten Fehler im Rauschen.
 *
 * Diese Lösung:
 *   Gruppiert alle overlap-Issues nach parent-Container (erkannt via shared element IDs),
 *   de-dupliziert sie zu einer einzigen Zusammenfassung pro Container-Gruppe,
 *   und gibt den bereinigten QA-Report aus — mit echten Fehlern oben.
 *
 * Außerdem: Berechnet einen Signal-Rausch-Verhältnis-Score.
 *   Deduplizierungsrate = (vorher - nachher) / vorher * 100
 *
 * Usage:
 *   # Pipe aus MCP-Aufruf:
 *   node scripts/deduplicate-visual-qa.js --input qa-raw.json --output qa-clean.json
 *
 *   # Mit Post-ID direkt (wenn adrians-visual-qa bereits aufgerufen wurde):
 *   node scripts/deduplicate-visual-qa.js --input qa-raw.json
 *
 *   # Verbose: zeigt auch die zusammengefassten Overlap-Gruppen
 *   node scripts/deduplicate-visual-qa.js --input qa-raw.json --verbose
 *
 * Exit codes:
 *   0 = keine errors oder warnings (nur info)
 *   1 = echte errors oder warnings vorhanden
 *   2 = Input-Fehler
 */

'use strict';

import { parseArgs }                         from 'node:util';
import { readFileSync, writeFileSync,
         mkdirSync, existsSync }             from 'node:fs';
import { resolve, dirname }                  from 'node:path';
import { fileURLToPath }                     from 'node:url';

// ── Modul-Export — importierbar ohne CLI-Ausfuehrung ──────────────────────────
export function deduplicateVisualIssues(rawIssues) {
  const overlapIssues    = (rawIssues || []).filter(i => i.type === 'overlap');
  const nonOverlapIssues = (rawIssues || []).filter(i => i.type !== 'overlap');

  const adjacency = new Map();
  for (const issue of overlapIssues) {
    const match   = issue.message?.match(/#([0-9a-f]+)/i);
    const sibling = match?.[1];
    const self    = issue.element_id;
    if (!self || !sibling) continue;
    if (!adjacency.has(self))    adjacency.set(self, new Set());
    if (!adjacency.has(sibling)) adjacency.set(sibling, new Set());
    adjacency.get(self).add(sibling);
    adjacency.get(sibling).add(self);
  }

  const visited = new Set();
  const groups  = [];
  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) continue;
    const group = new Set();
    const queue = [startId];
    while (queue.length > 0) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id); group.add(id);
      for (const neighbor of (adjacency.get(id) ?? [])) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    groups.push(group);
  }

  const dedupedOverlaps = groups.map(group => ({
    type: 'overlap-group',
    element_ids: [...group],
    pair_count: (group.size * (group.size - 1)) / 2,
    severity: 'warning',
    message: `Overlap-Gruppe: ${group.size} Elemente (${(group.size * (group.size - 1)) / 2} Paare)`,
  }));

  return [...nonOverlapIssues, ...dedupedOverlaps];
}

// ── CLI-Guard: nur ausfuehren wenn direkt aufgerufen ─────────────────────────
const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {

const { values: args } = parseArgs({
  options: {
    input:   { type: 'string' },
    output:  { type: 'string' },
    verbose: { type: 'boolean', default: false },
    help:    { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help || !args.input) {
  process.stdout.write(`
deduplicate-visual-qa.js — Overlap-Deduplizierung für adrians-visual-qa

USAGE:
  node scripts/deduplicate-visual-qa.js --input <qa-raw.json> [--output <qa-clean.json>]

OPTIONEN:
  --input FILE    Raw JSON output von novamira/adrians-visual-qa (required)
  --output FILE   Bereinigter Report  [default: stdout]
  --verbose       Zeigt auch deduplizierte Overlap-Gruppen Details
  --help          Diese Hilfe

WAS ES TUT:
  N*(N-1)/2 Overlap-Pairs → 1 Zusammenfassung pro Container-Gruppe
  Echte errors/warnings bleiben vollständig erhalten
  Gibt Signal-Rausch-Verhältnis aus

EXIT:
  0 = nur info-Issues (kein Handlungsbedarf)
  1 = echte errors oder warnings vorhanden
  2 = Input-Fehler
`);
  process.exit(args.help ? 0 : 2);
}

// ─── Load input ───────────────────────────────────────────────────────────────

if (!existsSync(args.input)) {
  process.stderr.write(`FEHLER: Input nicht gefunden: ${args.input}\n`);
  process.exit(2);
}

let rawReport;
try {
  const raw = JSON.parse(readFileSync(args.input, 'utf8'));
  // Accept { data: {...} } wrapper or direct report
  rawReport = raw.data ?? raw;
} catch (e) {
  process.stderr.write(`FEHLER: Ungültiges JSON: ${e.message}\n`);
  process.exit(2);
}

const allIssues = rawReport.issues ?? [];

// ─── Split issues ────────────────────────────────────────────────────────────

const overlapIssues   = allIssues.filter(i => i.type === 'overlap');
const nonOverlapIssues = allIssues.filter(i => i.type !== 'overlap');

// ─── Deduplicate overlaps ─────────────────────────────────────────────────────
// Strategy: group by the SET of element IDs that appear together.
// Two elements that share a container produce many pairs — collapse to one group.

// Build adjacency: element_id → all sibling element_ids it overlaps with
const adjacency = new Map(); // element_id → Set<element_id>

for (const issue of overlapIssues) {
  // Extract the two element IDs from the message
  // Message format: "Potential overlap with \"widget_type\" (#abc123). Both are..."
  const match = issue.message?.match(/#([0-9a-f]+)/i);
  const sibling = match?.[1];
  const self    = issue.element_id;
  if (!self || !sibling) continue;

  if (!adjacency.has(self))    adjacency.set(self, new Set());
  if (!adjacency.has(sibling)) adjacency.set(sibling, new Set());
  adjacency.get(self).add(sibling);
  adjacency.get(sibling).add(self);
}

// Find connected components (containers) via union-find / BFS
const visited  = new Set();
const groups   = [];

for (const startId of adjacency.keys()) {
  if (visited.has(startId)) continue;
  // BFS
  const group   = new Set();
  const queue   = [startId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    group.add(id);
    for (const neighbor of (adjacency.get(id) ?? [])) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  groups.push(group);
}

// Build deduplicated overlap summaries
const deduplicatedOverlaps = groups.map((group, i) => {
  const elementIds   = [...group];
  const pairCount    = (elementIds.length * (elementIds.length - 1)) / 2;

  // Collect widget types from original issues
  const widgetTypes  = new Set();
  for (const issue of overlapIssues) {
    if (group.has(issue.element_id)) {
      // Extract widget type from message: "Potential overlap with "TYPE" (#id)"
      const typeMatch = issue.message?.match(/overlap with "([^"]+)"/);
      if (typeMatch) widgetTypes.add(typeMatch[1]);
      // Also grab from element_type if available
      if (issue.element_type && issue.element_type !== 'absolute-positioned') {
        widgetTypes.add(issue.element_type);
      }
    }
  }

  const types = [...widgetTypes].join(', ') || 'mixed';

  return {
    severity:     'info',
    type:         'overlap_group',
    group_index:  i + 1,
    element_count: elementIds.length,
    pair_count:   pairCount,
    element_ids:  elementIds,
    widget_types: [...widgetTypes],
    message:      `Container group ${i + 1}: ${elementIds.length} absolute-positioned siblings (${types}) — ${pairCount} potential overlap pairs. Intentional layout or review z-index/positioning.`,
    deduplicated_from: pairCount,
  };
});

// ─── Build clean report ───────────────────────────────────────────────────────

const cleanIssues = [
  ...nonOverlapIssues,          // all real errors/warnings first
  ...deduplicatedOverlaps,      // then the summarised overlap groups
];

const beforeCount = allIssues.length;
const afterCount  = cleanIssues.length;
const reduction   = beforeCount > 0
  ? Math.round((1 - afterCount / beforeCount) * 100)
  : 0;

const bySeverity = { error: 0, warning: 0, info: 0 };
for (const i of cleanIssues) bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;

const cleanReport = {
  ...rawReport,
  total_issues:          cleanIssues.length,
  total_issues_raw:      beforeCount,
  deduplication_stats: {
    before:            beforeCount,
    after:             afterCount,
    overlap_pairs_raw: overlapIssues.length,
    overlap_groups:    deduplicatedOverlaps.length,
    noise_reduction:   `${reduction}%`,
  },
  by_severity: bySeverity,
  issues:      cleanIssues,
};

// ─── Output ───────────────────────────────────────────────────────────────────

const json = JSON.stringify(cleanReport, null, 2);

if (args.output) {
  mkdirSync(dirname(resolve(args.output)), { recursive: true });
  writeFileSync(resolve(args.output), json, 'utf8');
}

process.stdout.write(json + '\n');

// ─── Human summary ────────────────────────────────────────────────────────────

const C = { reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', cyan: '\x1b[36m' };

process.stderr.write(`\n${C.bold}deduplicate-visual-qa.js${C.reset}\n\n`);
process.stderr.write(`  Issues vorher: ${C.yellow}${beforeCount}${C.reset}\n`);
process.stderr.write(`  Issues nachher: ${C.green}${afterCount}${C.reset}\n`);
process.stderr.write(`  Rausch-Reduktion: ${C.cyan}${reduction}%${C.reset}\n`);
process.stderr.write(`  Overlap-Paare → ${overlapIssues.length} Paare → ${deduplicatedOverlaps.length} Gruppen\n\n`);

if (bySeverity.error > 0) {
  process.stderr.write(`  ${C.red}${C.bold}${bySeverity.error} ERROR(S) — sofort beheben!${C.reset}\n`);
  for (const i of cleanIssues.filter(x => x.severity === 'error')) {
    process.stderr.write(`    ${C.red}✗${C.reset} [${i.type}] ${i.element_id ?? ''}: ${i.message}\n`);
  }
}
if (bySeverity.warning > 0) {
  process.stderr.write(`  ${C.yellow}${bySeverity.warning} WARNING(S)${C.reset}\n`);
  for (const i of cleanIssues.filter(x => x.severity === 'warning')) {
    process.stderr.write(`    ${C.yellow}⚠${C.reset} [${i.type}] ${i.element_id ?? ''}: ${i.message}\n`);
  }
}

if (args.verbose && deduplicatedOverlaps.length > 0) {
  process.stderr.write(`\n  ${C.cyan}Overlap-Gruppen:${C.reset}\n`);
  for (const g of deduplicatedOverlaps) {
    process.stderr.write(`    Gruppe ${g.group_index}: ${g.element_count} Elemente (${g.widget_types.join(', ')}) — ${g.pair_count} Paare\n`);
    if (args.verbose) process.stderr.write(`      IDs: ${g.element_ids.join(', ')}\n`);
  }
}

if (bySeverity.error === 0 && bySeverity.warning === 0) {
  process.stderr.write(`  ${C.green}✓ Keine echten Fehler — nur Info${C.reset}\n`);
}

process.stderr.write('\n');
process.exit(bySeverity.error > 0 || bySeverity.warning > 0 ? 1 : 0);

} // end isMain
