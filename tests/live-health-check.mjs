/**
 * tests/live-health-check.mjs
 * Live-Test: Health-Status mit echten Daten von test4 (Elementor-Version, Plugin-Liste, WPCode-Status).
 */
import { getHealthStatus } from '../scripts/wizard/health.js';
import { createMemoryStore } from '../scripts/lib/auto-memory-save.js';
import { runQuarterlyAudit } from '../scripts/quarterly-audit.js';

const cacheDir = '.live-cache';
const mem = createMemoryStore({ cacheDir });

// Simulate 1 fresh lesson (Healthy state)
mem.saveLesson({
  content: 'Test4-Health-Check erfolgreich',
  concepts: ['live', 'test4'],
  confidence: 0.9,
  tags: ['test'],
});

const status = await getHealthStatus({ cacheDir, mcpBridge: null });
console.log('\n=== Health Status ===');
console.log(JSON.stringify(status, null, 2));

console.log('\n=== Quarterly Audit (mit leeren Caches) ===');
const audit = await runQuarterlyAudit({ cacheDir, outputDir: null, memoryStore: mem });
console.log(`Audit-Date: ${audit.json.audit_date}`);
console.log(`Action-Items: ${audit.json.action_items.length}`);
for (const item of audit.json.action_items) {
  console.log(`  • ${item}`);
}
console.log(`Bug-Regression: ${audit.json.sections.bug_regression?.length || 0} bugs geprüft`);
const okBugs = (audit.json.sections.bug_regression || []).filter(b => b.file_exists).length;
console.log(`  ${okBugs} Dateien vorhanden`);
