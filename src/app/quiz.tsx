import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import {
  getAllWords, getDueWords, getLessonWords, recordAnswer, recordLessonScore, written, type Word,
} from '../db/database';
import { shuffle } from '../lib/lessons';
import { buildQuestion, canAsk, readingExplanation, type Question, type QuizMode } from '../lib/quiz';
import { toRomaji } from '../lib/romaji';
import { Button, Written } from '../ui/components';
import { KanjiPad } from '../ui/KanjiPad';
import { colors, radius, space } from '../ui/theme';

type Point = { x: number; y: number };

const TITLES: Record<QuizMode, string> = {
  meaning: 'What does it mean?',
  reading: 'How is it read?',
  writing: 'Write it in kanji',
};

export default function Quiz() {
  const params = useLocalSearchParams<{ mode: QuizMode; lessonId?: string; review?: string }>();
  const mode: QuizMode = params.mode ?? 'meaning';
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [revealed, setRevealed] = useState(false);
  const [trace, setTrace] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    (async () => {
      const pool: Word[] = await getAllWords(db);
      const source: Word[] = params.lessonId
        ? await getLessonWords(db, Number(params.lessonId))
        : await getDueWords(db, 20);
      const asked = shuffle(source.filter((w) => canAsk(w, mode)));
      setQuestions(asked.map((w) => buildQuestion(w, mode, pool)));
    })();
  }, [db, mode, params.lessonId]);

  const q = questions?.[i];

  const answer = useCallback(async (correct: boolean, choice: string) => {
    if (!q) return;
    setPicked(choice);
    if (correct) setScore((s) => s + 1);
    await recordAnswer(db, q.word.id, correct);
  }, [db, q]);

  const next = async () => {
    if (!questions) return;
    if (i + 1 >= questions.length) {
      if (params.lessonId) await recordLessonScore(db, Number(params.lessonId), Math.round((score / questions.length) * 100));
      setFinished(true);
      return;
    }
    setI(i + 1);
    setPicked(null);
    setStrokes([]);
    setRevealed(false);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!questions) return <SafeAreaView style={styles.page} />;

  if (!questions.length || finished) {
    const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;
    return (
      <SafeAreaView style={[styles.page, styles.center]}>
        {questions.length ? (
          <>
            <Text style={styles.big}>{pct}%</Text>
            <Text style={styles.sub}>{score} / {questions.length} correct</Text>
            {params.lessonId ? (
              <Text style={[styles.sub, { marginTop: space(2) }]}>
                {pct >= 80 ? 'Lesson complete ✅' : 'Get 80% or more to complete the lesson.'}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.sub}>Nothing to quiz here yet.</Text>
        )}
        <Button label="Done" onPress={close} style={{ marginTop: space(6), alignSelf: 'stretch', marginHorizontal: space(8) }} />
      </SafeAreaView>
    );
  }

  if (!q) return null;
  const w = q.word;
  const answered = picked !== null;
  const padSize = Math.min(width - space(8), 340);

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.top}>
        <Pressable onPress={close} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
        <View style={styles.bar}><View style={[styles.barFill, { width: `${(i / questions.length) * 100}%` }]} /></View>
        <Text style={styles.count}>{i + 1}/{questions.length}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }} scrollEnabled={mode !== 'writing'}>
        <Text style={styles.kicker}>{TITLES[mode]}</Text>

        {mode === 'writing' ? (
          <>
            <View style={styles.prompt}>
              <Text style={styles.promptMeaning}>{w.meaning}</Text>
              <Text style={styles.sub}>{w.kana} · {toRomaji(w.kana)}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <KanjiPad
                size={padSize}
                strokes={strokes}
                onStrokesChange={setStrokes}
                guide={revealed || trace ? w.kanji : undefined}
                guideOpacity={revealed ? 0.35 : 0.15}
              />
            </View>
            {revealed ? (
              <>
                <Text style={[styles.center, { fontSize: 44, color: colors.ink }]}>{w.kanji}</Text>
                {answered ? (
                  <Button label={i + 1 >= questions.length ? 'Finish' : 'Next'} onPress={next} />
                ) : (
                  <View style={styles.rowGap}>
                    <Button label="Missed it" kind="secondary" style={{ flex: 1 }} onPress={() => answer(false, 'missed')} />
                    <Button label="Got it" style={{ flex: 1 }} onPress={() => answer(true, 'ok')} />
                  </View>
                )}
              </>
            ) : (
              <View style={styles.rowGap}>
                <Button label="Clear" kind="secondary" style={{ flex: 1 }} onPress={() => setStrokes([])} />
                <Button label={trace ? 'Hide guide' : 'Trace'} kind="secondary" style={{ flex: 1 }} onPress={() => setTrace(!trace)} />
                <Button label="Check" style={{ flex: 1 }} onPress={() => setRevealed(true)} />
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.prompt}>
              <Written word={w} size={56} highlight={mode === 'reading'} />
              {mode === 'meaning' && w.kanji && answered ? <Text style={styles.sub}>{w.kana}</Text> : null}
            </View>
            {q.options.map((o) => {
              const isAnswer = o === q.answer;
              const state = !answered ? 'idle' : isAnswer ? 'good' : o === picked ? 'bad' : 'idle';
              return (
                <Pressable
                  key={o}
                  disabled={answered}
                  onPress={() => answer(isAnswer, o)}
                  style={[styles.option, state === 'good' && styles.optGood, state === 'bad' && styles.optBad]}
                >
                  <Text style={[styles.optText, mode === 'reading' && { fontSize: 22 }]}>{o}</Text>
                  {mode === 'reading' && answered ? <Text style={styles.sub}>{toRomaji(o)}</Text> : null}
                </Pressable>
              );
            })}
            {answered ? (
              <View style={{ gap: space(3) }}>
                <View style={styles.explain}>
                  <Text style={styles.explainText}>
                    {written(w)} · {w.kana} · {toRomaji(w.kana)} — {w.meaning}
                  </Text>
                  {mode === 'reading' && readingExplanation(w) ? (
                    <Text style={[styles.explainText, { color: colors.muted, marginTop: space(1) }]}>{readingExplanation(w)}</Text>
                  ) : null}
                </View>
                <Button label={i + 1 >= questions.length ? 'Finish' : 'Next'} onPress={next} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingTop: space(2) },
  close: { fontSize: 20, color: colors.muted },
  bar: { flex: 1, height: 6, backgroundColor: colors.line, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.accent },
  count: { color: colors.muted, fontSize: 13, width: 44, textAlign: 'right' },
  kicker: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  prompt: { alignItems: 'center', paddingVertical: space(6), backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  promptMeaning: { fontSize: 24, fontWeight: '700', color: colors.ink, textAlign: 'center', paddingHorizontal: space(4) },
  option: { backgroundColor: colors.card, borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: colors.line },
  optGood: { backgroundColor: colors.goodSoft, borderColor: colors.good },
  optBad: { backgroundColor: colors.badSoft, borderColor: colors.bad },
  optText: { fontSize: 17, color: colors.ink },
  explain: { backgroundColor: colors.card, borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: colors.line },
  explainText: { fontSize: 15, color: colors.ink },
  rowGap: { flexDirection: 'row', gap: space(2) },
  big: { fontSize: 64, fontWeight: '800', color: colors.ink },
  sub: { color: colors.muted, fontSize: 14, marginTop: 2 },
});
