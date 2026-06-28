#!/usr/bin/env node
/**
 * install-skill.js
 *
 * Installiert den framer-v4-pipeline Skill in eine Novamira-Instanz.
 * Nutzt novamira/skill-write (falls vorhanden) oder einen direkten WP-Insert.
 *
 * Usage:
 *   node novamira-skill/install-skill.js
 *
 * Der Agent ruft dieses Script NICHT direkt aus - stattdessen kopiert er
 * den Inhalt von framer-v4-pipeline.md und ruft:
 *   MCP: novamira/skill-write { slug: "framer-v4-pipeline", title: "...", content: "..." }
 *
 * Falls skill-write nicht verfuegbar ist, alternativ via execute-php:
 *   MCP: novamira/execute-php { code: <PHP_CODE> }
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillFile = join(__dirname, 'framer-v4-pipeline.md');
const raw = readFileSync(skillFile, 'utf8');

// YAML Frontmatter parsen
const fmMatch = raw.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
if (!fmMatch) { console.error('ERROR: Frontmatter nicht gefunden'); process.exit(1); }

const frontmatter = fmMatch[1];
const content = fmMatch[2].trim();

const slugMatch    = frontmatter.match(/^slug:\s*(.+)$/m);
const titleMatch   = frontmatter.match(/^title:\s*(.+)$/m);
const descMatch    = frontmatter.match(/^description:\s*(.+)$/m);

const slug  = slugMatch?.[1]?.trim()  || 'framer-v4-pipeline';
const title = titleMatch?.[1]?.trim() || 'Framer V4 Pipeline Workflow';
const desc  = descMatch?.[1]?.trim()  || '';

console.log('=== NOVAMIRA SKILL INSTALLATION ===\n');
console.log('Skill-Datei:', skillFile);
console.log('Slug:', slug);
console.log('Title:', title);
console.log('Content-Laenge:', content.length, 'Zeichen\n');

console.log('--- METHODE 1: novamira/skill-write ---');
console.log('MCP-Call fuer den Agenten:\n');
console.log(JSON.stringify({
  ability: 'novamira/skill-write',
  parameters: { slug, title, content },
}, null, 2));

console.log('\n--- METHODE 2: novamira/execute-php (Fallback) ---');
const phpCode = `
$existing = get_page_by_path('${slug}', OBJECT, 'novamira_skill');
$post_data = [
  'post_title'   => '${title.replace(/'/g, "\\'")}',
  'post_name'    => '${slug}',
  'post_content' => base64_decode('${Buffer.from(content).toString('base64')}'),
  'post_status'  => 'publish',
  'post_type'    => 'novamira_skill',
];
if ($existing) {
  $post_data['ID'] = $existing->ID;
  $id = wp_update_post($post_data);
  echo "Updated skill ID: $id";
} else {
  $id = wp_insert_post($post_data);
  echo "Created skill ID: $id";
}
`.trim();

console.log('\nMCP-Call fuer den Agenten:\n');
console.log(JSON.stringify({
  ability: 'novamira/execute-php',
  parameters: { code: phpCode },
}, null, 2));console.log('\n=== AUTO-INSTALL (Fix 4) ===');
console.log('Versuche automatische Installation via MCP Bridge...\n');

async function autoInstall() {
  try {
    const mcpBridgePath = join(__dirname, '..', 'scripts', 'lib', 'mcp-bridge.js');
    const { McpBridge } = await import(mcpBridgePath);
    const mcp = await McpBridge.fromConfig();

    // Methode 1: skill-write
    try {
      const result = await mcp.call('novamira/skill-write', { slug, title, content });
      console.log('✅ Skill installiert via novamira/skill-write!');
      console.log('Ergebnis:', JSON.stringify(result, null, 2));
      return;
    } catch (e) {
      console.log('⚠️  skill-write nicht verfuegbar:', e.message);
    }

    // Methode 2: execute-php Fallback
    try {
      const result = await mcp.call('novamira/execute-php', { code: phpCode });
      console.log('✅ Skill installiert via novamira/execute-php!');
      console.log('Ergebnis:', JSON.stringify(result, null, 2));
      return;
    } catch (e) {
      console.log('⚠️  execute-php fehlgeschlagen:', e.message);
    }

    console.log('\n❌ Auto-Install fehlgeschlagen. Bitte manuell einen MCP-Call oben ausfuehren.');
  } catch (err) {
    console.log('\n⚠️  MCP Bridge nicht konfiguriert:', err.message);
    console.log('Kopiere einen der obigen MCP-Calls und fuehre ihn manuell aus.');
  }
}

autoInstall();

console.log('\nTestseite:   novamira-testseite-nick-w');
console.log('Treetsshop:  novamira-treetsshop-local');
