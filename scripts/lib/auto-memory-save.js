/**
 * scripts/lib/auto-memory-save.js
 * UMBAUPLAN v2.0 Phase 10.1 — Memory-System-Integration.
 *
 * Speichert Lessons in .framer-export-cache/lessons-{date}.jsonl,
 * lokal indexiert nach Concept und Confidence.
 *
 * Persistence: lokale Datei (kein externer MCP-Call nötig).
 * Confidence-Decay: nach 180 Tagen ohne Re-Use → 0.1 Abzug.
 * Re-Use-Boost: bei jedem Match → +0.05 (max 0.95).
 *
 * API:
 *   const memory = createMemoryStore({ cacheDir });
 *   memory.saveLesson({ content, concepts, confidence, tags });
 *   memory.findLesson({ query, minConfidence });
 *   memory.reinforce(lessonId);
 *   memory.decayStale();
 *   memory.getStats();
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DECAY_DAYS = 180;
const DECAY_AMOUNT = 0.1;
const REINFORCE_AMOUNT = 0.05;
const MAX_CONFIDENCE = 0.95;

/**
 * @param {object} options
 * @param {string} [options.cacheDir='.framer-export-cache']
 */
export function createMemoryStore({ cacheDir = '.framer-export-cache' } = {}) {
  if (!existsSync(cacheDir)) {
    try { mkdirSync(cacheDir, { recursive: true }); } catch { /* noop */ }
  }
  const lessonsPath = join(cacheDir, 'lessons.jsonl');

  function readAllLessons() {
    if (!existsSync(lessonsPath)) return [];
    try {
      const content = readFileSync(lessonsPath, 'utf8');
      return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch { return []; }
  }

  function writeAllLessons(lessons) {
    const content = lessons.map(l => JSON.stringify(l)).join('\n') + '\n';
    writeFileSync(lessonsPath, content, 'utf8');
  }

  /**
   * @param {object} opts
   * @param {string} opts.content
   * @param {string[]} [opts.concepts=[]]
   * @param {number} [opts.confidence=0.5]
   * @param {string[]} [opts.tags=[]]
   * @returns {object} saved lesson
   */
  function saveLesson({ content, concepts = [], confidence = 0.5, tags = [] }) {
    if (!content) throw new Error('saveLesson: content required');
    const id = createHash('md5').update(content).digest('hex').slice(0, 12);
    const lessons = readAllLessons();

    // Duplicate-Strengthen: wenn content schon existiert → reinforce
    const existing = lessons.find(l => l.id === id);
    if (existing) {
      existing.reinforced_count = (existing.reinforced_count || 0) + 1;
      existing.confidence = Math.min(MAX_CONFIDENCE, existing.confidence + REINFORCE_AMOUNT);
      existing.last_reinforced_at = new Date().toISOString();
      writeAllLessons(lessons);
      return existing;
    }

    const lesson = {
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

  /**
   * @param {object} opts
   * @param {string} [opts.query]
   * @param {number} [opts.minConfidence=0]
   * @param {string[]} [opts.tags]
   * @returns {Array}
   */
  function findLesson({ query, minConfidence = 0, tags } = {}) {
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

  /**
   * @param {string} lessonId
   * @returns {object|null}
   */
  function reinforce(lessonId) {
    const lessons = readAllLessons();
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return null;
    lesson.reinforced_count = (lesson.reinforced_count || 0) + 1;
    lesson.confidence = Math.min(MAX_CONFIDENCE, lesson.confidence + REINFORCE_AMOUNT);
    lesson.last_reinforced_at = new Date().toISOString();
    writeAllLessons(lessons);
    return lesson;
  }

  /**
   * Decay stale lessons (older than DECAY_DAYS without reinforcement).
   *
   * @returns {{decayed: number, removed: number}}
   */
  function decayStale() {
    const lessons = readAllLessons();
    const cutoff = Date.now() - DECAY_DAYS * 24 * 60 * 60 * 1000;
    let decayed = 0;
    let removed = 0;
    const remaining = [];
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

  /**
   * @returns {object} stats
   */
  function getStats() {
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

  return {
    saveLesson,
    findLesson,
    reinforce,
    decayStale,
    getStats,
  };
}
