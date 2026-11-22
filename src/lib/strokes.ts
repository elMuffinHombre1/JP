// Automatic checking of handwritten kanji against KanjiVG stroke order.
// Pure (no imports) so it can be unit-tested with plain Node; the data is passed in.

export type Pt = { x: number; y: number };
export type Stroke = Pt[];

export const BOX = 109; // KanjiVG coordinates are in a 109×109 square

/** Decode one kanji from the compact table in src/data/strokes.generated.ts. */
export function decodeStrokes(encoded: string, alphabet: string): Stroke[] {
  const levels = alphabet.length - 1;
  const val = (c: string) => (alphabet.indexOf(c) / levels) * BOX;
  return encoded.split(' ').map((s) => {
    const pts: Stroke = [];
    for (let i = 0; i + 1 < s.length; i += 2) pts.push({ x: val(s[i]), y: val(s[i + 1]) });
    return pts;
  });
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function length(s: Stroke) {
  let l = 0;
  for (let i = 1; i < s.length; i++) l += dist(s[i - 1], s[i]);
  return l;
}

/** `n` points spaced evenly along the stroke. */
export function resample(s: Stroke, n = 16): Stroke {
  if (s.length === 0) return [];
  if (s.length === 1) return Array(n).fill(s[0]);
  const total = length(s) || 1;
  const out: Stroke = [];
  let j = 0;
  let acc = 0; // length up to point j
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < s.length - 2 && acc + dist(s[j], s[j + 1]) < target) {
      acc += dist(s[j], s[j + 1]);
      j++;
    }
    const seg = dist(s[j], s[j + 1]) || 1;
    const t = Math.min(1, Math.max(0, (target - acc) / seg));
    out.push({ x: s[j].x + t * (s[j + 1].x - s[j].x), y: s[j].y + t * (s[j + 1].y - s[j].y) });
  }
  return out;
}

function bounds(strokes: Stroke[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const p of s) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/**
 * Move the drawing onto the reference: same centre and size. This forgives writing a
 * bit small or off-centre. Kanji that are very flat or thin (一, 丨) keep the pad's scale.
 */
function align(drawn: Stroke[], ref: Stroke[], padSize: number): Stroke[] {
  const toBox = drawn.map((s) => s.map((p) => ({ x: (p.x / padSize) * BOX, y: (p.y / padSize) * BOX })));
  const a = bounds(toBox);
  const b = bounds(ref);
  const sizeA = Math.max(a.w, a.h);
  const sizeB = Math.max(b.w, b.h);
  if (sizeA < 15 || sizeB < 15) return toBox;
  const k = Math.min(1.6, Math.max(0.6, sizeB / sizeA)); // don't stretch absurdly
  return toBox.map((s) => s.map((p) => ({ x: b.cx + (p.x - a.cx) * k, y: b.cy + (p.y - a.cy) * k })));
}

/** Average distance between two strokes, point by point (both resampled). */
function strokeDistance(a: Stroke, b: Stroke) {
  const ra = resample(a);
  const rb = resample(b);
  let d = 0;
  for (let i = 0; i < ra.length; i++) d += dist(ra[i], rb[i]);
  return d / ra.length;
}

export type StrokeIssue = 'ok' | 'shape' | 'direction' | 'order';

export interface CheckResult {
  ok: boolean;
  expected: number; // strokes in the kanji
  drawn: number;
  strokes: StrokeIssue[]; // per drawn stroke (only when the count matches)
  message: string;
}

/** How far (in the 109 box) a stroke may stray and still count. About 1/6 of the box. */
export const TOLERANCE = 17;

export function checkKanji(drawnPad: Stroke[], ref: Stroke[], padSize: number): CheckResult {
  const drawn = drawnPad.filter((s) => s.length > 0);
  const base = { expected: ref.length, drawn: drawn.length };
  if (drawn.length !== ref.length) {
    const diff = drawn.length < ref.length ? 'fewer' : 'more';
    return {
      ...base,
      ok: false,
      strokes: [],
      message: `You drew ${drawn.length} stroke${drawn.length === 1 ? '' : 's'}; this kanji has ${ref.length}. (${Math.abs(ref.length - drawn.length)} ${diff})`,
    };
  }
  const al = align(drawn, ref, padSize);
  const reversed = (s: Stroke) => [...s].reverse();

  const strokes: StrokeIssue[] = al.map((s, i) => {
    const d = strokeDistance(s, ref[i]);
    const dRev = strokeDistance(reversed(s), ref[i]);
    // A dot is too short to have a meaningful direction.
    const isDot = length(ref[i]) < 12;
    if (d <= TOLERANCE) return 'ok';
    if (!isDot && dRev <= TOLERANCE && dRev < d) return 'direction';
    // Right stroke, wrong place in the order?
    if (ref.some((r, j) => j !== i && strokeDistance(s, r) <= TOLERANCE)) return 'order';
    return 'shape';
  });

  const bad = strokes.map((s, i) => [s, i + 1] as const).filter(([s]) => s !== 'ok');
  if (!bad.length) return { ...base, ok: true, strokes, message: 'Correct!' };
  const say: Record<Exclude<StrokeIssue, 'ok'>, string> = {
    direction: 'is written the wrong way',
    order: 'is in the wrong order',
    shape: "doesn't match",
  };
  const parts = bad.slice(0, 3).map(([s, n]) => `stroke ${n} ${say[s as Exclude<StrokeIssue, 'ok'>]}`);
  const more = bad.length > 3 ? ` (and ${bad.length - 3} more)` : '';
  const msg = parts.join(', ') + more;
  return { ...base, ok: false, strokes, message: msg.charAt(0).toUpperCase() + msg.slice(1) + '.' };
}

/** Split a word into the characters to draw (kanji) and those shown as-is (kana). */
export function writingCells(written: string, hasStrokes: (ch: string) => boolean) {
  return [...written].map((ch) => {
    const isKanji = /[一-鿿々]/.test(ch);
    return { ch, draw: isKanji, auto: isKanji && hasStrokes(ch) };
  });
}
