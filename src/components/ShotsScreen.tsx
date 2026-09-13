import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, label as labelStyle, monoFont, spacing } from '../theme';
import { countShots, recentShots, type ShotRow } from '../data/db';
import { getPreset } from '../features/filters';
import { getPreset as getCapturePreset, presetSubName } from '../features/presets';

/**
 * SHOTS — in-app preview of the capture log, straight from SQLite + the
 * app-owned archive. No gallery permissions involved.
 */
export function ShotsScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const shots = useMemo(() => recentShots(200), []);
  const total = useMemo(() => countShots(), []);
  const [viewing, setViewing] = useState<ShotRow | null>(null);

  if (viewing) {
    const preset = getPreset(viewing.filter_id);
    const captureName = getCapturePreset(viewing.preset_id).name;
    const subName = presetSubName(viewing.preset_id, viewing.preset_sub).split(' ')[0];
    const mb = viewing.size_bytes ? (viewing.size_bytes / (1024 * 1024)).toFixed(1) : null;
    const time = new Date(viewing.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <View style={styles.wrap}>
        <Image source={{ uri: viewing.path }} style={styles.full} resizeMode="contain" />
        <Pressable
          onPress={() => setViewing(null)}
          style={[styles.backBtn, { top: insets.top + spacing.m }]}
          accessibilityRole="button"
          accessibilityLabel="Back to shots"
        >
          <Ionicons name="chevron-back" size={24} color={colors.bone} />
        </Pressable>
        <View style={[styles.metaBar, { bottom: insets.bottom + spacing.xl }]} pointerEvents="none">
          <Text style={styles.metaText}>
            {preset.name.toUpperCase()} · {captureName.toUpperCase()}{' '}
            {subName.toUpperCase()} · {viewing.facing.toUpperCase()} · {viewing.width}×
            {viewing.height}
            {mb ? ` · ${mb} MB` : ''} · {time}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.m }]}>
        <Text style={styles.title}>SHOTS · {total}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close shots"
        >
          <Ionicons name="close" size={24} color={colors.bone} />
        </Pressable>
      </View>
      {shots.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No shots yet.</Text>
        </View>
      ) : (
        <FlatList
          data={shots}
          keyExtractor={(s) => String(s.id)}
          numColumns={3}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.cell}
              onPress={() => setViewing(item)}
              accessibilityRole="button"
              accessibilityLabel={`Shot ${item.id}`}
            >
              <Image
                source={{ uri: item.thumb_path || item.path }}
                style={styles.thumb}
                resizeMode="cover"
              />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    backgroundColor: colors.ink,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.m,
  },
  title: {
    ...labelStyle,
    color: colors.bone,
    fontSize: 14,
    letterSpacing: 4,
    ...monoFont,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...labelStyle,
    fontSize: 12,
  },
  cell: {
    flex: 1 / 3,
    aspectRatio: 1,
    padding: 1,
  },
  thumb: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.panel,
  },
  full: {
    flex: 1,
  },
  backBtn: {
    position: 'absolute',
    left: spacing.l,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.panelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaBar: {
    position: 'absolute',
    left: spacing.l,
    right: spacing.l,
    alignItems: 'center',
    paddingVertical: spacing.s,
    borderRadius: 14,
    backgroundColor: 'rgba(11,12,14,0.72)',
  },
  metaText: {
    color: colors.bone,
    fontSize: 11,
    letterSpacing: 1,
    ...monoFont,
    textTransform: 'uppercase',
  },
});
