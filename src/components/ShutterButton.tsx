import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { colors } from '../theme';

/**
 * The shutter: a 72px bone ring, no icon. Responds on press-in so capture is
 * never animation-blocked. Flashes the danger color when a save fails.
 */
export function ShutterButton({
  onPressIn,
  onPressOut,
  busy,
  danger,
}: {
  onPressIn: () => void;
  onPressOut: () => void;
  busy: boolean;
  danger: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const dangerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(dangerOpacity, {
      toValue: danger ? 1 : 0,
      duration: danger ? 60 : 500,
      useNativeDriver: true,
    }).start();
  }, [danger, dangerOpacity]);

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 40 }).start();
    onPressIn();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start();
    onPressOut();
  };

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <Pressable
        style={styles.ring}
        onPressIn={pressIn}
        onPressOut={pressOut}
        hitSlop={12}
        disabled={false}
        accessibilityRole="button"
        accessibilityLabel="Shutter"
      />
      <Animated.View pointerEvents="none" style={[styles.danger, { opacity: dangerOpacity }]} />
      {busy ? <Animated.View pointerEvents="none" style={styles.busy} /> : null}
    </Animated.View>
  );
}

const RING = 72;

const styles = StyleSheet.create({
  wrap: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 4,
    borderColor: colors.bone,
    backgroundColor: 'transparent',
  },
  danger: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: RING / 2,
    borderWidth: 4,
    borderColor: colors.danger,
  },
  busy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: RING / 2,
    backgroundColor: 'rgba(232,230,225,0.18)',
  },
});
