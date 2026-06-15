#!/usr/bin/env node
/**
 * design-system-builder.js — Phase 3: Design-System-Automatisierung
 *
 * Nimmt token-mapping.json (aus Phase 2) und erstellt:
 *   1. variables.json — Global Variables mit MD5-basierten GV-IDs
 *   2. global-classes.json — Global Classes aus Text-Styles
 *   3. token-mapping-updated.json — Token-Mapping mit gv_id-Feldern
 *   4. batch-create-plan.json — MCP-Call-Plan für batch-create-variables
 *   5. font-resolution.json — Font-Mapping mit Upload-Plan
 *
 * MD5-GV-IDs sind deterministisch — KEIN Server-Call nötig.
 *   generateGvId("Theme Color / Very Dark Green", "color") → "e-gv-a3f2b1c"
 *
 * Usage:
 *   node scripts/design-system-builder.js \
 *     --token-map token-mapping.json \
 *     --output-dir FramerExport/design-system/
 */

import fs   from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { normalizeHex } from './lib/framer-utils.js';

const { values: args } = parseArgs({
  options: {
    'token-map':     { type: 'string' },
    'output-dir':    { type: 'string' },
    'namespace':     { type: 'string', default: 'framer' },
    verbose:         { type: 'boolean', default: false },
  },
  strict: false,
});

const log = (...m) => { if (args.verbose) process.stderr.write('[ds-builder] ' + m.join(' ') + '\n'); };

if (!args['token-map']) {
  process.stderr.write('Error: --token-map required\n');
  process.exit(2);
}

const tokenMap = JSON.parse(fs.readFileSync(args['token-map'], 'utf8'));
const outDir = args['output-dir'] || path.dirname(path.resolve(args['token-map']));
fs.mkdirSync(outDir, { recursive: true });

const NS = args.namespace;

// ─────────────────────────────────────────────
// MD5-BASED GV-ID GENERATION (deterministisch)
// ─────────────────────────────────────────────

function generateGvId(name, type) {
  const hash = createHash('md5')
    .update(`novamira:${NS}:${type}:${name}`)
    .digest('hex')
    .slice(0, 7);
  return `e-gv-${hash}`;
}

function generateGcId(name) {
  const hash = createHash('md5')
    .update(`novamira:${NS}:gc:${name}`)
    .digest('hex')
    .slice(0, 12);
  return `gc-${hash}`;
}

// ─────────────────────────────────────────────
// BUILD VARIABLES
// ─────────────────────────────────────────────

