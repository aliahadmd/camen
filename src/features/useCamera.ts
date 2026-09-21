import { Camera, CameraView, type FlashMode } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as KeepAwake from 'expo-keep-awake';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as MediaLibrary from 'expo-media-library/legacy';
// NOTE: Expo Go 57.0.9 ships the legacy `ExpoMediaLibrary` native module only —
// the main export (ExpoMediaLibraryNext) is not bundled there yet. When moving to
// a development build, switch this back to 'expo-media-library'.
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clampRatio, zoomRangeForFacing, type DeviceProfile } from './deviceProfile';
import { cropToAspect, developPhoto, MAX_DIM, queuedManipulate } from './gradePhoto';
import { getFraming } from './framings';
import { injectGpsExif } from './geotag';
import { applyPortraitDepth } from './portraitDepth';
import { getSelfieMask, type DepthMask } from './vision';
import { latestShot } from '../data/db';
import { developKey, isCustomDevelop, isUserPresetId, presetRecipe } from './presets';
import { rlog } from '../log';
import type { Settings } from './settings';
import { getDefaultMediaRepository } from './mediaRepository';
import { hasEffectiveDevelop } from './developValidation';
import { ArtifactScope, withDeadline } from './processingRuntime';

export type Phase = 'ready' | 'capturing' | 'saving' | 'recording';
export type RingMode = 'idle' | 'fill' | 'breath' | 'firing';

export type Countdown = { active: boolean; total: number; remaining: number };
export type Burst = { active: boolean; count: number };
export type Steady = { active: boolean; ok: boolean };

const IDLE_COUNTDOWN: Countdown = { active: false, total: 0, remaining: 0 };
const BURST_MAX = 30;
const STEADY_HOLD_MS = 600;
const STEADY_TIMEOUT_MS = 4000;
const STEADY_G_TOLERANCE = 0.05;
/** Sustained-press threshold: shorter = processed single shot, longer = burst. */
const HOLD_TO_BURST_MS = 260;

type UseCameraArgs = {
  settings: Settings;
  patch: (partial: Partial<Settings>) => void;
  profile: DeviceProfile;
};

type CapturedFrame = {
  uri: string;
  width: number;
  height: number;
  /** EXIF orientation of the source file (jpeg-js ignores it — see processCapture). */
  orientation?: number;
  /**
   * Closes every processing scope, deleting the intermediates they tracked.
   * URIs listed in `keep` survive — used on save failure to preserve the file
   * a journal still points at for recovery.
   */
  dispose?: (keep?: readonly string[]) => Promise<void>;
  /** True when the portrait depth pass actually ran (logged honestly to SQLite). */
  bokehApplied?: boolean;
};

/**
 * Thrown when a failed save kept a rerouted recovery source (the GPS copy):
 * the journal no longer points at the capture file, so the caller may reclaim
 * it once no sibling AEB variant still reads it. The capture file itself is
 * NEVER deleted inside saveShot — AEB brackets can share one file.
 */
class SaveReroutedError extends Error {
  constructor(journalSource: string, cause: unknown) {
    super(`save failed; recovery source rerouted to ${journalSource} (${String(cause)})`);
  }
}

/**
 * The camera engine: capture state machine, flash/torch, EV, anti-shake,
 * rapid-fire burst, timer and persistence. Every feature chapter hangs off this hook.
 */
