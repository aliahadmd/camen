import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { colors, radius } from '../theme';
import type { RingMode } from '../features/useCamera';

/**
 * The flash ring — a light ring on every side of the viewfinder.
 * idle: 8% armed glow · fill: 30% soft front light · breath: countdown pulse ·
 * firing: full-brightness flash at capture (with the native screen flash on front).
 */
export function FlashRing({ mode, intense }: { mode: RingMode; intense: boolean }) {
  const opacity = useSharedValue(0.08);

  useEffect(() => {
    cancelAnimation(opacity);
    if (mode === 'firing') {
      opacity.value = withTiming(1, { duration: 60 });
    } else if (mode === 'breath') {
      if (intense) {
        opacity.value = withTiming(0.9, { duration: 120 });
      } else {
        opacity.value = withRepeat(
          withSequence(withTiming(0.5, { duration: 800 }), withTiming(0.12, { duration: 800 })),
          -1,
        );
      }
    } else if (mode === 'fill') {
      opacity.value = withTiming(0.3, { duration: 200 });
    } else {
      opacity.value = withTiming(0.08, { duration: 400 });
    }
  }, [mode, intense, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style]}>
      {/* Layered strokes stand in for a glow (Android has no shadow stroking). */}
      <Animated.View pointerEvents="none" style={[styles.layerWide]} />
      <Animated.View pointerEvents="none" style={[styles.layerMid]} />
      <Animated.View pointerEvents="none" style={[styles.layerCore]} />
    </Animated.View>
  );
}

const fillAbsolute = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

const base = {
  position: 'absolute' as const,
  top: 6,
  bottom: 6,
  left: 6,
  right: 6,
  borderRadius: radius.ring,
  borderWidth: 2,
  borderColor: colors.bone,
};

const styles = StyleSheet.create({
  wrap: { ...fillAbsolute },
  layerCore: { ...base },
  layerMid: {
    ...base,
    borderWidth: 5,
    opacity: 0.35,
  },
  layerWide: {
    ...base,
    borderWidth: 10,
    opacity: 0.14,
  },
});
