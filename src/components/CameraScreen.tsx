import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppState,
  Animated,
  StyleSheet,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { colors, spacing } from '../theme';
import {
  clampRatio,
  ratioToNormalized,
  useDeviceProfile,
} from '../features/deviceProfile';
import { DEFAULT_SETTINGS, useSettings, type GridMode } from '../features/settings';
import { frameRect, getFraming } from '../features/framings';
import { getPreset } from '../features/filters';
import { useCamera } from '../features/useCamera';
import { Chip, IconButton } from './Chips';
import { CountdownRing } from './CountdownRing';
import { EdgeLight } from './EdgeLight';
import { FadeLabel } from './FadeLabel';
import { FilterCarousel } from './FilterCarousel';
import { FlashRing } from './FlashRing';
import { Grid } from './Grid';
import { PermissionGate } from './PermissionGate';
import { Ruler } from './Ruler';
import { SettingsScreen } from './SettingsScreen';
import { ShutterButton } from './ShutterButton';
import { ShotsScreen } from './ShotsScreen';
import { Thumbnail } from './Thumbnail';

const FLASH_CYCLE = { auto: 'on', on: 'off', off: 'auto' } as const;
const GRID_LABEL: Record<GridMode, string> = { off: 'Grid off', thirds: 'Thirds', golden: 'Golden' };
const EDGE_LABEL = [
  'Edge light off',
  'Edge light · Low',
  'Edge light · Medium',
  'Edge light · High',
];

