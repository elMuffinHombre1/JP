import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getLesson, getLessonWords, type Lesson, type WordProgress } from '../../db/database';
import type { QuizMode } from '../../lib/quiz';
import { Button, Card, WordRow } from '../../ui/components';
import { colors, space } from '../../ui/theme';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [words, setWords] = useState<WordProgress[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLesson(await getLesson(db, Number(id)));
        setWords(await getLessonWords(db, Number(id)));
      })();
    }, [db, id]),
  );

  const start = (mode: QuizMode) => router.push({ pathname: '/quiz', params: { mode, lessonId: id } });
  const hasKanji = words.some((w) => w.kanji);

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <Stack.Screen options={{ title: lesson?.title ?? 'Lesson' }} />
      <Card>
        <Text style={styles.kicker}>STUDY THESE WORDS</Text>
        <Text style={styles.sub}>Blue hiragana after a kanji is okurigana: it's read exactly as written.</Text>
        <View style={{ marginTop: space(2) }}>
          {words.map((w) => <WordRow key={w.id} word={w} />)}
        </View>
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={styles.kicker}>TEST YOURSELF</Text>
        <Text style={styles.sub}>Score 80% or more on any quiz to complete this lesson.</Text>
        <Button label="Meaning quiz" onPress={() => start('meaning')} />
        <Button label="Reading quiz" kind="secondary" disabled={!hasKanji} onPress={() => start('reading')} />
        <Button label="Writing practice" kind="secondary" disabled={!hasKanji} onPress={() => start('writing')} />
        {lesson?.best_score != null ? (
          <Text style={styles.sub}>Best score: {lesson.best_score}%{lesson.completed_at ? ' · completed ✅' : ''}</Text>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  kicker: { color: colors.muted, fontSize: 12, letterSpacing: 1 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
