import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TextStyle } from 'react-native';

import { monoFont } from '../theme';

/**
 * Reveal a label for `ms` after `tick` changes, then fade it away.
 * With `showOnMount`, a non-empty text shows immediately when mounted
 * (used by the "Developing" indicator, which mounts mid-process).
 */
export function FadeLabel({
  tick,
  text,
  ms = 1200,
  style,
  mono = false,
  showOnMount = false,
}: {
  tick?: unknown;
  text: string;
  ms?: number;
  style?: TextStyle;
  mono?: boolean;
  showOnMount?: boolean;
}) {
  const [visible, setVisible] = useState(showOnMount && text !== '');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (showOnMount && text) setVisible(true);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), ms);
    return () => clearTimeout(t);
  }, [tick, ms, showOnMount, text]);

  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 120 : 420,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  if (!text) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
      <Text style={[styles.text, mono && styles.mono, style]}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(11,12,14,0.55)',
  },
  text: {
    color: '#E8E6E1',
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  mono: {
    ...monoFont,
    textTransform: 'none',
    letterSpacing: 0.5,
  },
});
