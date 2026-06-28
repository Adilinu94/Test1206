/**
 * scripts/lib/split-large-tree.ts — Phase 1.2 Fix: MCP-Plan-Generator
 */

import { RollbackManager } from './rollback.js';

const DEFAULT_MAX_ELEMENTS = 50;

export interface TreeElement {
  elType?: string;
  widgetType?: string;
  elements?: TreeElement[];
  children?: TreeElement[];
  [key: string]: unknown;
}

export interface TreeSection {
  index: number;
  label: string;
  elementCount: number;
  elements: TreeElement[];
}

export interface BuildPlanResult {
  plan: {
    step: string;
    description: string;
    mcp_calls: Array<{
      ability: string;
      params: Record<string, unknown>;
      phase?: string;
      description?: string;
      note?: string;
    }>;
    agent_instruction: string;
    rollback: {
      note: string;
      backup_plan: string | null;
    } | null;
  };
  sections: TreeSection[];
  totalElements: number;
}

function countElements(tree: TreeElement[]): number {
  if (!Array.isArray(tree)) return 0;
  let n = 0;
  for (const el of tree) {
    n++;
    if (el.elements || el.children) n += countElements((el.elements || el.children) as TreeElement[]);
  }
  return n;
}

function findTopLevelContainers(tree: TreeElement[]): TreeElement[] {
  if (!Array.isArray(tree)) return [];
  return tree.filter(el => {
    const type = el.elType || el.widgetType || '';
    return ['container', 'e-flexbox', 'e-div-block', 'section'].includes(type as string)
      || ((el.elements as TreeElement[])?.length > 0)
      || ((el.children as TreeElement[])?.length > 0);
  });
}

export function splitLargeTree(tree: TreeElement | TreeElement[], options: { maxElementsPerSection?: number } = {}): TreeSection[] {
  const maxEl = options.maxElementsPerSection || DEFAULT_MAX_ELEMENTS;
  const rootArr: TreeElement[] = Array.isArray(tree) ? tree : [tree];
  const total = countElements(rootArr);

  if (total <= maxEl) {
    return [{
      index: 0,
      label: 'full-page',
      elementCount: total,
      elements: rootArr,
    }];
  }

  process.stderr.write(`[split] Tree has ${total} elements (>${maxEl}), splitting into sections...\n`);

  const containers = findTopLevelContainers(rootArr);
  const sections: TreeSection[] = [];
  let currentBatch: TreeElement[] = [];
  let currentCount = 0;
  let sectionIndex = 0;

  const nonContainer = rootArr.filter(el => !containers.includes(el));
  if (nonContainer.length > 0) {
    const nc = countElements(nonContainer);
    sections.push({
      index: sectionIndex++,
      label: 'root-elements',
      elementCount: nc,
      elements: nonContainer,
    });
  }

  for (const container of containers) {
    const containerCount = countElements((container.elements || container.children || [container]) as TreeElement[]);

    if (currentCount + containerCount > maxEl && currentBatch.length > 0) {
      sections.push({
        index: sectionIndex++,
        label: `section-group-${sectionIndex}`,
        elementCount: currentCount,
        elements: [...currentBatch],
      });
      currentBatch = [];
      currentCount = 0;
    }

    currentBatch.push(container);
    currentCount += containerCount;
  }

  if (currentBatch.length > 0) {
    sections.push({
      index: sectionIndex++,
      label: `section-group-${sectionIndex}`,
      elementCount: currentCount,
      elements: currentBatch,
    });
  }

  process.stderr.write(`[split] Split into ${sections.length} sections\n`);
  return sections;
}

export function buildPlan(sections: TreeSection[], postId: number, options: { rollback?: boolean } = {}): BuildPlanResult {
  const useRollback = options.rollback !== false;
  const rb = useRollback ? new RollbackManager() : null;

  const totalElements = sections.reduce((sum, s) => sum + s.elementCount, 0);

  const merged: TreeElement[] = [];
  for (const section of sections) {
    merged.push(...section.elements);
  }

  const mcp_calls: Array<{
    ability: string;
    params: Record<string, unknown>;
    phase?: string;
    description?: string;
    save_as?: string;
    note?: string;
  }> = [];

  if (useRollback) {
    const { plan: backupPlan } = rb!.backupPlan(postId);
    if (backupPlan?.mcp_calls) {
      mcp_calls.push(...backupPlan.mcp_calls.map(c => ({ ...c, phase: 'pre-build' as const })));
    }
  }

  const buildCall: {
    ability: string;
    params: Record<string, unknown>;
    phase: string;
    description: string;
    note?: string;
  } = {
    ability: 'novamira/elementor-set-content',
    params: { post_id: postId, content: merged },
    phase: 'build',
    description: sections.length === 1
      ? `Baue ${sections[0].elementCount} Elemente in 1 Call`
      : `Baue ${sections.length} Sections (${totalElements} Elemente gesamt) via merge → 1× set-content`,
  };

  if (merged.length > 100) {
    buildCall.note = `Tree has ${merged.length} top-level elements. Consider splitting into batches of ~50.`;
  }

  mcp_calls.push(buildCall);

  const agent_instruction = sections.length === 1
    ? `Führe elementor-set-content mit ${sections[0].elementCount} Elementen aus.`
    : `Führe elementor-set-content mit dem gemergten Tree (${sections.length} Sections, ${totalElements} Elemente) aus.`;

  process.stderr.write(
    `[split] Build-Plan: ${sections.length} section(s), ${totalElements} elements → 1× set-content\n`
  );

  return {
    plan: {
      step: 'split-build',
      description: `Baue ${sections.length} Section(s) auf Post ${postId}`,
      mcp_calls,
      agent_instruction,
      rollback: useRollback ? {
        note: 'Bei Build-Fehler: RollbackManager.restorePlan() aufrufen',
        backup_plan: rb ? 'RollbackManager.backupPlan() vor Build ausführen' : null,
      } : null,
    },
    sections,
    totalElements,
  };
}

export { countElements, findTopLevelContainers };
