#!/usr/bin/env node
/**
 * build-dependency-graph.js
 * Framer -> Elementor V4 Conversion Tool
 *
 * Baut aus Framer-Component-Daten einen Dependency-Graphen
 * und berechnet die korrekte Build-Reihenfolge via Kahn's Algorithm.
 *
 * Verwendung:
 *   node scripts/build-dependency-graph.js --input FramerExport/element-tree/homepage-element-tree.json
 *   node scripts/build-dependency-graph.js --input FramerExport/page-inventory.md --format markdown
 *   node scripts/build-dependency-graph.js --input data.json --output reports/build-order.json
 *   node scripts/build-dependency-graph.js --unframer-xml framer-nodes.xml
 */

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// CLI Args
// ---------------------------------------------------------------------------
const { values: rawArgs } = parseArgs({
  options: {
    input:            { type: 'string' },
    'unframer-xml':   { type: 'string' },
    output:           { type: 'string' },
    format:           { type: 'string', default: 'json' },
    'fail-on-cycle':  { type: 'boolean', default: true },
    'no-fail-on-cycle': { type: 'boolean', default: false },
    verbose:          { type: 'boolean', default: false },
  },
  strict: false,
});
// Merge: --no-fail-on-cycle ueberschreibt --fail-on-cycle
const args = {
  ...rawArgs,
  'fail-on-cycle': rawArgs['no-fail-on-cycle'] ? false : rawArgs['fail-on-cycle'],
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/build-dependency-graph.js [options]');
  console.log('');
  console.log('  --input <path>          Framer component JSON or markdown inventory');
  console.log('  --unframer-xml <path>   Framer XML from getNodeXml()');
  console.log('  --output <path>         Output file (default: stdout)');
  console.log('  --format <json|md>      Output format (default: json)');
  console.log('  --no-fail-on-cycle      Continue even if dependency cycle detected');
  console.log('  --verbose               Show extra debug output');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/build-dependency-graph.js --input FramerExport/page.json');
  console.log('  node scripts/build-dependency-graph.js --input data.json --format markdown');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Kahn's Algorithm (Topological Sort)
// ---------------------------------------------------------------------------
/**
 * Berechnet Build-Reihenfolge aus Adjacency-List.
 * @param {Object} graph - { ComponentName: [dep1, dep2, ...] }
 * @returns {{ order: string[], cycles: string[] }}
 */
function getBuildOrder(graph) {
  const allNodes = new Set(Object.keys(graph));

  // Sicherstellen dass Dependencies auch als Nodes existieren
  for (const deps of Object.values(graph)) {
    for (const dep of deps) {
      if (!allNodes.has(dep)) {
        allNodes.add(dep);
        graph[dep] = graph[dep] ?? [];
      }
    }
  }

  const nodes = [...allNodes];
  const inDegree = {};
  for (const node of nodes) inDegree[node] = 0;

  // In-Degree aufbauen: node haengt von seinen deps ab -> dep -> node
  for (const [node, deps] of Object.entries(graph)) {
    for (const dep of deps) {
      // "node" braucht "dep" -> dep muss zuerst gebaut werden
      // In-Degree von "node" erhoehen (node hat mehr Abhaengigkeiten)
      inDegree[node] = (inDegree[node] ?? 0); // already initialized above
    }
  }

  // Neu: korrekte Kanten-Richtung
  // graph[A] = [B, C] bedeutet: A haengt von B und C ab
  // Also: B und C muessen VOR A gebaut werden
  // In-Degree = Anzahl Components von denen diese Component abhaengt
  const inDegreeCorrect = {};
  for (const node of nodes) inDegreeCorrect[node] = 0;
  for (const [node, deps] of Object.entries(graph)) {
    inDegreeCorrect[node] = deps.length;
  }

  const queue = nodes.filter(n => inDegreeCorrect[n] === 0).sort();
  const result = [];

  while (queue.length > 0) {
    const node = queue.shift();
    result.push(node);

    // Finde alle Nodes die auf diesen Node warten
    for (const [other, deps] of Object.entries(graph)) {
      if (deps.includes(node)) {
        inDegreeCorrect[other]--;
        if (inDegreeCorrect[other] === 0) {
          queue.push(other);
          queue.sort(); // deterministisch
        }
      }
    }
  }

  // Cycle Detection
  const processed = result.length;
  const total = nodes.length;
  const cycles = nodes.filter(n => !result.includes(n));

  return { order: result, cycles, processed, total };
}

// ---------------------------------------------------------------------------
// Input Parsing
// ---------------------------------------------------------------------------

/**
 * Parst ein JSON Element-Tree aus Framer-Export.
 * Erwartet: { components: { Name: { children: [], props: [] } } }
 * oder flaches { Name: [dep1, dep2] }
 */
function parseJsonInput(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);

  // Format 1: Direktes Adjacency-List { ComponentName: [dep1, dep2] }
  if (typeof data === 'object' && !data.components && !data.pages) {
    const isAdjacency = Object.values(data).every(v => Array.isArray(v));
    if (isAdjacency) {
      return { graph: data, source: 'adjacency-list' };
    }
  }

  // Format 2: { components: { Name: { children: [], props: [] } } }
  if (data.components) {
    const graph = {};
    for (const [name, meta] of Object.entries(data.components)) {
      graph[name] = [
        ...(meta.children ?? []),
        ...(meta.dependencies ?? []),
      ];
    }
    return { graph, source: 'components-object', meta: data };
  }

  // Format 3: Array von Component-Objekten
  if (Array.isArray(data)) {
    const graph = {};
    for (const item of data) {
      const name = item.name ?? item.id;
      if (!name) continue;
      graph[name] = [
        ...(item.children ?? []),
        ...(item.dependencies ?? []),
        ...(item.uses ?? []),
      ];
    }
    return { graph, source: 'component-array', meta: data };
  }

  throw new Error(`Unbekanntes JSON-Format in ${filePath}`);
}

