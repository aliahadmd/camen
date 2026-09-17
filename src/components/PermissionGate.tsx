import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { permissionAction } from '../features/cameraMath';

import { colors, label as labelStyle, spacing } from '../theme';

/** Minimal permission screen: one line, one action. No nag loops. */
export function PermissionGate({
  onEnable,
  canAskAgain = true,
}: {
  onEnable: () => void;
  canAskAgain?: boolean;
}) {
  const label = canAskAgain ? 'Enable camera' : 'Open Settings';
  const enable = () => {
    if (permissionAction(canAskAgain) === 'request') onEnable();
    else void Linking.openSettings().catch(() => Alert.alert('Open app settings', 'Enable Camera permission in Android Settings.'));
  };
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>CAMEN</Text>
      <Text style={styles.body}>Camen needs the camera to take photos.</Text>
      <Pressable
        onPress={enable}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.button}
      >
        <Text style={styles.buttonText}>{label}</Text>
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
