#!/usr/bin/env node
/**
 * expand-components.js  —  Prio 2: Component-Expansion als Pre-Build-Step
 *
 * Problem: Framer-XML enthält Component-Referenzen (componentId="xxxx") die
 * Elementor nicht kennt. Ohne Expansion produziert convert-xml-to-v4.js blinde
 * e-component-Nodes die im Build als Downgrade-Container landen.
 *
 * Lösung: Dieses Script scannt das Framer-XML VOR der Konvertierung, extrahiert
 * alle einzigartigen componentId-Werte und erstellt entweder:
 *   a) Einen MCP-Call-Plan (export-plan.json) → Agent ruft getNodeXml() pro ID auf
 *   b) Inline-XML-Inlining → ersetzt <Node componentId="X"/> mit dem echten XML
 *
 * Usage:
 *   # Schritt 1: Component-IDs extrahieren + Plan erstellen
 *   node scripts/expand-components.js \
 *     --xml FramerExport/section-name.xml \
 *     --output FramerExport/component-expand-plan.json
 *
 *   # Schritt 2: Agent ruft getNodeXml() für jeden Eintrag auf und speichert als:
 *   #   FramerExport/components/<componentId>.xml
 *
 *   # Schritt 3: XML mit echten Component-Trees inline expandieren
 *   node scripts/expand-components.js \
 *     --xml FramerExport/section-name.xml \
 *     --components-dir FramerExport/components/ \
 *     --output FramerExport/section-name-expanded.xml
 *
 *   # Vollständige Pipeline danach:
 *   node scripts/convert-xml-to-v4.js \
 *     --xml FramerExport/section-name-expanded.xml \
 *     --tokens FramerExport/tokens/token-mapping.json \
 *     --style-map FramerExport/tokens/style-map.json \
 *     --output FramerExport/v4-tree/section-name.json
 */

import fs   from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    xml:             { type: 'string' },          // Eingangs-XML
    'components-dir': { type: 'string' },         // Ordner mit <cid>.xml Dateien (Schritt 3)
    output:          { type: 'string' },          // Ausgabe (Plan-JSON oder expandiertes XML)
    'plan-only':     { type: 'boolean', default: false }, // Nur Plan ausgeben, nicht expandieren
    verbose:         { type: 'boolean', default: false },
  },
  strict: false,
});

const log  = (...m) => { if (args.verbose) process.stderr.write('[expand-components] ' + m.join(' ') + '\n'); };
const warn = (m)    => process.stderr.write(`⚠ [expand-components] ${m}\n`);
const info = (m)    => process.stderr.write(`ℹ [expand-components] ${m}\n`);

if (!args.xml) {
  process.stderr.write('Error: --xml erforderlich\n');
  process.stderr.write('Usage: node scripts/expand-components.js --xml <framer.xml> [--components-dir <dir>] [--output <path>]\n');
  process.exit(2);
}

if (!fs.existsSync(args.xml)) {
  process.stderr.write(`Error: --xml nicht gefunden: ${args.xml}\n`);
  process.exit(2);
}

const xmlContent = fs.readFileSync(args.xml, 'utf8');

// ─── Scan for componentId references ─────────────────────────────────────────

/**
 * Extrahiert alle einzigartigen componentId-Werte aus dem XML.
 * Framer schreibt Component-Referenzen als Attribute:
 *   <Node componentId="abcde1234" name="Logo" ... />
 */
function extractComponentIds(xml) {
  const ids = new Set();
  const nameMap = {};   // componentId → component name (für den Plan)

  const re = /componentId="([^"]+)"/g;
  const nameRe = /componentId="([^"]+)"[^>]*name="([^"]+)"/g;
  const nameRe2 = /name="([^"]+)"[^>]*componentId="([^"]+)"/g;

  // Collect names first
  let m;
  while ((m = nameRe.exec(xml)) !== null)  { nameMap[m[1]] = m[2]; }
  while ((m = nameRe2.exec(xml)) !== null) { nameMap[m[2]] = m[1]; }

  // Collect all IDs
  while ((m = re.exec(xml)) !== null) ids.add(m[1]);

  return [...ids].map(id => ({ componentId: id, name: nameMap[id] || id }));
}

const components = extractComponentIds(xmlContent);
log(`Found ${components.length} unique component references`);

if (components.length === 0) {
  info('Keine componentId-Referenzen im XML gefunden. Kein Expand notwendig.');
  if (args.output) {
    fs.writeFileSync(args.output, xmlContent, 'utf8');
    info(`XML unverändert geschrieben → ${args.output}`);
  } else {
    process.stdout.write(xmlContent);
  }
  process.exit(0);
}

// ─── Mode A: Plan-only (kein components-dir) ─────────────────────────────────

const componentsDir = args['components-dir'];
const hasCacheDir = componentsDir && fs.existsSync(componentsDir);

if (!hasCacheDir || args['plan-only']) {
  // Erstelle MCP-Call-Plan: Agent ruft getNodeXml() pro componentId auf
  const plan = {
    generated_by: 'expand-components.js',
    source_xml: args.xml,
    components_to_expand: components.length,
    components_dir_target: componentsDir || 'FramerExport/components/',
    instructions: [
      `Für jede component_id unten: Unframer MCP getNodeXml({ nodeId: component_id }) aufrufen`,
      `XML-Output speichern als: <components_dir_target>/<component_id>.xml`,
      `Dann erneut aufrufen: node scripts/expand-components.js --xml <source_xml> --components-dir <components_dir_target> --output <source_xml_expanded.xml>`,
    ],
    calls: components.map((c, i) => ({
      step: i + 1,
      component_id: c.componentId,
      component_name: c.name,
      mcp_tool: 'Unframer:getNodeXml',
      mcp_params: { nodeId: c.componentId },
      save_as: path.join(componentsDir || 'FramerExport/components/', `${c.componentId}.xml`),
    })),
  };

  const planJson = JSON.stringify(plan, null, 2);

  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, planJson, 'utf8');
    process.stderr.write(`✓ Component-Expand-Plan → ${args.output} (${components.length} components)\n`);
    // Print a brief summary to stdout for the agent
    process.stdout.write(`Component Expansion Plan:\n`);
    for (const c of components) {
      process.stdout.write(`  getNodeXml({ nodeId: "${c.componentId}" })  →  ${c.name}\n`);
    }
  } else {
    process.stdout.write(planJson + '\n');
  }
  process.exit(0);
}

