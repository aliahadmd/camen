import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import type { GridMode } from '../features/settings';

/**
 * Composition grid over the preview: rule of thirds (1/3, 2/3) or golden ratio
 * (0.382 / 0.618). Hairline, non-interactive, computed from the real preview
 * bounds — never from screen constants.
 */
export function Grid({ mode, width, height }: { mode: GridMode; width: number; height: number }) {
  if (mode === 'off' || width <= 0 || height <= 0) return null;
  const cuts = mode === 'thirds' ? [1 / 3, 2 / 3] : [0.382, 0.618];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {cuts.map((f) => (
        <View
          key={`v${f}`}
          style={[styles.line, styles.vertical, { left: width * f }]}
        />
      ))}
      {cuts.map((f) => (
        <View
          key={`h${f}`}
          style={[styles.line, styles.horizontal, { top: height * f }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    position: 'absolute',
    backgroundColor: colors.hairline,
  },
  vertical: {
    width: StyleSheet.hairlineWidth,
    top: 0,
    bottom: 0,
  },
  horizontal: {
    height: StyleSheet.hairlineWidth,
    left: 0,
    right: 0,
  },
});
