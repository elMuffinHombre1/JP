import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestion, readingExplanation, canAsk } from '../src/lib/quiz.ts';

const pool = [
  { id: 1, kanji: '食べる', kana: 'たべる', meaning: 'to eat', type: 'verb-ru' },
  { id: 2, kanji: '出来る', kana: 'できる', meaning: 'to be able to', type: 'verb-ru' },
  { id: 3, kanji: '寝る', kana: 'ねる', meaning: 'to sleep', type: 'verb-ru' },
  { id: 4, kanji: '見る', kana: 'みる', meaning: 'to see', type: 'verb-ru' },
  { id: 5, kanji: '犬', kana: 'いぬ', meaning: 'dog', type: 'noun' },
  { id: 6, kanji: '', kana: 'とても', meaning: 'very', type: 'adverb' },
];

test('meaning question has 4 unique options including the answer', () => {
  const q = buildQuestion(pool[0], 'meaning', pool);
  assert.equal(q.options.length, 4);
  assert.equal(new Set(q.options).size, 4);
  assert.ok(q.options.includes('to eat'));
});

test('reading distractors share the okurigana ending', () => {
  const q = buildQuestion(pool[1], 'reading', pool);
  assert.equal(q.answer, 'できる');
  assert.ok(q.options.every((o) => o.endsWith('る')));
});

test('explanations and askability', () => {
  assert.match(readingExplanation(pool[0]), /食 = た/);
  assert.match(readingExplanation(pool[1]), /る-verb/);
  assert.equal(readingExplanation(pool[4]), null);
  assert.equal(canAsk(pool[5], 'writing'), false);
  assert.equal(canAsk(pool[5], 'meaning'), true);
});

import { summarizeSpeed, isBestRun } from '../src/lib/quiz.ts';

test('speed summary averages correct answers only', () => {
  const s = summarizeSpeed([
    { wordId: 1, correct: true, ms: 1000, timedOut: false },
    { wordId: 2, correct: true, ms: 2000, timedOut: false },
    { wordId: 3, correct: false, ms: 5000, timedOut: true },
    { wordId: 4, correct: false, ms: 800, timedOut: false },
  ]);
  assert.deepEqual(s, { total: 4, correct: 2, pct: 50, avgMs: 1500, fastestMs: 1000, timeouts: 1 });
  assert.equal(summarizeSpeed([]).avgMs, null);
});

test('personal best needs 80% accuracy and a faster average', () => {
  assert.equal(isBestRun(1500, 90, null), true);
  assert.equal(isBestRun(1500, 70, null), false);
  assert.equal(isBestRun(1500, 90, 1400), false);
  assert.equal(isBestRun(1300, 90, 1400), true);
});
