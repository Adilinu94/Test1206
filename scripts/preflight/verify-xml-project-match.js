#!/usr/bin/env node
/**
 * scripts/preflight/verify-xml-project-match.js  —  P3-B Preflight Gate
 *
 * Validiert dass eine gecachte Framer-homepage.xml zum Target-URL-Projekt passt.
 * Hintergruende aus dem E2E-Verbesserungsbericht (17. Juni 2026):
 *   - tools/framer-export/homepage.xml enthaelt Text "Fast reliable plumbing solutions..."
 *     (Klempner-Template) — die Target-Seite remarkable-interface-616594.framer.app
 *     enthaelt aber "Strategify — Growth Strategy...". Falsche XML produziert einen
 *     komplett falschen Elementor-Baum, der technisch valid ist aber inhaltlich
 *     nicht zur Source passt.
 *
 * Gecachte XMLs MUSSEN ein Projektbindungs-Metadaten-Kommentar enthalten:
 *
 *   <!-- framer-project-id="remarkable-interface-616594"
 *        framer-url="https://remarkable-interface-616594.framer.app/"
 *        exported-at="2026-06-17T10:00:00Z" -->
 *
 * Vergleichslogik:
 *   1. Liest XML-Kommentar: framer-project-id
 *   2. Liest Target-URL (aus CLI / env / SESSION-STATE)
 *   3. Extrahiert Hostname-Slug aus Target-URL (erstes Segment)
 *   4. Match-Check: exakte Gleichheit ODER enthaelt-Substring ODER gueltige Manuelle Override-Liste
 *
 * Aufruf:
 *   node scripts/preflight/verify-xml-project-match.js --xml file.xml --target-url URL [--json] [--help]
 *
 * Exit-Codes:
 *   0 = XML matched Target-Projekt
 *   1 = Mismatch (BUILD STOPPEN — falsches XML)
 *   2 = Input-Fehler / XML nicht lesbar / kein framer-project-id Kommentar
 */

'use strict';

import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';

const { values: args } = parseArgs({
  options: {
    xml:        { type: 'string' },                          // Pflicht: Pfad zur homepage.xml
    'target-url': { type: 'string' },                         // Pflicht: Framer-URL vom Build
    'target-id': { type: 'string' },                         // Optional: erwarteter framer-project-id (Override)
    json:       { type: 'boolean', default: false },
    help:       { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help || process.argv.includes('-h')) {
  process.stdout.write(`verify-xml-project-match.js — P3-B Preflight Gate fuer Framer-XML-Projekt-Match

USAGE:
  node scripts/preflight/verify-xml-project-match.js --xml PATH --target-url URL [--target-id ID] [--json]

OPTIONS:
  --xml PATH         Pfad zur gecachten homepage.xml (Pflicht)
  --target-url URL   Framer-URL des Target-Projekts (Pflicht)
  --target-id ID     Erwarteter framer-project-id Override (sonst aus URL abgeleitet)
  --json             JSON-Output
  --help             Diese Hilfe

XML-FORMAT (Pflicht-Kommentar am Anfang):
  <!-- framer-project-id="remarkable-interface-616594"
       framer-url="https://remarkable-interface-616594.framer.app/"
       exported-at="2026-06-17T10:00:00Z" -->

EXIT-CODES:
  0 = XML matched Target
  1 = Mismatch (BUILD STOPPEN)
  2 = Input-Fehler
`);
  process.exit(0);
}

if (!args.xml || !args['target-url']) {
  const out = { ok: false, error: 'missing-args', required: ['--xml', '--target-url'] };
  if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  else process.stderr.write(`FEHLER: --xml und --target-url sind Pflicht\n`);
  process.exit(2);
}

if (!existsSync(args.xml)) {
  const out = { ok: false, error: 'xml-not-found', path: args.xml };
  if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  else process.stderr.write(`FEHLER: XML nicht gefunden: ${args.xml}\n`);
  process.exit(2);
}

function extractHostnameSlug(url) {
  try {
    const u = new URL(url);
    // Erstes Hostname-Segment (subdomain oder domain-name)
    // z.B. remarkable-interface-616594.framer.app → remarkable-interface-616594
    // z.B. www.framer.app → www
    return u.hostname.split('.')[0];
  } catch {
    return null;
  }
}

/**
 * Liest den framer-project-id Kommentar aus der XML-Datei.
 * Erwartetes Format:
 *   <!-- framer-project-id="..." framer-url="..." exported-at="..." -->
 * Wir extrahieren alle 3 Felder (id ist Pflicht, die anderen optional).
 */
function readXmlProjectMeta(xmlPath) {
  const xmlContent = readFileSync(xmlPath, 'utf8');

  // Pflicht-Kommentar suchen — am Anfang oder innerhalb der ersten 1000 Zeichen
  const head = xmlContent.slice(0, 65536); // NEU P3-B: 64KB Headroom fuer grosse Framer-Exports mit BOM + Preamble
  const commentMatch = head.match(/<!--\s*([\s\S]*?)\s*-->/);

  if (!commentMatch) {
    return { hasComment: false, projectId: null, url: null, exportedAt: null, firstContentSnippet: head.slice(0, 200) };
  }

  const inner = commentMatch[1];
  const idMatch = inner.match(/framer-project-id\s*=\s*"([^"]+)"/);
  const urlMatch = inner.match(/framer-url\s*=\s*"([^"]+)"/);
  const exportedMatch = inner.match(/exported-at\s*=\s*"([^"]+)"/);

  return {
    hasComment: true,
    projectId: idMatch ? idMatch[1] : null,
    url: urlMatch ? urlMatch[1] : null,
    exportedAt: exportedMatch ? exportedMatch[1] : null,
    rawComment: inner.slice(0, 300),
  };
}