function buildVariables(tokenMap) {
  const variables = [];

  // Color variables
  for (const [stylePath, data] of Object.entries(tokenMap.colors || {})) {
    const label = stylePath.replace(/\//g, ' / ').replace(/\s+/g, ' ').trim();
    const gvId = generateGvId(stylePath, 'color');
    variables.push({
      id: gvId,
      label,
      type: 'color',
      value: data.hex,
      source_path: stylePath,
      matched_by: data.matched_by || 'manual',
    });
    // Update token map with gv_id
    data.gv_id = gvId;
  }

  // Font variables
  for (const font of (tokenMap.fonts || [])) {
    const gvId = generateGvId(font.family, 'font');
    variables.push({
      id: gvId,
      label: font.family,
      type: 'font',
      value: font.family,
      weights: font.weights,
      sources: font.sources,
    });
    font.gv_id = gvId;
  }

  return variables;
}

// ─────────────────────────────────────────────
// BUILD GLOBAL CLASSES
// ─────────────────────────────────────────────

function buildGlobalClasses(tokenMap, variables) {
  const classes = [];
  const varMap = new Map(variables.map(v => [v.id, v]));

  // Text-Style → Global Classes
  for (const [stylePath, data] of Object.entries(tokenMap.textStyles || {})) {
    const label = stylePath.split('/').pop().replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
    const gcId = generateGcId(stylePath);
    const props = {};

    // Only add props that have actual values (not undefined)
    if (data.size)       props['font-size']   = { '$$type': 'size', value: { size: parseFloat(data.size), unit: 'px' } };
    if (data.weight)     props['font-weight'] = { '$$type': 'string', value: String(data.weight) };
    if (data.lineHeight) props['line-height'] = { '$$type': 'size', value: { size: parseFloat(data.lineHeight), unit: 'custom' } };
    if (data.color)      props['color']       = { '$$type': 'color', value: data.color };

    if (Object.keys(props).length === 0) continue;  // Skip empty text styles

    classes.push({
      id: gcId,
      label,
      type: 'typography',
      source_path: stylePath,
      variants: [{ meta: { breakpoint: null, state: null }, props }],
    });
  }

  // Color → Background Global Classes
  for (const [stylePath, data] of Object.entries(tokenMap.colors || {})) {
    // Sanitize label: /Theme Color/Very Dark Green → bg-theme-color-very-dark-green
    const label = ('bg-' + stylePath.replace(/\//g, '-').replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()).slice(0, 50);
    const gcId = generateGcId(`bg-${stylePath}`);

    classes.push({
      id: gcId,
      label,
      type: 'background',
      source_path: stylePath,
      gv_ref: data.gv_id,
      variants: [{
        meta: { breakpoint: null, state: null },
        props: {
          'background': {
            '$$type': 'background',
            value: { color: { '$$type': 'global-color-variable', value: data.gv_id } },
          },
        },
      }],
    });
  }

  return classes;
}

// ─────────────────────────────────────────────
// BUILD BATCH-CREATE PLAN
// ─────────────────────────────────────────────

function buildBatchCreatePlan(variables) {
  const newVars = variables.filter(v => v.type === 'color' || v.type === 'font');
  return {
    meta: {
      generated_at: new Date().toISOString(),
      total_variables: newVars.length,
      strategy: 'skip',  // 'skip' = bestehende nicht ueberschreiben
    },
    mcp_call: {
      ability_name: 'novamira-adrianv2/batch-create-variables',
      parameters: {
        variables: newVars.map(v => ({
          label: v.label,
          type: v.type,
          value: v.value,
        })),
      },
    },
    instructions: [
      '1. session-start-checklist → setup-v4-foundation (frische IDs holen)',
      '2. batch-create-variables via MCP mit obigem mcp_call',
      '3. export-design-system what=all → IDs verifizieren',
      '4. convert-xml-to-v4.js --tokens token-mapping-updated.json',
    ],
  };
}

// ─────────────────────────────────────────────
// BUILD FONT-RESOLUTION
// ─────────────────────────────────────────────

function buildFontResolution(tokenMap) {
  const fonts = [];
  for (const font of (tokenMap.fonts || [])) {
    for (const src of font.sources) {
      fonts.push({
        family: font.family,
        weight: src.weight,
        style: src.style,
        url: src.url,
        display: src.display,
        source: src.source,
        gv_id: font.gv_id,
        needs_upload: src.source === 'framer-cdn',  // Framer CDN URLs nicht nachhaltig
      });
    }
  }
  return { fonts };
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

if (!tokenMap || typeof tokenMap !== 'object') {
  process.stderr.write('Error: Invalid token-mapping.json\n');
  process.exit(2);
}

log('Building design system from:', args['token-map']);

// Step 1: Variables
const variables = buildVariables(tokenMap);
log(`Generated ${variables.length} variables`);

// Write variables.json
const variablesPath = path.join(outDir, 'variables.json');
fs.writeFileSync(variablesPath, JSON.stringify({
  meta: { generated_at: new Date().toISOString(), total: variables.length },
  variables,
}, null, 2), 'utf8');
process.stderr.write(`✓ variables.json → ${variablesPath} (${variables.length} variables)\n`);

// Step 2: Global Classes
const classes = buildGlobalClasses(tokenMap, variables);
log(`Generated ${classes.length} global classes`);

const classesPath = path.join(outDir, 'global-classes.json');
fs.writeFileSync(classesPath, JSON.stringify({
  meta: { generated_at: new Date().toISOString(), total: classes.length },
  classes,
}, null, 2), 'utf8');
process.stderr.write(`✓ global-classes.json → ${classesPath} (${classes.length} classes)\n`);

// Step 3: Updated token mapping (with gv_ids)
const tokenMapPath = path.join(outDir, 'token-mapping-updated.json');
fs.writeFileSync(tokenMapPath, JSON.stringify(tokenMap, null, 2), 'utf8');
process.stderr.write(`✓ token-mapping-updated.json → ${tokenMapPath}\n`);

// Step 4: Batch-create plan
const plan = buildBatchCreatePlan(variables);
const planPath = path.join(outDir, 'batch-create-plan.json');
fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
process.stderr.write(`✓ batch-create-plan.json → ${planPath}\n`);

// Step 5: Font resolution
const fontRes = buildFontResolution(tokenMap);
const fontPath = path.join(outDir, 'font-resolution.json');
fs.writeFileSync(fontPath, JSON.stringify(fontRes, null, 2), 'utf8');
process.stderr.write(`✓ font-resolution.json → ${fontPath} (${fontRes.fonts.length} fonts)\n`);

// Summary
const newVars = variables.filter(v => !v.id || v.id.startsWith('e-gv-'));
process.stderr.write([
  `\n📊 Design System Summary:`,
  `  ${variables.length} variables (${variables.filter(v=>v.type==='color').length} colors, ${variables.filter(v=>v.type==='font').length} fonts)`,
  `  ${classes.length} global classes`,
  `  ${fontRes.fonts.length} font entries`,
  `  ${fontRes.fonts.filter(f=>f.needs_upload).length} fonts need upload`,
].join('\n') + '\n');

process.exit(0);
