import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, label as labelStyle, monoFont, spacing } from '../theme';
import { cropDims, FRAMINGS } from '../features/framings';
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

  if (!settings) return null;

  const facing = settings.facing === 'front' ? 'front' : 'back';
  const [maxW, maxH] = profile.maxDims[facing];

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

        <Text style={styles.section}>TONE & EXPOSURE</Text>
        {(['ldr', 'hdr'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => patch({ tone: t })}
            style={[styles.row, settings.tone === t && styles.rowActive]}
            accessibilityRole="button"
            accessibilityLabel={`Tone ${t}`}
          >
            <View style={styles.rowMain}>
              <Text style={[styles.rowTitle, settings.tone === t && styles.rowTitleActive]}>
                {t === 'hdr' ? 'HDR look' : 'LDR · standard'}
              </Text>
              <Text style={styles.rowNote}>
                {t === 'hdr'
                  ? 'Lifted shadows, recovered highlights'
                  : 'Neutral, straight-out-of-camera'}
              </Text>
            </View>
            {settings.tone === t ? (
              <Ionicons name="checkmark" size={18} color={colors.brass} />
            ) : null}
          </Pressable>
        ))}
        <ToggleRow
          title="AEB bracket"
          note="Save −0.7 / 0 / +0.7EV variants of each shot"
          value={settings.aeb}
          onToggle={() => patch({ aeb: !settings.aeb })}
        />
        <View style={styles.isoWrap}>
          {[0, 100, 200, 400, 800, 1600, 3200].map((isoValue) => {
            const active = settings.iso === isoValue;
            return (
              <Pressable
                key={isoValue}
                onPress={() => patch({ iso: isoValue })}
                style={[styles.isoPill, active && styles.isoPillActive]}
                accessibilityRole="button"
                accessibilityLabel={`ISO ${isoValue === 0 ? 'auto' : isoValue}`}
              >
                <Text style={[styles.isoPillText, active && styles.isoPillTextActive]}>
                  {isoValue === 0 ? 'Auto' : String(isoValue)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Simulated gain — up to +2 EV lift with film grain. Auto is cleanest.
        </Text>

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
  isoWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
    marginVertical: spacing.s,
  },
  isoPill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  isoPillActive: {
    backgroundColor: colors.brass,
    borderColor: colors.brass,
  },
  isoPillText: {
    color: colors.bone,
    fontSize: 12,
    ...monoFont,
  },
  isoPillTextActive: {
    color: colors.ink,
  },
});