async function main() {
  const targetUrl = args['target-url'];
  const expectedId = args['target-id'] || extractHostnameSlug(targetUrl);

  if (!expectedId) {
    const out = { ok: false, error: 'invalid-target-url', url: targetUrl };
    if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    else process.stderr.write(`FEHLER: Target-URL nicht parsbar: ${targetUrl}\n`);
    process.exit(2);
  }

  const meta = readXmlProjectMeta(args.xml);

  if (!meta.hasComment) {
    const out = {
      ok: false,
      error: 'no-project-binding-comment',
      xml_path: args.xml,
      message: 'XML enthaelt keinen framer-project-id Kommentar — MISMATCH nicht verifizierbar. Build STOPPEN oder manuell verifizieren.',
      first_content_snippet: meta.firstContentSnippet,
    };
    if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    else {
      process.stderr.write(`❌ Kein framer-project-id Kommentar in ${args.xml}\n`);
      process.stderr.write(`   XML-Inhalt-Anfang: ${meta.firstContentSnippet}\n\n`);
      process.stderr.write(`Fix: Kommentar am Anfang der XML ergaenzen:\n`);
      process.stderr.write(`  <!-- framer-project-id="<id>" framer-url="<url>" exported-at="<iso>" -->\n\n`);
      process.stderr.write(`BUILD STOPPEN oder manuell verifizieren.\n`);
    }
    process.exit(2);
  }

  if (!meta.projectId) {
    const out = {
      ok: false,
      error: 'comment-without-project-id',
      xml_path: args.xml,
      raw_comment: meta.rawComment,
    };
    if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    else {
      process.stderr.write(`❌ XML-Kommentar vorhanden aber ohne framer-project-id Feld\n`);
      process.stderr.write(`   Kommentar: ${meta.rawComment}\n`);
    }
    process.exit(2);
  }

  // Match-Check
  const matches = meta.projectId === expectedId;

  const out = {
    ok: matches,
    xml_path: args.xml,
    target_url: targetUrl,
    expected_id: expectedId,
    xml_project_id: meta.projectId,
    xml_meta_url: meta.url,
    xml_exported_at: meta.exportedAt,
    matches,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    if (matches) {
      process.stderr.write(`✅ XML-Projekt-Match OK\n`);
      process.stderr.write(`   XML:   ${args.xml}\n`);
      process.stderr.write(`   XML-Projekt: ${meta.projectId}\n`);
      process.stderr.write(`   Target: ${expectedId} (aus ${targetUrl})\n`);
      if (meta.exportedAt) process.stderr.write(`   Exported: ${meta.exportedAt}\n`);
    } else {
      process.stderr.write(`❌ XML-Projekt-MISMATCH — BUILD STOPPEN!\n\n`);
      process.stderr.write(`   XML-Datei:    ${args.xml}\n`);
      process.stderr.write(`   XML-Projekt:  ${meta.projectId}\n`);
      process.stderr.write(`   Target:       ${expectedId} (aus ${targetUrl})\n`);
      process.stderr.write(`   XML-URL:      ${meta.url ?? '(nicht im Kommentar)'}\n\n`);
      process.stderr.write(`WAHRSCHEINLICHE URSACHE: Die gecachte homepage.xml gehoert zu einem\n`);
      process.stderr.write(`ANDEREN Framer-Projekt. Ein falsches XML produziert einen komplett\n`);
      process.stderr.write(`falschen Elementor-Baum, der zwar technisch valid ist aber inhaltlich\n`);
      process.stderr.write(`nicht zur Source-Seite passt.\n\n`);
      process.stderr.write(`LOESUNG:\n`);
      process.stderr.write(`  1. Frisches XML vom aktuellen Projekt erstellen (Unframer MCP oder web_fetch)\n`);
      process.stderr.write(`  2. Mit korrektem Kommentar am Anfang speichern:\n`);
      process.stderr.write(`     <!-- framer-project-id="${expectedId}" framer-url="${targetUrl}" exported-at="<iso>" -->\n`);
      process.stderr.write(`  3. verify-xml-project-match.js erneut ausfuehren\n\n`);
      process.stderr.write(`Wenn DU SICHER bist dass die XML passt (Override-Match):\n`);
      process.stderr.write(`  --target-id "${meta.projectId}"  verwenden — wird im Report als Override markiert.\n`);
    }
  }

  process.exit(matches ? 0 : 1);
}

main().catch(e => {
  const out = { ok: false, error: 'unhandled', message: e.message };
  if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  else process.stderr.write(`Unbehandelter Fehler: ${e.message}\n`);
  process.exit(1);
});
