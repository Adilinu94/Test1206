#!/usr/bin/env node
/**
 * extract-framer-components.js  —  A1: Component Extraction (Sprint 2)
 *
 * Analysiert Framer HTML/XML auf wiederholte Container-Muster und
 * extrahiert sie als V4 Atomic Component Blueprints.
 *
 * Usage:
 *   node scripts/extract-framer-components.js \
 *     --xml FramerExport/index.html \
 *     --output components/
 *   node scripts/extract-framer-components.js \
 *     --v4-tree v4-tree.json \
 *     --output components/
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { structuralHash } from './lib/framer-utils.js';

const { values: args } = parseArgs({
  options: {
    xml:      { type: 'string' },
    'v4-tree':{ type: 'string' },
    output:   { type: 'string' },
    'min-dups':{ type: 'string', default: '2' },
    verbose:  { type: 'boolean', default: false },
    help:     { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help || (!args.xml && !args['v4-tree'])) {
  console.log(`

extract-framer-components.js  —  A1: Component Extraction (Sprint 2)

ZWECK:
  Analysiert Framer HTML/XML auf wiederholte Container-Muster und
  extrahiert sie als V4 Atomic Component Blueprints. Erkennt:
    • Wiederholte CSS-Selektoren (data-framer-name Pattern)
    • Strukturell identische Kind-Gruppen im V4 Tree (structuralHash)
    • Properties: Titel, Paragraph, Bild, Button/Link

EINGABE (mindestens eine):
  --xml FILE            Framer HTML/CSS Export
  --v4-tree FILE        V4 Widget-Tree JSON (von convert-xml-to-v4.js)

OPTIONEN:
  --output DIR          Output-Verzeichnis (eine JSON pro Component +
                        components-plan.json)                [default: .]
  --min-dups N          Mindest-Wiederholungen fuer Component [default: 2]
  --verbose             Ausfuehrliche Logs
  --help                Diese Hilfe

BEISPIELE:
  # Aus Framer HTML-Export:
  node scripts/extract-framer-components.js \\
    --xml FramerExport/index.html \\
    --output components/

  # Aus V4 Tree (Pipeline Stage):
  node scripts/extract-framer-components.js \\
    --v4-tree v4-tree.json \\
    --output components/ \\
    --min-dups 3

  # Stdout (kein --output):
  node scripts/extract-framer-components.js --xml index.html

OUTPUT:
  components-plan.json  — Meta, alle Components, MCP-Routing
  <ComponentName>.json  — Einzelner Component Blueprint

MCP-ROUTING:
  create: novamira-adrianv2/create-component
  assign: novamira-adrianv2/insert-component
  (Beide existieren bereits — kein neues PHP noetig)

EXIT-CODES:
  0 = Components extrahiert
  1 = Keine wiederholten Muster gefunden
  2 = Eingabedatei nicht gefunden / kein Input-Flag
`);
  if (args.help) process.exit(0);
  process.exit(2);
}

const MIN_DUPS = parseInt(args['min-dups'] || '2', 10);

const log = (...m) => { if (args.verbose) process.stderr.write('[comp-extract] ' + m.join(' ') + '\n'); };

// ─── V4 Tree Mode ───────────────────────────────────────────────────────────

function extractComponentsFromV4Tree(tree) {
  const roots = Array.isArray(tree) ? tree : [tree];
  const containerGroups = new Map(); // structuralHash → [elements]

  function walk(node) {
    const children = node.elements || node.children || [];
    if (children.length >= 2) {
      const hash = structuralHash(children, { includeTag: true });
      if (!containerGroups.has(hash)) {
        containerGroups.set(hash, { template: children, occurrences: [] });
      }
      containerGroups.get(hash).occurrences.push(node.id || 'unknown');
    }
    for (const child of children) walk(child);
  }

  for (const root of roots) walk(root);

  const components = [];
  let idx = 1;

  for (const [hash, group] of containerGroups) {
    if (group.occurrences.length < MIN_DUPS) continue;

    const template = group.template;
    const properties = extractProperties(template);

    components.push({
      name: properties.name || `Component-${idx++}`,
      hash,
      occurrences: group.occurrences.length,
      parent_ids: group.occurrences,
      properties: properties.fields,
      content: template,
    });
  }

  return components;
}

function extractProperties(template) {
  const fields = {};
  let suggestedName = '';

  for (const el of template) {
    const id = el.id || '';
    if (/heading|title/i.test(id)) {
      const text = el.settings?.title?.value?.content?.value ||
                   el.settings?.text?.value?.content?.value || '';
      fields[id] = { type: 'text', default: text, prop: 'title' };
      if (!suggestedName) suggestedName = text.replace(/[^a-zA-Z0-9]/g, '');
    }
    if (/paragraph|body|description/i.test(id)) {
      const text = el.settings?.paragraph?.value?.content?.value || '';
      fields[id] = { type: 'text', default: text, prop: 'paragraph' };
    }
    if (/image|img|icon/i.test(id)) {
      const imgSrc = el.settings?.image?.value?.src?.value?.id ||
                     el.settings?.['image-src']?.value?.id ||
                     0;
      fields[id] = { type: 'image', default: imgSrc, prop: 'image' };
    }
    if (/button|cta|link/i.test(id)) {
      const href = el.settings?.link?.value?.destination?.value || '';
      const text = el.settings?.text?.value?.content?.value || '';
      fields[id] = { type: 'link', default: { href, text }, prop: 'link' };
    }

    // Recurse into children
    const children = el.elements || el.children || [];
    const childFields = extractProperties(children);
    Object.assign(fields, childFields.fields);
    if (!suggestedName && childFields.name) suggestedName = childFields.name;
  }

  return { fields, name: suggestedName };
}

// ─── XML Mode (Framer HTML Export) ──────────────────────────────────────────

function extractCssFromHtml(html) {
  const blocks = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) blocks.push(m[1]);
  return blocks.join('\n');
}

function findRepeatingSelectors(css) {
  const ruleMap = new Map();
  const ruleRe = /([^{}]+)\{([^{}]+)\}/g;
  let m;
  while ((m = ruleRe.exec(css)) !== null) {
    const selector = m[1].trim();
    const body = m[2].trim();
    // Gruppiere nach data-framer-name pattern
    const nameMatch = selector.match(/\[data-framer-name=["']([^"']+)["']\]/);
    const baseName = nameMatch ? nameMatch[1].replace(/[\d-]+$/g, '') : selector;
    if (!ruleMap.has(baseName)) ruleMap.set(baseName, []);
    ruleMap.get(baseName).push({ selector, body });
  }

  const repeating = [];
  for (const [baseName, rules] of ruleMap) {
    if (rules.length >= MIN_DUPS) {
      repeating.push({ baseName, count: rules.length, selectors: rules.map(r => r.selector) });
    }
  }
  return repeating;
}

function buildTemplateFromRepeat(repeatingGroup, xmlContent) {
  const name = repeatingGroup.baseName.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'Component';
  const firstSelector = repeatingGroup.selectors[0];
  const selectorMatch = firstSelector.match(/\[data-framer-name=["']([^"']+)["']\]/);
  const displayName = selectorMatch ? selectorMatch[1] : name;

  return {
    name: displayName,
    occurrences: repeatingGroup.count,
    selectors: repeatingGroup.selectors,
    properties: {
      title: { type: 'text', default: displayName },
    },
  };
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

let components = [];

if (args['v4-tree']) {
  if (!fs.existsSync(args['v4-tree'])) {
    process.stderr.write(`Error: v4-tree not found: ${args['v4-tree']}\n`);
    process.exit(2);
  }
  const tree = JSON.parse(fs.readFileSync(args['v4-tree'], 'utf8'));
  components = extractComponentsFromV4Tree(tree);
}

if (args.xml) {
  if (!fs.existsSync(args.xml)) {
    process.stderr.write(`Error: XML/HTML not found: ${args.xml}\n`);
    process.exit(2);
  }
  const html = fs.readFileSync(args.xml, 'utf8');
  const css = extractCssFromHtml(html);
  const repeating = findRepeatingSelectors(css);

  for (const group of repeating) {
    const comp = buildTemplateFromRepeat(group, html);
    components.push(comp);
  }
}

// ─── OUTPUT ─────────────────────────────────────────────────────────────────

const result = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: args['v4-tree'] || args.xml,
    totalComponents: components.length,
    minDuplicates: MIN_DUPS,
  },
  components,
  mcpRouting: {
    create_ability: 'novamira-adrianv2/create-component',
    assign_ability: 'novamira-adrianv2/insert-component',
    note: 'B1-B3: Diese Abilities existieren bereits im novamira-adrianv2 Plugin. Kein neues PHP noetig.',
  },
};

const outDir = args.output || '.';
if (components.length > 0) {
  fs.mkdirSync(path.resolve(outDir), { recursive: true });

  for (const comp of components) {
    const compPath = path.join(outDir, `${comp.name.replace(/[^a-zA-Z0-9_-]/g, '-')}.json`);
    fs.writeFileSync(compPath, JSON.stringify(comp, null, 2), 'utf8');
    log(`Component: ${comp.name} → ${compPath}`);
  }
}

const summaryPath = path.join(outDir, 'components-plan.json');
fs.writeFileSync(summaryPath, JSON.stringify(result, null, 2), 'utf8');

process.stderr.write(`[comp-extract] ${components.length} components extracted → ${outDir}\n`);
if (components.length === 0) {
  process.stderr.write('[comp-extract] No repeating patterns found.\n');
}

process.exit(0);