export function useCamera({ settings, patch, profile }: UseCameraArgs) {
  const cameraRef = useRef<CameraView | null>(null);
  const phaseRef = useRef<Phase>('ready');
  const [phase, setPhase] = useState<Phase>('ready');
  const [torch, setTorch] = useState(false);
  const [countdown, setCountdown] = useState<Countdown>(IDLE_COUNTDOWN);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [burst, setBurst] = useState<Burst>({ active: false, count: 0 });
  const [steady, setSteady] = useState<Steady>({ active: false, ok: false });
  const [ev, setEvState] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [screenFlashArmed, setScreenFlashArmed] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstActiveRef = useRef(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordStartRef = useRef(0);

  const facing = settings.facing;

  const zoomRange = zoomRangeForFacing(profile, facing);
  const [zoomRatio, setZoomRatioState] = useState(() =>
    clampRatio(zoomRange, facing === 'front' ? 1 : settings.zoomBackRatio),
  );
  const zoomRatioRef = useRef(zoomRatio);
  useEffect(() => {
    const ratio = clampRatio(zoomRange, facing === 'front' ? 1 : settings.zoomBackRatio);
    zoomRatioRef.current = ratio;
    setZoomRatioState(ratio);
    // Only restore when switching lenses; live gestures own the current value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const setZoomRatio = useCallback((ratio: number) => {
    zoomRatioRef.current = clampRatio(zoomRange, ratio);
    setZoomRatioState(zoomRatioRef.current);
  }, [zoomRange]);

  const commitZoom = useCallback((value = zoomRatioRef.current) => {
    if (facing === 'back') patch({ zoomBackRatio: clampRatio(zoomRange, value) });
  }, [facing, patch, zoomRange]);

  const setEv = useCallback((value: number) => {
    setEvState(Math.min(2, Math.max(-2, Math.round(value * 4) / 4)));
  }, []);

  // ---- tap-to-focus / AF·AE lock -------------------------------------------
  // x/y are normalized to the viewfinder; key is a monotonic counter — every
  // increment re-meters at the point and LOCKS (patched disableAutoCancel),
  // key 0 releases back to continuous autofocus.
  const [focus, setFocus] = useState<{ x: number; y: number; key: number } | null>(null);
  const focusKeyRef = useRef(0);
  const focusAt = useCallback((x: number, y: number) => {
    const nx = Math.min(1, Math.max(0, x));
    const ny = Math.min(1, Math.max(0, y));
    focusKeyRef.current += 1;
    setFocus({ x: nx, y: ny, key: focusKeyRef.current });
  }, []);
  const clearFocus = useCallback(() => {
    focusKeyRef.current = 0;
    setFocus(null);
  }, []);

  // ---- flash / torch ------------------------------------------------------
  const enableTorch = torch && facing === 'back' && profile.backFlash === 'led';

  const toggleTorch = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTorch((t) => !t);
  }, []);

  // Front camera has no flash unit (probed): the ring screen-flash is the flash.
  // It is armed only for the instant of capture (see `capture`).
  const flashProp: FlashMode = screenFlashArmed
    ? 'screen'
    : facing === 'front'
      ? 'off'
      : settings.flashMode;

  // ---- toast --------------------------------------------------------------
  const showToast = useCallback((text: string) => {
    setToast({ text, id: Date.now() });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }, []);

  // ---- gallery / archive --------------------------------------------------
  const refreshThumbnail = useCallback(async () => {
    // The 256px thumb, never the full-size original — decoding a 12MP JPEG
    // into a 40px view spikes memory on every shot.
    const shot = latestShot();
    setThumbUri(shot?.thumb_path || shot?.path || null);
  }, []);

  const makeThumb = useCallback(async (src: string): Promise<string> => {
    const dir = `${FileSystem.documentDirectory}camen/thumbs`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const name = src.split('/').pop() || `t${Date.now()}`;
    const dest = `${dir}/${name}.jpg`;
    const scope = new ArtifactScope((uri) => FileSystem.deleteAsync(uri, { idempotent: true }));
    try {
      await withDeadline(scope.run(async () => {
        const generate = async () => {
          const result = src.endsWith('.mp4')
            ? await VideoThumbnails.getThumbnailAsync(src, { time: 500, quality: 0.8 })
            : await ImageManipulator.manipulateAsync(src, [{ resize: { width: 256 } }], {
                compress: 0.8, format: ImageManipulator.SaveFormat.JPEG,
              });
          scope.track(result.uri);
          return result;
        };
        const thumb = src.endsWith('.mp4')
          ? await generate()
          : await queuedManipulate(() => scope.run(generate));
        scope.assertOpen();
        scope.track(dest);
        await FileSystem.copyAsync({ from: thumb.uri, to: dest });
        scope.assertOpen();
        scope.retain(dest);
      }), 15000, 'Thumbnail');
      return dest;
    } finally {
      await scope.close();
    }
  }, []);

  useEffect(() => {
    void getDefaultMediaRepository().then(async (repo) => {
      const report = await repo.recover();
      if (report.failed.length) rlog('[camen] pending archive recovery:', report.failed.length);
      await refreshThumbnail();
    }).catch((error) => rlog('[camen] archive recovery unavailable:', error));
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      // Unmounting mid-countdown must not leave the screen awake forever.
      KeepAwake.deactivateKeepAwake();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- location -------------------------------------------------------------
  const fetchCoords = useCallback(async (): Promise<{ lat: number; lon: number } | null> => {
    if (!settings.location) return null;
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return null;
      const pos = (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ])) as { coords: { latitude: number; longitude: number } } | null;
      return pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude } : null;
    } catch {
      return null;
    }
  }, [settings.location]);

  // ---- capture pipeline -----------------------------------------------------
  /**
   * Orientation upright → framing crop → filter grade + preset recipe develop →
   * portrait depth bokeh → format conversion. Every intermediate lives in an
   * ArtifactScope owned by the returned `dispose` — the caller closes it after
   * archiving, keeping any URI a failed-save journal still points at.
   * `maskRef` lets AEB variants of one capture share a single segmentation —
   * same geometry, same person.
   */
  const processCapture = useCallback(
    async (
      photo: CapturedFrame,
      evOffset: number,
      maskRef?: { promise: Promise<DepthMask | null> | null },
    ): Promise<CapturedFrame> => {
      const scopes: ArtifactScope[] = [];
      const stage = async <T extends { uri: string } | null>(job: (scope: ArtifactScope) => Promise<T>): Promise<T> => {
        const scope = new ArtifactScope((uri) => FileSystem.deleteAsync(uri, { idempotent: true }));
        try {
          const out = await withDeadline(scope.run(() => job(scope)), 45000, 'Photo processing');
          if (out) scope.track(out.uri);
          scopes.push(scope);
          return out;
        } catch (error) {
          void scope.close();
          throw error;
        }
      };
      let current = { uri: photo.uri, width: photo.width, height: photo.height };
      let oriented = true;
      let bokehApplied = false;
      try {
        if (photo.orientation && photo.orientation !== 1) {
          try {
            // Glide applies all EXIF orientations while loading; do not rotate twice.
            current = await stage((scope) => queuedManipulate(() => scope.run(async () => {
              const out = await ImageManipulator.manipulateAsync(photo.uri, [], {
                compress: 0.95, format: ImageManipulator.SaveFormat.JPEG,
              });
              scope.track(out.uri);
              return out;
            })));
          } catch (error) {
            oriented = false;
            rlog('[camen] orientation unavailable, preserving original:', error);
          }
        }
        const recipe = settings.develop;
        const options = { ...recipe, ev: evOffset, iso: settings.iso };
        if (oriented) {
          const framing = getFraming(settings.framing);
          if (framing.aspect) {
            try {
              const input = current;
              current = await stage((scope) => cropToAspect(input.uri, input.width, input.height,
                framing.aspect, framing.maxLongEdge, scope));
            } catch (error) { rlog('[camen] crop unavailable:', error); }
          }
          let developed = false;
          if (hasEffectiveDevelop(options)) {
            setProcessing(true);
            try {
              const input = current;
              current = await stage((scope) => developPhoto(input.uri, input.width, input.height, {}, options, scope));
              developed = true;
            } catch (error) { rlog('[camen] develop unavailable, preserving capture:', error); }
            finally { setProcessing(false); }
          }
          if ((recipe.bokeh ?? 0) > 0) {
            setProcessing(true);
            try {
              let input = current;
              // The tonal develop pass downsizes to MAX_DIM before any JS
              // pixel work. When it didn't run (bokeh-only look) or failed,
              // resize here — the depth pass otherwise decodes the full
              // sensor frame (~113MB of planes on the K80 Pro).
              if (!developed && Math.max(input.width, input.height) > MAX_DIM) {
                input = await stage((scope) => queuedManipulate(() => scope.run(async () => {
                  const out = await ImageManipulator.manipulateAsync(
                    input.uri,
                    [
                      input.width >= input.height
                        ? { resize: { width: MAX_DIM } }
                        : { resize: { height: MAX_DIM } },
                    ],
                    { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG },
                  );
                  scope.track(out.uri);
                  return out;
                })));
              }
              const provider = () => {
                if (!maskRef) return getSelfieMask(input.uri);
                if (!maskRef.promise) maskRef.promise = getSelfieMask(input.uri);
                return maskRef.promise;
              };
              const out = await stage((scope) => applyPortraitDepth(input.uri, provider, {
                bokeh: recipe.bokeh!, bokehGlow: recipe.bokehGlow ?? recipe.bokeh! * 0.45,
                bgTone: recipe.bgTone ?? 0,
              }, scope));
              if (out) { current = out; bokehApplied = true; }
            } catch (error) {
              const code = (error as { code?: string } | null)?.code;
              const busy =
                code === 'E_SEGMENT_BUSY' ||
                (error instanceof Error && error.message.includes('E_SEGMENT_BUSY'));
              if (busy) {
                // A previous shot is still segmenting — degrade to an
                // un-blurred capture, but never silently.
                rlog('[camen] portrait busy, saved without bokeh:', error);
                showToast('Portrait busy — saved without blur');
              } else {
                rlog('[camen] portrait unavailable:', error);
              }
            }
            finally { setProcessing(false); }
          }
          if (settings.format === 'webp') {
            try {
              const input = current;
              current = await stage((scope) => queuedManipulate(() => scope.run(async () => {
                const out = await ImageManipulator.manipulateAsync(input.uri, [], {
                  compress: 0.9, format: ImageManipulator.SaveFormat.WEBP,
                });
                scope.track(out.uri);
                return out;
              })));
            } catch (error) { rlog('[camen] WebP unavailable:', error); }
          }
        }
      } catch (error) {
        // A mid-pipeline throw leaves the already-completed stages' scopes
        // unclosed (the failing stage closed its own) — sweep them now or the
        // captured originals leak into the cache.
        await Promise.all(scopes.map((scope) => scope.close().catch(() => {})));
        throw error;
      }
      return {
        ...current,
        bokehApplied,
        dispose: async (keep: readonly string[] = []) => {
          const keepSet = new Set(keep);
          await Promise.all(scopes.map(async (scope) => {
            for (const uri of keepSet) scope.retain(uri);
            await scope.close();
          }));
        },
      };
    },
    [settings.develop, settings.framing, settings.format, settings.iso],
  );

  /** Prepare metadata, durably archive/index, then generate optional assets. */
  const saveShot = useCallback(
    async (
      shot: CapturedFrame,
      coords: { lat: number; lon: number } | null,
      meta: { ev: number; aeb: boolean; raw?: boolean },
      media: { mediaType: 'photo' | 'video'; durationMs?: number } = { mediaType: 'photo' },
    ): Promise<void> => {
      // Trust the actual file bytes, not the setting — a failed webp
      // conversion must never archive JPEG data under a .webp name. Videos
      // keep whatever extension the recorder produced (default mp4).
      const srcExt = shot.uri.split('.').pop()?.toLowerCase();
      const ext =
        media.mediaType === 'video'
          ? srcExt || 'mp4'
          : srcExt === 'webp'
            ? 'webp'
            : 'jpg';
      // `raw` marks speed-priority burst originals: no crop, no develop values
      // touched them — the log must not claim otherwise.
      // Modified develop values log as 'custom'; user presets log as their id.
      const isUser = isUserPresetId(settings.preset);
      const matchesUser =
        isUser && developKey(settings.develop) === developKey(presetRecipe(settings.preset, settings.presetSub));
      let loggedPreset: string;
      if (meta.raw) {
        loggedPreset = 'standard';
      } else if (matchesUser) {
        loggedPreset = settings.preset;
      } else if (
        isCustomDevelop(settings.develop, settings.preset, settings.presetSub)
      ) {
        loggedPreset = 'custom';
      } else {
        loggedPreset = settings.preset;
      }
      const repo = await getDefaultMediaRepository();
      let archiveSource = shot.uri;
      const gpsScope = new ArtifactScope((uri) => FileSystem.deleteAsync(uri, { idempotent: true }));
      if (coords && media.mediaType === 'photo' && ext === 'jpg') {
        const copy = `${FileSystem.cacheDirectory}gps-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        gpsScope.track(copy);
        try {
          await withDeadline(gpsScope.run(async () => {
            await FileSystem.copyAsync({ from: shot.uri, to: copy });
            gpsScope.assertOpen();
            await injectGpsExif(copy, coords.lat, coords.lon);
          }), 15000, 'GPS metadata');
          archiveSource = copy;
        } catch (error) {
          void gpsScope.close();
          rlog('[camen] GPS EXIF unavailable, preserving capture:', error);
        }
      }
      // A failed archive keeps its recovery source (the journal's GPS copy
      // when one was made, otherwise the capture file itself) — reclaiming
      // anything else is the capture loop's call, after ALL variants saved.
      let path: string;
      try {
        path = (await repo.savePhoto({ sourceUri: archiveSource, extension: ext, meta: {
          created_at: Date.now(),
          filter_id: 'none', // filter system removed in v1.12
          facing,
          width: shot.width,
          height: shot.height,
          flash_mode: settings.flashMode,
          zoom_ratio: zoomRatio,
          timer_seconds: settings.timerSeconds,
          edge_light: settings.edgeLight,
          device: profile.name,
          framing: meta.raw ? 'full' : settings.framing,
          preset_id: loggedPreset,
          preset_sub: meta.raw ? 'standard' : settings.presetSub,
          ev: meta.ev,
          iso: meta.raw ? 0 : settings.iso,
          tone: meta.raw ? 'ldr' : settings.develop.hdr ? 'hdr' : 'ldr',
          aeb: meta.aeb ? 1 : 0,
          lat: coords?.lat ?? null,
          lon: coords?.lon ?? null,
          media_type: media.mediaType,
          duration_ms: media.durationMs ?? null,
          bokeh: meta.raw ? null : shot.bokehApplied ? settings.develop.bokeh ?? null : null,
      } })).path;
      } catch (error) {
        if (archiveSource !== shot.uri) {
          // The journal points at the GPS copy — keep it for recovery. The
          // capture file itself must NOT be deleted here: with AEB the other
          // brackets may still save from this very file. The caller decides
          // after the whole save loop (SaveReroutedError).
          gpsScope.retain(archiveSource);
          await gpsScope.close();
          throw new SaveReroutedError(archiveSource, error);
        }
        await gpsScope.close();
        throw error;
      }
      await gpsScope.close();
      const optionalAssets = async () => {
        let thumbPath = '';
        try { thumbPath = await makeThumb(path); }
        catch (error) { rlog('[camen] thumbnail unavailable:', error); }
        if (thumbPath) await repo.updateAssets(path, { thumb_path: thumbPath });
        try {
          let permission = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
          if (!permission.granted) permission = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
          if (permission.granted) {
            const asset = await MediaLibrary.createAssetAsync(path);
            await repo.updateAssets(path, { gallery_uri: asset.uri });
          }
        } catch (error) { rlog('[camen] gallery export unavailable:', error); }
        await refreshThumbnail();
      };
      // Optional exports cannot hold the capture lock or invalidate archived pixels.
      void optionalAssets().catch((error) => rlog('[camen] optional assets failed:', error));

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (!meta.aeb) showToast('Saved');
      setSaveError(false);
      // DB init failures make latestShot() throw — never an unhandled rejection.
      void refreshThumbnail().catch((error) => rlog('[camen] thumbnail refresh failed:', error));
    },
    [
      facing,
      makeThumb,
      profile,
      refreshThumbnail,
      settings.develop,
      settings.edgeLight,
      settings.flashMode,
      settings.framing,
      settings.iso,
      settings.preset,
      settings.presetSub,
      settings.timerSeconds,
      showToast,
      zoomRatio,
    ],
  );

  // ---- anti-shake steady detection ------------------------------------------
  const steadySubRef = useRef<{ remove: () => void } | null>(null);
  const steadyResolveRef = useRef<((r: { canceled: boolean }) => void) | null>(null);

  const cancelSteady = useCallback(() => {
    steadySubRef.current?.remove();
    steadySubRef.current = null;
    const r = steadyResolveRef.current;
    steadyResolveRef.current = null;
    setSteady({ active: false, ok: false });
    r?.({ canceled: true });
  }, []);

  // Unmounting mid-steady-wait must release the sensor subscription and settle
  // the pending promise, or the subscriber leaks past the screen's lifetime.
  useEffect(() => () => cancelSteady(), [cancelSteady]);

  /**
   * Resolves once the phone has been held steady (smoothed |‖a‖ − 1g| under the
   * threshold for STEADY_HOLD_MS), or after STEADY_TIMEOUT_MS — the shot is taken
   * either way. `canceled` marks an explicit user cancel.
   */
  const waitForSteady = useCallback((): Promise<{ canceled: boolean }> => {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (r: { canceled: boolean }) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        steadySubRef.current?.remove();
        steadySubRef.current = null;
        steadyResolveRef.current = null;
        setSteady({ active: false, ok: false });
        resolve(r);
      };
      steadyResolveRef.current = finish;

      const start = Date.now();
      let lastTick = start;
      let ema = 1;
      let steadyFor = 0;
      let reported = false;

      setSteady({ active: true, ok: false });
      // Independent deadline: the timeout must not depend on the accelerometer
      // delivering events — a stalled sensor would hang the shutter forever.
      const deadline = setTimeout(() => finish({ canceled: false }), STEADY_TIMEOUT_MS + 250);
      Accelerometer.setUpdateInterval(60);
      steadySubRef.current = Accelerometer.addListener((d) => {
        if (settled) return;
        const now = Date.now();
        const dt = Math.min(200, now - lastTick);
        lastTick = now;
        const mag = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
        ema = ema * 0.65 + mag * 0.35;
        steadyFor = Math.abs(ema - 1) < STEADY_G_TOLERANCE ? steadyFor + dt : 0;

        const ok = steadyFor >= STEADY_HOLD_MS;
        if (ok !== reported) {
          reported = ok;
          setSteady({ active: true, ok });
        }
        if (ok) finish({ canceled: false });
      });
    });
  }, []);

  // ---- capture ------------------------------------------------------------
  const capture = useCallback(async () => {
    // The timer countdown fires the CURRENT capture — if the user switched to
    // video mode while it was counting down, firing would grab a still frame
    // inside video mode. Photo pipelines only run in photo mode.
    if (settings.mode !== 'photo') return;
    if (phaseRef.current !== 'ready' || !cameraRef.current) return;
    phaseRef.current = 'capturing';
    setPhase('capturing');
    let useScreenFlash = false;
    // Hoisted so the failure catch can reclaim the raw capture file.
    let capturedUri: string | null = null;
    try {
      // Anti-shake FIRST — the screen flash must never blind the user for the
      // whole steady-wait (up to 4s).
      if (settings.antiShake) {
        const wait = await waitForSteady();
        if (wait.canceled) return;
      }

      useScreenFlash = facing === 'front' && settings.flashMode !== 'off';
      if (useScreenFlash) {
        setScreenFlashArmed(true);
        await new Promise((r) => setTimeout(r, 150)); // let the white overlay land
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        exif: true,
        shutterSound: settings.shutterSound,
      });
      if (!photo?.uri) throw new Error('capture returned no uri');
      // The flash lit the sensor — end the white-out now, not after the whole
      // develop/save pipeline (which can take seconds and blinds the user).
      if (useScreenFlash) {
        setScreenFlashArmed(false);
        useScreenFlash = false;
      }
      phaseRef.current = 'saving';
      setPhase('saving');

      const coords = await fetchCoords();
      capturedUri = photo.uri;
      const frame: CapturedFrame = {
        uri: capturedUri,
        width: photo.width ?? 0,
        height: photo.height ?? 0,
        orientation: (photo.exif as { Orientation?: number } | undefined)?.Orientation,
      };

      // Process the main shot AND every AEB variant BEFORE archiving anything —
      // archiving moves cache files, which would starve the remaining variants.
      // All variants share one segmentation (identical geometry).
      const sharedMask: { promise: Promise<DepthMask | null> | null } = { promise: null };
      const results: { shot: CapturedFrame; meta: { ev: number; aeb: boolean } }[] = [];
      results.push({ shot: await processCapture(frame, ev, sharedMask), meta: { ev, aeb: false } });
      if (settings.aeb) {
        for (const bracket of [-0.7, 0.7]) {
          try {
            results.push({
              shot: await processCapture(frame, ev + bracket, sharedMask),
              meta: { ev: ev + bracket, aeb: true },
            });
          } catch (e) {
            rlog('[camen] aeb variant failed:', e);
          }
        }
      }

      // Archive everything, then reclaim the cache (original + intermediates).
      // The repository COPIES sources into the archive, so this delete is a
      // pure cache reclaim (deleteAsync is idempotent anyway). Each variant
      // saves in its own try — one failed insert must not abort the remaining
      // AEB brackets (they were already captured and processed).
      const retained = new Set<string>();
      const rerouted = new Set<string>();
      let savedCount = 0;
      let saveFailed = false;
      try {
        for (const r of results) {
          try {
            // AEB brackets are geotagged like the center shot — a failed EXIF
            // pass on one variant must not silently untag the other two.
            await saveShot(r.shot, coords, r.meta);
            savedCount++;
            await r.shot.dispose?.();
            if (r.shot.uri !== frame.uri) void FileSystem.deleteAsync(r.shot.uri, { idempotent: true }).catch(() => {});
          } catch (e) {
            if (e instanceof SaveReroutedError) {
              // The journal points at a rerouted GPS copy — this variant's
              // capture file is redundant, BUT only after the remaining
              // brackets had their chance to save from it (they share it
              // when no processing stage ran). Reclaim after the loop.
              rerouted.add(r.shot.uri);
            } else {
              retained.add(r.shot.uri);
            }
            rlog('[camen] save failed:', e);
            saveFailed = true;
            // Reclaim this variant's intermediates, but keep the shot file
            // itself: an unarchived save leaves a journal that still points
            // at it for recovery.
            await r.shot.dispose?.([r.shot.uri]);
          }
        }
        // Rerouted capture files are only reclaimed once nothing else reads
        // them: a still-retained URI belongs to a failed non-rerouted save.
        for (const uri of rerouted) {
          if (!retained.has(uri)) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        }
        if (settings.aeb && savedCount > 1) showToast(`AEB ×${savedCount} saved`);
        if (saveFailed) {
          setSaveError(true);
          showToast('Save failed');
        }
      } finally {
        if (!retained.has(frame.uri)) void FileSystem.deleteAsync(frame.uri, { idempotent: true }).catch(() => {});
      }
    } catch (e) {
      rlog('[camen] capture failed:', e);
      // The archive loop never ran, so nothing here is a recovery source —
      // reclaim the raw capture file too.
      if (typeof capturedUri === 'string') {
        void FileSystem.deleteAsync(capturedUri, { idempotent: true }).catch(() => {});
      }
      showToast('Capture failed');
    } finally {
      if (useScreenFlash) setScreenFlashArmed(false);
      phaseRef.current = 'ready';
      setPhase('ready');
    }
  }, [
    ev,
    facing,
    fetchCoords,
    processCapture,
    saveShot,
    settings.aeb,
    settings.antiShake,
    settings.flashMode,
    settings.mode,
    settings.shutterSound,
    showToast,
    waitForSteady,
  ]);

  // A save failure pulses the shutter's danger ring briefly, then clears.
  useEffect(() => {
    if (!saveError) return;
    const t = setTimeout(() => setSaveError(false), 2500);
    return () => clearTimeout(t);
  }, [saveError]);

  // ---- countdown ------------------------------------------------------------
  // Fire through a ref so the countdown always uses the CURRENT capture
  // (EV/preset changes made while counting down must apply).
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  const cancelCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    KeepAwake.deactivateKeepAwake();
    setCountdown(IDLE_COUNTDOWN);
  }, []);

  const startCountdown = useCallback(
    (seconds: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const total = seconds * 1000;
      const endAt = Date.now() + total;
      tickRef.current = seconds + 1;
      // remaining/total are both milliseconds — the ring stroke divides them.
      setCountdown({ active: true, total, remaining: total });
      void KeepAwake.activateKeepAwakeAsync().catch(() => {});
      intervalRef.current = setInterval(() => {
        const remainingMs = Math.max(0, endAt - Date.now());
        const sec = Math.ceil(remainingMs / 1000);
        if (sec !== tickRef.current) {
          tickRef.current = sec;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
        if (remainingMs <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          KeepAwake.deactivateKeepAwake();
          setCountdown(IDLE_COUNTDOWN);
          void captureRef.current();
        } else {
          setCountdown({ active: true, total, remaining: remainingMs });
        }
      }, 50);
    },
    [],
  );

  const switchFacing = useCallback(() => {
    // Lens switches are only safe from the idle state: mid-recording they
    // orphan the record promise, mid-burst/capture they race the native
    // session, and a countdown would fire the stale lens's closure.
    if (phaseRef.current !== 'ready') return;
    const next = facing === 'back' ? 'front' : 'back';
    if (next === 'front' ? !profile.hasFront : !profile.hasBack) return;
    if (intervalRef.current) cancelCountdown();
    clearFocus(); // a focus lock on the old lens means nothing on the new one
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    patch({ facing: next });
  }, [cancelCountdown, clearFocus, facing, patch, profile]);

  // ---- rapid fire ------------------------------------------------------------
  const startBurst = useCallback(() => {
    if (burstActiveRef.current || phaseRef.current !== 'ready' || !cameraRef.current) return;
    burstActiveRef.current = true;
    // Own the capture lock for the whole acquisition — an unlocked burst let a
    // second tap interleave another native capture against the same session.
    phaseRef.current = 'capturing';
    setPhase('capturing');
    setBurst({ active: true, count: 0 });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    (async () => {
      const collected: CapturedFrame[] = [];
      while (burstActiveRef.current && collected.length < BURST_MAX && cameraRef.current) {
        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.92,
            exif: true,
            shutterSound: settings.shutterSound,
          });
          if (!photo?.uri) break;
          collected.push({
            uri: photo.uri,
            width: photo.width ?? 0,
            height: photo.height ?? 0,
          });
          setBurst({ active: true, count: collected.length });
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        } catch {
          break;
        }
      }
      burstActiveRef.current = false;
      setBurst({ active: false, count: 0 });

      // Full-resolution originals, saved after release — no crop/grade during
      // bursts (speed priority, documented in plan/plan15.md). `raw: true`
      // keeps the SQLite log honest about what these files are.
      phaseRef.current = 'saving';
      setPhase('saving');
      const coords = await fetchCoords();
      for (const frame of collected) {
        try {
          await saveShot(frame, coords, { ev: 0, aeb: false, raw: true });
          void FileSystem.deleteAsync(frame.uri, { idempotent: true }).catch(() => {});
        } catch (e) {
          rlog('[camen] burst save failed:', e);
          // A rerouted failure keeps its GPS journal source; this capture
          // file is not shared (bursts never AEB) and can go right away.
          if (e instanceof SaveReroutedError) {
            void FileSystem.deleteAsync(frame.uri, { idempotent: true }).catch(() => {});
          }
          setSaveError(true);
        }
      }
      if (collected.length > 0) showToast(`Rapid ×${collected.length}`);
      phaseRef.current = 'ready';
      setPhase('ready');
    })();
  }, [fetchCoords, saveShot, settings.shutterSound, showToast]);

  // ---- video recording -------------------------------------------------------
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Session token: stopRecording() bumps it so a permission chain that is
  // still starting up aborts instead of rolling film nobody asked for.
  const videoSessionRef = useRef(0);

  const stopRecordTimer = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setRecordSeconds(0);
  }, []);

  /**
   * Starts recording. The promise chain resolves after `stopRecording()` —
   * the camera stays in `recording` phase until the file lands in the archive.
   * Videos record ungraded (sensor output); grading is a photo develop concept.
   * Recording requires the microphone permission even for muted capture —
   * the native record call refuses without it.
   */
  const startRecording = useCallback(() => {
    if (phaseRef.current !== 'ready' || !cameraRef.current) return;
    const session = ++videoSessionRef.current;
    phaseRef.current = 'recording';
    setPhase('recording');
    setRecording(true);
    setRecordSeconds(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    (async () => {
      try {
        const mic = await Camera.getMicrophonePermissionsAsync();
        if (!mic.granted) {
          const req = await Camera.requestMicrophonePermissionsAsync();
          if (!req.granted) {
            showToast('Mic permission needed for video');
            setRecording(false);
            stopRecordTimer();
            phaseRef.current = 'ready';
            setPhase('ready');
            return;
          }
        }
      } catch {
        // permission check unavailable — let the native call decide
      }
      // A stop pressed while the permission chain was running must win: never
      // call recordAsync for an already-cancelled session.
      if (videoSessionRef.current !== session) {
        setRecording(false);
        stopRecordTimer();
        phaseRef.current = 'ready';
        setPhase('ready');
        return;
      }
      recordStartRef.current = Date.now();
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - recordStartRef.current) / 1000));
      }, 500);
      let vid: Awaited<ReturnType<NonNullable<typeof cameraRef.current>['recordAsync']>> | null =
        null;
      try {
        vid = await cameraRef.current!.recordAsync({ maxDuration: 60 * 10 });
      } catch (e) {
        rlog('[camen] record failed:', e);
      }
      stopRecordTimer();
      setRecording(false);
      if (!vid?.uri) {
        showToast('Record failed');
        setSaveError(true);
        phaseRef.current = 'ready';
        setPhase('ready');
        return;
      }
      phaseRef.current = 'saving';
      setPhase('saving');
      const durationMs = Date.now() - recordStartRef.current;
      const coords = await fetchCoords();
      try {
        await saveShot(
          { uri: vid.uri, width: 0, height: 0 },
          coords,
          { ev: 0, aeb: false, raw: true },
          { mediaType: 'video', durationMs },
        );
        void FileSystem.deleteAsync(vid.uri, { idempotent: true }).catch(() => {});
      } catch (e) {
        rlog('[camen] video save failed:', e);
        setSaveError(true);
        showToast('Save failed');
      } finally {
        phaseRef.current = 'ready';
        setPhase('ready');
      }
    })();
  }, [fetchCoords, saveShot, showToast, stopRecordTimer]);

  const stopRecording = useCallback(() => {
    // Invalidate any startup still in its permission chain, then stop the
    // native recorder (a no-op when recording never actually began).
    videoSessionRef.current++;
    cameraRef.current?.stopRecording();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  // ---- shutter ------------------------------------------------------------
  const onShutter = useCallback(() => {
    // Video mode: the shutter toggles recording — timer/rapid/anti-shake are
    // photo-only concepts.
    if (settings.mode === 'video') {
      if (phaseRef.current === 'recording') {
        stopRecording();
        return;
      }
      if (phaseRef.current !== 'ready') return;
      startRecording();
      return;
    }
    if (steady.active) {
      cancelSteady();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    if (countdown.active) {
      cancelCountdown();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    if (phaseRef.current !== 'ready') return;
    // The timer always wins over rapid fire — otherwise TIMER could never
    // fire while Rapid fire (default on) is enabled.
    if (settings.timerSeconds > 0) {
      startCountdown(settings.timerSeconds);
      return;
    }
    if (settings.rapidFire) {
      // A tap is a fully processed single shot; a sustained hold (≥260ms)
      // arms the rapid raw burst.
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null;
        startBurst();
      }, HOLD_TO_BURST_MS);
      return;
    }
    void capture();
  }, [
    cancelCountdown,
    cancelSteady,
    capture,
    countdown.active,
    settings.mode,
    settings.rapidFire,
    settings.timerSeconds,
    startBurst,
    startCountdown,
    startRecording,
    steady.active,
    stopRecording,
  ]);

  const onShutterRelease = useCallback(() => {
    if (settings.mode === 'video') return;
    if (tapTimerRef.current) {
      // Released before the hold threshold → processed single shot.
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      void capture();
      return;
    }
    burstActiveRef.current = false;
  }, [capture, settings.mode]);

  // ---- ring light ------------------------------------------------------------
  const ringMode: RingMode =
    phase === 'recording'
      ? 'firing'
      : phase === 'capturing' || phase === 'saving'
        ? 'firing'
        : countdown.active
          ? 'breath'
          : 'idle';
  const ringIntense = countdown.active && countdown.remaining <= 1000;

  const shutterBusy = phase !== 'ready';

  return {
    cameraRef,
    phase,
    shutterBusy,
    processing,
    onShutter,
    onShutterRelease,
    capture,
    facing,
    switchFacing,
    torch,
    toggleTorch,
    enableTorch,
    flashProp,
    screenFlash: screenFlashArmed,
    zoomRatio,
    setZoomRatio,
    commitZoom,
    countdown,
    cancelCountdown,
    ringMode,
    ringIntense,
    thumbUri,
    saveError,
    toast,
    ev,
    setEv,
    burst,
    steady,
    focus,
    focusAt,
    clearFocus,
    recording,
    recordSeconds,
    startRecording,
    stopRecording,
  };
}