export function CameraScreen() {
  const { settings, patch } = useSettings();
  const settingsReady = settings !== null;
  const profile = useDeviceProfile();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const cam = useCamera({ settings: settings ?? DEFAULT_SETTINGS, patch, profile });
  const insets = useSafeAreaInsets();

  const [showShots, setShowShots] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [rulerMode, setRulerMode] = useState<'off' | 'zoom' | 'timer' | 'ev'>('off');

  // preview bounds for the grid
  const [bounds, setBounds] = useState({ w: 0, h: 0 });

  // Edge Light — front camera only; window brightness boost while on
  const edgeLevel: 0 | 1 | 2 | 3 =
    settings?.facing === 'front'
      ? (Math.min(3, Math.max(0, settings.edgeLight)) as 0 | 1 | 2 | 3)
      : 0;
  useEdgeLightBrightness(edgeLevel > 0);

  // idle fade for the control rails
  const holdUI = cam.countdown.active || cam.phase !== 'ready';
  const { railOpacity, bump } = useIdleFade(holdUI);

  // pinch zoom
  const zoomRef = useRef(cam.zoomRatio);
  zoomRef.current = cam.zoomRatio;
  const baseZoom = useSharedValue(1);
  const [pinchActive, setPinchActive] = useState(false);
  const pinchHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPinchBegin = useCallback(() => {
    baseZoom.value = zoomRef.current;
    bump();
    setPinchActive(true);
    if (pinchHideTimer.current) clearTimeout(pinchHideTimer.current);
  }, [bump, baseZoom]);
  const onPinchUpdate = useCallback(
    (r: number) => {
      cam.setZoomRatio(r);
      bump();
    },
    [bump, cam],
  );
  const onPinchEnd = useCallback(() => {
    cam.commitZoom();
    if (pinchHideTimer.current) clearTimeout(pinchHideTimer.current);
    pinchHideTimer.current = setTimeout(() => setPinchActive(false), 1000);
  }, [cam]);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          runOnJS(onPinchBegin)();
        })
        .onUpdate((e) => {
          const r = clampRatio(profile, baseZoom.value * e.scale);
          runOnJS(onPinchUpdate)(r);
        })
        .onEnd(() => {
          runOnJS(onPinchEnd)();
        }),
    [baseZoom, onPinchBegin, onPinchEnd, onPinchUpdate, profile],
  );

  if (!settingsReady || !settings || !cameraPermission) {
    return <View style={styles.fillInk} />;
  }

  if (!cameraPermission.granted) {
    return (
      <PermissionGate
        onEnable={() => {
          void requestCameraPermission();
        }}
      />
    );
  }

  const activePreset = getPreset(settings.filterId);
  const activeFraming = getFraming(settings.framing);
  const frame = frameRect(activeFraming.aspect, bounds.w, bounds.h);

  return (
    <GestureHandlerRootView style={styles.fill}>
      <GestureDetector gesture={pinch}>
        <View
          style={styles.fillInk}
          onTouchStart={bump}
          onLayout={(e) =>
            setBounds({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }
        >
          <View
            style={{
              position: 'absolute',
              left: frame.x,
              top: frame.y,
              width: frame.w,
              height: frame.h,
            }}
            pointerEvents="none"
          >
            <CameraView
              ref={cam.cameraRef}
              style={StyleSheet.absoluteFill}
              facing={settings.facing}
              flash={cam.flashProp}
              zoom={ratioToNormalized(profile, cam.zoomRatio)}
              enableTorch={cam.enableTorch}
              mirror={settings.facing === 'front' && settings.mirrorFront}
              mode="picture"
            />
          </View>

          {/* v1 filter approximation: tint overlays over the framed preview */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: frame.x,
              top: frame.y,
              width: frame.w,
              height: frame.h,
            }}
          >
            {activePreset.overlay.map((layer, i) => (
              <View
                key={`${activePreset.id}-${i}`}
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: layer.color, opacity: layer.opacity }]}
              />
            ))}
          </View>

          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: frame.x,
              top: frame.y,
              width: frame.w,
              height: frame.h,
            }}
          >
            <Grid mode={settings.grid} width={frame.w} height={frame.h} />
          </View>
          <EdgeLight level={edgeLevel} />

          {/* ---- control rails (auto-fade) ---- */}
          <Animated.View
            pointerEvents="box-none"
            style={[StyleSheet.absoluteFill, { opacity: railOpacity }]}
          >
            {/* top rail */}
            <View style={[styles.topRail, { top: insets.top + spacing.s }]} pointerEvents="box-none">
              <View style={styles.row}>
                {settings.facing === 'front' ? (
                  <IconButton
                    icon="radio-button-on"
                    active={settings.edgeLight > 0}
                    onPress={() => {
                      void Haptics.selectionAsync().catch(() => {});
                      patch({ edgeLight: (settings.edgeLight + 1) % 4 });
                    }}
                    accessibilityLabel="Edge light"
                  />
                ) : (
                  <IconButton
                    icon="flashlight"
                    active={cam.torch}
                    onPress={cam.toggleTorch}
                    accessibilityLabel="Flashlight"
                  />
                )}
                <IconButton
                  icon="grid"
                  active={settings.grid !== 'off'}
                  onPress={() =>
                    patch({
                      grid:
                        settings.grid === 'off'
                          ? 'thirds'
                          : settings.grid === 'thirds'
                            ? 'golden'
                            : 'off',
                    })
                  }
                  accessibilityLabel="Composition grid"
                />
              </View>
              <View style={styles.spacer} />
              <IconButton
                icon="settings"
                active={false}
                onPress={() => setShowSettings(true)}
                accessibilityLabel="Settings"
              />
            </View>

            {/* transient labels — absolute so they never shift the rails */}
            <View
              pointerEvents="none"
              style={[styles.labelsWrap, { top: insets.top + spacing.s + 52, right: spacing.l }]}
            >
              <FadeLabel tick={settings.grid} text={GRID_LABEL[settings.grid]} />
              <FadeLabel tick={cam.zoomRatio} text={`${cam.zoomRatio.toFixed(1)}×`} mono />
              <FadeLabel tick={settings.edgeLight} text={EDGE_LABEL[settings.edgeLight] ?? ''} />
            </View>

            {/* bottom stack */}
            <View
              style={[styles.bottomStack, { paddingBottom: insets.bottom + spacing.s }]}
              pointerEvents="box-none"
            >
              <FadeLabel tick={settings.filterId} text={activePreset.name} style={styles.filterName} />

              {rulerMode === 'timer' ? (
                <Ruler
                  min={0}
                  max={30}
                  step={1}
                  value={settings.timerSeconds}
                  onChange={(v) => patch({ timerSeconds: v })}
                  format={(v) => (v === 0 ? 'Off' : `${v}s`)}
                  readoutPrefix="TIMER"
                  stepPx={26}
                />
              ) : null}
              {rulerMode === 'ev' ? (
                <Ruler
                  min={-2}
                  max={2}
                  step={0.25}
                  value={cam.ev}
                  onChange={cam.setEv}
                  format={(v) => (v > 0 ? `+${v}` : `${v}`)}
                  readoutPrefix="EV"
                />
              ) : null}
              {rulerMode === 'zoom' ? (
                <Ruler
                  min={profile.zoomMinRatio}
                  max={profile.zoomMaxRatio}
                  step={0.1}
                  value={cam.zoomRatio}
                  onChange={cam.setZoomRatio}
                  onCommit={cam.commitZoom}
                  format={(v) => `${v.toFixed(1)}×`}
                  stepPx={18}
                />
              ) : null}

              <View style={styles.chipRow} pointerEvents="box-none">
                <Chip
                  icon="crop"
                  text="ZOOM"
                  active={rulerMode === 'zoom'}
                  onPress={() => setRulerMode((m) => (m === 'zoom' ? 'off' : 'zoom'))}
                  accessibilityLabel="Zoom scrollbar"
                />
                <Chip
                  icon="timer"
                  text={settings.timerSeconds > 0 ? `${settings.timerSeconds}s` : 'TIMER'}
                  active={settings.timerSeconds > 0}
                  onPress={() => setRulerMode((m) => (m === 'timer' ? 'off' : 'timer'))}
                  accessibilityLabel="Capture timer"
                />
                <Chip
                  icon="speedometer"
                  text={cam.ev === 0 ? 'EV' : `EV ${cam.ev > 0 ? '+' : ''}${cam.ev}`}
                  active={rulerMode === 'ev' || cam.ev !== 0}
                  onPress={() => setRulerMode((m) => (m === 'ev' ? 'off' : 'ev'))}
                  accessibilityLabel="Exposure compensation"
                />
                {cam.processing ? (
                  <View style={styles.devChip} pointerEvents="none">
                    <FadeLabel text="Developing" ms={60000} showOnMount />
                  </View>
                ) : null}
                {cam.steady.active ? (
                  <View style={styles.devChip} pointerEvents="none">
                    <FadeLabel
                      text={cam.steady.ok ? 'Steady' : 'Hold steady'}
                      ms={60000}
                      showOnMount
                    />
                  </View>
                ) : null}
                {cam.burst.active ? (
                  <View style={styles.devChip} pointerEvents="none">
                    <FadeLabel text={`Rapid ×${cam.burst.count}`} ms={60000} showOnMount />
                  </View>
                ) : null}
                <View style={styles.spacer} />
                <Chip
                  icon="flash"
                  text={settings.flashMode === 'auto' ? 'Auto' : settings.flashMode === 'on' ? 'On' : 'Off'}
                  active={settings.flashMode !== 'off'}
                  onPress={() => patch({ flashMode: FLASH_CYCLE[settings.flashMode] })}
                  accessibilityLabel="Flash mode"
                />
              </View>

              <FilterCarousel
                selectedId={settings.filterId}
                onSelect={(id) => patch({ filterId: id })}
              />

              <View style={styles.mainRow} pointerEvents="box-none">
                <Thumbnail uri={cam.thumbUri} onPress={() => setShowShots(true)} />
                <View style={styles.shutterWrap}>
                  {cam.countdown.active ? (
                    <View style={styles.countdownWrap} pointerEvents="none">
                      <CountdownRing remaining={cam.countdown.remaining} total={cam.countdown.total} />
                    </View>
                  ) : null}
                  <ShutterButton
                    onPressIn={cam.onShutter}
                    onPressOut={cam.onShutterRelease}
                    busy={cam.shutterBusy}
                    danger={cam.saveError}
                  />
                </View>
                <IconButton
                  icon="camera-reverse"
                  active={settings.facing === 'front'}
                  disabled={settings.facing === 'back' && !profile.hasFront}
                  onPress={cam.switchFacing}
                  accessibilityLabel="Switch camera"
                />
              </View>
            </View>
          </Animated.View>

          {/* the ring lines every side, drawn above the rails */}
          <FlashRing mode={cam.ringMode} intense={cam.ringIntense} />

          {/* toast */}
          <View style={[styles.toastWrap, { bottom: insets.bottom + 120 }]} pointerEvents="none">
            <FadeLabel tick={cam.toast?.id ?? 0} text={cam.toast?.text ?? ''} ms={1400} />
          </View>
        </View>
      </GestureDetector>

      {showShots ? <ShotsScreen onClose={() => setShowShots(false)} /> : null}
      {showSettings ? <SettingsScreen onClose={() => setShowSettings(false)} /> : null}
    </GestureHandlerRootView>
  );
}

