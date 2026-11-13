import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getGrouping, getLessons, setSetting, type Lesson } from '../../db/database';
import type { Grouping } from '../../lib/lessons';
import { Segmented } from '../../ui/components';
import { colors, radius, space } from '../../ui/theme';

export default function Lessons() {
  const db = useSQLiteContext();
  const [grouping, setGrouping] = useState<Grouping>('context');
  const [lessons, setLessons] = useState<Lesson[]>([]);

  const load = useCallback(async (g?: Grouping) => {
    const gg = g ?? (await getGrouping(db));
    setGrouping(gg);
    setLessons(await getLessons(db, gg));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const change = async (g: Grouping) => {
    await setSetting(db, 'grouping', g);
    load(g);
  };

  const nextId = lessons.find((l) => !l.completed_at)?.id;

  return (
    <FlatList
      data={lessons}
      keyExtractor={(l) => String(l.id)}
      contentContainerStyle={{ padding: space(4), gap: space(2) }}
      ListHeaderComponent={
        <View style={{ marginBottom: space(2), gap: space(2) }}>
          <Segmented
            value={grouping}
            onChange={change}
            options={[{ value: 'context', label: 'By topic' }, { value: 'type', label: 'By word type' }]}
          />
          <Text style={styles.hint}>Your daily lesson is the next unfinished one in this list.</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <Pressable onPress={() => router.push(`/lesson/${item.id}`)} style={[styles.item, item.id === nextId && styles.next]}>
          <Text style={styles.day}>Day {index + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.sub}>
              {item.word_count} words{item.best_score != null ? ` · best ${item.best_score}%` : ''}
            </Text>
          </View>
          <Text style={{ fontSize: 18 }}>{item.completed_at ? '✅' : item.id === nextId ? '▶︎' : ''}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, fontSize: 12 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.card,
    padding: space(4), borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
  },
  next: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  day: { width: 52, color: colors.muted, fontSize: 12, fontWeight: '600' },
  title: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
