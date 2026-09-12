import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, label as labelStyle, spacing } from '../theme';

/** Minimal permission screen: one line, one action. No nag loops. */
export function PermissionGate({
  onEnable,
}: {
  onEnable: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>CAMEN</Text>
      <Text style={styles.body}>Camen needs the camera to take photos.</Text>
      <Pressable
        onPress={onEnable}
        accessibilityRole="button"
        accessibilityLabel="Enable camera"
        style={styles.button}
      >
        <Text style={styles.buttonText}>Enable camera</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.l,
    padding: spacing.xl,
  },
  title: {
    ...labelStyle,
    color: colors.bone,
    fontSize: 18,
    letterSpacing: 6,
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.brass,
    borderRadius: 24,
    paddingHorizontal: spacing.xl,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.ink,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
