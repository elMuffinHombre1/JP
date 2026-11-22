import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import {
  getAllSentences, getAllWords, getSentenceRows, getSetting, recordAnswer, setSetting,
} from '../db/database';
import { summarizeSpeed, type SpeedResult } from '../lib/quiz';
import { toRomaji } from '../lib/romaji';
import {
  buildSentenceQuestions, SENTENCE_LIMITS, splitAround, type SentenceMode, type SentenceQuestion, type SWord,
} from '../lib/sentences';
import { Button, Card, Segmented } from '../ui/components';
import { colors, radius, space } from '../ui/theme';

type Phase = 'setup' | 'question' | 'feedback' | 'done';
const TICK_MS = 50;
const AUTO_NEXT_MS = 700;
const secs = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)}s`);

export default function SentenceQuiz() {
  const params = useLocalSearchParams<{ lessonId?: string }>();
  const db = useSQLiteContext();

  const [mode, setMode] = useState<SentenceMode>('sentence');
  const [limit, setLimit] = useState<number>(12); // seconds, 0 = untimed
  const [questions, setQuestions] = useState<SentenceQuestion[] | null>(null);
  const [words, setWords] = useState<Map<number, SWord>>(new Map());
  const [phase, setPhase] = useState<Phase>('setup');
  const [i, setI] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [showKana, setShowKana] = useState(false);
  const [results, setResults] = useState<SpeedResult[]>([]);

  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoNext = useRef<ReturnType<typeof setTimeout> | null>(null);
  const data = useRef<{ rows: Awaited<ReturnType<typeof getSentenceRows>>; all: { id: number; english: string }[] } | null>(null);

  const stopTimers = () => {
    if (ticker.current) clearInterval(ticker.current);
    if (autoNext.current) clearTimeout(autoNext.current);
    ticker.current = autoNext.current = null;
  };
  useEffect(() => stopTimers, []);

  useEffect(() => {
    (async () => {
      const m = await getSetting(db, 'sentence_mode');
      if (m === 'word' || m === 'sentence') setMode(m);
      const sec = await getSetting(db, 'sentence_seconds');
      if (sec !== null && (SENTENCE_LIMITS as readonly number[]).includes(Number(sec))) setLimit(Number(sec));
      const all = await getAllWords(db);
      setWords(new Map(all.map((w) => [w.id, w])));
      data.current = {
        rows: await getSentenceRows(db, params.lessonId ? Number(params.lessonId) : undefined),
        all: await getAllSentences(db),
      };
      setQuestions([]); // loaded; real questions are built on Start
    })();
  }, [db, params.lessonId]);

  const limitMs = limit * 1000;
  const q = questions?.[i];
  const available = data.current ? new Set(data.current.rows.map((r) => r.id)).size : 0;

  const showQuestion = useCallback((timed: boolean) => {
    stopTimers();
    setPicked(null);
    setShowKana(false);
    setElapsed(0);
    setPhase('question');
    startedAt.current = Date.now();
    if (timed) ticker.current = setInterval(() => setElapsed(Date.now() - startedAt.current), TICK_MS);
  }, []);

  const goNext = useCallback((all: SpeedResult[]) => {
    if (!questions) return;
    if (i + 1 >= questions.length) {
      stopTimers();
      setPhase('done');
      return;
    }
    setI(i + 1);
    showQuestion(limit > 0);
  }, [questions, i, limit, showQuestion]);

  const submit = useCallback((choice: string | null) => {
    if (!q || phase !== 'question') return;
    stopTimers();
    const raw = Date.now() - startedAt.current;
    const ms = limitMs ? Math.min(raw, limitMs) : raw;
    const timedOut = choice === null;
    const correct = !timedOut && choice === q.answer;
    const all = [...results, { wordId: q.sentenceId, correct, ms, timedOut }];
    setResults(all);
    setPicked(choice ?? '');
    setElapsed(ms);
    setPhase('feedback');
    if (q.mode === 'word') recordAnswer(db, q.wordId, correct);
    if (correct && limitMs) autoNext.current = setTimeout(() => goNext(all), AUTO_NEXT_MS);
  }, [q, phase, limitMs, results, db, goNext]);

  useEffect(() => {
    if (phase === 'question' && limitMs && elapsed >= limitMs) submit(null);
  }, [phase, elapsed, limitMs, submit]);

  const start = async () => {
    if (!data.current) return;
    await setSetting(db, 'sentence_mode', mode);
    await setSetting(db, 'sentence_seconds', String(limit));
    setQuestions(buildSentenceQuestions(data.current.rows, mode, data.current.all, words));
    setResults([]);
    setI(0);
    showQuestion(limit > 0);
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
            <Text style={styles.title}>Sentences</Text>
            <Text style={styles.sub}>Read real sentences and show you understand them.</Text>
            <Text style={styles.kicker}>WHAT TO ANSWER</Text>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[{ value: 'sentence', label: 'Whole sentence' }, { value: 'word', label: 'Word in context' }]}
            />
            <Text style={styles.sub}>
              {mode === 'sentence'
                ? 'Pick the English meaning of the whole sentence.'
                : 'One word is highlighted. Pick what it means in this sentence.'}
            </Text>
            <Text style={styles.kicker}>TIME PER SENTENCE</Text>
            <Segmented
              value={String(limit)}
              onChange={(v) => setLimit(Number(v))}
              options={SENTENCE_LIMITS.map((s) => ({ value: String(s), label: s ? `${s}s` : 'Off' }))}
            />
            {available ? (
              <>
                <Text style={styles.sub}>{Math.min(available, 15)} sentences</Text>
                <Button label="Start" onPress={start} />
              </>
            ) : (
              <Text style={styles.sub}>No sentences use these words yet. Add some to data/sentences.psv.</Text>
            )}
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------ results
  if (phase === 'done') {
    const s = summarizeSpeed(results);
    const missed = questions.filter((x) => results.find((r) => r.wordId === x.sentenceId && !r.correct));
    return (
      <SafeAreaView style={styles.page}>
        <Header onClose={close} />
        <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
          <View style={{ alignItems: 'center', paddingVertical: space(4) }}>
            <Text style={styles.big}>{s.pct}%</Text>
            <Text style={styles.sub}>{s.correct}/{s.total} correct</Text>
            <Text style={[styles.sub, { marginTop: space(1) }]}>
              average {secs(s.avgMs)} per correct answer{limit ? ` · ${s.timeouts} timed out` : ''}
            </Text>
          </View>
          {missed.length ? (
            <Card style={{ gap: space(3) }}>
              <Text style={styles.kicker}>REVIEW THESE</Text>
              {missed.map((m) => (
                <View key={m.sentenceId}>
                  <Highlighted q={m} size={18} />
                  <Text style={styles.sub}>{m.kana}</Text>
                  <Text style={{ color: colors.ink, marginTop: 2 }}>{m.english}</Text>
                </View>
              ))}
            </Card>
          ) : null}
          <Button label="Go again" onPress={start} />
          <Button label="Done" kind="secondary" onPress={close} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------ question / feedback
  if (!q) return null;
  const answered = phase === 'feedback';
  const last = results[results.length - 1];
  const remaining = limitMs ? Math.max(0, 1 - elapsed / limitMs) : 1;
  const word = words.get(q.wordId);

  return (
    <SafeAreaView style={styles.page}>
      <Header onClose={close} progress={`${i + 1}/${questions.length}`} />
      {limitMs ? (
        <View style={styles.timer}>
          <View style={[styles.timerFill, { width: `${remaining * 100}%`, backgroundColor: remaining < 0.3 ? colors.bad : colors.accent }]} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3) }}>
        <Text style={styles.kicker}>
          {q.mode === 'sentence' ? 'WHAT DOES THIS SENTENCE MEAN?' : 'WHAT DOES THE HIGHLIGHTED WORD MEAN HERE?'}
        </Text>
        <Pressable style={styles.prompt} onPress={() => setShowKana((v) => !v)}>
          <Highlighted q={q} size={26} highlight={q.mode === 'word'} />
          <Text style={[styles.sub, { marginTop: space(2) }]}>
            {showKana || answered ? q.kana : 'Tap to show the reading'}
          </Text>
          {answered ? <Text style={[styles.sub, { marginTop: 2 }]}>{toRomaji(q.kana)}</Text> : null}
          {limitMs && !answered ? (
            <Text style={[styles.sub, { marginTop: space(2) }]}>{((limitMs - elapsed) / 1000).toFixed(1)}s</Text>
          ) : null}
        </Pressable>
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
            </Pressable>
          );
        })}
        {answered && !(last.correct && limitMs) ? (
          <>
            <View style={styles.explain}>
              {last.timedOut ? <Text style={[styles.explainText, { color: colors.bad }]}>Time's up</Text> : null}
              <Text style={styles.explainText}>{q.english}</Text>
              {word ? (
                <Text style={[styles.explainText, { color: colors.muted, marginTop: space(1) }]}>
                  {q.surface} ← {word.kanji || word.kana} ({word.kana} · {toRomaji(word.kana)}): {word.meaning}
                </Text>
              ) : null}
            </View>
            <Button label={i + 1 >= questions.length ? 'See results' : 'Next'} onPress={() => goNext(results)} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Highlighted({ q, size, highlight = true }: { q: SentenceQuestion; size: number; highlight?: boolean }) {
  const [before, mid, after] = splitAround(q.japanese, q.surface);
  return (
    <Text style={{ fontSize: size, color: colors.ink, lineHeight: size * 1.5 }}>
      {before}
      <Text style={highlight ? styles.hl : undefined}>{mid}</Text>
      {after}
    </Text>
  );
}

function Header({ onClose, progress }: { onClose: () => void; progress?: string }) {
  return (
    <View style={styles.top}>
      <Pressable onPress={onClose} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
      <Text style={styles.topTitle}>文 Sentences</Text>
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
  prompt: {
    alignItems: 'center', paddingVertical: space(6), paddingHorizontal: space(4), backgroundColor: colors.card,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
  },
  hl: { color: colors.accent, fontWeight: '700', textDecorationLine: 'underline' },
  option: { backgroundColor: colors.card, borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: colors.line },
  optGood: { backgroundColor: colors.goodSoft, borderColor: colors.good },
  optBad: { backgroundColor: colors.badSoft, borderColor: colors.bad },
  optText: { fontSize: 17, color: colors.ink },
  explain: { backgroundColor: colors.card, borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: colors.line },
  explainText: { fontSize: 15, color: colors.ink },
});
