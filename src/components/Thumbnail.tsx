import { Image, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

/**
 * Last-shot thumbnail (bottom-left). Tap opens the in-app SHOTS browser —
 * the app-owned archive, not a gallery intent.
 */
export function Thumbnail({
  uri,
  onPress,
}: {
  uri: string | null;
  onPress: () => void;
}) {
  if (!uri) {
    // keeps the bottom row layout stable before the first shot
    return <View style={styles.stub} />;
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open shots">
      <View style={[styles.stub, styles.border]}>
        <Image source={{ uri }} style={styles.img} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stub: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.panel,
  },
  border: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  img: { width: 40, height: 40 },
});
