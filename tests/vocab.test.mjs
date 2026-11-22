import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOCAB, SENTENCES } from '../src/data/vocab.generated.ts';

test('10,000 unique words, starter words keep their ids', () => {
  assert.equal(VOCAB.length, 10000);
  const keys = new Set(VOCAB.map(([kanji, kana]) => `${kanji}|${kana}`));
  assert.equal(keys.size, VOCAB.length);
  // The first starter words, in their original positions (ids = position + 1).
  assert.deepEqual(VOCAB[0].slice(0, 2), ['私', 'わたし']);
  assert.deepEqual(VOCAB[9].slice(0, 2), ['食べる', 'たべる']);
  assert.deepEqual(VOCAB[15].slice(0, 2), ['好き', 'すき']);
});

test('every word has kana, a meaning, a type and a topic', () => {
  for (const [kanji, kana, meaning, type, context] of VOCAB) {
    assert.ok(/^[぀-ヿー]+$/.test(kana), `kana for ${kanji || kana}: ${kana}`);
    assert.ok(meaning && type && context, `${kanji || kana}`);
    assert.ok(!kanji.includes('|') && !meaning.includes('|'));
  }
});

test('sentence targets point at real words', () => {
  for (const [jp, , , targets] of SENTENCES) {
    for (const [id, surface] of targets) {
      assert.ok(id >= 1 && id <= VOCAB.length);
      assert.ok(jp.includes(surface));
    }
  }
});
