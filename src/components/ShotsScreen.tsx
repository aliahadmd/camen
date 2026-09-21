import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library/legacy';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, label as labelStyle, monoFont, spacing } from '../theme';
import {
  countShots,
  deleteShot,
  recentShots,
  recentShotsBefore,
  type ShotRow,
} from '../data/db';
import { presetDisplayName, presetSubName } from '../features/presets';
import { refreshUserPresets, userPresetName } from '../features/userPresets';

type Tab = 'all' | 'photo' | 'video';

/** Grid page size — older shots stream in on scroll instead of a hard 200 cap. */
const PAGE_SIZE = 60;

/**
 * SHOTS — in-app browser for the capture log (SQLite + the app-owned archive).
 * Tab by media type; open a shot for full-screen view, share, or delete.
 * No gallery permissions involved.
 */
export function ShotsScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  // warm the user-preset cache so logged `user:<id>` names resolve
  const [, bumpVersion] = useState(0);
  useEffect(() => {
    void refreshUserPresets().then(() => bumpVersion((v) => v + 1));
  }, []);
  const [tab, setTab] = useState<Tab>('all');
  // Bumping `version` refreshes the header COUNT only — the grid itself is
  // spliced on delete so a user scrolled pages deep keeps their place.
  const [version, setVersion] = useState(0);
  const [viewing, setViewing] = useState<ShotRow | null>(null);
  const [shots, setShots] = useState<ShotRow[]>([]);
  const [hasMore, setHasMore] = useState(false);

  const loadPage = useCallback(
    (beforeId?: number) => {
      try {
        const mediaType = tab === 'all' ? undefined : tab;
        const rows =
          beforeId != null
            ? recentShotsBefore(PAGE_SIZE, beforeId, mediaType)
            : recentShots(PAGE_SIZE, mediaType);
        setShots((prev) => (beforeId != null ? [...prev, ...rows] : rows));
        setHasMore(rows.length === PAGE_SIZE);
      } catch (e) {
        // A failed index (corrupt store) must not red-screen the browser.
        console.error('[camen] shots query failed:', e);
        if (beforeId == null) setShots([]);
        setHasMore(false);
      }
    },
    [tab],
  );

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const total = useMemo(() => {
    try {
      return countShots();
    } catch {
      return 0;
    }
  }, [version]);

  const removeShot = (shot: ShotRow) => {
    Alert.alert(
      'Delete shot?',
      'This removes it from Camen. The exported gallery copy is deleted too, when media permissions allow.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // File deletes are awaited BEFORE the row delete: dying in between
            // would otherwise leave an indexed row pointing at nothing. The
            // gallery export stays best-effort (the system may refuse it on
            // another app's behalf) and never blocks the archive delete.
            void (async () => {
              try {
                await FileSystem.deleteAsync(shot.path, { idempotent: true }).catch(() => {});
                if (shot.thumb_path) {
                  await FileSystem.deleteAsync(shot.thumb_path, { idempotent: true }).catch(() => {});
                }
                if (shot.gallery_uri) {
                  void MediaLibrary.deleteAssetsAsync([shot.gallery_uri]).catch(() => {});
                }
                deleteShot(shot.id);
                setViewing(null);
                // Splice the row out instead of reloading — deleting from the
                // detail view must not reset a deep-scrolled grid to page 1.
                setShots((prev) => prev.filter((s) => s.id !== shot.id));
                setVersion((v) => v + 1);
              } catch (e) {
                Alert.alert('Could not delete shot', 'The storage layer refused the write.');
                console.error('[camen] shot delete failed:', e);
              }
            })();
          },
        },
      ],
    );
  };

  if (viewing) {
    return (
      <ShotDetail
        shot={viewing}
        insets={insets}
        onClose={() => setViewing(null)}
        onDelete={() => removeShot(viewing)}
      />
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

      <View style={styles.tabs}>
        {(
          [
            ['all', 'ALL'],
            ['photo', 'PHOTOS'],
            ['video', 'VIDEOS'],
          ] as [Tab, string][]
        ).map(([id, name]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && styles.tabActive]}
            accessibilityRole="button"
            accessibilityLabel={`${name} tab`}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{name}</Text>
          </Pressable>
        ))}
      </View>

      {shots.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nothing here yet.</Text>
        </View>
      ) : (
        <FlatList
          data={shots}
          extraData={version}
          keyExtractor={(s) => String(s.id)}
          numColumns={3}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          onEndReached={() => {
            if (hasMore && shots.length > 0) loadPage(shots[shots.length - 1].id);
          }}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <Pressable
              style={styles.cell}
              onPress={() => setViewing(item)}
              accessibilityRole="button"
              accessibilityLabel={item.media_type === 'video' ? `Video ${item.id}` : `Shot ${item.id}`}
            >
              {item.media_type === 'video' && !item.thumb_path ? (
                // A video path can never decode in an <Image> — show a real
                // placeholder instead of a blank cell.
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Ionicons name="videocam-outline" size={22} color={colors.muted} />
                </View>
              ) : (
                <Image
                  source={{ uri: item.thumb_path || item.path }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
              )}
              {item.media_type === 'video' ? (
                <View style={styles.vidTag} pointerEvents="none">
                  <Ionicons name="play" size={10} color={colors.bone} />
                  {item.duration_ms ? (
                    <Text style={styles.vidTagText}>
                      {Math.max(1, Math.round(item.duration_ms / 1000))}s
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function ShotDetail({
  shot,
  insets,
  onClose,
  onDelete,
}: {
  shot: ShotRow;
  insets: { top: number; bottom: number };
  onClose: () => void;
  onDelete: () => void;
}) {
  const isVideo = shot.media_type === 'video';

  const userName = userPresetName(shot.preset_id);
  const captureName =
    shot.preset_id === 'custom' ? 'Custom' : userName ?? presetDisplayName(shot.preset_id);
  const subName =
    shot.preset_id === 'custom' || userName
      ? ''
      : presetSubName(shot.preset_id, shot.preset_sub).split(' ')[0];
  const mb = shot.size_bytes ? (shot.size_bytes / (1024 * 1024)).toFixed(1) : null;
  const time = new Date(shot.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dur = shot.duration_ms
    ? `${Math.floor(shot.duration_ms / 60000)}:${String(Math.floor((shot.duration_ms % 60000) / 1000)).padStart(2, '0')}`
    : null;

  const share = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) return;
      // The mime must match the actual file — a WebP announced as JPEG
      // confuses receiving apps.
      const lowerPath = shot.path.toLowerCase();
      const videoMime = lowerPath.endsWith('.mov')
        ? 'video/quicktime'
        : lowerPath.endsWith('.webm')
          ? 'video/webm'
          : 'video/mp4';
      await Sharing.shareAsync(shot.path, {
        mimeType: isVideo ? videoMime : lowerPath.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
        dialogTitle: 'Share shot',
      });
    } catch {
      // user closed the sheet — nothing to do
    }
  };

  return (
    <View style={styles.wrap}>
      {isVideo ? (
        <VideoPlayerView source={shot.path} />
      ) : (
        <Image source={{ uri: shot.path }} style={styles.full} resizeMode="contain" />
      )}

      <Pressable
        onPress={onClose}
        style={[styles.backBtn, { top: insets.top + spacing.m }]}
        accessibilityRole="button"
        accessibilityLabel="Back to shots"
      >
        <Ionicons name="chevron-back" size={24} color={colors.bone} />
      </Pressable>

      <View style={[styles.actionBar, { top: insets.top + spacing.m }]}>
        <Pressable
          onPress={share}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel="Share shot"
        >
          <Ionicons name="share-social-outline" size={20} color={colors.bone} />
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel="Delete shot"
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>

      <View style={[styles.metaBar, { bottom: insets.bottom + spacing.xl }]} pointerEvents="none">
        <Text style={styles.metaText}>
          {captureName.toUpperCase()}
          {subName ? ` ${subName.toUpperCase()}` : ''} · {shot.facing.toUpperCase()} ·{' '}
          {shot.width}×{shot.height}
          {mb ? ` · ${mb} MB` : ''}
          {dur ? ` · ${dur}` : ''} · {time}
        </Text>
        {shot.lat != null && shot.lon != null ? (
          <Text style={styles.metaTextSub}>
            {shot.lat.toFixed(5)}, {shot.lon.toFixed(5)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Autoplaying, looping video stage (hook isolated so photos never mount it). */
function VideoPlayerView({ source }: { source: string }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    void p.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.full}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
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
  tabs: {
    flexDirection: 'row',
    gap: spacing.s,
    paddingHorizontal: spacing.l,
    marginBottom: spacing.s,
  },
  tab: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: colors.brass,
    borderColor: colors.brass,
  },
  tabText: {
    ...labelStyle,
    color: colors.bone,
    fontSize: 10,
  },
  tabTextActive: {
    color: colors.ink,
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
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vidTag: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(11,12,14,0.72)',
  },
  vidTagText: {
    ...labelStyle,
    color: colors.bone,
    fontSize: 9,
    ...monoFont,
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
  actionBar: {
    position: 'absolute',
    right: spacing.l,
    flexDirection: 'row',
    gap: spacing.s,
  },
  actionBtn: {
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
  metaTextSub: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 2,
    ...monoFont,
  },
});
