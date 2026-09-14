import Slider from '@react-native-community/slider';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, label as labelStyle, monoFont, spacing } from '../theme';
import type { DevelopOptions } from '../features/gradePhoto';
import { presetRecipe } from '../features/presets';

/**
 * ADJUST — the manual develop controls. These are the REAL values the develop
 * pipeline applies to the saved photo; presets are shortcuts that fill this
 * panel in. Every slider shows its current value; "Reset" reloads the active
 * preset's recipe.
 */

type Row = {
  key: keyof DevelopOptions;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
};

const ROWS: Row[] = [
  {
    key: 'exposure',
    label: 'Exposure',
    min: -0.5,
    max: 0.5,
    step: 0.01,
    format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`,
  },
  {
    key: 'temperature',
    label: 'Warmth',
    min: -1,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'contrast',
    label: 'Contrast',
    min: -0.3,
    max: 0.5,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'shadows',
    label: 'Shadows',
    min: -1,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'highlights',
    label: 'Highlights',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'saturation',
    label: 'Saturation',
    min: 0,
    max: 1.5,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  { key: 'grain', label: 'Grain', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  {
    key: 'vignette',
    label: 'Vignette',
    min: 0,
    max: 0.6,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
];

export function DevelopPanel({
  develop,
  presetId,
  presetSub,
  onChange,
  onClose,
}: {
  develop: DevelopOptions;
  presetId: string;
  presetSub: string;
  onChange: (patch: Partial<DevelopOptions>) => void;
  onClose: () => void;
}) {
  return (
    <>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Close adjust panel"
      />
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>ADJUST</Text>
          <Pressable
            onPress={() => onChange({ ...presetRecipe(presetId, presetSub) })}
            accessibilityRole="button"
            accessibilityLabel="Reset to preset"
          >
            <Text style={styles.reset}>RESET</Text>
          </Pressable>
        </View>
        <ScrollView>
          {ROWS.map((row) => {
            const value = (develop[row.key] as number | undefined) ?? 0;
            return (
              <View key={row.key} style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={row.min}
                  maximumValue={row.max}
                  step={row.step}
                  value={value}
                  minimumTrackTintColor={colors.brass}
                  maximumTrackTintColor={colors.hairline}
                  thumbTintColor={colors.bone}
                  onValueChange={(v) => onChange({ [row.key]: v })}
                  accessibilityLabel={row.label}
                />
                <Text style={styles.rowValue}>
                  {row.format ? row.format(value) : value.toFixed(2)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
        <Text style={styles.hint}>
          Presets fill these values in — change any and the shot is yours.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    position: 'absolute',
    left: spacing.l,
    right: spacing.l,
    bottom: 150,
    maxHeight: 460,
    borderRadius: 14,
    backgroundColor: 'rgba(11,12,14,0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    padding: spacing.m,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s,
  },
  title: {
    ...labelStyle,
    color: colors.brass,
    fontSize: 11,
    letterSpacing: 3,
  },
  reset: {
    ...labelStyle,
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    height: 38,
  },
  rowLabel: {
    ...labelStyle,
    color: colors.bone,
    fontSize: 10,
    width: 78,
  },
  slider: { flex: 1, height: 30 },
  rowValue: {
    color: colors.brass,
    fontSize: 10,
    ...monoFont,
    width: 56,
    textAlign: 'right',
  },
  hint: {
    ...labelStyle,
    color: colors.muted,
    fontSize: 9,
    textTransform: 'none',
    letterSpacing: 0.3,
    marginTop: spacing.s,
  },
});