/**
 * Pushes the app-window brightness to maximum while the Edge Light is on
 * (window-level — the system brightness setting is never touched) and restores
 * the previous value on toggle-off, unmount, or background.
 */
function useEdgeLightBrightness(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let prev: number | null = null;
    let killed = false;
    const sub = AppState.addEventListener('change', (state) => {
      if (prev == null) return;
      if (state === 'background') void Brightness.setBrightnessAsync(prev).catch(() => {});
      if (state === 'active') void Brightness.setBrightnessAsync(1).catch(() => {});
    });
    (async () => {
      try {
        prev = await Brightness.getBrightnessAsync();
        if (!killed) await Brightness.setBrightnessAsync(1);
      } catch {
        prev = null;
      }
    })();
    return () => {
      killed = true;
      sub.remove();
      if (prev != null) void Brightness.setBrightnessAsync(prev).catch(() => {});
    };
  }, [active]);
}

/** Fades the control rails to a whisper after 4s of inactivity. */function useIdleFade(hold: boolean) {
  const railOpacity = useRef(new Animated.Value(1)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(() => {
    Animated.timing(railOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(railOpacity, { toValue: 0.25, duration: 600, useNativeDriver: true }).start();
    }, 4000);
  }, [railOpacity]);

  useEffect(() => {
    if (hold) {
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(railOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      return;
    }
    bump();
  }, [hold, bump, railOpacity]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { railOpacity, bump };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fillInk: { flex: 1, backgroundColor: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  spacer: { flex: 1 },
  topRail: {
    position: 'absolute',
    left: spacing.l,
    right: spacing.l,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  bottomStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.l,
    gap: spacing.m,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  devChip: {
    alignSelf: 'center',
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  labelsWrap: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  filterName: { alignSelf: 'center' },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shutterWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
