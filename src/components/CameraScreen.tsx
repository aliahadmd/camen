import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppState,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { colors, label as labelStyle, monoFont, spacing } from '../theme';
import {
  clampRatio,
  ratioToNormalized,
  useDeviceProfile,
} from '../features/deviceProfile';
import { DEFAULT_SETTINGS, useSettings, type GridMode } from '../features/settings';
import { frameRect, getFraming } from '../features/framings';
import {
  CAPTURE_PRESETS,
  getPreset as getCapturePreset,
  isCustomDevelop,
  isUserPresetId,
  presetDisplayName,
  presetRecipe,
  presetVeilLayers,
} from '../features/presets';
import {
  deleteUserPreset,
  loadUserPresets,
  refreshUserPresets,
  saveUserPreset,
} from '../features/userPresets';
import { useCamera } from '../features/useCamera';
import { DevelopPanel } from './DevelopPanel';
import { Chip, IconButton } from './Chips';
import { CountdownRing } from './CountdownRing';
import { EdgeLight } from './EdgeLight';
import { FadeLabel } from './FadeLabel';
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

/** Compact chip label for the combined EV + ISO control. */
function exposureChipText(ev: number, iso: number): string {
  const evPart = ev === 0 ? '' : `EV${ev > 0 ? '+' : ''}${ev}`;
  const isoPart = iso === 0 ? '' : `${iso}`;
  if (evPart && isoPart) return `${evPart}·${isoPart}`;
  if (evPart) return evPart;
  if (isoPart) return `ISO${isoPart}`;
  return 'EXP';
}

