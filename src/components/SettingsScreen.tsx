import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, label as labelStyle, monoFont, spacing } from '../theme';
import { cropDims, FRAMINGS } from '../features/framings';
import { archiveStats } from '../data/db';
import type { ShotRow } from '../data/db';
import { useSettings } from '../features/settings';
import { useDeviceProfile } from '../features/deviceProfile';

/**
 * SETTINGS — the camera's control room: framing presets (with resolved pixels
 * for the active camera), mirror toggle, device info. Everything the dashboard
 * doesn't need to show all the time.
 */
function ToggleRow({
  title,
  note,
  value,
  onToggle,
}: {
  title: string;
  note: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowNote}>{note}</Text>
      </View>
      <Ionicons
        name={value ? 'checkbox' : 'square-outline'}
        size={20}
        color={value ? colors.brass : colors.muted}
      />
    </Pressable>
  );
}

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { settings, patch } = useSettings();
  const profile = useDeviceProfile();
  const insets = useSafeAreaInsets();
  const stats = useMemo(() => archiveStats(), []);

  if (!settings) return null;

  const facing = settings.facing === 'front' ? 'front' : 'back';
  const [maxW, maxH] = profile.maxDims[facing];
  const statsMb = (stats.bytes / (1024 * 1024)).toFixed(0);

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.m }]}>
        <Text style={styles.title}>SETTINGS</Text>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
        >
          <Ionicons name="close" size={24} color={colors.bone} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.l,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        <Text style={styles.section}>FRAMING</Text>
        {FRAMINGS.map((f) => {
          const dims = cropDims(f.aspect, maxW, maxH, f.maxLongEdge);
          const active = settings.framing === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => patch({ framing: f.id })}
              style={[styles.row, active && styles.rowActive]}
              accessibilityRole="button"
              accessibilityLabel={`Framing ${f.name}`}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.rowTitle, active && styles.rowTitleActive]}>
                  {f.name}
                </Text>
                <Text style={styles.rowNote}>{f.note}</Text>
              </View>
              <Text style={[styles.rowDims, active && styles.rowDimsActive]}>
                {dims.w}×{dims.h}
              </Text>
              {active ? (
                <Ionicons name="checkmark" size={18} color={colors.brass} />
              ) : null}
            </Pressable>
          );
        })}
        <Text style={styles.hint}>
          The viewfinder shows the framing. The shot is center-cropped to match —
          full sensor quality, no downscaling.
        </Text>

        <Text style={styles.section}>CAPTURE</Text>
        <ToggleRow
          title="Rapid fire"
          note="Tap = processed shot · hold = full-res burst"
          value={settings.rapidFire}
          onToggle={() => patch({ rapidFire: !settings.rapidFire })}
        />
        <ToggleRow
          title="Anti-shake"
          note="Waits for a steady hold before capturing"
          value={settings.antiShake}
          onToggle={() => patch({ antiShake: !settings.antiShake })}
        />
        <ToggleRow
          title="Shutter sound"
          note="iOS hardware sound · Android always plays the system sound"
          value={settings.shutterSound}
          onToggle={() => patch({ shutterSound: !settings.shutterSound })}
        />
        <ToggleRow
          title="Location"
          note="Geo-tag shots (GPS in EXIF + log)"
          value={settings.location}
          onToggle={async () => {
            const next = !settings.location;
            patch({ location: next });
            if (next) {
              try {
                const Location = await import('expo-location');
                await Location.requestForegroundPermissionsAsync();
              } catch {
                // permission dialog is best-effort
              }
            }
          }}
        />

        <Text style={styles.section}>FORMAT</Text>
        {(['jpeg', 'webp'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => patch({ format: f })}
            style={[styles.row, settings.format === f && styles.rowActive]}
            accessibilityRole="button"
            accessibilityLabel={`Format ${f}`}
          >
            <View style={styles.rowMain}>
              <Text style={[styles.rowTitle, settings.format === f && styles.rowTitleActive]}>
                {f === 'jpeg' ? 'JPEG' : 'WEBP'}
              </Text>
              <Text style={styles.rowNote}>
                {f === 'jpeg' ? 'Universal · best compatibility' : 'Smaller files · same quality'}
              </Text>
            </View>
            {settings.format === f ? (
              <Ionicons name="checkmark" size={18} color={colors.brass} />
            ) : null}
          </Pressable>
        ))}

        <Text style={styles.section}>CAMERA</Text>
        <Pressable
          onPress={() => patch({ mirrorFront: !settings.mirrorFront })}
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel="Mirror front photos"
        >
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>Mirror front photos</Text>
            <Text style={styles.rowNote}>Selfies match the mirrored preview</Text>
          </View>
          <Ionicons
            name={settings.mirrorFront ? 'checkbox' : 'square-outline'}
            size={20}
            color={settings.mirrorFront ? colors.brass : colors.muted}
          />
        </Pressable>

        <Text style={styles.section}>DEVICE</Text>
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>Redmi K80 Pro</Text>
            <Text style={styles.rowNote}>
              {profile.maxDims[facing][0]}×{profile.maxDims[facing][1]} ·{' '}
              {settings.facing === 'front' ? 'Screen flash' : 'LED + torch'}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>Archive</Text>
            <Text style={styles.rowNote}>
              {stats.count} shot{stats.count === 1 ? '' : 's'} · {statsMb} MB in Camen's folder
            </Text>
          </View>
        </View>

        {/* Hardcoded credit — this line never comes from settings or storage. */}
        <Pressable
          onPress={() => {
            void Linking.openURL('https://x.com/AliAhadMd1').catch(() => {});
          }}
          style={styles.credit}
          accessibilityRole="link"
          accessibilityLabel="Developed by Ali on X"
        >
          <Text style={styles.creditText}>Developed by Ali</Text>
          <Text style={styles.creditLink}>x.com/AliAhadMd1</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    backgroundColor: colors.ink,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.l,
  },
  title: {
    ...labelStyle,
    color: colors.bone,
    fontSize: 14,
    letterSpacing: 4,
    ...monoFont,
  },
  section: {
    ...labelStyle,
    color: colors.brass,
    fontSize: 10,
    marginTop: spacing.l,
    marginBottom: spacing.s,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    marginBottom: spacing.s,
  },
  rowActive: {
    borderColor: colors.brass,
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    color: colors.bone,
    fontSize: 14,
  },
  rowTitleActive: {
    color: colors.brass,
  },
  rowNote: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  rowDims: {
    color: colors.muted,
    fontSize: 12,
    ...monoFont,
  },
  rowDimsActive: {
    color: colors.brass,
  },
  hint: {
    ...labelStyle,
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    textTransform: 'none',
    letterSpacing: 0.3,
    marginBottom: spacing.s,
  },
  credit: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xl,
    marginTop: spacing.l,
  },
  creditText: {
    ...labelStyle,
    color: colors.bone,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  creditLink: {
    ...labelStyle,
    color: colors.brass,
    fontSize: 10,
    letterSpacing: 0.5,
    ...monoFont,
  },
});
