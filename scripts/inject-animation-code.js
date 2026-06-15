#!/usr/bin/env node
/**
 * scripts/inject-animation-code.js
 *
 * Liest eine Animation-Plan-Datei (animation-plan.json) oder einzelne CLI-Argumente
 * und gibt einen MCP-Plan aus, den der Claude-Agent als
 * novamira/adrians-batch-inject-snippets Batch-Call ausführt (Standard).
 * Debug-Modus: --single-mode für N Einzelcalls via adrians-code-injector.
 *
 * Anwendungsfälle:
 *   1. Framer GSAP-Animationen nachbauen (aus framer-export analysiert)
 *   2. Custom CSS für Elementor V4 Global Classes ergänzen
 *   3. JavaScript-Events / Observer-Patterns hinzufügen
 *
 * Usage:
 *   # Plan aus Datei ausgeben:
 *   node scripts/inject-animation-code.js --plan animation-plan.json
 *
 *   # Einzelnen Snippet direkt planen:
 *   node scripts/inject-animation-code.js \
 *     --title "Hero Fade In" \
 *     --type gsap \
 *     --code-file exports/papaya/hero-animation.js \
 *     --post-id 123 \
 *     --gsap-plugins ScrollTrigger,SplitText
 *
 *   # Inline-Code:
 *   node scripts/inject-animation-code.js \
 *     --title "Custom Hero CSS" \
 *     --type css \
 *     --code ".e-heading { opacity: 0; transition: opacity .5s; }" \
 *     --location site_wide_header
 *
 *   # Ergebnisse zurückschreiben:
 *   node scripts/inject-animation-code.js --apply-results injection-results.json
 *
 * Output-Datei: animation-mcp-plan.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ─── CLI-Args parsen ──────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const hasFlag = flag => args.includes(flag);

// ─── Apply-Results Modus ──────────────────────────────────────────────────────

if (hasFlag('--apply-results')) {
  const resultsFile = getArg('--apply-results');
  if (!resultsFile || !existsSync(resultsFile)) {
    console.error(`ERROR: Datei nicht gefunden: ${resultsFile}`);
    process.exit(1);
  }

  const results  = JSON.parse(readFileSync(resultsFile, 'utf8'));
  const snippets = Array.isArray(results) ? results : results.results || [];

  const summary = snippets.map(r => ({
    title:      r.title      || '?',
    snippet_id: r.snippet_id || 0,
    action:     r.action     || '?',
    type:       r.type       || '?',
    active:     r.active     || false,
  }));

  const outputFile = 'injection-summary.json';
  writeFileSync(outputFile, JSON.stringify({ snippets: summary, generated_at: new Date().toISOString() }, null, 2));

  console.log(`\n✅ Injection-Summary gespeichert: ${outputFile}`);
  console.log(`   ${summary.filter(s => s.action === 'created').length} erstellt`);
  console.log(`   ${summary.filter(s => s.action === 'updated').length} aktualisiert`);
  console.log(`   ${summary.filter(s => s.action === 'skipped').length} übersprungen`);
  process.exit(0);
}

// ─── Plan-Datei Modus ─────────────────────────────────────────────────────────

let snippetSpecs = [];

if (hasFlag('--plan')) {
  const planFile = getArg('--plan');
  if (!planFile || !existsSync(planFile)) {
    console.error(`ERROR: Plan-Datei nicht gefunden: ${planFile}`);
    process.exit(1);
  }
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  snippetSpecs = Array.isArray(plan) ? plan : plan.snippets || [];
}

// ─── Einzelner CLI-Snippet ────────────────────────────────────────────────────

else if (getArg('--title')) {
  const codeFile = getArg('--code-file');
  let code = getArg('--code', '');

  if (codeFile) {
    if (!existsSync(codeFile)) {
      console.error(`ERROR: Code-Datei nicht gefunden: ${codeFile}`);
      process.exit(1);
    }
    code = readFileSync(codeFile, 'utf8');
  }

  const pluginsRaw  = getArg('--gsap-plugins', 'ScrollTrigger');
  const gsapPlugins = pluginsRaw.split(',').map(p => p.trim()).filter(Boolean);

  snippetSpecs.push({
    title:        getArg('--title'),
    type:         getArg('--type', 'js'),
    code,
    location:     getArg('--location') || undefined,
    post_id:      getArg('--post-id') ? parseInt(getArg('--post-id'), 10) : undefined,
    on_conflict:  getArg('--on-conflict', 'replace'),
    gsap_version: getArg('--gsap-version', '3.12.5'),
    gsap_plugins: gsapPlugins,
    description:  getArg('--description', ''),
    tags:         getArg('--tags', '').split(',').map(t => t.trim()).filter(Boolean),
  });
}

// ─── Framer-Export analysieren (Auto-Discover) ────────────────────────────────

else if (hasFlag('--from-framer-export')) {
  const exportDir = getArg('--from-framer-export', 'exports');
  snippetSpecs    = discoverFramerAnimations(exportDir);
}

else {
  showHelp();
  process.exit(0);
}

// ─── MCP-Plan generieren ──────────────────────────────────────────────────────

if (snippetSpecs.length === 0) {
  console.log('Keine Snippets im Plan. Nichts zu tun.');
  process.exit(0);
}

const isSingleMode = hasFlag('--single-mode'); // Debug-Flag: zwingt Individual-Calls

const mcpPlan = isSingleMode
  ? buildIndividualPlan(snippetSpecs)
  : buildBatchPlan(snippetSpecs);

const outputFile = getArg('--output', 'animation-mcp-plan.json');

// ─── Plan-Builder ─────────────────────────────────────────────────────────────

/**
 * Generiert einen einzelnen Batch-Call (1 MCP-Call für alle Snippets).
 * Bevorzugter Modus — reduziert N MCP-Roundtrips auf 1.
 */