// ─── Mode B: Inline XML expansion ────────────────────────────────────────────

/**
 * Inline-expandiert Component-Referenzen im XML.
 *
 * Strategie: Ersetzt <Node componentId="X" .../> mit dem vollständigen
 * XML-Inhalt aus components/<X>.xml, dabei werden Wrapper-Attribute
 * (name, componentId, position, etc.) als überschreibende Attribute
 * auf den Root-Node des expandierten XMLs gemappt.
 *
 * Framer-Override-Reihenfolge: Instance-Attrs > Component-Default-Attrs
 */
function expandComponentsInXml(xml, componentFiles) {
  let expanded = xml;
  let totalExpanded = 0;
  let totalSkipped = 0;

  for (const { componentId, name } of components) {
    const xmlPath = componentFiles[componentId];
    if (!xmlPath) {
      log(`  ⏭ ${componentId} (${name}): keine XML-Datei → bleibt als componentId-Referenz`);
      totalSkipped++;
      continue;
    }

    let componentXml;
    try {
      componentXml = fs.readFileSync(xmlPath, 'utf8').trim();
    } catch (err) {
      warn(`Kann ${xmlPath} nicht lesen: ${err.message}`);
      totalSkipped++;
      continue;
    }

    // Count how many instances exist before replacement
    const instanceRe = new RegExp(`<[^>]+componentId="${componentId}"[^>]*/?>`, 'gs');
    const instances = [...xml.matchAll(instanceRe)];
    if (instances.length === 0) continue;

    log(`  ✓ ${componentId} (${name}): ${instances.length} instance(s) → inline XML (${componentXml.length} chars)`);

    // Replace each instance tag with the component XML
    // Preserve instance-level overrides as attributes on the root node
    expanded = expanded.replace(
      new RegExp(`(<[^>]+)componentId="${componentId}"([^>]*/?>)`, 'gs'),
      (match, before, after) => {
        // Extract instance-level override attrs (name, position, overrides, etc.)
        const instanceAttrs = before + after;

        // Find the root tag of the component XML and inject instance attrs
        // that aren't already on the component root (instance wins)
        const rootTagMatch = componentXml.match(/^<(\w[\w.-]*)\s*/);
        if (!rootTagMatch) return match; // can't parse component XML root

        const componentRootTag = rootTagMatch[1];

        // Strip componentId from the injected attributes (avoid re-expansion)
        const cleanedInstanceAttrs = instanceAttrs
          .replace(/componentId="[^"]*"\s*/g, '')
          .replace(/^<\s*\w[\w.-]*\s*/, '')   // strip original tag name
          .replace(/\/?>$/, '')                // strip closing
          .trim();

        // Inject instance attrs into component root (before first attr or after tag name)
        const injectedXml = componentXml.replace(
          /^(<\w[\w.-]*)(\s|>)/,
          `$1 data-framer-instance="true" ${cleanedInstanceAttrs}$2`
        );

        return `<!-- component:${componentId} name:${name} -->\n${injectedXml}`;
      }
    );

    totalExpanded++;
  }

  return { expanded, totalExpanded, totalSkipped };
}

// ─── Load component XML files ─────────────────────────────────────────────────

const componentFiles = {};
let foundCount = 0;

for (const { componentId } of components) {
  const xmlPath = path.join(componentsDir, `${componentId}.xml`);
  if (fs.existsSync(xmlPath)) {
    componentFiles[componentId] = xmlPath;
    foundCount++;
    log(`  Found: ${componentId}.xml`);
  } else {
    log(`  Missing: ${componentId}.xml (will keep as componentId reference)`);
  }
}

info(`Component XMLs: ${foundCount}/${components.length} gefunden in ${componentsDir}`);

if (foundCount === 0) {
  warn(`Keine Component-XMLs gefunden. Erstelle zuerst den Plan und rufe getNodeXml() auf:`);
  warn(`  node scripts/expand-components.js --xml ${args.xml} --plan-only --output component-plan.json`);
  // Output original XML unchanged so pipeline can continue with downgrade fallback
  if (args.output) {
    fs.writeFileSync(args.output, xmlContent, 'utf8');
  } else {
    process.stdout.write(xmlContent);
  }
  process.exit(1);
}

// ─── Execute expansion ────────────────────────────────────────────────────────

const { expanded, totalExpanded, totalSkipped } = expandComponentsInXml(xmlContent, componentFiles);

// ─── Write output ─────────────────────────────────────────────────────────────

if (args.output) {
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, expanded, 'utf8');
  process.stderr.write(`✓ Expanded XML → ${args.output}\n`);
  process.stderr.write(`  Components expanded: ${totalExpanded}/${components.length}\n`);
  if (totalSkipped > 0) {
    process.stderr.write(`  Skipped (no XML): ${totalSkipped} — these remain as e-component downgrade nodes\n`);
  }
} else {
  process.stdout.write(expanded);
}

process.exit(totalSkipped > 0 ? 1 : 0);
