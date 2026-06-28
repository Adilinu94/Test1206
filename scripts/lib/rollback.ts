/**
 * scripts/lib/rollback.ts — Phase 1.2 Fix: MCP-Plan-Generator
 */

import fs from 'node:fs';
import path from 'node:path';

export interface AgentResults {
  getContent?: { content?: unknown[]; data?: { content?: unknown[] }; [key: string]: unknown };
  pageSettings?: { settings?: Record<string, unknown>; data?: { settings?: Record<string, unknown> }; [key: string]: unknown };
  [key: string]: unknown;
}

export interface Backup {
  postId: number;
  timestamp: string;
  content: unknown[];
  pageSettings: Record<string, unknown> | null;
  elementCount: number;
}

export interface McpCall {
  ability: string;
  params: Record<string, unknown>;
  save_as?: string;
  description?: string;
  phase?: string;
  note?: string;
}

export interface BackupPlanResult {
  plan: { step: string; description: string; mcp_calls: McpCall[]; agent_instruction: string } | null;
  backup: Backup | null;
}

export interface RestorePlanResult {
  plan: { step: string; description: string; mcp_calls: McpCall[]; page_settings_restore?: McpCall; agent_instruction: string } | null;
  backup?: Backup;
  error?: string;
}

export class RollbackManager {
  private dir: string;

  constructor(rollbackDir: string | null = null) {
    this.dir = rollbackDir || path.resolve(process.cwd(), '.rollback');
    this._ensureDir();
  }

  private _ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  private _backupPath(postId: number): string {
    return path.join(this.dir, `backup-${postId}.json`);
  }

  private _backupExists(postId: number): boolean {
    return fs.existsSync(this._backupPath(postId));
  }

  backupPlan(postId: number, agentResults: AgentResults | null = null): BackupPlanResult {
    if (agentResults) {
      const content = agentResults.getContent?.content
        || agentResults.getContent?.data?.content
        || agentResults.getContent
        || [];
      const pageSettings = agentResults.pageSettings?.settings
        || agentResults.pageSettings?.data?.settings
        || agentResults.pageSettings
        || null;

      const backup: Backup = {
        postId,
        timestamp: new Date().toISOString(),
        content: Array.isArray(content) ? content : [],
        pageSettings: pageSettings as Record<string, unknown> | null,
        elementCount: this._countElements(content as unknown[]),
      };

      fs.writeFileSync(this._backupPath(postId), JSON.stringify(backup, null, 2), 'utf8');
      process.stderr.write(`[rollback] Backup saved for post ${postId} (${backup.elementCount} elements)\n`);

      return { plan: null, backup };
    }

    const plan = {
      step: 'rollback-backup',
      description: `Sichere Post ${postId} vor dem Build für Rollback`,
      mcp_calls: [
        {
          ability: 'novamira/elementor-get-content',
          params: { post_id: postId, full_dump: true },
          save_as: 'getContent',
          description: 'Hole aktuellen Elementor-Inhalt',
        },
        {
          ability: 'novamira/adrians-page-settings',
          params: { post_id: postId },
          save_as: 'pageSettings',
          description: 'Hole Page-Settings (optional, nicht kritisch)',
        },
      ],
      agent_instruction: `
Führe beide MCP-Calls aus und übergib die Ergebnisse an RollbackManager.backupPlan(postId, agentResults).
Der agentResults-Parameter erwartet:
  {
    getContent: <ergebnis von elementor-get-content>,
    pageSettings: <ergebnis von adrians-page-settings>
  }
`.trim(),
    };

    process.stderr.write(`[rollback] MCP backup plan generated for post ${postId}\n`);
    return { plan, backup: null };
  }

  restorePlan(postId: number): RestorePlanResult {
    const backupPath = this._backupPath(postId);
    if (!fs.existsSync(backupPath)) {
      return { plan: null, error: `No backup found for post ${postId} at ${backupPath}` };
    }

    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8')) as Backup;
    const content = Array.isArray(backup.content) ? backup.content : [];

    process.stderr.write(`[rollback] Restore plan for post ${postId} (${backup.elementCount || 0} elements)\n`);

    const result: RestorePlanResult = {
      plan: {
        step: 'rollback-restore',
        description: `Stelle Post ${postId} aus Backup wieder her`,
        mcp_calls: [
          {
            ability: 'novamira/elementor-set-content',
            params: { post_id: postId, content },
            description: `Rollback: stelle ${content.length} Top-Level-Elemente wieder her`,
          },
        ],
        agent_instruction: 'Führe elementor-set-content aus, um das Rollback durchzuführen.',
      },
      backup,
    };

    if (backup.pageSettings) {
      (result.plan as Record<string, unknown>).page_settings_restore = {
        ability: 'novamira/adrians-page-settings',
        params: { post_id: postId, settings: backup.pageSettings },
        note: 'Optionales Restore der Page-Settings',
      };
    }

    return result;
  }

  discardBackup(postId: number): void {
    const backupPath = this._backupPath(postId);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      process.stderr.write(`[rollback] Backup discarded for post ${postId}\n`);
    }
  }

  loadBackup(postId: number): Backup | null {
    const backupPath = this._backupPath(postId);
    if (!fs.existsSync(backupPath)) return null;
    return JSON.parse(fs.readFileSync(backupPath, 'utf8')) as Backup;
  }

  listBackups(): Array<{ postId: number; timestamp: string; elementCount: number }> {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs.readdirSync(this.dir).filter(f => f.startsWith('backup-') && f.endsWith('.json'));
    return files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')) as Backup;
        return { postId: data.postId, timestamp: data.timestamp, elementCount: data.elementCount };
      } catch {
        return null;
      }
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }

  hasBackup(postId: number): boolean {
    return this._backupExists(postId);
  }

  private _countElements(tree: unknown[]): number {
    if (!Array.isArray(tree)) return 0;
    let count = 0;
    for (const el of tree) {
      count++;
      const node = el as Record<string, unknown>;
      if (node.elements || node.children) {
        count += this._countElements((node.elements || node.children) as unknown[]);
      }
    }
    return count;
  }
}

export default RollbackManager;
