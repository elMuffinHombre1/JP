import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  getAllWords, getGrouping, getStats, getTodaysLesson, type Lesson, type Word,
} from '../../db/database';
import { dailyIndex } from '../../lib/lessons';
import { Button, Card, WordWidget } from '../../ui/components';
import { colors, space } from '../../ui/theme';

export default function Today() {
  const db = useSQLiteContext();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState({ total: 0, seen: 0, learned: 0, due: 0 });

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const grouping = await getGrouping(db);
        const [l, w, s] = await Promise.all([getTodaysLesson(db, grouping), getAllWords(db), getStats(db)]);
        if (!alive) return;
        setLesson(l);
        setWords(w);
        setStats(s);
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const wotd = words.length ? words[(dailyIndex(words.length, new Date()) + offset) % words.length] : null;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {wotd ? <WordWidget word={wotd} onPress={() => setOffset((o) => o + 1)} /> : null}
      <Text style={styles.hint}>Tap the card for another word. This is a preview of the home-screen widget.</Text>

      <Card>
        <Text style={styles.kicker}>TODAY'S LESSON</Text>
        {lesson ? (
          <>
            <Text style={styles.title}>{lesson.title}</Text>
            <Text style={styles.sub}>{lesson.word_count} words</Text>
            <Button label="Start lesson" onPress={() => router.push(`/lesson/${lesson.id}`)} style={{ marginTop: space(4) }} />
          </>
        ) : (
          <Text style={styles.title}>All lessons complete 🎉</Text>
        )}
      </Card>

      <View style={styles.stats}>
        <Stat n={stats.learned} label="learned" />
        <Stat n={stats.seen} label="seen" />
        <Stat n={stats.total} label="words" />
      </View>

      <Card>
        <Text style={styles.kicker}>REVIEW</Text>
        <Text style={styles.title}>{stats.due} due now</Text>
        <Button
          label="Review due words"
          kind="secondary"
          disabled={!stats.due}
          onPress={() => router.push({ pathname: '/quiz', params: { mode: 'meaning', review: '1' } })}
          style={{ marginTop: space(4) }}
        />
      </Card>
    </ScrollView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space(4), gap: space(4) },
  hint: { color: colors.muted, fontSize: 12, marginTop: -space(2), textAlign: 'center' },
  kicker: { color: colors.muted, fontSize: 12, letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '700', marginTop: space(1) },
  sub: { color: colors.muted, fontSize: 14, marginTop: 2 },
  stats: { flexDirection: 'row', gap: space(3) },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: space(3), alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  statN: { fontSize: 22, fontWeight: '700', color: colors.ink },
  statL: { fontSize: 12, color: colors.muted },
});