function buildBatchPlan(specs) {
  return {
    description: 'Novamira adrians-batch-inject-snippets MCP-Plan (Batch)',
    generated_at: new Date().toISOString(),
    mode: 'batch',
    total: specs.length,
    steps: [{
      step: 1,
      ability: 'novamira-adrianv2/adrians-batch-inject-snippets',
      parameters: {
        snippets: specs.map(spec => buildParameters(spec)),
      },
    }],
  };
}

/**
 * Generiert individuelle Calls (ein Schritt pro Snippet).
 * Nur für Debugging via --single-mode Flag.
 */
function buildIndividualPlan(specs) {
  return {
    description: 'Novamira adrians-code-injector MCP-Plan (Single — Debug)',
    generated_at: new Date().toISOString(),
    mode: 'single',
    total: specs.length,
    steps: specs.map((spec, i) => ({
      step: i + 1,
      ability: 'novamira-adrianv2/adrians-code-injector',
      parameters: buildParameters(spec),
    })),
  };
}

// ─── Output ───────────────────────────────────────────────────────────────────
writeFileSync(outputFile, JSON.stringify(mcpPlan, null, 2));

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  inject-animation-code.js — MCP-Plan generiert      ║`);
console.log(`╚══════════════════════════════════════════════════════╝`);
console.log(`\nOutput:  ${outputFile}`);
console.log(`Snippets: ${snippetSpecs.length}\n`);

snippetSpecs.forEach((s, i) => {
  const type     = s.type?.toUpperCase().padEnd(6);
  const location = s.location || '(auto)';
  const postHint = s.post_id ? ` → Post #${s.post_id}` : ' → sitewide';
  console.log(`  ${String(i + 1).padStart(2)}. [${type}] "${s.title}"  |  ${location}${postHint}`);
});

console.log(`\n─── Agent-Anweisung ───────────────────────────────────`);
if (isSingleMode) {
  console.log(`[--single-mode] Führe ${snippetSpecs.length} individuelle Calls aus:`);
  console.log(`  Ability: novamira-adrianv2/adrians-code-injector`);
} else {
  console.log(`Führe 1 Batch-Call für alle ${snippetSpecs.length} Snippets aus:`);
  console.log(`  Ability: novamira-adrianv2/adrians-batch-inject-snippets`);
}
console.log(`  Tool:    novamira-solar-local:mcp-adapter-execute-ability`);
console.log(`\nErgebnisse als injection-results.json speichern, dann:`);
console.log(`  node scripts/inject-animation-code.js --apply-results injection-results.json\n`);

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function buildParameters(spec) {
  const p = {
    title:       spec.title,
    type:        spec.type,
    code:        spec.code,
    on_conflict: spec.on_conflict || 'replace',
  };

  if (spec.location)    p.location    = spec.location;
  if (spec.post_id)     p.post_id     = spec.post_id;
  if (spec.priority)    p.priority    = spec.priority;
  if (spec.description) p.description = spec.description;
  if (spec.tags?.length) p.tags       = spec.tags;

  // GSAP-spezifisch
  if (spec.type === 'gsap') {
    p.gsap_version = spec.gsap_version || '3.12.5';
    p.gsap_plugins = spec.gsap_plugins || ['ScrollTrigger'];
  }

  return p;
}

