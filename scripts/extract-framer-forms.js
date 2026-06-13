#!/usr/bin/env node
/**
 * extract-framer-forms.js  —  A3: Form Extraction (Sprint 3)
 *
 * Erkennt Framer Formulare (Input-Felder, Labels, Submit-Buttons)
 * und generiert V4 Atomic Form Strukturen.
 *
 * Usage:
 *   node scripts/extract-framer-forms.js \
 *     --html FramerExport/index.html \
 *     --output form-plan.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    html:     { type: 'string' },
    xml:      { type: 'string' },
    output:   { type: 'string' },
    verbose:  { type: 'boolean', default: false },
  },
  strict: false,
});

if (!args.html && !args.xml) {
  process.stderr.write('Error: --html <framer-export> oder --xml <file> required\n');
  process.exit(2);
}

const log = (...m) => { if (args.verbose) process.stderr.write('[form-extract] ' + m.join(' ') + '\n'); };

// ─── FORM DETECTION ─────────────────────────────────────────────────────────

function detectFormElements(html) {
  const forms = [];

  // Find all <input>, <textarea>, <select> elements with their context
  const inputRe = /<input\s+[^>]*?\/?>/gi;
  const textareaRe = /<textarea[^>]*>([\s\S]*?)<\/textarea>/gi;
  const buttonRe = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  const formRe = /<form[^>]*>([\s\S]*?)<\/form>/gi;

  // Try to find explicit <form> elements first
  let formMatch;
  while ((formMatch = formRe.exec(html)) !== null) {
    const formContent = formMatch[1];
    const formAttrs = formMatch[0];
    const action = (formAttrs.match(/action=["']([^"']+)["']/) || [])[1] || 'email';

    const fields = extractFieldsFromBlock(formContent);
    const submitText = extractSubmitFromBlock(formContent);

    if (fields.length > 0) {
      forms.push({
        name: 'ContactForm',
        action: { type: action.includes('mailto:') ? 'email' : 'email', to: action.replace('mailto:', '') || '{{email}}' },
        fields,
        submit_text: submitText || 'Submit',
      });
    }
  }

  // Fallback: Detect form-like patterns without <form> tag
  if (forms.length === 0) {
    const allInputs = detectStandaloneInputs(html);
    if (allInputs.length >= 2) {
      forms.push({
        name: 'ContactForm',
        action: { type: 'email', to: '{{email}}' },
        fields: allInputs,
        submit_text: detectSubmitText(html) || 'Submit',
      });
    }
  }

  return forms;
}

function extractFieldsFromBlock(html) {
  const fields = [];

  const inputRe = /<input\s+([^>]*?)\/?>/gi;
  let m;
  while ((m = inputRe.exec(html)) !== null) {
    const attrs = m[1];
    const type = (attrs.match(/type=["']([^"']+)["']/i) || [])[1] || 'text';
    const name = (attrs.match(/name=["']([^"']+)["']/i) || [])[1] || '';
    const placeholder = (attrs.match(/placeholder=["']([^"']+)["']/i) || [])[1] || '';
    const required = /\brequired\b/i.test(attrs);

    // Find preceding label for this input
    const label = findLabelForInput(html, m.index, name);

    fields.push({
      type: type === 'email' ? 'email' : 'text',
      label: label || name || placeholder || 'Field',
      placeholder: placeholder || label || '',
      required,
    });
  }

  // Detect <textarea>
  const textareaRe = /<textarea[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/textarea>/gi;
  let tm;
  while ((tm = textareaRe.exec(html)) !== null) {
    fields.push({
      type: 'textarea',
      label: tm[1] || 'Message',
      placeholder: 'Your message',
      required: false,
    });
  }

  return fields;
}

function extractSubmitFromBlock(html) {
  const buttonRe = /<button[^>]*type=["']submit["'][^>]*>([\s\S]*?)<\/button>/gi;
  const m = buttonRe.exec(html);
  if (m) return m[1].trim();

  const inputRe = /<input[^>]*type=["']submit["'][^>]*value=["']([^"']+)["'][^>]*\/?>/gi;
  const im = inputRe.exec(html);
  if (im) return im[1];

  return null;
}

function findLabelForInput(html, inputIndex, inputName) {
  const before = html.slice(Math.max(0, inputIndex - 500), inputIndex);
  const labelMatch = before.match(/<label[^>]*>([\s\S]*?)<\/label>\s*$/i);
  if (labelMatch) return labelMatch[1].trim();

  const forMatch = before.match(/<label[^>]*for=["']([^"']+)["'][^>]*>/i);
  if (forMatch && forMatch[1] === inputName) {
    const afterLabel = html.slice(before.lastIndexOf(forMatch[0]));
    const content = afterLabel.match(/<label[^>]*>([\s\S]*?)<\/label>/i);
    if (content) return content[1].trim();
  }

  return null;
}

function detectStandaloneInputs(html) {
  const fields = [];
  const inputRe = /<input\s+([^>]*?)\/?>/gi;
  let m;
  let idx = 0;
  while ((m = inputRe.exec(html)) !== null) {
    const attrs = m[1];
    const type = (attrs.match(/type=["']([^"']+)["']/i) || [])[1] || 'text';
    if (type === 'hidden' || type === 'submit') continue;
    const placeholder = (attrs.match(/placeholder=["']([^"']+)["']/i) || [])[1] || '';
    const name = (attrs.match(/name=["']([^"']+)["']/i) || [])[1] || '';
    fields.push({
      type: type === 'email' ? 'email' : 'text',
      label: name || placeholder || `Field ${++idx}`,
      placeholder: placeholder || '',
      required: /required/i.test(attrs),
    });
  }
  return fields;
}

function detectSubmitText(html) {
  const btnMatch = html.match(/<button[^>]*>(Submit|Send|Absenden|Senden|Sign Up|Subscribe)<\/button>/i);
  if (btnMatch) return btnMatch[1];

  const inputMatch = html.match(/<input[^>]*value=["'](Submit|Send|Absenden|Senden|Sign Up|Subscribe)["'][^>]*\/?>/i);
  if (inputMatch) return inputMatch[1];

  return null;
}

// ─── V4 ATOMIC FORM BUILDER ─────────────────────────────────────────────────

function buildAtomicFormTree(formDef) {
  const containerId = `${formDef.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-form`;

  const elements = [];

  for (const field of formDef.fields) {
    // Label
    elements.push({
      type: 'e-field-label',
      elType: 'widget',
      widgetType: 'e-field-label',
      id: `${containerId}-label-${field.label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
      settings: {
        'field-label': { '$$type': 'string', value: field.label },
        classes: { '$$type': 'classes', value: [] },
      },
      styles: {},
    });

    // Input
    elements.push({
      type: 'e-field-input',
      elType: 'widget',
      widgetType: 'e-field-input',
      id: `${containerId}-input-${field.label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
      settings: {
        'field-placeholder': { '$$type': 'string', value: field.placeholder },
        'field-required': { '$$type': 'boolean', value: field.required },
        classes: { '$$type': 'classes', value: [] },
      },
      styles: {},
    });
  }

  // Submit button
  elements.push({
    type: 'e-field-submit',
    elType: 'widget',
    widgetType: 'e-field-submit',
    id: `${containerId}-submit`,
    settings: {
      'submit-text': { '$$type': 'string', value: formDef.submit_text || 'Submit' },
      classes: { '$$type': 'classes', value: [] },
    },
    styles: {},
  });

  return {
    widgetType: 'e-flexbox',
    id: containerId,
    settings: {
      tag: 'form',
      classes: { '$$type': 'classes', value: [] },
    },
    styles: {},
    elements,
  };
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

let htmlContent = '';

if (args.html && fs.existsSync(args.html)) {
  htmlContent = fs.readFileSync(args.html, 'utf8');
} else if (args.xml && fs.existsSync(args.xml)) {
  htmlContent = fs.readFileSync(args.xml, 'utf8');
}

if (!htmlContent) {
  process.stderr.write('Error: No HTML/XML content loaded\n');
  process.exit(2);
}

const forms = detectFormElements(htmlContent);
const formTrees = forms.map(buildAtomicFormTree);

const result = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: args.html || args.xml,
    totalForms: forms.length,
  },
  forms: forms.map((f, i) => ({
    ...f,
    v4_tree: formTrees[i],
  })),
  // B4: create-atomic-form MCP Ability Interface
  mcpRouting: {
    ability: 'novamira-adrianv2/create-atomic-form',
    note: 'B4: Diese Ability muss im novamira-adrianv2 Plugin implementiert werden. Sie ist die EINZIGE neue Ability im gesamten Sprint-Plan.',
    example_call: {
      ability_name: 'novamira-adrianv2/create-atomic-form',
      parameters: {
        post_id: '{{post_id}}',
        form: {
          action: { type: 'email', to: 'hello@example.com', subject: 'New Contact' },
          fields: [
            { type: 'text', label: 'Full Name', placeholder: 'Your name', required: true },
            { type: 'email', label: 'Email Address', placeholder: 'you@example.com', required: true },
          ],
          submit_text: 'Send Message',
        },
      },
    },
  },
};

if (args.output) {
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(result, null, 2), 'utf8');
  process.stderr.write(`[form-extract] ${forms.length} forms → ${args.output}\n`);
} else {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

process.exit(0);
