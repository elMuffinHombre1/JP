import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getDueWords, getStats, type WordProgress } from '../../db/database';
import type { QuizMode } from '../../lib/quiz';
import { Button, Card, WordRow } from '../../ui/components';
import { colors, space } from '../../ui/theme';

export default function Review() {
  const db = useSQLiteContext();
  const [due, setDue] = useState<WordProgress[]>([]);
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setDue(await getDueWords(db, 50));
        setCount((await getStats(db)).due);
      })();
    }, [db]),
  );

  const start = (mode: QuizMode) => router.push({ pathname: '/quiz', params: { mode, review: '1' } });

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <Card style={{ gap: space(3) }}>
        <Text style={styles.title}>{count} words due</Text>
        <Text style={styles.sub}>
          Words you've studied come back here on a spaced-repetition schedule (1, 2, 4, 8, 16, 32 days).
        </Text>
        <Button label="Meaning quiz" disabled={!count} onPress={() => start('meaning')} />
        <Button label="Reading quiz" kind="secondary" disabled={!count} onPress={() => start('reading')} />
        <Button label="Writing practice" kind="secondary" disabled={!count} onPress={() => start('writing')} />
      </Card>
      <Card style={{ gap: space(3) }}>
        <Text style={styles.title}>⚡ Speed reading</Text>
        <Text style={styles.sub}>
          A timed reading drill with 20 random words you've already studied, due or not. Beat your best average time.
        </Text>
        <Button label="Start speed reading" onPress={() => router.push('/speed')} />
      </Card>
      <Card style={{ gap: space(3) }}>
        <Text style={styles.title}>文 Sentences</Text>
        <Text style={styles.sub}>
          Read sentences that use words you've studied. Choose the meaning of the whole sentence or of one word, timed or untimed.
        </Text>
        <Button label="Start sentences" onPress={() => router.push('/sentences')} />
      </Card>
      {due.length ? (
        <Card>
          {due.map((w) => <WordRow key={w.id} word={w} />)}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 14 },
});
