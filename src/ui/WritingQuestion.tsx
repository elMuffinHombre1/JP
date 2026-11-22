import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { STROKE_ALPHABET, STROKES } from '../data/strokes.generated';
import { toRomaji } from '../lib/romaji';
import { checkKanji, decodeStrokes, writingCells, type CheckResult, type Pt } from '../lib/strokes';
import { Button } from './components';
import { KanjiPad, MiniDrawing } from './KanjiPad';
import { colors, radius, space } from './theme';

const refCache = new Map<string, Pt[][]>();
function referenceOf(ch: string): Pt[][] | undefined {
  if (!STROKES[ch]) return undefined;
  if (!refCache.has(ch)) refCache.set(ch, decodeStrokes(STROKES[ch], STROKE_ALPHABET));
  return refCache.get(ch);
}

type CellResult = {
  strokes: Pt[][];
  firstTryOk: boolean | null; // null until checked
  check?: CheckResult;
};

/**
 * Write a word one kanji at a time: one box per kanji, kana shown as-is. Each kanji is
 * checked automatically against its stroke order. The word counts as correct only if
 * every kanji was right on the first try.
 */
export function WritingQuestion({
  word, padSize, onDone,
}: {
  word: { kanji: string; kana: string; meaning: string };
  padSize: number;
  onDone: (correct: boolean) => void;
}) {
  const cells = useMemo(() => writingCells(word.kanji, (c) => !!STROKES[c]), [word.kanji]);
  const toDraw = useMemo(() => cells.map((c, i) => (c.draw ? i : -1)).filter((i) => i >= 0), [cells]);

  const [cur, setCur] = useState(0); // index into toDraw
  const [results, setResults] = useState<CellResult[]>(() => cells.map(() => ({ strokes: [], firstTryOk: null })));
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const [checked, setChecked] = useState<CheckResult | null>(null);
  const [selfCheck, setSelfCheck] = useState(false); // kanji with no stroke data, revealed
  const [trace, setTrace] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null); // strokes shown while animating
  const [finished, setFinished] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const cellIndex = toDraw[cur];
  const cell = cells[cellIndex];
  const reference = cell ? referenceOf(cell.ch) : undefined;

  const save = (patch: Partial<CellResult>) =>
    setResults((r) => r.map((x, i) => (i === cellIndex ? { ...x, ...patch } : x)));

  const check = () => {
    if (!cell) return;
    if (!cell.auto || !reference) {
      setSelfCheck(true);
      return;
    }
    const res = checkKanji(strokes, reference, padSize);
    setChecked(res);
    setTrace(false);
    const first = results[cellIndex].firstTryOk;
    save({ strokes, check: res, firstTryOk: first === null ? res.ok : first });
  };

  const markSelf = (ok: boolean) => {
    save({ strokes, firstTryOk: results[cellIndex].firstTryOk ?? ok });
    advance(results.map((x, i) => (i === cellIndex ? { ...x, firstTryOk: x.firstTryOk ?? ok } : x)));
  };

  /** The check got it wrong: count this kanji as right. */
  const overrule = () => {
    save({ firstTryOk: true });
    advance(results.map((x, i) => (i === cellIndex ? { ...x, firstTryOk: true } : x)));
  };

  const retry = () => {
    setStrokes([]);
    setChecked(null);
  };

  const advance = (all = results) => {
    stopPlaying();
    setStrokes([]);
    setChecked(null);
    setSelfCheck(false);
    setTrace(false);
    setShowCount(false);
    if (cur + 1 < toDraw.length) {
      setCur(cur + 1);
      return;
    }
    setFinished(true);
    onDone(toDraw.every((i) => all[i].firstTryOk));
  };

  const stopPlaying = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(null);
  };

  const play = () => {
    if (!reference) return;
    stopPlaying();
    let n = 0;
    setPlaying(0);
    timer.current = setInterval(() => {
      n++;
      if (n > reference.length) {
        stopPlaying();
        return;
      }
      setPlaying(n);
    }, 450);
  };

  // ------------------------------------------------------------ the row of boxes
  const BOXSIZE = 52;
  const row = (
    <View style={styles.cells}>
      {cells.map((c, i) => {
        if (!c.draw) {
          return (
            <View key={i} style={[styles.cell, styles.kanaCell, { width: BOXSIZE * 0.7, height: BOXSIZE }]}>
              <Text style={styles.kana}>{c.ch}</Text>
            </View>
          );
        }
        const r = results[i];
        const active = !finished && i === cellIndex;
        const done = r.firstTryOk !== null;
        const border = active ? colors.accent : !done ? colors.line : r.firstTryOk ? colors.good : colors.bad;
        return (
          <View key={i} style={[styles.cell, { width: BOXSIZE, height: BOXSIZE, borderColor: border, borderWidth: active ? 2 : 1 }]}>
            {finished || (done && !active) ? (
              <Text style={{ fontSize: BOXSIZE * 0.66, color: r.firstTryOk ? colors.good : colors.bad }}>{c.ch}</Text>
            ) : done ? (
              <MiniDrawing strokes={r.strokes} padSize={padSize} size={BOXSIZE - 4} color={r.firstTryOk ? colors.good : colors.bad} />
            ) : (
              <Text style={{ fontSize: 18, color: colors.muted }}>{active ? '✎' : '?'}</Text>
            )}
          </View>
        );
      })}
    </View>
  );

  const prompt = (
    <View style={styles.prompt}>
      <Text style={styles.promptMeaning}>{word.meaning}</Text>
      <Text style={styles.sub}>{word.kana} · {toRomaji(word.kana)}</Text>
      {row}
    </View>
  );

  if (finished) {
    const right = toDraw.filter((i) => results[i].firstTryOk).length;
    return (
      <View style={{ gap: space(4) }}>
        {prompt}
        <View style={styles.result}>
          <Text style={{ fontSize: 48, color: colors.ink }}>{word.kanji}</Text>
          <Text style={[styles.sub, { marginTop: space(1) }]}>
            {right === toDraw.length ? 'All kanji right first time ✅' : `${right}/${toDraw.length} kanji right first time`}
          </Text>
        </View>
      </View>
    );
  }

  // ------------------------------------------------------------ colours after checking
  const strokeColors = checked
    ? checked.strokes.length
      ? checked.strokes.map((s) => (s === 'ok' ? colors.good : colors.bad))
      : strokes.map(() => colors.bad) // wrong count: all red
    : undefined;

  const showRef = !!reference && (trace || !!checked || playing !== null);
  const lastCell = cur + 1 >= toDraw.length;

  return (
    <View style={{ gap: space(3) }}>
      {prompt}

      <View style={{ alignItems: 'center' }}>
        <KanjiPad
          size={padSize}
          strokes={playing !== null ? [] : strokes}
          onStrokesChange={setStrokes}
          reference={showRef ? reference : undefined}
          referenceCount={playing ?? undefined}
          referenceOpacity={playing !== null ? 0.9 : checked ? 0.3 : 0.15}
          guide={!cell.auto && (trace || selfCheck) ? cell.ch : undefined}
          guideOpacity={selfCheck ? 0.35 : 0.15}
          strokeColors={strokeColors}
          disabled={!!checked || selfCheck || playing !== null}
        />
      </View>

      {checked ? (
        <View style={[styles.feedback, { borderColor: checked.ok ? colors.good : colors.bad, backgroundColor: checked.ok ? colors.goodSoft : colors.badSoft }]}>
          <Text style={styles.feedbackText}>{checked.ok ? `✓ ${cell.ch}: correct!` : `✗ ${checked.message}`}</Text>
          {!checked.ok ? (
            <Text style={[styles.sub, { marginTop: 2 }]}>The numbers show where each stroke starts, in order.</Text>
          ) : null}
        </View>
      ) : selfCheck ? (
        <View style={styles.feedback}>
          <Text style={styles.feedbackText}>No stroke data for {cell.ch}. Compare and mark it yourself.</Text>
        </View>
      ) : (
        <Text style={[styles.sub, { textAlign: 'center' }]}>
          Kanji {cur + 1} of {toDraw.length}
          {cells.length > toDraw.length ? ' · the hiragana is filled in for you' : ''}
          {reference ? (
            <Text onPress={() => setShowCount(true)} style={{ color: colors.accent }}>
              {showCount ? `  ·  ${reference.length} strokes` : '  ·  stroke count?'}
            </Text>
          ) : null}
        </Text>
      )}

      {checked ? (
        <View style={{ gap: space(2) }}>
          <View style={styles.rowGap}>
            <Button label="▶ Stroke order" kind="secondary" style={{ flex: 1 }} onPress={play} />
            {checked.ok ? null : <Button label="Try again" kind="secondary" style={{ flex: 1 }} onPress={retry} />}
            <Button label={lastCell ? 'Done' : 'Next kanji'} style={{ flex: 1 }} onPress={() => advance()} />
          </View>
          {!checked.ok ? (
            <Pressable onPress={overrule} hitSlop={8}>
              <Text style={[styles.sub, { textAlign: 'center', textDecorationLine: 'underline' }]}>I wrote it correctly</Text>
            </Pressable>
          ) : null}
        </View>
      ) : selfCheck ? (
        <View style={styles.rowGap}>
          <Button label="Missed it" kind="secondary" style={{ flex: 1 }} onPress={() => markSelf(false)} />
          <Button label="Got it" style={{ flex: 1 }} onPress={() => markSelf(true)} />
        </View>
      ) : (
        <View style={styles.rowGap}>
          <Button label="Undo" kind="secondary" style={{ flex: 1 }} disabled={!strokes.length} onPress={() => setStrokes(strokes.slice(0, -1))} />
          <Button label="Clear" kind="secondary" style={{ flex: 1 }} disabled={!strokes.length} onPress={() => setStrokes([])} />
          <Button label={trace ? 'Hide' : 'Trace'} kind="secondary" style={{ flex: 1 }} onPress={() => setTrace(!trace)} />
          <Button label="Check" style={{ flex: 1 }} disabled={!strokes.length && !!cell.auto} onPress={check} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: {
    alignItems: 'center', paddingVertical: space(4), paddingHorizontal: space(3), gap: space(1),
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
  },
  promptMeaning: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  sub: { color: colors.muted, fontSize: 14 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space(1.5), marginTop: space(2) },
  cell: { borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFDF8' },
  kanaCell: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  kana: { fontSize: 24, color: colors.okurigana },
  feedback: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space(3), backgroundColor: colors.card },
  feedbackText: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  result: { alignItems: 'center', paddingVertical: space(4), backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  rowGap: { flexDirection: 'row', gap: space(2) },
});
