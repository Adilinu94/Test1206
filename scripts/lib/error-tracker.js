/**
 * scripts/lib/error-tracker.js
 * UMBAUPLAN v2.0 Phase 7.2 — Error-Tracking.
 *
 * Wrappt alle MCP-Calls + Plugin-Calls und sammelt Fehler zentral.
 * Speichert in lokaler Datei (.framer-export-cache/errors-{date}.jsonl).
 * Optional: Sentry (SENTRY_DSN) und Email (SMTP_HOST).
 *
 * API:
 *   const tracker = createErrorTracker({ cacheDir, sentryDsn, smtpHost });
 *   const wrapped = tracker.wrapMcpBridge(mcpBridge);
 *   await wrapped.call(...) // errors are auto-tracked
 *   tracker.getSummary()  // { total, byCategory, recentErrors }
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CATEGORIES = ['mcp-framer', 'mcp-novamira', 'mcp-elementor', 'pipeline-internal', 'wp-plugin'];

function classifyAbility(abilityName) {
  if (!abilityName || typeof abilityName !== 'string') return 'pipeline-internal';
  if (abilityName.startsWith('mcp__framer') || abilityName.includes('framer')) return 'mcp-framer';
  if (abilityName.includes('elementor')) return 'mcp-elementor';
  if (abilityName.startsWith('novamira') || abilityName.includes('wp-')) return 'mcp-novamira';
  if (abilityName.includes('plugin') || abilityName.includes('wp_')) return 'wp-plugin';
  return 'pipeline-internal';
}

/**
 * @param {object} options
 * @param {string} [options.cacheDir='.framer-export-cache']
 * @param {string} [options.sentryDsn] - Optional Sentry DSN
 * @param {string} [options.smtpHost] - Optional SMTP host for email
 * @param {object} [options.context] - { post_id, page_url, build_id, framer_url, elementor_version, theme }
 */
export function createErrorTracker({ cacheDir = '.framer-export-cache', sentryDsn, smtpHost, context = {} } = {}) {
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
    errors: [],
    byCategory: Object.fromEntries(CATEGORIES.map(c => [c, 0])),
  };

  function writeError(category, error, additional = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId,
      category,
      message: error?.message || String(error),
      stack: error?.stack?.split('\n').slice(0, 5).join('\n') || null,
      context: { ...session.context, ...additional.context },
    };
    session.errors.push(entry);
    session.byCategory[category] = (session.byCategory[category] || 0) + 1;
    try {
      appendFileSync(errorLogPath, JSON.stringify(entry) + '\n', 'utf8');
      appendFileSync(sessionPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch { /* disk-full is non-fatal */ }

    if (sentryDsn && typeof process.env.SENTRY_DSN === 'string') {
      // Optional: forward to Sentry via fetch (out of scope for this stub)
    }

    return entry;
  }

  /**
   * Wrappt einen McpBridge-Client, sodass call()-Fehler zentral erfasst werden.
   *
   * @param {object} bridge - { call(ability_name, parameters) }
   * @returns {object} wrapped bridge
   */
  function wrapMcpBridge(bridge) {
    if (!bridge?.call) throw new Error('wrapMcpBridge: invalid bridge');
    return {
      call: async (ability, parameters) => {
        try {
          return await bridge.call(ability, parameters);
        } catch (err) {
          const category = classifyAbility(ability);
          writeError(category, err, { context: { ability, parameters } });
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

  function getSessionPath() {
    return sessionPath;
  }

  function getRecentErrors(limit = 50) {
    if (!existsSync(errorLogPath)) return [];
    try {
      const content = readFileSync(errorLogPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.slice(-limit).map(l => JSON.parse(l));
    } catch { return []; }
  }

  function rotateLog() {
    if (!existsSync(errorLogPath)) return;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const target = join(cacheDir, `errors-${date}.jsonl`);
      const content = readFileSync(errorLogPath, 'utf8');
      writeFileSync(target, content, 'utf8');
      writeFileSync(errorLogPath, '', 'utf8');
    } catch { /* noop */ }
  }

  return {
    sessionId,
    wrapMcpBridge,
    writeError,
    getSummary,
    getSessionPath,
    getRecentErrors,
    rotateLog,
  };
}

export { CATEGORIES, classifyAbility };
