import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, label as labelStyle, radius, spacing } from '../theme';

export function IconButton({
  icon,
  active,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.iconBtn}
    >
      <Ionicons
        name={icon}
        size={22}
        color={active ? colors.brass : disabled ? 'rgba(138,143,152,0.4)' : colors.bone}
      />
    </Pressable>
  );
}

export function Chip({
  icon,
  text,
  active,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Ionicons name={icon} size={15} color={active ? colors.ink : colors.bone} />
      {text ? <Text style={[styles.chipText, active && styles.chipTextActive]}>{text}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelSoft,
  },
  chip: {
    height: 36,
    paddingHorizontal: spacing.m,
    borderRadius: radius.chip,
    backgroundColor: colors.panelSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.brass,
  },
  chipText: {
    ...labelStyle,
    color: colors.bone,
    fontSize: 11,
    letterSpacing: 1,
  },
  chipTextActive: {
    color: colors.ink,
  },
});

export { View as __View };
