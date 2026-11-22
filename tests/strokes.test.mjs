import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STROKES, STROKE_ALPHABET } from '../src/data/strokes.generated.ts';
import { checkKanji, decodeStrokes, writingCells, BOX } from '../src/lib/strokes.ts';

const PAD = 300;
const ref = (ch) => decodeStrokes(STROKES[ch], STROKE_ALPHABET);

// Draw the reference strokes on a 300px pad, slightly smaller and off-centre, with wobble.
function imitate(strokes, { scale = 0.85, dx = 12, dy = -8, wobble = 3, seed = 1 } = {}) {
  let r = seed;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  return strokes.map((s) =>
    s.flatMap((p, i) => {
      const q = { x: (p.x / BOX) * PAD * scale + dx + 20 + rand() * wobble, y: (p.y / BOX) * PAD * scale + dy + 20 + rand() * wobble };
      // Extra in-between points, like a real finger trace.
      if (i === 0) return [q];
      const prev = s[i - 1];
      const mid = { x: ((p.x + prev.x) / 2 / BOX) * PAD * scale + dx + 20, y: ((p.y + prev.y) / 2 / BOX) * PAD * scale + dy + 20 };
      return [mid, q];
    }),
  );
}

test('table covers common kanji and decodes in the box', () => {
  for (const ch of ['日', '本', '語', '食', '見', '行', '一']) assert.ok(STROKES[ch], ch);
  assert.equal(ref('日').length, 4);
  assert.equal(ref('語').length, 14);
  for (const s of ref('語')) for (const p of s) assert.ok(p.x >= 0 && p.x <= BOX && p.y >= 0 && p.y <= BOX);
});

test('a good imitation passes', () => {
  for (const ch of ['日', '本', '語', '食', '見', '行', '一', '水', '書']) {
    const r = checkKanji(imitate(ref(ch)), ref(ch), PAD);
    assert.ok(r.ok, `${ch}: ${r.message}`);
  }
});

test('wrong stroke count is reported', () => {
  const r = checkKanji(imitate(ref('日')).slice(0, 3), ref('日'), PAD);
  assert.equal(r.ok, false);
  assert.match(r.message, /3 strokes; this kanji has 4/);
});

test('a reversed stroke is reported as the wrong direction', () => {
  const s = imitate(ref('日'));
  s[1] = [...s[1]].reverse();
  const r = checkKanji(s, ref('日'), PAD);
  assert.equal(r.ok, false);
  assert.equal(r.strokes[1], 'direction');
  assert.match(r.message, /Stroke 2 is written the wrong way/);
});

test('swapped strokes are reported as the wrong order', () => {
  const s = imitate(ref('十'));
  const r = checkKanji([s[1], s[0]], ref('十'), PAD);
  assert.equal(r.ok, false);
  assert.deepEqual(r.strokes, ['order', 'order']);
});

test('a different kanji with the same stroke count fails', () => {
  // 田 and 由 both have 5 strokes.
  const r = checkKanji(imitate(ref('由')), ref('田'), PAD);
  assert.equal(r.ok, false);
});

test('writing cells: kanji are drawn, kana are shown', () => {
  const cells = writingCells('食べる', (c) => !!STROKES[c]);
  assert.deepEqual(cells.map((c) => [c.ch, c.draw]), [['食', true], ['べ', false], ['る', false]]);
  assert.equal(writingCells('日本語', (c) => !!STROKES[c]).filter((c) => c.draw).length, 3);
  assert.equal(writingCells('人々', (c) => !!STROKES[c])[1].auto, false); // no data for 々
});
