/**
 * tests/lib/gsap-enqueue-integration.test.js
 *
 * Integrationstest: Extraktor → inject-animation-code.js → Enqueue-Prepend
 *
 * Validiert den kompletten Flow:
 *  1. Animation-Plan mit GSAP-Snippets → inject-animation-code.js prependet Enqueue
 *  2. Plan ohne GSAP-Snippets → kein Enqueue
 *  3. Gemischter Plan (CSS + GSAP) → korrekte Reihenfolge
 *  4. Leerer Plan → sauberer Exit ohne Output
 *  5. Enqueue im Output-MCP-Plan hat korrektes Schema
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INJECT_SCRIPT = resolve(__dirname, '../../scripts/inject-animation-code.js');

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'gsap-enqueue-integration-'));
}

function writePlan(dir, snippets) {
  const planPath = join(dir, 'animation-plan.json');
  writeFileSync(planPath, JSON.stringify(snippets, null, 2));
  return planPath;
}

function runInject(planPath, outputPath, extraFlags = '') {
  const cmd = `node "${INJECT_SCRIPT}" --plan "${planPath}" --output "${outputPath}" ${extraFlags}`;
  // Let execSync throw on non-zero exit — the script only exits 0 for "empty plan",
  // so any real error (syntax error, missing file, corrupted JSON) should surface immediately.
  return execSync(cmd, { encoding: 'utf8', cwd: join(planPath, '..') });
}

// ─── Test 1: GSAP-Plan → Enqueue wird vorangestellt ───────────────────────────

test('integration: Plan mit GSAP-Snippet → Enqueue als erstes Snippet im MCP-Plan', () => {
  const dir = tmpDir();
  try {
    const plan = [
      {
        title: 'Hero GSAP ScrollReveal',
        type: 'gsap',
        code: 'gsap.from(".hero", { opacity: 0, y: 50 })',
        location: 'site_wide_footer',
        gsap_version: '3.12.5',
        gsap_plugins: ['ScrollTrigger'],
        on_conflict: 'replace',
        tags: ['framer', 'gsap'],
      },
    ];

    const planPath = writePlan(dir, plan);
    const outputPath = join(dir, 'mcp-plan.json');

    const stdout = runInject(planPath, outputPath);

    // Verify output file exists
    assert.ok(existsSync(outputPath), 'MCP-Plan Output-Datei muss existieren');

    const mcpPlan = JSON.parse(readFileSync(outputPath, 'utf8'));

    // Verify total count (1 original + 1 enqueue)
    assert.equal(mcpPlan.total, 2, 'total muss 2 sein (1 GSAP + 1 Enqueue)');

    // Verify first snippet is the enqueue
    const snippets = mcpPlan.steps[0].parameters.snippets;
    assert.equal(snippets.length, 2);

    const first = snippets[0];
    assert.equal(first.title, 'GSAP Global Enqueue');
    assert.equal(first.type, 'php');
    assert.equal(first.location, 'site_wide_header');
    assert.equal(first.priority, 10);
    assert.equal(first.on_conflict, 'skip');

    // Verify second snippet is our original GSAP
    const second = snippets[1];
    assert.equal(second.title, 'Hero GSAP ScrollReveal');
    assert.equal(second.type, 'gsap');

    // Verify stdout contains the prepend message
    assert.match(stdout, /GSAP Global Enqueue.*automatisch vorangestellt/);

    // Verify enqueue is first in output listing (index 1)
    assert.match(stdout, /1\.\s+\[PHP\s+].*GSAP Global Enqueue/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 2: Kein GSAP → Kein Enqueue ─────────────────────────────────────────

test('integration: Plan ohne GSAP-Snippet → kein Enqueue im MCP-Plan', () => {
  const dir = tmpDir();
  try {
    const plan = [
      {
        title: 'Global Animations CSS',
        type: 'css',
        code: '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }',
        location: 'site_wide_header',
        on_conflict: 'replace',
        tags: ['css'],
      },
    ];

    const planPath = writePlan(dir, plan);
    const outputPath = join(dir, 'mcp-plan.json');

    const stdout = runInject(planPath, outputPath);

    const mcpPlan = JSON.parse(readFileSync(outputPath, 'utf8'));
    const snippets = mcpPlan.steps[0].parameters.snippets;

    // Total should match original (no enqueue added)
    assert.equal(mcpPlan.total, 1, 'total muss 1 sein (kein Enqueue erwartet)');
    assert.equal(snippets.length, 1);

    // Verify the CSS snippet is present
    assert.equal(snippets[0].title, 'Global Animations CSS');
    assert.equal(snippets[0].type, 'css');

    // Verify NO enqueue snippet exists
    const hasEnqueue = snippets.some(s => s.title === 'GSAP Global Enqueue');
    assert.equal(hasEnqueue, false, 'Kein Enqueue im Plan ohne GSAP-Snippets');

    // Verify stdout does NOT contain prepend message
    assert.ok(!stdout.includes('automatisch vorangestellt'), 'stdout darf keine Prepand-Meldung enthalten');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 3: Gemischter Plan (CSS + GSAP) ─────────────────────────────────────

test('integration: Gemischter Plan (CSS + GSAP) → korrekte Reihenfolge mit Enqueue zuerst', () => {
  const dir = tmpDir();
  try {
    const plan = [
      {
        title: 'Animation CSS Basis',
        type: 'css',
        code: '@keyframes slideUp { from { transform: translateY(20px); } }',
        location: 'site_wide_header',
        on_conflict: 'replace',
        tags: ['css'],
      },
      {
        title: 'Features GSAP Stagger',
        type: 'gsap',
        code: 'gsap.from(".feature-card", { opacity: 0, y: 60, stagger: 0.15 })',
        location: 'site_wide_footer',
        gsap_version: '3.12.5',
        gsap_plugins: ['ScrollTrigger'],
        on_conflict: 'replace',
        tags: ['framer', 'gsap'],
      },
      {
        title: 'Footer JS Toggle',
        type: 'js',
        code: 'document.querySelector(".toggle")?.addEventListener("click", () => {})',
        location: 'site_wide_footer',
        on_conflict: 'replace',
        tags: ['js'],
      },
    ];

    const planPath = writePlan(dir, plan);
    const outputPath = join(dir, 'mcp-plan.json');

    runInject(planPath, outputPath);

    const mcpPlan = JSON.parse(readFileSync(outputPath, 'utf8'));
    const snippets = mcpPlan.steps[0].parameters.snippets;

    // Total: 3 original + 1 enqueue = 4
    assert.equal(mcpPlan.total, 4);
    assert.equal(snippets.length, 4);

    // Correct order: Enqueue first, then CSS, GSAP, JS
    assert.equal(snippets[0].title, 'GSAP Global Enqueue');
    assert.equal(snippets[0].type, 'php');

    assert.equal(snippets[1].title, 'Animation CSS Basis');
    assert.equal(snippets[1].type, 'css');

    assert.equal(snippets[2].title, 'Features GSAP Stagger');
    assert.equal(snippets[2].type, 'gsap');

    assert.equal(snippets[3].title, 'Footer JS Toggle');
    assert.equal(snippets[3].type, 'js');

    // GSAP snippet parameters should be preserved
    assert.equal(snippets[2].gsap_version, '3.12.5');
    assert.deepEqual(snippets[2].gsap_plugins, ['ScrollTrigger']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 4: Mehrere GSAP-Snippets → nur ein Enqueue ──────────────────────────

test('integration: Mehrere GSAP-Snippets → nur ein Enqueue (keine Duplikate)', () => {
  const dir = tmpDir();
  try {
    const plan = [
      {
        title: 'Hero GSAP',
        type: 'gsap',
        code: 'gsap.from(".hero", { opacity: 0 })',
        location: 'site_wide_footer',
        gsap_version: '3.12.5',
        gsap_plugins: ['ScrollTrigger'],
        on_conflict: 'replace',
      },
      {
        title: 'Features GSAP',
        type: 'gsap',
        code: 'gsap.from(".features", { opacity: 0 })',
        location: 'site_wide_footer',
        gsap_version: '3.12.5',
        gsap_plugins: ['ScrollTrigger'],
        on_conflict: 'replace',
      },
    ];

    const planPath = writePlan(dir, plan);
    const outputPath = join(dir, 'mcp-plan.json');

    runInject(planPath, outputPath);

    const mcpPlan = JSON.parse(readFileSync(outputPath, 'utf8'));
    const snippets = mcpPlan.steps[0].parameters.snippets;

    // Total: 2 GSAP + 1 enqueue = 3
    assert.equal(mcpPlan.total, 3);
    assert.equal(snippets.length, 3);

    // Count GSAP Global Enqueue occurrences — should be exactly 1
    const enqueueCount = snippets.filter(s => s.title === 'GSAP Global Enqueue').length;
    assert.equal(enqueueCount, 1, 'Genau ein GSAP Global Enqueue Snippet');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 5: Enqueue-Schema im Output ist vollständig ─────────────────────────

test('integration: Enqueue-Snippet im MCP-Plan hat vollständiges Schema', () => {
  const dir = tmpDir();
  try {
    const plan = [
      {
        title: 'Test GSAP',
        type: 'gsap',
        code: 'gsap.to(".el", { x: 100 })',
        location: 'site_wide_footer',
        gsap_version: '3.12.5',
        gsap_plugins: [],
        on_conflict: 'replace',
      },
    ];

    const planPath = writePlan(dir, plan);
    const outputPath = join(dir, 'mcp-plan.json');

    runInject(planPath, outputPath);

    const mcpPlan = JSON.parse(readFileSync(outputPath, 'utf8'));
    const snippets = mcpPlan.steps[0].parameters.snippets;
    const enqueue = snippets[0];

    // Enqueue schema validation
    assert.equal(enqueue.title, 'GSAP Global Enqueue');
    assert.equal(enqueue.type, 'php');
    assert.equal(typeof enqueue.code, 'string');
    assert.equal(enqueue.location, 'site_wide_header');
    assert.equal(enqueue.priority, 10);
    assert.equal(enqueue.on_conflict, 'skip');

    // tags should be present
    assert.ok(Array.isArray(enqueue.tags));
    assert.ok(enqueue.tags.includes('gsap'));
    assert.ok(enqueue.tags.includes('enqueue'));

    // PHP code must contain wp_enqueue_script calls
    assert.match(enqueue.code, /wp_enqueue_script/);
    assert.match(enqueue.code, /gsap-core/);
    assert.match(enqueue.code, /gsap-st/);
    assert.match(enqueue.code, /ScrollTrigger/);
    assert.match(enqueue.code, /3\.12\.5/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 6: --single-mode funktioniert mit Enqueue ───────────────────────────

test('integration: --single-mode generiert individuelle Steps mit Enqueue als ersten Step', () => {
  const dir = tmpDir();
  try {
    const plan = [
      {
        title: 'Single GSAP Test',
        type: 'gsap',
        code: 'gsap.to(".el", { opacity: 0.5 })',
        location: 'site_wide_footer',
        gsap_version: '3.12.5',
        gsap_plugins: ['ScrollTrigger'],
        on_conflict: 'replace',
      },
    ];

    const planPath = writePlan(dir, plan);
    const outputPath = join(dir, 'mcp-plan.json');

    runInject(planPath, outputPath, '--single-mode');

    const mcpPlan = JSON.parse(readFileSync(outputPath, 'utf8'));

    assert.equal(mcpPlan.mode, 'single');
    assert.equal(mcpPlan.total, 2); // 1 GSAP + 1 enqueue

    // Each step should have its own ability and parameters
    assert.equal(mcpPlan.steps.length, 2);
    assert.equal(mcpPlan.steps[0].step, 1);
    assert.equal(mcpPlan.steps[0].ability, 'novamira-adrianv2/adrians-code-injector');
    assert.equal(mcpPlan.steps[0].parameters.title, 'GSAP Global Enqueue');

    assert.equal(mcpPlan.steps[1].step, 2);
    assert.equal(mcpPlan.steps[1].parameters.title, 'Single GSAP Test');
    assert.equal(mcpPlan.steps[1].parameters.type, 'gsap');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 7: Enqueue enthält version-pinned JS-Delivr URLs ────────────────────

test('integration: Enqueue PHP-Code enthält version-gepinnte jsDelivr URLs', () => {
  const dir = tmpDir();
  try {
    const plan = [
      {
        title: 'Version Check GSAP',
        type: 'gsap',
        code: 'gsap.from(".el", { opacity: 0 })',
        location: 'site_wide_footer',
        gsap_version: '3.12.5',
        gsap_plugins: ['ScrollTrigger'],
        on_conflict: 'replace',
      },
    ];

    const planPath = writePlan(dir, plan);
    const outputPath = join(dir, 'mcp-plan.json');

    runInject(planPath, outputPath);

    const mcpPlan = JSON.parse(readFileSync(outputPath, 'utf8'));
    const enqueue = mcpPlan.steps[0].parameters.snippets[0];

    // Check CDN URLs with version pinning
    assert.match(enqueue.code, /cdn\.jsdelivr\.net\/npm\/gsap@3\.12\.5\/dist\/gsap\.min\.js/);
    assert.match(enqueue.code, /cdn\.jsdelivr\.net\/npm\/gsap@3\.12\.5\/dist\/ScrollTrigger\.min\.js/);

    // Check version parameter
    const versionMatches = enqueue.code.match(/'3\.12\.5'/g);
    assert.ok(versionMatches, 'Version 3.12.5 muss im Code vorkommen');
    assert.ok(versionMatches.length >= 2, `Mind. 2× Version 3.12.5, gefunden: ${versionMatches?.length || 0}`);

    // ScrollTrigger depends on gsap-core
    assert.match(enqueue.code, /wp_enqueue_script\(\s*'gsap-st'\s*,\s*[^,]+,\s*\[\s*'gsap-core'\s*\]/);

    // Uses add_action for wp_enqueue_scripts
    assert.match(enqueue.code, /add_action\(\s*'wp_enqueue_scripts'/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
