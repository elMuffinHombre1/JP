import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radius, space } from './theme';
import { splitOkurigana, toRomaji } from '../lib/romaji';
import { written, type Word } from '../db/database';

export function Button({
  label, onPress, kind = 'primary', disabled, style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        primary ? styles.btnPrimary : styles.btnSecondary,
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 },
        style,
      ]}
    >
      <Text style={[styles.btnText, { color: primary ? '#fff' : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Shows a written word with its okurigana (trailing hiragana) in a different colour. */
export function Written({ word, size = 40, highlight = true }: { word: Pick<Word, 'kanji' | 'kana'>; size?: number; highlight?: boolean }) {
  if (!word.kanji) return <Text style={{ fontSize: size, color: colors.ink }}>{word.kana}</Text>;
  const { stem, okurigana } = splitOkurigana(word.kanji);
  return (
    <Text style={{ fontSize: size, color: colors.ink }}>
      {stem}
      <Text style={{ color: highlight ? colors.okurigana : colors.ink }}>{okurigana}</Text>
    </Text>
  );
}

/** A preview of the home-screen widget: kanji, kana, romaji and meaning. */
export function WordWidget({ word, onPress }: { word: Word; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.widget}>
      <Text style={styles.widgetLabel}>今日の言葉 · WORD OF THE DAY</Text>
      <Text style={styles.widgetKanji}>{written(word)}</Text>
      {word.kanji ? <Text style={styles.widgetKana}>{word.kana}</Text> : null}
      <Text style={styles.widgetRomaji}>{toRomaji(word.kana)}</Text>
      <Text style={styles.widgetMeaning}>{word.meaning}</Text>
    </Pressable>
  );
}

export function WordRow({ word, right }: { word: Word; right?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ width: 110 }}>
        <Written word={word} size={24} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowKana}>
          {word.kanji ? `${word.kana} · ` : ''}
          {toRomaji(word.kana)}
        </Text>
        <Text style={styles.rowMeaning}>{word.meaning}</Text>
      </View>
      {right}
    </View>
  );
}

export function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segItem, value === o.value && styles.segItemOn]}
        >
          <Text style={[styles.segText, value === o.value && { color: colors.ink, fontWeight: '700' }]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: space(3.5), paddingHorizontal: space(5), borderRadius: radius.md, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.accent },
  btnSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  btnText: { fontSize: 16, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space(5), borderWidth: 1, borderColor: colors.line },
  widget: {
    backgroundColor: colors.ink, borderRadius: radius.lg, padding: space(5), alignItems: 'flex-start',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  widgetLabel: { color: '#B9B3A9', fontSize: 11, letterSpacing: 1, marginBottom: space(2) },
  widgetKanji: { color: '#fff', fontSize: 52, fontWeight: '600' },
  widgetKana: { color: '#EDE8DF', fontSize: 20, marginTop: space(1) },
  widgetRomaji: { color: '#F2A49F', fontSize: 16, marginTop: space(1) },
  widgetMeaning: { color: '#fff', fontSize: 18, marginTop: space(2) },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: space(3),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: space(3),
  },
  rowKana: { color: colors.muted, fontSize: 14 },
  rowMeaning: { color: colors.ink, fontSize: 16, marginTop: 2 },
  seg: { flexDirection: 'row', backgroundColor: colors.line, borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, paddingVertical: space(2), borderRadius: radius.md - 3, alignItems: 'center' },
  segItemOn: { backgroundColor: colors.card },
  segText: { color: colors.muted, fontSize: 14 },
});
