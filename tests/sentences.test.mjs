import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSentenceQuestions, splitAround } from '../src/lib/sentences.ts';

const words = new Map([
  [1, { id: 1, kanji: '犬', kana: 'いぬ', meaning: 'dog', type: 'noun' }],
  [2, { id: 2, kanji: '好き', kana: 'すき', meaning: 'liked; to like', type: 'adj-na' }],
  [3, { id: 3, kanji: '猫', kana: 'ねこ', meaning: 'cat', type: 'noun' }],
  [4, { id: 4, kanji: '家', kana: 'いえ', meaning: 'house; home', type: 'noun' }],
  [5, { id: 5, kanji: '水', kana: 'みず', meaning: 'water', type: 'noun' }],
]);
const sentences = [
  { id: 1, english: 'I like dogs.' },
  { id: 2, english: 'There is a cat in the house.' },
  { id: 3, english: "I'm going home." },
  { id: 4, english: 'I bought water.' },
  { id: 5, english: 'I like cats.' },
];
const rows = [
  { id: 1, japanese: '犬が好きです。', kana: 'いぬがすきです。', english: 'I like dogs.', word_id: 1, surface: '犬' },
  { id: 1, japanese: '犬が好きです。', kana: 'いぬがすきです。', english: 'I like dogs.', word_id: 2, surface: '好き' },
  { id: 2, japanese: '猫が家にいます。', kana: '', english: 'There is a cat in the house.', word_id: 3, surface: '猫' },
  { id: 3, japanese: '家に帰ります。', kana: '', english: "I'm going home.", word_id: 4, surface: '家' },
  { id: 4, japanese: '水を買いました。', kana: '', english: 'I bought water.', word_id: 5, surface: '水' },
  { id: 5, japanese: '猫が好きです。', kana: '', english: 'I like cats.', word_id: 2, surface: '好き' },
];

test('split around the highlighted word', () => {
  assert.deepEqual(splitAround('犬が好きです。', '好き'), ['犬が', '好き', 'です。']);
  assert.deepEqual(splitAround('abc', 'x'), ['abc', '', '']);
});

test('one sentence question per sentence, 4 unique options with the answer', () => {
  for (const mode of ['sentence', 'word']) {
    const qs = buildSentenceQuestions(rows, mode, sentences, words);
    assert.equal(qs.length, 5);
    assert.equal(new Set(qs.map((q) => q.sentenceId)).size, 5);
    for (const q of qs) {
      assert.equal(q.options.length, 4, `${mode} ${q.japanese}`);
      assert.equal(new Set(q.options).size, 4);
      assert.ok(q.options.includes(q.answer));
      assert.ok(q.japanese.includes(q.surface));
    }
  }
});

test('word mode asks the highlighted word, sentence mode the translation', () => {
  const w = buildSentenceQuestions(rows, 'word', sentences, words);
  for (const q of w) assert.equal(q.answer, words.get(q.wordId).meaning);
  const s = buildSentenceQuestions(rows, 'sentence', sentences, words);
  for (const q of s) assert.equal(q.answer, q.english);
});

test('limit caps the number of questions', () => {
  assert.equal(buildSentenceQuestions(rows, 'sentence', sentences, words, Math.random, 2).length, 2);
});
