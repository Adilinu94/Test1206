/**
 * scripts/lib/error-tracker.ts
 * UMBAUPLAN v2.0 Phase 7.2 — Error-Tracking.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CATEGORIES = ['mcp-framer', 'mcp-novamira', 'mcp-elementor', 'pipeline-internal', 'wp-plugin'] as const;

type Category = typeof CATEGORIES[number];

export interface ErrorEntry {
  timestamp: string;
  sessionId: string;
  category: Category;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
}

export interface ErrorTrackerContext {
  post_id?: number;
  page_url?: string;
  build_id?: string;
  framer_url?: string;
  elementor_version?: string;
  theme?: string;
  [key: string]: unknown;
}

export interface ErrorTracker {
  sessionId: string;
  wrapMcpBridge: (bridge: { call: (ability: string, parameters: Record<string, unknown>) => Promise<unknown> }) => {
    call: (ability: string, parameters: Record<string, unknown>) => Promise<unknown>;
    unwrap: () => { call: (ability: string, parameters: Record<string, unknown>) => Promise<unknown> };
  };
  writeError: (category: Category, error: Error | string, additional?: { context?: Record<string, unknown> }) => ErrorEntry;
  getSummary: () => { sessionId: string; total: number; byCategory: Record<string, number>; recentErrors: ErrorEntry[] };
  getSessionPath: () => string;
  getRecentErrors: (limit?: number) => ErrorEntry[];
  rotateLog: () => void;
}

function classifyAbility(abilityName: string): Category {
  if (!abilityName || typeof abilityName !== 'string') return 'pipeline-internal';
  if (abilityName.startsWith('mcp__framer') || abilityName.includes('framer')) return 'mcp-framer';
  if (abilityName.includes('elementor')) return 'mcp-elementor';
  if (abilityName.startsWith('novamira') || abilityName.includes('wp-')) return 'mcp-novamira';
  if (abilityName.includes('plugin') || abilityName.includes('wp_')) return 'wp-plugin';
  return 'pipeline-internal';
}

export function createErrorTracker({ cacheDir = '.framer-export-cache', sentryDsn, smtpHost, context = {} }: {
  cacheDir?: string;
  sentryDsn?: string;
  smtpHost?: string;
  context?: ErrorTrackerContext;
} = {}): ErrorTracker {
  if (!existsSync(cacheDir)) {
    try { mkdirSync(cacheDir, { recursive: true }); } catch { /* noop */ }
  }

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const errorLogPath = join(cacheDir, 'errors-current.jsonl');
  const sessionPath = join(cacheDir, `session-${sessionId}.jsonl`);

  const session = {
    id: sessionId,
    started_at: new Date().toISOString(),
    context: { ...context },
    errors: [] as ErrorEntry[],
    byCategory: Object.fromEntries(CATEGORIES.map(c => [c, 0])) as Record<string, number>,
  };

  function writeError(category: Category, error: Error | string, additional: { context?: Record<string, unknown> } = {}): ErrorEntry {
    const entry: ErrorEntry = {
      timestamp: new Date().toISOString(),
      sessionId,
      category,
      message: typeof error === 'string' ? error : (error?.message || String(error)),
      stack: typeof error === 'string' ? null : (error?.stack?.split('\n').slice(0, 5).join('\n') || null),
      context: { ...session.context, ...additional.context },
    };
    session.errors.push(entry);
    session.byCategory[category] = (session.byCategory[category] || 0) + 1;
    try {
      appendFileSync(errorLogPath, JSON.stringify(entry) + '\n', 'utf8');
      appendFileSync(sessionPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch { /* disk-full is non-fatal */ }

    return entry;
  }

  function wrapMcpBridge(bridge: { call: (ability: string, parameters: Record<string, unknown>) => Promise<unknown> }): {
    call: (ability: string, parameters: Record<string, unknown>) => Promise<unknown>;
    unwrap: () => typeof bridge;
  } {
    if (!bridge?.call) throw new Error('wrapMcpBridge: invalid bridge');
    return {
      call: async (ability, parameters) => {
        try {
          return await bridge.call(ability, parameters);
        } catch (err: unknown) {
          const category = classifyAbility(ability);
          writeError(category, err as Error, { context: { ability, parameters } });
          throw err;
        }
      },
      unwrap: () => bridge,
    };
  }

  function getSummary() {
    return {
      sessionId,
      total: session.errors.length,
      byCategory: { ...session.byCategory },
      recentErrors: session.errors.slice(-10),
    };
  }

  function getSessionPath(): string {
    return sessionPath;
  }

  function getRecentErrors(limit = 50): ErrorEntry[] {
    if (!existsSync(errorLogPath)) return [];
    try {
      const content = readFileSync(errorLogPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.slice(-limit).map(l => JSON.parse(l) as ErrorEntry);
    } catch { return []; }
  }

  function rotateLog(): void {
    if (!existsSync(errorLogPath)) return;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const target = join(cacheDir, `errors-${date}.jsonl`);
      const content = readFileSync(errorLogPath, 'utf8');
      writeFileSync(target, content, 'utf8');
      writeFileSync(errorLogPath, '', 'utf8');
    } catch { /* noop */ }
  }

  return { sessionId, wrapMcpBridge, writeError, getSummary, getSessionPath, getRecentErrors, rotateLog };
}

export { CATEGORIES, classifyAbility };
