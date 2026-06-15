#!/usr/bin/env node
/**
 * generate-component-cache.js — Phase 10: Component Resolution
 *
 * Extrahiert alle e-component-IDs aus einem V4-Tree und generiert
 * eine component-cache.json mit Downgrade-V4-Trees (e-flexbox + Label).
 *
 * Ohne Unframer MCP werden Components zu e-flexbox-Containern mit
 * dem Component-Namen als inline-Heading downgraded. Sobald Unframer
 * MCP verfügbar ist, können die echten Component-XMLs in den Cache
 * eingefügt werden.
 *
 * Usage:
 *   node scripts/generate-component-cache.js \
 *     --tree v4-output/elements.json \
 *     --output v4-output/component-cache.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    tree:      { type: 'string' },
    output:    { type: 'string' },
    verbose:   { type: 'boolean', default: false },
  },
  strict: false,
});

if (!args.tree) {
  console.error('Error: --tree required');
  process.exit(2);
}

const log = (...m) => { if (args.verbose) process.stderr.write('[comp-cache] ' + m.join(' ') + '\n'); };

// Load tree
const tree = JSON.parse(fs.readFileSync(args.tree, 'utf8'));

// Collect unique component IDs with metadata
const componentMap = new Map();

function walk(node, parentType = 'root') {
  if (!node || typeof node !== 'object') return;
  
  if (node.widgetType === 'e-component') {
    const cid = node.settings?.['component-id']?.value || 'unknown';
    if (!componentMap.has(cid)) {
      // Extract text overrides from component instance
      const overrides = {};
      for (const [key, val] of Object.entries(node.settings || {})) {
        if (key.startsWith('property-')) {
          const propName = key.replace('property-', '');
          overrides[propName] = typeof val === 'object' ? val.value : val;
        }
      }
      
      componentMap.set(cid, {
        componentId: cid,
        overrides,
        occurrences: 1,
        parentTypes: [parentType],
        sampleClasses: node.settings?.classes?.value || [],
      });
    } else {
      const entry = componentMap.get(cid);
      entry.occurrences++;
      if (!entry.parentTypes.includes(parentType)) entry.parentTypes.push(parentType);
    }
  }
  
  if (node.elements) {
    for (const child of node.elements) {
      walk(child, node.widgetType || node.elType || '?');
    }
  }
}

const roots = Array.isArray(tree) ? tree : [tree];
roots.forEach(r => walk(r));

log(`Found ${componentMap.size} unique component IDs across all instances`);

// Build component cache: each component ID → downgraded V4 tree
const componentCache = {};

for (const [cid, info] of componentMap) {
  // Generate a readable label from the component ID
  const label = `Component: ${cid}`;
  const styleId = 'fecomp' + cid.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14);
  
  // Find the best text override
  const textContent = info.overrides.text 
    || info.overrides.title 
    || info.overrides.content 
    || info.overrides.heading
    || label;
  
  // Build a downgraded component tree (e-flexbox with inline heading)
  const downgraded = {
    type: 'e-flexbox',
    elType: 'e-flexbox',
    widgetType: 'e-flexbox',
    id: `comp-${cid}`,
    settings: {
      classes: {
        '$$type': 'classes',
        value: [styleId],
      },
      tag: 'div',
    },
    styles: {
      [styleId]: {
        id: styleId,
        type: 'class',
        label: 'local',
        variants: [{
          meta: { breakpoint: null, state: null },
          props: {
            display: { '$$type': 'string', value: 'flex' },
            'flex-direction': 'column',
            gap: { '$$type': 'size', value: { size: 8, unit: 'px' } },
          },
          custom_css: null,
        }],
      },
    },
    elements: [
      {
        type: 'e-heading',
        elType: 'widget',
        widgetType: 'e-heading',
        id: `comp-${cid}-label`,
        settings: {
          classes: {
            '$$type': 'classes',
            value: [`fecomp${cid}label`],
          },
          tag: 'h4',
          title: {
            '$$type': 'html-v3',
            value: {
              content: {
                '$$type': 'string',
                value: String(textContent),
              },
            },
          },
        },
        styles: {
          [`fecomp${cid}label`]: {
            id: `fecomp${cid}label`,
            type: 'class',
            label: 'local',
            variants: [{
              meta: { breakpoint: null, state: null },
              props: {},
              custom_css: null,
            }],
          },
        },
      },
    ],
  };
  
  componentCache[cid] = downgraded;
  
  log(`  ${cid} (${info.occurrences}x) → "${String(textContent).slice(0, 50)}"`);
}

// Write cache
const outputPath = args.output || 'component-cache.json';
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(componentCache, null, 2), 'utf8');

console.log(`Component cache written: ${outputPath}`);
console.log(`  ${Object.keys(componentCache).length} components cached`);
console.log(`  Total instances resolved: ${[...componentMap.values()].reduce((s,i) => s + i.occurrences, 0)}`);

// Print summary
console.log('\nComponent ID → Label:');
for (const [cid, info] of componentMap) {
  const text = info.overrides.text || info.overrides.title || info.overrides.content || '(no text overrides)';
  console.log(`  ${cid.padEnd(12)} (${String(info.occurrences).padStart(2)}x) → ${String(text).slice(0, 60)}`);
}