/**
 * Parst ein Markdown-Inventar (page-inventory.md Format).
 * Sucht nach Component-Sektionen und extrahiert Dependency-Hinweise.
 */
function parseMarkdownInput(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const graph = {};

  // Pattern: "ComponentName (referenziert XYZ)" oder "ComponentName -> XYZ"
  const lines = raw.split('\n');
  let currentComponent = null;

  for (const line of lines) {
    // Heading-Level Komponenten
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      currentComponent = headingMatch[1].trim();
      if (!graph[currentComponent]) graph[currentComponent] = [];
      continue;
    }

    // Listeneintrag mit Komponentennamen (- ComponentName)
    const listItemMatch = line.match(/^[-*]\s+\*?\*?([A-Z][A-Za-z\s]+?)\*?\*?\s*($|[:(,])/);
    if (listItemMatch) {
      const compName = listItemMatch[1].trim();
      if (!graph[compName]) graph[compName] = [];
      currentComponent = compName;
    }

    // Dependency-Hinweise: "referenziert XYZ" oder "-> XYZ"
    const refMatch = line.match(/referenziert?\s+([A-Z][A-Za-z\s,]+)/i);
    if (refMatch && currentComponent) {
      const deps = refMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      graph[currentComponent] = [...new Set([...graph[currentComponent], ...deps])];
    }

    // Explizite Pfeil-Syntax: "A -> B"
    const arrowMatch = line.match(/^[-*]?\s*([A-Z][A-Za-z\s]+?)\s*->\s*([A-Z][A-Za-z\s]+)/);
    if (arrowMatch) {
      const [, parent, child] = arrowMatch;
      const p = parent.trim();
      const c = child.trim();
      if (!graph[p]) graph[p] = [];
      if (!graph[p].includes(c)) graph[p].push(c);
    }
  }

  // Hardcoded bekannte Strukturen aus dem Handoff-Dokument einarbeiten
  // (FAQ-Kette, Social Icons etc.)
  const knownDeps = {
    'FAQs':             ['Faq Row'],
    'Faq Row':          ['Primary Button'],
    'Slider Card':      ['Testimonial Card'],
    'Single Innovators Card': ['Social Icons'],
    'Socials for Teams': ['X-Icon', 'Instagram Icon', 'Linkedin Icon'],
    'FAQ':              ['Faq Row'],
    'Faq Items':        ['Faq Row'],
  };

  for (const [comp, deps] of Object.entries(knownDeps)) {
    if (graph[comp] !== undefined) {
      graph[comp] = [...new Set([...graph[comp], ...deps])];
    }
  }

  return { graph, source: 'markdown-inventory' };
}

/**
 * Parst XML von Unframer MCP getNodeXml Output.
 * Sucht nach component-Referenzen in XML-Attributen.
 */
