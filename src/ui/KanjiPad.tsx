import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { colors, radius } from './theme';

type Point = { x: number; y: number };

const toPath = (pts: Point[]) =>
  pts.length === 1
    ? `M${pts[0].x} ${pts[0].y} l0.1 0`
    : pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

/**
 * A square writing pad. `guide` draws the target character faintly behind the strokes
 * (used for tracing, and for comparing after you check your answer).
 */
export function KanjiPad({
  size, guide, guideOpacity = 0.18, strokes, onStrokesChange,
}: {
  size: number;
  guide?: string;
  guideOpacity?: number;
  strokes: Point[][];
  onStrokesChange: (s: Point[][]) => void;
}) {
  const [current, setCurrent] = useState<Point[] | null>(null);
  const currentRef = useRef<Point[] | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          currentRef.current = [{ x, y }];
          setCurrent(currentRef.current);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          if (!currentRef.current) return;
          currentRef.current = [...currentRef.current, { x, y }];
          setCurrent(currentRef.current);
        },
        onPanResponderRelease: () => {
          if (currentRef.current) onStrokesChange([...strokesRef.current, currentRef.current]);
          currentRef.current = null;
          setCurrent(null);
        },
      }),
    [onStrokesChange],
  );

  const all = current ? [...strokes, current] : strokes;
  const glyph = guide && [...guide].length > 2 ? size * 0.36 : guide && [...guide].length === 2 ? size * 0.46 : size * 0.78;

  return (
    <View style={[styles.pad, { width: size, height: size }]} {...responder.panHandlers}>
      {guide ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={{ fontSize: glyph, color: colors.ink, opacity: guideOpacity }}>{guide}</Text>
        </View>
      ) : null}
      <Svg width={size} height={size} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke={colors.line} strokeDasharray="6 6" />
        <Line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke={colors.line} strokeDasharray="6 6" />
        {all.map((s, i) => (
          <Path key={i} d={toPath(s)} stroke={colors.ink} strokeWidth={size / 28} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { backgroundColor: '#FFFDF8', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
