// Pure lesson + spaced-repetition logic (no imports, unit-tested with plain Node).

export type Grouping = 'type' | 'context';

export interface LessonWord {
  id: number;
  type: string;
  context: string;
  rank: number;
}

export interface LessonPlan {
  grouping: Grouping;
  groupValue: string;
  part: number;
  title: string;
  wordIds: number[];
}

export const TYPE_LABELS: Record<string, string> = {
  noun: 'Nouns',
  pronoun: 'Pronouns',
  'verb-ru': 'Verbs (る-verbs)',
  'verb-u': 'Verbs (う-verbs)',
  'verb-irr': 'Verbs (irregular)',
  'adj-i': 'い-adjectives',
  'adj-na': 'な-adjectives',
  adverb: 'Adverbs',
  expression: 'Expressions',
  question: 'Question words',
};

export function groupLabel(grouping: Grouping, value: string): string {
  if (grouping === 'type') return TYPE_LABELS[value] ?? value;
  return value
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Build lessons of `size` words. Groups are ordered by their most common word, so the
 * first lessons cover the highest-frequency vocabulary.
 */
export function buildLessons(words: LessonWord[], grouping: Grouping, size = 10): LessonPlan[] {
  const groups = new Map<string, LessonWord[]>();
  for (const w of [...words].sort((a, b) => a.rank - b.rank)) {
    const key = grouping === 'type' ? w.type : w.context;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }

  // Interleave parts: part 1 of every group, then part 2 of every group, ...
  const chunked = [...groups.entries()].map(([value, list]) => {
    const parts: LessonWord[][] = [];
    for (let i = 0; i < list.length; i += size) parts.push(list.slice(i, i + size));
    // Fold a tiny last chunk into the previous lesson.
    if (parts.length > 1 && parts[parts.length - 1].length < Math.ceil(size / 3)) {
      const last = parts.pop()!;
      parts[parts.length - 1].push(...last);
    }
    return { value, parts };
  });

  const plans: LessonPlan[] = [];
  const maxParts = Math.max(0, ...chunked.map((c) => c.parts.length));
  for (let p = 0; p < maxParts; p++) {
    for (const { value, parts } of chunked) {
      if (!parts[p]) continue;
      const label = groupLabel(grouping, value);
      plans.push({
        grouping,
        groupValue: value,
        part: p + 1,
        title: parts.length > 1 ? `${label} ${p + 1}` : label,
        wordIds: parts[p].map((w) => w.id),
      });
    }
  }
  return plans;
}

/** Leitner boxes: days until the next review for each box. */
export const BOX_INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32];
const DAY = 24 * 60 * 60 * 1000;

export function nextReview(box: number, correct: boolean, now: number): { box: number; due: number } {
  const newBox = correct ? Math.min(box + 1, BOX_INTERVAL_DAYS.length - 1) : 0;
  // A wrong answer comes back in 10 minutes; otherwise wait the box interval.
  const wait = correct ? BOX_INTERVAL_DAYS[newBox] * DAY : 10 * 60 * 1000;
  return { box: newBox, due: now + wait };
}

/** Deterministic pick (same answer all day) used for the "word of the day" widget. */
export function dailyIndex(count: number, date: Date): number {
  if (count <= 0) return 0;
  const key = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  let h = key;
  h = Math.imul((h >>> 16) ^ h, 0x45d9f3b);
  h = Math.imul((h >>> 16) ^ h, 0x45d9f3b);
  h = (h >>> 16) ^ h;
  return (h >>> 0) % count;
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
