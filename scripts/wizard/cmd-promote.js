/**
 * scripts/wizard/cmd-promote.js — Promote Preview to Live
 *
 * Sprint 6: Extracted from wizard.js runPromote().
 * Copies a preview page's content to a live page with backup.
 */

import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { log, pipelineDir, findWorkspaceRoot } from './shared.js';

/**
 * Promoted eine Preview-Page auf eine Live-Seite.
 *
 * @param {string|null} previewId - Preview-Post-ID
 * @param {string|null} targetId - Ziel-Post-ID
 * @returns {Promise<void>}
 */
export async function runPromote(previewId, targetId) {
  if (!previewId || !targetId) {
    log.error('promote benötigt --preview-id <ID> --target-id <ID>');
    process.exit(1);
  }
  const pvId = parseInt(previewId, 10);
  const tgId = parseInt(targetId, 10);
  const rootDir = findWorkspaceRoot();

  log.step(`Promote: Preview #${pvId} → Live #${tgId}...`);

  try {
    const { McpBridge } = await import(pathToFileURL(path.join(pipelineDir, 'lib', 'mcp-bridge.js')).href);
    const mcp = await McpBridge.fromConfig();

    const preview = await mcp.call('novamira/elementor-get-content', { post_id: pvId });
    if (!preview?.content) throw new Error('Kein Content auf Preview-Seite.');

    const live = await mcp.call('novamira/elementor-get-content', { post_id: tgId });
    const backupPath = path.join(rootDir, `promote-backup-${tgId}-${Date.now().toString(36)}.json`);
    await fs.writeFile(backupPath, JSON.stringify(live, null, 2), 'utf8');
    log.info(`Live-Backup gespeichert: ${path.relative(rootDir, backupPath)}`);

    await mcp.call('novamira/elementor-set-content', {
      post_id: tgId,
      content: preview.content,
    });

    log.success(`Promote erfolgreich: Preview #${pvId} → Live #${tgId}`);
    console.log(`  Backup: ${path.relative(rootDir, backupPath)}`);
    console.log(`  Live-URL: ${process.env.WP_API_URL?.replace('/wp-json/mcp/novamira', '') || 'http://solar.local'}/?p=${tgId}\n`);
    process.exit(0);
  } catch (e) {
    log.error(`Promote fehlgeschlagen: ${e.message}`);
    process.exit(1);
  }
}