function parseXmlInput(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const graph = {};

  // Component-Namen aus dem XML extrahieren
  const componentMatches = [...raw.matchAll(/component[Nn]ame="([^"]+)"/g)];
  const instanceMatches  = [...raw.matchAll(/componentId="([^"]+)"/g)];
  const nameMatches      = [...raw.matchAll(/\bname="([^"]+)"/g)];

  // Unique Components
  const allNames = [
    ...componentMatches.map(m => m[1]),
    ...nameMatches.map(m => m[1]),
  ].filter(n => /^[A-Z]/.test(n)); // nur PascalCase

  for (const name of allNames) {
    if (!graph[name]) graph[name] = [];
  }

  // Prop-Hashes mit instanziierten Components mappen
  // Framer 9-Zeichen Hashes: z.B. ycw27fUKm
  const propHashPattern = /\b([A-Za-z0-9]{9})\b/g;
  const propHashes = [...new Set([...raw.matchAll(propHashPattern)].map(m => m[1]))];
  if (args.verbose && propHashes.length > 0) {
    console.error(`[XML] ${propHashes.length} unaufgeloeste Prop-Hashes gefunden (Unframer MCP benoetigt)`);
  }

  return { graph, source: 'unframer-xml', propHashes };
}

// ---------------------------------------------------------------------------
// Known Framer Components (aus page-inventory.md im Handoff-Dokument)
// ---------------------------------------------------------------------------
function getKnownComponentGraph() {
  return {
    // Navigation & Layout (keine Dependencies)
    'Navigation':               [],
    'Footer':                   ['Footer Social', 'Footer Navlink'],
    'Footer Social':            [],
    'Footer Navlink':           [],
    'Nab Link':                 [],
    'Nav Menu':                 ['Nab Link'],

    // Buttons & CTAs (minimale Dependencies)
    'Primary Button':           [],
    'Newsletter Submit Button': [],
    'Submit Button':            [],
    'Blog Button':              [],
    'CTA Section':              ['Primary Button'],

    // Cards (referenzieren Typography und Buttons)
    'Single Value Card':        [],
    'Sustainable Service Card': [],
    'Single Crafted Card':      [],
    'Statistics Image Short Card': [],
    'Statistics Text Card Short':  [],
    'Blog Card':                ['Blog Button'],
    'Pricing Single Card':      ['Primary Button'],
    'Single Pricing Options':   ['Pricing Single Card'],
    'Single Innovators Card':   ['Socials for Teams'],

    // Social Icons
    'X-Icon':                   [],
    'Instagram Icon':           [],
    'Linkedin Icon':            [],
    'Socials for Teams':        ['X-Icon', 'Instagram Icon', 'Linkedin Icon'],

    // Sliders & Carousels (referenzieren Cards)
    'Logo Slider':              [],
    'Slider Card':              ['Testimonial Card'],
    'Accordion':                [],
    'Tab Button':               [],
    'Tab Content':              [],
    'Faq Items':                ['Faq Row'],

    // FAQ System (Kette: FAQs -> Faq Row -> Primary Button)
    'Faq Row':                  ['Primary Button'],
    'FAQs':                     ['Faq Row'],

    // About
    'About Us Statistic Item':  [],

    // Testimonial (referenced by Slider Card)
    'Testimonial Card':         [],
  };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------
function formatJson(result, graph) {
  return JSON.stringify({
    meta: {
      generated: new Date().toISOString(),
      totalComponents: result.total,
      buildSteps: result.order.length,
      hasCycles: result.cycles.length > 0,
    },
    buildOrder: result.order.map((name, index) => ({
      step: index + 1,
      component: name,
      dependencies: graph[name] ?? [],
      isLeaf: (graph[name] ?? []).length === 0,
    })),
    cycles: result.cycles,
    graph,
  }, null, 2);
}

function formatMarkdown(result, graph) {
  const lines = [
    '# Framer Component Build Order',
    '',
    `> Generiert: ${new Date().toISOString()}`,
    `> Components: ${result.total} | Build-Steps: ${result.order.length}`,
    '',
  ];

  if (result.cycles.length > 0) {
    lines.push('## ⚠️  Circular Dependencies Detected');
    lines.push('');
    for (const c of result.cycles) {
      lines.push(`- **${c}** (in Zyklus)`);
    }
    lines.push('');
  }

  lines.push('## Build-Reihenfolge');
  lines.push('');
  lines.push('| Schritt | Component | Leaf | Dependencies |');
  lines.push('|---------|-----------|------|--------------|');

  for (const [i, name] of result.order.entries()) {
    const deps = graph[name] ?? [];
    const isLeaf = deps.length === 0;
    const depsStr = deps.length > 0 ? deps.join(', ') : '-';
    lines.push(`| ${i + 1} | ${name} | ${isLeaf ? 'Yes' : 'No'} | ${depsStr} |`);
  }

  lines.push('');
  lines.push('## Layer-Gruppen');
  lines.push('');

  // Gruppen berechnen
  const layers = computeLayers(graph, result.order);
  for (const [layerIndex, layer] of layers.entries()) {
    lines.push(`### Layer ${layerIndex + 1} (parallel baubar)`);
    for (const comp of layer) {
      lines.push(`- ${comp}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Berechnet parallele Build-Layers (Components in gleichem Layer koennen parallel gebaut werden)
 */
function computeLayers(graph, buildOrder) {
  const layers = [];
  const placed = new Set();

  for (const node of buildOrder) {
    const deps = graph[node] ?? [];
    // Finde den Layer-Index: max(layer-index aller deps) + 1
    let layerIndex = 0;
    for (const dep of deps) {
      for (let li = 0; li < layers.length; li++) {
        if (layers[li].includes(dep)) {
          layerIndex = Math.max(layerIndex, li + 1);
        }
      }
    }
    if (!layers[layerIndex]) layers[layerIndex] = [];
    layers[layerIndex].push(node);
    placed.add(node);
  }

  return layers;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let graphData = null;

  if (!args.input && !args['unframer-xml']) {
    // Kein Input: Verwende bekannte Component-Struktur aus page-inventory.md
    console.error('[INFO] Kein --input angegeben. Verwende bekannte Novamira-Framer-Components.');
    graphData = {
      graph: getKnownComponentGraph(),
      source: 'built-in-inventory',
    };
  } else if (args['unframer-xml']) {
    graphData = parseXmlInput(args['unframer-xml']);
  } else {
    const inputPath = args.input;
    const ext = path.extname(inputPath).toLowerCase();

    if (!fs.existsSync(inputPath)) {
      console.error(`[ERROR] Datei nicht gefunden: ${inputPath}`);
      process.exit(1);
    }

    if (ext === '.json') {
      graphData = parseJsonInput(inputPath);
    } else if (ext === '.md' || ext === '.markdown') {
      graphData = parseMarkdownInput(inputPath);
    } else {
      console.error(`[ERROR] Unbekanntes Dateiformat: ${ext} (erwartet: .json, .md)`);
      process.exit(1);
    }
  }

  const { graph, source } = graphData;

  if (args.verbose) {
    console.error(`[INFO] Quelle: ${source}`);
    console.error(`[INFO] Components gefunden: ${Object.keys(graph).length}`);
  }

  // Build-Order berechnen
  const result = getBuildOrder({ ...graph }); // Kopie, da mutiert wird

  // Cycle-Handling
  if (result.cycles.length > 0) {
    console.error(`[WARN] ${result.cycles.length} Component(s) in Zyklus: ${result.cycles.join(', ')}`);
    if (args['fail-on-cycle']) {
      console.error('[ERROR] Build abgebrochen wegen Circular Dependency. --fail-on-cycle=false zum Ignorieren.');
      process.exit(2);
    }
  }

  // Output
  let output = '';
  const fmt = args.format;

  if (fmt === 'json') {
    output = formatJson(result, graph);
  } else if (fmt === 'markdown' || fmt === 'md') {
    output = formatMarkdown(result, graph);
  } else if (fmt === 'both') {
    output = formatJson(result, graph) + '\n\n---\n\n' + formatMarkdown(result, graph);
  } else {
    output = formatJson(result, graph);
  }

  if (args.output) {
    const outDir = path.dirname(args.output);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(args.output, output, 'utf8');
    console.error(`[OK] Ergebnis gespeichert: ${args.output}`);
  } else {
    process.stdout.write(output + '\n');
  }

  // Exit-Code basierend auf Ergebnis
  process.exit(result.cycles.length > 0 && args['fail-on-cycle'] ? 2 : 0);
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
