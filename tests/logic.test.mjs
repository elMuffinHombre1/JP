import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRomaji, splitOkurigana } from '../src/lib/romaji.ts';
import { buildLessons, nextReview, dailyIndex, BOX_INTERVAL_DAYS } from '../src/lib/lessons.ts';

test('romaji: basic, digraphs, small tsu, n', () => {
  assert.equal(toRomaji('すき'), 'suki');
  assert.equal(toRomaji('できる'), 'dekiru');
  assert.equal(toRomaji('しゃしん'), 'shashin');
  assert.equal(toRomaji('きょう'), 'kyou');
  assert.equal(toRomaji('ちゃ'), 'cha');
  assert.equal(toRomaji('じゃ'), 'ja');
  assert.equal(toRomaji('がっこう'), 'gakkou');
  assert.equal(toRomaji('いっしょに'), 'isshoni');
  assert.equal(toRomaji('まっちゃ'), 'matcha');
  assert.equal(toRomaji('こんいん'), "kon'in");
  assert.equal(toRomaji('こんにちは'), 'konnichiha');
  assert.equal(toRomaji('コーヒー'), 'koohii');
});

test('okurigana split', () => {
  assert.deepEqual(splitOkurigana('食べる'), { stem: '食', okurigana: 'べる' });
  assert.deepEqual(splitOkurigana('出来る'), { stem: '出来', okurigana: 'る' });
  assert.deepEqual(splitOkurigana('日本'), { stem: '日本', okurigana: '' });
  assert.deepEqual(splitOkurigana('お願いします'), { stem: 'お願', okurigana: 'いします' });
});

test('lessons are sized, grouped and cover every word once', () => {
  const words = Array.from({ length: 47 }, (_, i) => ({
    id: i + 1,
    rank: i + 1,
    type: i % 2 ? 'noun' : 'verb-u',
    context: i < 30 ? 'food' : 'travel',
  }));
  for (const g of ['type', 'context']) {
    const plans = buildLessons(words, g, 10);
    const ids = plans.flatMap((p) => p.wordIds).sort((a, b) => a - b);
    assert.deepEqual(ids, words.map((w) => w.id));
    assert.ok(plans.every((p) => p.wordIds.length <= 13 && p.wordIds.length > 0));
  }
  const byType = buildLessons(words, 'type', 10);
  assert.equal(byType[0].title, 'Verbs (う-verbs) 1');
  assert.equal(byType[1].title, 'Nouns 1');
});

test('leitner scheduling', () => {
  const now = 1_000_000;
  assert.deepEqual(nextReview(0, true, now), { box: 1, due: now + BOX_INTERVAL_DAYS[1] * 86400000 });
  assert.equal(nextReview(4, false, now).box, 0);
  assert.equal(nextReview(6, true, now).box, 6);
});

test('daily index is stable for a date and in range', () => {
  const d = new Date(2026, 10, 13);
  assert.equal(dailyIndex(100, d), dailyIndex(100, new Date(2026, 10, 13, 23)));
  for (let i = 0; i < 60; i++) {
    const v = dailyIndex(37, new Date(2026, 0, 1 + i));
    assert.ok(v >= 0 && v < 37);
  }
});
