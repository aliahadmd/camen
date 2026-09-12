import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/**
 * Edge Light — the ring-light simulator for selfies. Illuminates the borders of
 * the screen with soft white gradients that bounce fill light onto the face
 * (the front lens has no flash unit on this device).
 *
 * Level: 0 off · 1 low · 2 medium · 3 high. Rendered above the preview and
 * overlays, below the control rails; never intercepts touches.
 */
export function EdgeLight({ level }: { level: 0 | 1 | 2 | 3 }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const target = level === 0 ? 0 : level === 1 ? 0.6 : level === 2 ? 0.78 : 0.95;
    Animated.timing(opacity, {
      toValue: target,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [level, opacity]);

  const band = level === 0 ? 0 : level === 1 ? 30 : level === 2 ? 40 : 52;
  const white = 'rgba(255,255,255,0.98)';
  const clear = 'rgba(255,255,255,0)';

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      {level >= 3 ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]}
        />
      ) : null}
      <LinearGradient colors={[white, clear]} style={[styles.top, { height: band }]} />
      <LinearGradient colors={[clear, white]} style={[styles.bottom, { height: band }]} />
      <LinearGradient
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        colors={[white, clear]}
        style={[styles.left, { width: band }]}
      />
      <LinearGradient
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        colors={[clear, white]}
        style={[styles.right, { width: band }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  left: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  right: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
  },
});