/**
 * Analysiert einen Framer-Export-Ordner auf Animations-Hinweise:
 *   - data-framer-appear-id → Framer Auto-Animate
 *   - CSS transition / animation Klassen
 *   - @keyframes Definitionen
 *   - JS-Dateien im Export
 *
 * Gibt ein Array von Snippet-Specs zurück (werden noch manuell befüllt).
 */
function discoverFramerAnimations(exportDir) {
  if (!existsSync(exportDir)) {
    console.warn(`WARN: Export-Dir nicht gefunden: ${exportDir}`);
    return [];
  }

  const specs = [];

  // CSS-Transitions aus styles.css lesen
  const cssFile = resolve(exportDir, 'styles.css');
  if (existsSync(cssFile)) {
    const css         = readFileSync(cssFile, 'utf8');
    const transitions = (css.match(/transition:[^;]+;/g) || []);
    const keyframes   = (css.match(/@keyframes\s+\w+/g) || []);
    const animations  = (css.match(/animation:[^;]+;/g) || []);

    if (transitions.length || keyframes.length || animations.length) {
      specs.push({
        title:       'Framer Animation CSS (aus Export)',
        type:        'css',
        code:        css,
        location:    'site_wide_header',
        description: `Auto-entdeckt: ${transitions.length} transitions, ${keyframes.length} keyframes`,
        tags:        ['framer', 'animations', 'css'],
        on_conflict: 'replace',
      });
    }
  }

  // JS-Dateien im Export (können GSAP-Code enthalten)
  const jsFiles = ['animation.js', 'framer-animation.js', 'gsap-animations.js'];
  for (const jsFile of jsFiles) {
    const jsPath = resolve(exportDir, jsFile);
    if (existsSync(jsPath)) {
      const code = readFileSync(jsPath, 'utf8');
      const isGsap = code.includes('gsap.') || code.includes('ScrollTrigger');

      specs.push({
        title:        `Framer ${jsFile}`,
        type:         isGsap ? 'gsap' : 'js',
        code,
        location:     'site_wide_footer',
        gsap_version: '3.12.5',
        gsap_plugins: ['ScrollTrigger'],
        description:  `Auto-entdeckt aus ${jsFile}`,
        tags:         ['framer', 'animations', isGsap ? 'gsap' : 'js'],
        on_conflict:  'replace',
      });
    }
  }

  if (specs.length === 0) {
    console.log(`INFO: Keine Animations-Dateien in ${exportDir} gefunden.`);
    console.log(`      Erstelle animation-plan.json manuell oder nutze --title/--type/--code.`);
  }

  return specs;
}

function showHelp() {
  console.log(`
inject-animation-code.js — Framer → WPCode MCP-Plan Generator

Usage:
  # Plan aus Datei:
  node scripts/inject-animation-code.js --plan animation-plan.json

  # Einzelner Snippet:
  node scripts/inject-animation-code.js \\
    --title "Hero GSAP" --type gsap \\
    --code-file exports/papaya/hero.js \\
    --post-id 123 \\
    --gsap-plugins ScrollTrigger,SplitText

  # Inline-Code:
  node scripts/inject-animation-code.js \\
    --title "Custom CSS" --type css \\
    --code ".hero { opacity: 0; }" \\
    --location site_wide_header

  # Framer-Export auto-analysieren:
  node scripts/inject-animation-code.js --from-framer-export exports/papaya/

  # Ergebnisse einlesen:
  node scripts/inject-animation-code.js --apply-results injection-results.json

Typen: css | js | html | php | gsap
Locations: site_wide_header | site_wide_footer | frontend | everywhere | after_post
  `);
}
