import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import {
  getAllWords, getLessonWords, getSeenWords, getSetting, recordAnswer, recordLessonScore, setSetting, written,
} from '../db/database';
import { shuffle } from '../lib/lessons';
import {
  buildQuestion, canAsk, isBestRun, readingExplanation, summarizeSpeed, SPEED_LIMITS,
  type Question, type SpeedResult,
} from '../lib/quiz';
import { toRomaji } from '../lib/romaji';
import { Button, Card, Segmented, Written } from '../ui/components';
import { colors, radius, space } from '../ui/theme';

type Phase = 'setup' | 'question' | 'feedback' | 'done';
const TICK_MS = 50;
const AUTO_NEXT_MS = 450; // pause after a correct answer before the next word

const secs = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(2)}s`);

export default function SpeedReading() {
  const params = useLocalSearchParams<{ lessonId?: string }>();
  const db = useSQLiteContext();

  const [limit, setLimit] = useState<number>(5);
  const [best, setBest] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [phase, setPhase] = useState<Phase>('setup');
  const [i, setI] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<SpeedResult[]>([]);
  const [newBest, setNewBest] = useState(false);

  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoNext = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimers = () => {
    if (ticker.current) clearInterval(ticker.current);
    if (autoNext.current) clearTimeout(autoNext.current);
    ticker.current = autoNext.current = null;
  };
  useEffect(() => stopTimers, []);

  useEffect(() => {
    (async () => {
      const saved = Number(await getSetting(db, 'speed_seconds'));
      if ((SPEED_LIMITS as readonly number[]).includes(saved)) setLimit(saved);
      const b = await getSetting(db, 'speed_best_ms');
      setBest(b ? Number(b) : null);
      const pool = await getAllWords(db);
      const source = params.lessonId ? await getLessonWords(db, Number(params.lessonId)) : await getSeenWords(db, 20);
      setQuestions(shuffle(source.filter((w) => canAsk(w, 'reading'))).map((w) => buildQuestion(w, 'reading', pool)));
    })();
  }, [db, params.lessonId]);

  const q = questions?.[i];
  const limitMs = limit * 1000;

  const finish = useCallback(async (all: SpeedResult[]) => {
    stopTimers();
    setPhase('done');
    const s = summarizeSpeed(all);
    if (params.lessonId) await recordLessonScore(db, Number(params.lessonId), s.pct);
    if (isBestRun(s.avgMs, s.pct, best)) {
      await setSetting(db, 'speed_best_ms', String(s.avgMs));
      setNewBest(true);
    }
  }, [db, params.lessonId, best]);

  const showQuestion = useCallback(() => {
    stopTimers();
    setPicked(null);
    setElapsed(0);
    setPhase('question');
    startedAt.current = Date.now();
    ticker.current = setInterval(() => setElapsed(Date.now() - startedAt.current), TICK_MS);
  }, []);

  const goNext = useCallback((all: SpeedResult[]) => {
    if (!questions) return;
    if (i + 1 >= questions.length) {
      finish(all);
      return;
    }
    setI(i + 1);
    showQuestion();
  }, [questions, i, finish, showQuestion]);

  const submit = useCallback((choice: string | null) => {
    if (!q || phase !== 'question') return;
    stopTimers();
    const ms = Math.min(Date.now() - startedAt.current, limitMs);
    const timedOut = choice === null;
    const correct = !timedOut && choice === q.answer;
    const all = [...results, { wordId: q.word.id, correct, ms, timedOut }];
    setResults(all);
    setPicked(choice ?? '');
    setElapsed(ms);
    setPhase('feedback');
    recordAnswer(db, q.word.id, correct);
    // Keep the pace up when you get it right; stop so you can study a miss.
    if (correct) autoNext.current = setTimeout(() => goNext(all), AUTO_NEXT_MS);
  }, [q, phase, limitMs, results, db, goNext]);

  // Time's up.
  useEffect(() => {
    if (phase === 'question' && elapsed >= limitMs) submit(null);
  }, [phase, elapsed, limitMs, submit]);

  const start = async (seconds: number) => {
    await setSetting(db, 'speed_seconds', String(seconds));
    setResults([]);
    setI(0);
    setNewBest(false);
    showQuestion();
  };

  const close = () => {
    stopTimers();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (!questions) return <SafeAreaView style={styles.page} />;

  // ------------------------------------------------------------ setup
  if (phase === 'setup') {
    return (
      <SafeAreaView style={styles.page}>
        <Header onClose={close} />
        <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
          <Card style={{ gap: space(3) }}>
            <Text style={styles.title}>Speed reading</Text>
            <Text style={styles.sub}>
              Read each word and tap its reading before the bar runs out. Running out of time counts as a miss.
            </Text>
            {questions.length ? (
              <>
                <Text style={styles.kicker}>SECONDS PER WORD</Text>
                <Segmented
                  value={String(limit)}
                  onChange={(v) => setLimit(Number(v))}
                  options={SPEED_LIMITS.map((s) => ({ value: String(s), label: `${s}s` }))}
                />
                <Text style={styles.sub}>
                  {questions.length} words · personal best {secs(best)} average
                </Text>
                <Button label="Start" onPress={() => start(limit)} />
              </>
            ) : (
              <Text style={styles.sub}>
                {params.lessonId
                  ? 'This lesson has no kanji words to read.'
                  : 'Study a lesson first. Speed reading uses words you have already seen.'}
              </Text>
            )}
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------ results
  if (phase === 'done') {
    const s = summarizeSpeed(results);
    const slow = [...results].filter((r) => !r.correct || r.ms > limitMs * 0.6)
      .sort((a, b) => Number(a.correct) - Number(b.correct) || b.ms - a.ms)
      .slice(0, 8);
    const byId = new Map(questions.map((x) => [x.word.id, x.word]));
    return (
      <SafeAreaView style={styles.page}>
        <Header onClose={close} />
        <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
          <View style={{ alignItems: 'center', paddingVertical: space(4) }}>
            <Text style={styles.big}>{secs(s.avgMs)}</Text>
            <Text style={styles.sub}>average per correct word{newBest ? ' · new best! 🎉' : ''}</Text>
            <Text style={[styles.sub, { marginTop: space(2) }]}>
              {s.correct}/{s.total} correct ({s.pct}%) · fastest {secs(s.fastestMs)} · {s.timeouts} timed out
            </Text>
            {params.lessonId ? (
              <Text style={[styles.sub, { marginTop: space(1) }]}>
                {s.pct >= 80 ? 'Lesson complete ✅' : 'Get 80% or more to complete the lesson.'}
              </Text>
            ) : null}
          </View>
          {slow.length ? (
            <Card>
              <Text style={styles.kicker}>PRACTISE THESE</Text>
              {slow.map((r) => {
                const w = byId.get(r.wordId)!;
                return (
                  <View key={r.wordId} style={styles.slowRow}>
                    <Text style={{ fontSize: 22, width: 100, color: colors.ink }}>{written(w)}</Text>
                    <Text style={{ flex: 1, color: colors.ink }}>{w.kana} · {toRomaji(w.kana)}</Text>
                    <Text style={{ color: r.correct ? colors.muted : colors.bad }}>
                      {r.timedOut ? 'time' : r.correct ? secs(r.ms) : 'miss'}
                    </Text>
                  </View>
                );
              })}
            </Card>
          ) : null}
          <Button label="Go again" onPress={() => { setQuestions(shuffle(questions)); start(limit); }} />
          <Button label="Done" kind="secondary" onPress={close} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------ question / feedback
  if (!q) return null;
  const w = q.word;
  const remaining = Math.max(0, 1 - elapsed / limitMs);
  const urgent = remaining < 0.3;
  const answered = phase === 'feedback';
  const last = results[results.length - 1];

  return (
    <SafeAreaView style={styles.page}>
      <Header onClose={close} progress={`${i + 1}/${questions.length}`} />
      <View style={styles.timer}>
        <View style={[styles.timerFill, { width: `${remaining * 100}%`, backgroundColor: urgent ? colors.bad : colors.accent }]} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3) }}>
        <View style={styles.prompt}>
          <Written word={w} size={60} />
          <Text style={[styles.sub, { marginTop: space(2) }]}>
            {answered ? `${secs(last.ms)}${last.timedOut ? ' · time up' : ''}` : `${((limitMs - elapsed) / 1000).toFixed(1)}s`}
          </Text>
        </View>
        {q.options.map((o) => {
          const isAnswer = o === q.answer;
          const state = !answered ? 'idle' : isAnswer ? 'good' : o === picked ? 'bad' : 'idle';
          return (
            <Pressable
              key={o}
              disabled={answered}
              onPress={() => submit(o)}
              style={({ pressed }) => [
                styles.option, pressed && { opacity: 0.7 },
                state === 'good' && styles.optGood, state === 'bad' && styles.optBad,
              ]}
            >
              <Text style={styles.optText}>{o}</Text>
              {answered ? <Text style={styles.sub}>{toRomaji(o)}</Text> : null}
            </Pressable>
          );
        })}
        {answered && !last.correct ? (
          <>
            <View style={styles.explain}>
              <Text style={styles.explainText}>{written(w)} · {w.kana} · {toRomaji(w.kana)} — {w.meaning}</Text>
              {readingExplanation(w) ? (
                <Text style={[styles.explainText, { color: colors.muted, marginTop: space(1) }]}>{readingExplanation(w)}</Text>
              ) : null}
            </View>
            <Button label={i + 1 >= questions.length ? 'See results' : 'Next'} onPress={() => goNext(results)} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onClose, progress }: { onClose: () => void; progress?: string }) {
  return (
    <View style={styles.top}>
      <Pressable onPress={onClose} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
      <Text style={styles.topTitle}>⚡ Speed reading</Text>
      <Text style={styles.count}>{progress ?? ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(2) },
  topTitle: { flex: 1, textAlign: 'center', color: colors.ink, fontWeight: '600' },
  close: { fontSize: 20, color: colors.muted, width: 44 },
  count: { color: colors.muted, fontSize: 13, width: 44, textAlign: 'right' },
  timer: { height: 8, backgroundColor: colors.line, marginHorizontal: space(4), borderRadius: 4, overflow: 'hidden' },
  timerFill: { height: 8 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  kicker: { color: colors.muted, fontSize: 12, letterSpacing: 1 },
  sub: { color: colors.muted, fontSize: 14 },
  big: { fontSize: 56, fontWeight: '800', color: colors.ink },
  prompt: { alignItems: 'center', paddingVertical: space(6), backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  option: { backgroundColor: colors.card, borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: colors.line },
  optGood: { backgroundColor: colors.goodSoft, borderColor: colors.good },
  optBad: { backgroundColor: colors.badSoft, borderColor: colors.bad },
  optText: { fontSize: 22, color: colors.ink },
  explain: { backgroundColor: colors.card, borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: colors.line },
  explainText: { fontSize: 15, color: colors.ink },
  slowRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: space(2),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
});
