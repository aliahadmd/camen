import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

export type FrameRect = { x: number; y: number; w: number; h: number };

const RING = 72;

/**
 * Tap-to-focus indicator: pops in at the tapped viewfinder point with a quick
 * scale-settle, stays solid while the AF/AE metering is locked, and tapping it
 * dismisses the lock. Sits under the control rails so chips always win, and
 * its wrapper is box-none so viewfinder taps pass through to re-focus.
 */
export function FocusRing({
  frame,
  x,
  y,
  lockKey,
  onDismiss,
}: {
  frame: FrameRect;
  /** Normalized viewfinder coordinates (0…1). */
  x: number;
  y: number;
  /** Changes on every new focus point — retriggers the pop-in. */
  lockKey: number;
  onDismiss: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1.35)).current;

  useEffect(() => {
    opacity.setValue(0);
    scale.setValue(1.35);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 130, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [lockKey, opacity, scale]);

  const left = frame.x + x * frame.w - RING / 2;
  const top = frame.y + y * frame.h - RING / 2;

  return (
    <Animated.View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* The ring itself animates: scaling the full-screen wrapper would slide
          the whole coordinate space instead of scaling the ring in place. */}
      <Animated.View style={[styles.ring, { left, top, opacity, transform: [{ scale }] }]}>
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Focus locked — tap to release"
          style={StyleSheet.absoluteFill}
        >
          <View style={styles.dotWrap}>
            <Animated.View style={styles.dot} />
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1.5,
    borderColor: colors.brass,
    backgroundColor: 'rgba(11,12,14,0.12)',
  },
  dotWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brass,
  },
});
