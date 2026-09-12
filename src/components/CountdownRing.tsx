import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';

import { colors, monoFont } from '../theme';

const SIZE = 96;
const STROKE = 3;
const R = (SIZE - STROKE) / 2 - 4;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * Circular countdown around the shutter. `remaining`/`total` drive the stroke;
 * the monospaced numeral ticks the seconds. Tapping the shutter cancels.
 */
export function CountdownRing({
  remaining,
  total,
}: {
  remaining: number;
  total: number;
}) {
  const progress = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const seconds = Math.max(1, Math.ceil(remaining));
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.hairline}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.brass}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.numeralWrap} pointerEvents="none">
        <Text style={styles.numeral}>{seconds}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE + 24,
    height: SIZE + 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeralWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeral: {
    color: colors.bone,
    fontSize: 28,
    ...monoFont,
  },
});
