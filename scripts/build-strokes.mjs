// Builds src/data/strokes.generated.ts: the stroke order of every kanji in the word list,
// for checking your writing automatically.
//
//   1. npm pack @johnmorrisdotca/jisho  and extract it   (KanjiVG data, CC BY-SA 3.0)
//   2. node scripts/build-strokes.mjs <jisho package dir>
//
// You don't need to run it: its output is committed. Run it again after changing the
// word list if new kanji appear. It only READS the package's data files as text.
//
// Each stroke (an SVG path in a 109×109 box) is sampled into a few points along its
// length, and each coordinate is stored as one printable character, so ~2,000 kanji fit
// in well under a megabyte.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [pkgDir] = process.argv.slice(2);
if (!pkgDir) {
  console.error('usage: node scripts/build-strokes.mjs <jisho package dir>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strokesDir = join(pkgDir, 'dist', 'data', 'strokes');

// Alphabet for coordinates: printable ASCII without quote and backslash (92 symbols).
export const ALPHABET = [...Array(95)].map((_, i) => String.fromCharCode(32 + i)).filter((c) => c !== '"' && c !== '\\' && c !== ' ').join('');
const LEVELS = ALPHABET.length; // 92
const BOX = 109;
const enc = (v) => ALPHABET[Math.max(0, Math.min(LEVELS - 1, Math.round((v / BOX) * (LEVELS - 1))))];

// ---------------------------------------------------------------- SVG path -> points
function parsePath(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e-?\d+)?/g) ?? [];
  const pts = [];
  let i = 0;
  let cmd = '';
  let x = 0, y = 0, sx = 0, sy = 0, lcx = null, lcy = null;
  const num = () => Number(tokens[i++]);
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    const N = 12;
    for (let k = 1; k <= N; k++) {
      const t = k / N, u = 1 - t;
      pts.push([
        u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      ]);
    }
    lcx = x2; lcy = y2; x = x3; y = y3;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toLowerCase()) {
      case 'm': x = ox + num(); y = oy + num(); sx = x; sy = y; pts.push([x, y]); cmd = rel ? 'l' : 'L'; lcx = null; break;
      case 'l': x = ox + num(); y = oy + num(); pts.push([x, y]); lcx = null; break;
      case 'h': x = ox + num(); pts.push([x, y]); lcx = null; break;
      case 'v': y = oy + num(); pts.push([x, y]); lcx = null; break;
      case 'c': { const a = [num(), num(), num(), num(), num(), num()]; cubic(ox + a[0], oy + a[1], ox + a[2], oy + a[3], ox + a[4], oy + a[5]); break; }
      case 's': {
        const a = [num(), num(), num(), num()];
        const x1 = lcx === null ? x : 2 * x - lcx, y1 = lcy === null ? y : 2 * y - lcy;
        cubic(x1, y1, ox + a[0], oy + a[1], ox + a[2], oy + a[3]);
        break;
      }
      case 'z': x = sx; y = sy; pts.push([x, y]); lcx = null; break;
      default: throw new Error(`unsupported path command ${cmd} in ${d}`);
    }
  }
  return pts;
}

/** Points spaced evenly along the stroke: 2 for a dot, up to 14 for a long stroke. */
function resample(pts) {
  const lens = [0];
  for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const total = lens[lens.length - 1];
  const n = Math.max(2, Math.min(14, Math.round(total / 6) + 1));
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < lens.length - 2 && lens[j + 1] < target) j++;
    const seg = lens[j + 1] - lens[j] || 1;
    const t = Math.min(1, Math.max(0, (target - lens[j]) / seg));
    out.push([pts[j][0] + t * (pts[j + 1][0] - pts[j][0]), pts[j][1] + t * (pts[j + 1][1] - pts[j][1])]);
  }
  return out;
}

// ---------------------------------------------------------------- which kanji we need
const vocab = readFileSync(join(root, 'src', 'data', 'vocab.generated.ts'), 'utf8');
const needed = new Set(vocab.match(/[一-鿿々]/g));

const literals = (text) => [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
const out = {};
let missing = new Set(needed);
for (const f of readdirSync(strokesDir).filter((f) => /^t\d+\.data\.js$/.test(f)).sort()) {
  for (const row of literals(readFileSync(join(strokesDir, f), 'utf8'))) {
    const tab = row.indexOf('\t');
    if (tab < 0) continue;
    const ch = row.slice(0, tab);
    if (!needed.has(ch)) continue;
    const strokes = row.slice(tab + 1).split('|').map((d) => resample(parsePath(d)));
    out[ch] = strokes.map((s) => s.map(([x, y]) => enc(x) + enc(y)).join('')).join(' ');
    missing.delete(ch);
  }
}

const body = Object.entries(out).map(([k, v]) => `  '${k}': ${JSON.stringify(v)},`).join('\n');
writeFileSync(
  join(root, 'src', 'data', 'strokes.generated.ts'),
  `// AUTO-GENERATED by scripts/build-strokes.mjs. Do not edit by hand.
// Stroke order from KanjiVG (https://kanjivg.tagaini.net), copyright Ulrich Apel and contributors,
// CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/). This derived table is under the same licence.
//
// Each kanji: its strokes in writing order, separated by spaces. Each stroke: points along it,
// two characters per point (x then y), each character a coordinate in a ${BOX}×${BOX} box
// encoded with STROKE_ALPHABET.
export const STROKE_ALPHABET = ${JSON.stringify(ALPHABET)};
export const STROKE_BOX = ${BOX};
export const STROKES: Record<string, string> = {
${body}
};
`,
);
console.log(`wrote strokes for ${Object.keys(out).length} kanji; ${missing.size} without data: ${[...missing].join('')}`);
