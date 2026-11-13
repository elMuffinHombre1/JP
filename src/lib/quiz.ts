// Builds multiple-choice questions. Pure (no imports) so it can be unit-tested with Node.

export type QuizMode = 'meaning' | 'reading' | 'writing';

export interface QWord {
  id: number;
  kanji: string;
  kana: string;
  meaning: string;
  type: string;
}

export interface Question {
  word: QWord;
  mode: QuizMode;
  options: string[]; // empty for writing
  answer: string;
}

const okuriganaOf = (kanji: string) => kanji.match(/[぀-ゟ]*$/)?.[0] ?? '';

function pickDistractors(
  pool: QWord[], target: QWord, n: number, value: (w: QWord) => string, prefer: (w: QWord) => boolean,
  rand: () => number,
): string[] {
  const answer = value(target);
  const seen = new Set([answer]);
  const out: string[] = [];
  const shuffled = [...pool].sort(() => rand() - 0.5);
  // Preferred distractors first (same type / same ending), then anything.
  for (const pass of [true, false]) {
    for (const w of shuffled) {
      if (out.length >= n) return out;
      if (w.id === target.id || prefer(w) !== pass) continue;
      const v = value(w);
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Words that can be asked in a mode (reading and writing need a kanji form). */
export const canAsk = (w: QWord, mode: QuizMode) => (mode === 'meaning' ? true : !!w.kanji);

export function buildQuestion(word: QWord, mode: QuizMode, pool: QWord[], rand: () => number = Math.random): Question {
  if (mode === 'writing') return { word, mode, options: [], answer: word.kanji };

  let answer: string;
  let distractors: string[];
  if (mode === 'meaning') {
    answer = word.meaning;
    distractors = pickDistractors(pool, word, 3, (w) => w.meaning, (w) => w.type === word.type, rand);
  } else {
    // Reading: prefer readings that end with the same okurigana, so the ending alone
    // doesn't give it away — you have to read the kanji.
    answer = word.kana;
    const ending = okuriganaOf(word.kanji);
    distractors = pickDistractors(
      pool, word, 3, (w) => w.kana,
      (w) => (ending ? w.kana.endsWith(ending) : !!w.kanji && w.kana.length === word.kana.length),
      rand,
    );
  }
  const options = [answer, ...distractors].sort(() => rand() - 0.5);
  return { word, mode, options, answer };
}

/** For a reading question: how the okurigana tells you the pronunciation. */
export function readingExplanation(word: QWord): string | null {
  const ending = okuriganaOf(word.kanji);
  if (!word.kanji || !ending || !word.kana.endsWith(ending)) return null;
  const stem = word.kanji.slice(0, word.kanji.length - ending.length);
  const stemReading = word.kana.slice(0, word.kana.length - ending.length);
  let note = `The hiragana ending 〜${ending} is read as written, so ${stem} = ${stemReading}.`;
  if (word.type === 'verb-ru') note += ` Ending in 〜${ending.slice(-2)} → this is a る-verb.`;
  else if (word.type === 'verb-u') note += ` Ending in 〜${ending.slice(-1)} → this is an う-verb.`;
  else if (word.type === 'adj-i') note += ' Ending in 〜い → this is an い-adjective.';
  return note;
}
