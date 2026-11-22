import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { BOX } from '../lib/strokes';
import { colors, radius } from './theme';

type Point = { x: number; y: number };

const toPath = (pts: Point[], k = 1) =>
  pts.length === 1
    ? `M${pts[0].x * k} ${pts[0].y * k} l0.1 0`
    : pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x * k).toFixed(1)} ${(p.y * k).toFixed(1)}`).join(' ');

/**
 * A square writing pad.
 * - `reference`: the correct strokes (in KanjiVG's 109 box), drawn faintly with numbers
 *   at each stroke's start. `referenceCount` shows only the first N (for animating).
 * - `guide`: a character drawn faintly behind (for kanji without stroke data).
 * - `strokeColors`: a colour per drawn stroke (green/red after checking).
 * - `disabled`: stop accepting new strokes.
 */
export function KanjiPad({
  size, strokes, onStrokesChange, reference, referenceCount, referenceOpacity = 0.25, guide, guideOpacity = 0.18,
  strokeColors, disabled,
}: {
  size: number;
  strokes: Point[][];
  onStrokesChange: (s: Point[][]) => void;
  reference?: Point[][];
  referenceCount?: number;
  referenceOpacity?: number;
  guide?: string;
  guideOpacity?: number;
  strokeColors?: string[];
  disabled?: boolean;
}) {
  const [current, setCurrent] = useState<Point[] | null>(null);
  const currentRef = useRef<Point[] | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
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
  const k = size / BOX;
  const shown = reference ? reference.slice(0, referenceCount ?? reference.length) : [];

  return (
    <View style={[styles.pad, { width: size, height: size }]} {...responder.panHandlers}>
      {guide ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={{ fontSize: size * 0.78, color: colors.ink, opacity: guideOpacity }}>{guide}</Text>
        </View>
      ) : null}
      <Svg width={size} height={size} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke={colors.line} strokeDasharray="6 6" />
        <Line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke={colors.line} strokeDasharray="6 6" />
        <G opacity={referenceOpacity}>
          {shown.map((s, i) => (
            <Path key={`r${i}`} d={toPath(s, k)} stroke={colors.ink} strokeWidth={size / 26} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
        </G>
        {shown.map((s, i) => (
          <G key={`n${i}`}>
            <Circle cx={s[0].x * k} cy={s[0].y * k} r={size / 30} fill={colors.accent} opacity={0.85} />
            <SvgText x={s[0].x * k} y={s[0].y * k + size / 80} fontSize={size / 26} fill="#fff" fontWeight="bold" textAnchor="middle">
              {i + 1}
            </SvgText>
          </G>
        ))}
        {all.map((s, i) => (
          <Path
            key={i}
            d={toPath(s)}
            stroke={strokeColors?.[i] ?? colors.ink}
            strokeWidth={size / 28}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

/** A small read-only preview of what was drawn (for the row of boxes above the pad). */
export function MiniDrawing({ strokes, padSize, size, color }: { strokes: Point[][]; padSize: number; size: number; color: string }) {
  const k = size / padSize;
  return (
    <Svg width={size} height={size}>
      {strokes.map((s, i) => (
        <Path key={i} d={toPath(s, k)} stroke={color} strokeWidth={Math.max(2, size / 18)} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  pad: { backgroundColor: '#FFFDF8', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
