/**
 * scripts/lib/auto-memory-save.ts
 * UMBAUPLAN v2.0 Phase 10.1 — Memory-System-Integration.
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DECAY_DAYS = 180;
const DECAY_AMOUNT = 0.1;
const REINFORCE_AMOUNT = 0.05;
const MAX_CONFIDENCE = 0.95;

export interface Lesson {
  id: string;
  content: string;
  concepts: string[];
  tags: string[];
  confidence: number;
  created_at: string;
  last_reinforced_at: string;
  reinforced_count: number;
}

export interface MemoryStats {
  total: number;
  byConfidence: { high: number; medium: number; low: number };
  avg_confidence: number;
}

export interface MemoryStore {
  saveLesson: (opts: { content: string; concepts?: string[]; confidence?: number; tags?: string[] }) => Lesson;
  findLesson: (opts?: { query?: string; minConfidence?: number; tags?: string[] }) => Lesson[];
  reinforce: (lessonId: string) => Lesson | null;
  decayStale: () => { decayed: number; removed: number };
  getStats: () => MemoryStats;
}

export function createMemoryStore({ cacheDir = '.framer-export-cache' }: { cacheDir?: string } = {}): MemoryStore {
  if (!existsSync(cacheDir)) {
    try { mkdirSync(cacheDir, { recursive: true }); } catch { /* noop */ }
  }
  const lessonsPath = join(cacheDir, 'lessons.jsonl');

  function readAllLessons(): Lesson[] {
    if (!existsSync(lessonsPath)) return [];
    try {
      const content = readFileSync(lessonsPath, 'utf8');
      return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Lesson);
    } catch { return []; }
  }

  function writeAllLessons(lessons: Lesson[]): void {
    const content = lessons.map(l => JSON.stringify(l)).join('\n') + '\n';
    writeFileSync(lessonsPath, content, 'utf8');
  }

  function saveLesson({ content, concepts = [], confidence = 0.5, tags = [] }: {
    content: string;
    concepts?: string[];
    confidence?: number;
    tags?: string[];
  }): Lesson {
    if (!content) throw new Error('saveLesson: content required');
    const id = createHash('md5').update(content).digest('hex').slice(0, 12);
    const lessons = readAllLessons();

    const existing = lessons.find(l => l.id === id);
    if (existing) {
      existing.reinforced_count = (existing.reinforced_count || 0) + 1;
      existing.confidence = Math.min(MAX_CONFIDENCE, existing.confidence + REINFORCE_AMOUNT);
      existing.last_reinforced_at = new Date().toISOString();
      writeAllLessons(lessons);
      return existing;
    }

    const lesson: Lesson = {
      id,
      content,
      concepts,
      tags,
      confidence,
      created_at: new Date().toISOString(),
      last_reinforced_at: new Date().toISOString(),
      reinforced_count: 0,
    };
    try {
      appendFileSync(lessonsPath, JSON.stringify(lesson) + '\n', 'utf8');
    } catch { /* noop */ }
    return lesson;
  }

  function findLesson({ query, minConfidence = 0, tags }: {
    query?: string;
    minConfidence?: number;
    tags?: string[];
  } = {}): Lesson[] {
    let lessons = readAllLessons();
    if (query) {
      const q = query.toLowerCase();
      lessons = lessons.filter(l =>
        l.content.toLowerCase().includes(q)
        || (l.concepts || []).some(c => c.toLowerCase().includes(q))
        || (l.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (tags && tags.length > 0) {
      lessons = lessons.filter(l => (l.tags || []).some(t => tags.includes(t)));
    }
    lessons = lessons.filter(l => (l.confidence || 0) >= minConfidence);
    lessons.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    return lessons;
  }

  function reinforce(lessonId: string): Lesson | null {
    const lessons = readAllLessons();
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return null;
    lesson.reinforced_count = (lesson.reinforced_count || 0) + 1;
    lesson.confidence = Math.min(MAX_CONFIDENCE, lesson.confidence + REINFORCE_AMOUNT);
    lesson.last_reinforced_at = new Date().toISOString();
    writeAllLessons(lessons);
    return lesson;
  }

  function decayStale(): { decayed: number; removed: number } {
    const lessons = readAllLessons();
    const cutoff = Date.now() - DECAY_DAYS * 24 * 60 * 60 * 1000;
    let decayed = 0;
    let removed = 0;
    const remaining: Lesson[] = [];
    for (const l of lessons) {
      const lastTouch = new Date(l.last_reinforced_at || l.created_at).getTime();
      if (lastTouch < cutoff) {
        l.confidence = Math.max(0, (l.confidence || 0) - DECAY_AMOUNT);
        decayed++;
        if (l.confidence <= 0) {
          removed++;
          continue;
        }
      }
      remaining.push(l);
    }
    writeAllLessons(remaining);
    return { decayed, removed };
  }

  function getStats(): MemoryStats {
    const lessons = readAllLessons();
    const byConfidence = { high: 0, medium: 0, low: 0 };
    for (const l of lessons) {
      const c = l.confidence || 0;
      if (c >= 0.7) byConfidence.high++;
      else if (c >= 0.4) byConfidence.medium++;
      else byConfidence.low++;
    }
    return {
      total: lessons.length,
      byConfidence,
      avg_confidence: lessons.length === 0 ? 0 :
        Math.round((lessons.reduce((s, l) => s + (l.confidence || 0), 0) / lessons.length) * 100) / 100,
    };
  }

  return { saveLesson, findLesson, reinforce, decayStale, getStats };
}
