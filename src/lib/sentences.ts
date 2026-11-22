// Sentence-quiz question building. Pure (no imports) so it can be unit-tested with Node.

export type SentenceMode = 'sentence' | 'word';

export interface SRow {
  id: number;
  japanese: string;
  kana: string;
  english: string;
  word_id: number;
  surface: string;
}

export interface SWord {
  id: number;
  kanji: string;
  kana: string;
  meaning: string;
  type: string;
}

export interface SentenceQuestion {
  mode: SentenceMode;
  sentenceId: number;
  japanese: string;
  kana: string;
  english: string;
  wordId: number; // the highlighted word
  surface: string;
  options: string[];
  answer: string;
}

/** Time limits in seconds; 0 = untimed. */
export const SENTENCE_LIMITS = [0, 8, 12, 20] as const;

/** Split a sentence around the first occurrence of `surface` for highlighting. */
export function splitAround(japanese: string, surface: string): [string, string, string] {
  const at = japanese.indexOf(surface);
  if (at < 0 || !surface) return [japanese, '', ''];
  return [japanese.slice(0, at), surface, japanese.slice(at + surface.length)];
}

function pick(cands: string[], answer: string, n: number, rand: () => number): string[] {
  const out: string[] = [];
  const seen = new Set([answer]);
  for (const c of [...cands].sort(() => rand() - 0.5)) {
    if (out.length >= n) break;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

export function buildSentenceQuestions(
  rows: SRow[],
  mode: SentenceMode,
  allSentences: { id: number; english: string }[],
  wordsById: Map<number, SWord>,
  rand: () => number = Math.random,
  limit = 15,
): SentenceQuestion[] {
  // One question per sentence; if it has several target words, pick one at random.
  const bySentence = new Map<number, SRow[]>();
  for (const r of rows) {
    if (!wordsById.has(r.word_id)) continue;
    if (!bySentence.has(r.id)) bySentence.set(r.id, []);
    bySentence.get(r.id)!.push(r);
  }
  // Which sentences share a word with which (to make harder distractors).
  const sharing = new Map<number, Set<number>>();
  for (const r of rows) {
    for (const o of rows) {
      if (o.word_id === r.word_id && o.id !== r.id) {
        if (!sharing.has(r.id)) sharing.set(r.id, new Set());
        sharing.get(r.id)!.add(o.id);
      }
    }
  }
  const englishById = new Map(allSentences.map((s) => [s.id, s.english]));

  const groups = [...bySentence.values()].sort(() => rand() - 0.5).slice(0, limit);
  return groups.map((g) => {
    const row = g[Math.floor(rand() * g.length)];
    const word = wordsById.get(row.word_id)!;
    let answer: string;
    let options: string[];
    if (mode === 'sentence') {
      answer = row.english;
      const similar = [...(sharing.get(row.id) ?? [])].map((id) => englishById.get(id)!).filter(Boolean);
      const first = pick(similar, answer, 2, rand); // up to 2 that share a word
      const rest = pick(allSentences.map((s) => s.english), answer, 3 - first.length, rand)
        .filter((e) => !first.includes(e));
      options = [answer, ...first, ...rest].slice(0, 4);
      // Top up if filtering removed one.
      if (options.length < 4) {
        options.push(...pick(allSentences.map((s) => s.english), answer, 6, rand).filter((e) => !options.includes(e)).slice(0, 4 - options.length));
      }
    } else {
      answer = word.meaning;
      const pool = [...wordsById.values()].filter((w) => w.id !== word.id);
      const sameType = pick(pool.filter((w) => w.type === word.type).map((w) => w.meaning), answer, 3, rand);
      const others = pick(pool.map((w) => w.meaning), answer, 6, rand).filter((m) => !sameType.includes(m));
      options = [answer, ...sameType, ...others].slice(0, 4);
    }
    return {
      mode,
      sentenceId: row.id,
      japanese: row.japanese,
      kana: row.kana,
      english: row.english,
      wordId: row.word_id,
      surface: row.surface,
      options: options.sort(() => rand() - 0.5),
      answer,
    };
  });
}