export function CameraScreen() {
  const { settings, patch } = useSettings();
  const settingsReady = settings !== null;
  const profile = useDeviceProfile();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const cam = useCamera({ settings: settings ?? DEFAULT_SETTINGS, patch, profile });
  const insets = useSafeAreaInsets();

  const [showShots, setShowShots] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [rulerMode, setRulerMode] = useState<'off' | 'zoom' | 'timer' | 'exposure'>('off');
  const [earPicker, setEarPicker] = useState<null | 'preset' | 'sub'>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  // user-saved presets — the version bump re-reads the cached list after saves
  const [userPresetsVersion, setUserPresetsVersion] = useState(0);
  useEffect(() => {
    void refreshUserPresets().then(() => setUserPresetsVersion((v) => v + 1));
  }, []);
  const userPresets = useMemo(
    () => (void userPresetsVersion, loadUserPresets()),
    [userPresetsVersion],
  );

  // preview bounds for the grid
  const [bounds, setBounds] = useState({ w: 0, h: 0 });

  // Edge Light — front camera only; window brightness boost while on
  const edgeLevel: 0 | 1 | 2 | 3 =
    settings?.facing === 'front'
      ? (Math.min(3, Math.max(0, settings.edgeLight)) as 0 | 1 | 2 | 3)
      : 0;
  useEdgeLightBrightness(edgeLevel > 0);

  // idle fade for the control rails
  const holdUI =
    cam.countdown.active ||
    cam.phase !== 'ready' ||
    earPicker !== null ||
    showAdjust ||
    cam.recording;
  const { railOpacity, bump } = useIdleFade(holdUI);

  // double-tap on the viewfinder flips the camera (single taps just wake rails)
  const lastTapRef = useRef(0);
  const onTouchStart = useCallback(() => {
    bump();
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      if (!cam.recording) cam.switchFacing();
    } else {
      lastTapRef.current = now;
    }
  }, [bump, cam]);

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

  const activeFraming = getFraming(settings.framing);
  const frame = frameRect(activeFraming.aspect, bounds.w, bounds.h);

  return (
    <GestureHandlerRootView style={styles.fill}>
      <GestureDetector gesture={pinch}>
        <View
          style={styles.fillInk}
          onTouchStart={onTouchStart}
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
              mode={settings.mode === 'video' ? 'video' : 'picture'}
              videoQuality="1080p"
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
            {/* the comment block that held the old filter overlay tints was
                removed with the filter system in v1.12 */}
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

          {/* capture-preset preview veils — instant feedback for the tonal recipe */}
          {/* live approximation of the CURRENT develop values (what a preset
              loaded or what the user set by hand) */}
          {presetVeilLayers(settings.develop).map((layer, i) => (
            <View
              key={`pv-${i}`}
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: layer.color, opacity: layer.opacity }]}
            />
          ))}
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
              {/* PHOTO | VIDEO mode switch */}
              <View style={styles.modeSwitch} pointerEvents="box-none">
                <Pressable
                  onPress={() => {
                    if (!cam.recording && settings.mode !== 'photo') patch({ mode: 'photo' });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Photo mode"
                >
                  <Text
                    style={[
                      styles.modeSwitchText,
                      settings.mode === 'photo' && styles.modeSwitchTextActive,
                    ]}
                  >
                    PHOTO
                  </Text>
                </Pressable>
                <View style={styles.modeSwitchDivider} />
                <Pressable
                  onPress={() => {
                    if (!cam.recording && settings.mode !== 'video') patch({ mode: 'video' });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Video mode"
                >
                  <Text
                    style={[
                      styles.modeSwitchText,
                      settings.mode === 'video' && styles.modeSwitchTextActive,
                    ]}
                  >
                    VIDEO
                  </Text>
                </Pressable>
              </View>

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
              {rulerMode === 'exposure' ? (
                <>
                  <Ruler
                    min={-2}
                    max={2}
                    step={0.25}
                    value={cam.ev}
                    onChange={cam.setEv}
                    format={(v) => (v > 0 ? `+${v}` : `${v}`)}
                    readoutPrefix="EV"
                  />
                  <View style={styles.isoRow} pointerEvents="box-none">
                    {[0, 100, 200, 400, 800, 1600, 3200].map((isoValue) => (
                      <Pressable
                        key={isoValue}
                        onPress={() => patch({ iso: isoValue })}
                        style={[styles.isoPill, settings.iso === isoValue && styles.isoPillActive]}
                        accessibilityRole="button"
                        accessibilityLabel={`ISO ${isoValue === 0 ? 'auto' : isoValue}`}
                      >
                        <Text style={[styles.isoPillText, settings.iso === isoValue && styles.isoPillTextActive]}>
                          {isoValue === 0 ? 'Auto' : String(isoValue)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
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

              {/* control toolbar — horizontally scrollable so every chip can
                  carry its icon + label, and new tools can be appended freely */}
              <View style={styles.chipRow} pointerEvents="box-none">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRowScroll}
                >
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
                    active={settings.timerSeconds > 0 || rulerMode === 'timer'}
                    onPress={() => setRulerMode((m) => (m === 'timer' ? 'off' : 'timer'))}
                    accessibilityLabel="Capture timer"
                  />
                  <Chip
                    icon="speedometer"
                    text={exposureChipText(cam.ev, settings.iso)}
                    active={rulerMode === 'exposure' || cam.ev !== 0 || settings.iso > 0}
                    onPress={() => setRulerMode((m) => (m === 'exposure' ? 'off' : 'exposure'))}
                    accessibilityLabel="Exposure and ISO"
                  />
                  {settings.mode === 'photo' ? (
                    <Chip
                      icon="layers"
                      text="AEB"
                      active={settings.aeb}
                      onPress={() => patch({ aeb: !settings.aeb })}
                      accessibilityLabel="Auto exposure bracketing"
                    />
                  ) : null}
                  {settings.mode === 'photo' ? (
                    <Chip
                      icon="options"
                      text="ADJUST"
                      active={showAdjust}
                      onPress={() => setShowAdjust((s) => !s)}
                      accessibilityLabel="Manual develop controls"
                    />
                  ) : null}
                  <Chip
                    icon="flash"
                    text={settings.flashMode === 'auto' ? 'AUTO' : settings.flashMode === 'on' ? 'ON' : 'OFF'}
                    active={settings.flashMode !== 'off'}
                    onPress={() => patch({ flashMode: FLASH_CYCLE[settings.flashMode] })}
                    accessibilityLabel="Flash mode"
                  />
                </ScrollView>
                {/* status badges — centered over the toolbar, never scrolling */}
                <View style={styles.statusOverlay} pointerEvents="none">
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
                </View>
              </View>

              {cam.recording ? (
                <View style={styles.recBadge} pointerEvents="none">
                  <View style={styles.recDot} />
                  <Text style={styles.recText}>
                    REC {String(Math.floor(cam.recordSeconds / 60)).padStart(2, '0')}:
                    {String(cam.recordSeconds % 60).padStart(2, '0')}
                  </Text>
                </View>
              ) : null}

              <View style={styles.mainRow} pointerEvents="box-none">
                <Thumbnail uri={cam.thumbUri} onPress={() => setShowShots(true)} />
                <Pressable
                  style={[styles.earChip, earPicker === 'preset' && styles.earChipActive]}
                  onPress={() => setEarPicker(earPicker === 'preset' ? null : 'preset')}
                  accessibilityRole="button"
                  accessibilityLabel="Capture preset"
                >
                  <Text style={styles.earChipText}>
                    {isCustomDevelop(settings.develop, settings.preset, settings.presetSub)
                      ? 'CUSTOM'
                      : presetDisplayName(settings.preset).toUpperCase().slice(0, 9)}
                  </Text>
                </Pressable>
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
                <Pressable
                  style={[styles.earChip, earPicker === 'sub' && styles.earChipActive]}
                  onPress={() => setEarPicker(earPicker === 'sub' ? null : 'sub')}
                  accessibilityRole="button"
                  accessibilityLabel="Sub preset"
                >
                  <Text style={styles.earChipText}>
                    {isUserPresetId(settings.preset)
                      ? 'MY'
                      : (getCapturePreset(settings.preset).subs.find((s) => s.id === settings.presetSub)?.name ?? 'LOOK').toUpperCase().slice(0, 9)}
                  </Text>
                </Pressable>
                <IconButton
                  icon="camera-reverse"
                  active={settings.facing === 'front'}
                  disabled={settings.facing === 'back' && !profile.hasFront}
                  onPress={cam.switchFacing}
                  accessibilityLabel="Switch camera"
                />
              </View>
            </View>

            {/* preset pickers — anchored just above the selector button,
                fully decoupled from the bottom row so the shutter never moves.
                A selection WRITES its recipe into the user's develop values —
                a preset is a shortcut, not a hidden layer. */}
            {earPicker !== null ? (
              <>
                <Pressable
                  style={styles.backdrop}
                  onPress={() => setEarPicker(null)}
                  accessibilityLabel="Close preset picker"
                />
                <View style={[styles.earDock, { bottom: insets.bottom + 140 }]}>
                  <ScrollView style={styles.earDockScroll}>
                    {earPicker === 'preset'
                      ? [
                          ...userPresets.map((p) => ({ id: `user:${p.id}`, name: p.name, user: p })),
                          ...CAPTURE_PRESETS.map((p) => ({ id: p.id, name: p.name, user: null as null | (typeof userPresets)[number] })),
                        ].map((entry) => (
                          <Pressable
                            key={entry.id}
                            style={[
                              styles.earOption,
                              settings.preset === entry.id && styles.earOptionActive,
                            ]}
                            onPress={() => {
                              const subId = entry.user ? 'my' : getCapturePreset(entry.id).subs[0].id;
                              patch({
                                preset: entry.id,
                                presetSub: subId,
                                develop: presetRecipe(entry.id, subId),
                              });
                              setEarPicker(null);
                            }}
                          >
                            <View style={styles.earOptionRow}>
                              {entry.user ? (
                                <Text style={styles.earOptionTag}>MY</Text>
                              ) : null}
                              <Text style={styles.earOptionText}>{entry.name}</Text>
                              <View style={styles.earOptionSpacer} />
                              {entry.user ? (
                                <Pressable
                                  hitSlop={8}
                                  onPress={() => {
                                    void deleteUserPreset(entry.user!.id).then(() => {
                                      if (settings.preset === entry.id) {
                                        patch({ preset: 'standard', presetSub: 'standard', develop: {} });
                                      }
                                      void refreshUserPresets().then(() => setUserPresetsVersion((v) => v + 1));
                                    });
                                  }}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Delete ${entry.name}`}
                                >
                                  <Text style={styles.earOptionDelete}>✕</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          </Pressable>
                        ))
                      : getCapturePreset(settings.preset).subs.map((s) => (
                          <Pressable
                            key={s.id}
                            style={[styles.earOption, settings.presetSub === s.id && styles.earOptionActive]}
                            onPress={() => {
                              patch({
                                presetSub: s.id,
                                develop: presetRecipe(settings.preset, s.id),
                              });
                              setEarPicker(null);
                            }}
                          >
                            <Text style={styles.earOptionText}>{s.name}</Text>
                          </Pressable>
                        ))}
                  </ScrollView>
                </View>
              </>
            ) : null}

            {/* manual develop controls — the real values presets load into */}
            {showAdjust ? (
              <DevelopPanel
                develop={settings.develop}
                presetId={settings.preset}
                presetSub={settings.presetSub}
                onChange={(p) => patch({ develop: { ...settings.develop, ...p } })}
                onClose={() => setShowAdjust(false)}
                onSavePreset={(name) => {
                  void saveUserPreset(name, settings.develop).then((saved) => {
                    patch({ preset: `user:${saved.id}`, presetSub: 'my' });
                    void refreshUserPresets().then(() => setUserPresetsVersion((v) => v + 1));
                  });
                }}
              />
            ) : null}
          </Animated.View>

          {/* the ring lines every side, drawn above the rails */}
          <FlashRing mode={cam.ringMode} intense={cam.ringIntense} />

          {/* toast */}
          <View style={[styles.toastWrap, { bottom: insets.bottom + 120 }]} pointerEvents="none">
            <FadeLabel tick={cam.toast?.id ?? 0} text={cam.toast?.text ?? ''} ms={1400} />
          </View>

          {/* front flash — a real white screen for the instant of capture
              (the front lens has no flash unit; expo-camera's 'screen' flash
              mode is iOS-only, so the app lights the screen itself) */}
          {cam.screenFlash ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]}
              pointerEvents="none"
            />
          ) : null}
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

/** Fades the control rails to a whisper after 4s of inactivity. */
function useIdleFade(hold: boolean) {
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
    alignItems: 'center',
  },
  chipRowScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  statusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
  isoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.s,
  },
  isoPill: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,24,27,0.85)',
  },
  isoPillActive: {
    backgroundColor: colors.brass,
    borderColor: colors.brass,
  },
  isoPillText: {
    ...labelStyle,
    color: colors.bone,
    fontSize: 11,
    ...monoFont,
  },
  isoPillTextActive: {
    color: colors.ink,
  },
  modeSwitch: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.m,
  },
  modeSwitchText: {
    ...labelStyle,
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 3,
  },
  modeSwitchTextActive: {
    color: colors.brass,
  },
  modeSwitchDivider: {
    width: StyleSheet.hairlineWidth,
    height: 12,
    backgroundColor: colors.hairline,
  },
  recBadge: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(11,12,14,0.72)',
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  recText: {
    ...labelStyle,
    color: colors.bone,
    fontSize: 11,
    letterSpacing: 1.5,
    ...monoFont,
  },
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
  earDock: {
    position: 'absolute',
    left: spacing.l,
    right: spacing.l,
    maxHeight: 380,
    borderRadius: 14,
    backgroundColor: 'rgba(11,12,14,0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    padding: 6,
  },
  earOption: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  earOptionActive: {
    backgroundColor: colors.panel,
  },
  earOptionText: {
    color: colors.bone,
    fontSize: 12,
  },
  earDockScroll: { flexGrow: 0 },
  earOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  earOptionTag: {
    ...labelStyle,
    color: colors.brass,
    fontSize: 9,
  },
  earOptionSpacer: { flex: 1 },
  earOptionDelete: {
    color: colors.muted,
    fontSize: 14,
    paddingHorizontal: 6,
  },
  earChip: {
    minWidth: 58,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(22,24,27,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earChipActive: {
    backgroundColor: colors.panel,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  earChipText: {
    color: colors.bone,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
