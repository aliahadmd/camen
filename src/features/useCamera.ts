import { CameraView, type FlashMode } from 'expo-camera';
import * as Brightness from 'expo-brightness';
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
import { useCallback, useEffect, useRef, useState } from 'react';

import { clampRatio, type DeviceProfile } from './deviceProfile';
import { getPreset, hasGrade } from './filters';
import { cropToAspect, developPhoto } from './gradePhoto';
import { getFraming } from './framings';
import { presetRecipe } from './presets';
import { injectGpsExif } from './geotag';
import { insertShot, latestShot } from '../data/db';
import { dlog } from '../log';
import type { Settings } from './settings';

export type Phase = 'ready' | 'capturing' | 'saving';
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
  /** Cache files created while processing that the caller should delete after archiving. */
  extras?: string[];
};

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
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [screenFlashArmed, setScreenFlashArmed] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstActiveRef = useRef(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const facing = settings.facing;

  // ---- zoom -------------------------------------------------------------
  const [zoomRatio, setZoomRatioState] = useState(() =>
    settings.facing === 'front' ? 1 : settings.zoomBackRatio,
  );

  useEffect(() => {
    // Reset sensibly on lens switch: front is fixed 1x, back restores its last value.
    setZoomRatioState(facing === 'front' ? 1 : settings.zoomBackRatio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const setZoomRatio = useCallback(
    (ratio: number) => {
      setZoomRatioState(clampRatio(profile, ratio));
    },
    [profile],
  );

  const commitZoom = useCallback(() => {
    if (facing === 'back') patch({ zoomBackRatio: clampRatio(profile, zoomRatio) });
  }, [facing, patch, profile, zoomRatio]);

  const setEv = useCallback((value: number) => {
    setEvState(Math.min(2, Math.max(-2, Math.round(value * 4) / 4)));
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

  const archiveShot = useCallback(
    async (cacheUri: string, ext: string): Promise<{ path: string; size: number }> => {
      const docDir = FileSystem.documentDirectory;
      if (!docDir) throw new Error('no document directory');
      const dir = `${docDir}camen`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const d = new Date();
      const p = (n: number, len = 2) => String(n).padStart(len, '0');
      // Millisecond precision + collision walk: burst/AEB saves can land in
      // the same second, and a duplicate name would silently overwrite a shot.
      const base = `CAM_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${p(d.getMilliseconds(), 3)}`;
      let dest = `${dir}/${base}.${ext}`;
      let n = 1;
      while ((await FileSystem.getInfoAsync(dest)).exists) {
        dest = `${dir}/${base}-${n}.${ext}`;
        n++;
      }
      try {
        await FileSystem.moveAsync({ from: cacheUri, to: dest });
      } catch {
        await FileSystem.copyAsync({ from: cacheUri, to: dest });
      }
      const info = await FileSystem.getInfoAsync(dest);
      return { path: dest, size: info.exists ? (info.size ?? 0) : 0 };
    },
    [],
  );

  const makeThumb = useCallback(async (src: string): Promise<string> => {
    const dir = `${FileSystem.documentDirectory}camen/thumbs`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const name = src.split('/').pop() ?? `t${Date.now()}.jpg`;
    const dest = `${dir}/${name}`;
    const thumb = await ImageManipulator.manipulateAsync(
      src,
      [{ resize: { width: 256 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );
    await FileSystem.moveAsync({ from: thumb.uri, to: dest }).catch(async () => {
      await FileSystem.copyAsync({ from: thumb.uri, to: dest });
    });
    return dest;
  }, []);

  useEffect(() => {
    void refreshThumbnail();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
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
   * format conversion. Every cache file created along the way that is not the
   * returned final is listed in `extras` so the caller can reclaim the cache
   * after archiving (the final itself is moved into the archive).
   */
  const processCapture = useCallback(
    async (photo: CapturedFrame, evOffset: number): Promise<CapturedFrame> => {
      const created: string[] = [];
      let fileUri = photo.uri;
      let w = photo.width;
      let h = photo.height;

      // jpeg-js ignores EXIF orientation — upright rotated captures first so
      // crop math and the grade operate on the displayed geometry.
      if (photo.orientation === 6 || photo.orientation === 8) {
        try {
          const rotated = await ImageManipulator.manipulateAsync(
            fileUri,
            [{ rotate: photo.orientation === 6 ? 90 : 270 }],
            { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG },
          );
          created.push(rotated.uri);
          fileUri = rotated.uri;
          const t = w;
          w = h;
          h = t;
        } catch (e) {
          dlog('[camen] orientation rotate failed:', e);
        }
      }

      const framing = getFraming(settings.framing);
      if (framing.aspect && w > 0 && h > 0) {
        try {
          const cropped = await cropToAspect(
            fileUri,
            w,
            h,
            framing.aspect,
            framing.maxLongEdge,
          );
          created.push(cropped.uri);
          fileUri = cropped.uri;
          w = cropped.width;
          h = cropped.height;
        } catch (e) {
          dlog('[camen] crop failed, keeping native aspect:', e);
        }
      }

      const preset = getPreset(settings.filterId);
      const recipe = presetRecipe(settings.preset, settings.presetSub);
      const needsDevelop =
        hasGrade(preset) || evOffset !== 0 || settings.iso > 100 || settings.tone === 'hdr' ||
        Object.keys(recipe).length > 0;
      if (needsDevelop) {
        setProcessing(true);
        try {
          const dev = await developPhoto(fileUri, w, h, preset.grade, {
            ev: evOffset,
            iso: settings.iso,
            tone: settings.tone,
            ...recipe,
          });
          created.push(dev.uri);
          fileUri = dev.uri;
          w = dev.width;
          h = dev.height;
        } catch (e) {
          dlog('[camen] develop failed, saving ungraded copy:', e);
          // Own a private copy: the original cache file must stay intact for
          // AEB variants of the same capture.
          const cacheDir = FileSystem.cacheDirectory;
          if (cacheDir) {
            try {
              const fallback = `${cacheDir}camen_fallback_${Date.now()}.jpg`;
              await FileSystem.copyAsync({ from: photo.uri, to: fallback });
              created.push(fallback);
              fileUri = fallback;
              w = photo.width;
              h = photo.height;
            } catch {
              fileUri = photo.uri; // last resort: archive the original itself
            }
          }
        } finally {
          setProcessing(false);
        }
      }

      if (settings.format === 'webp') {
        try {
          const converted = await ImageManipulator.manipulateAsync(fileUri, [], {
            compress: 0.9,
            format: ImageManipulator.SaveFormat.WEBP,
          });
          created.push(converted.uri);
          fileUri = converted.uri;
        } catch (e) {
          dlog('[camen] webp conversion failed:', e);
        }
      }

      return { uri: fileUri, width: w, height: h, extras: created.filter((u) => u !== fileUri) };
    },
    [
      settings.framing,
      settings.filterId,
      settings.format,
      settings.iso,
      settings.tone,
      // preset + sub MUST be listed: without them a preset change keeps using
      // the previous recipe until some other setting happens to change.
      settings.preset,
      settings.presetSub,
    ],
  );

  /** Archive → EXIF GPS → thumb → gallery export → SQLite row. */
  const saveShot = useCallback(
    async (
      shot: CapturedFrame,
      coords: { lat: number; lon: number } | null,
      meta: { ev: number; aeb: boolean; raw?: boolean },
    ): Promise<void> => {
      // Trust the actual file bytes, not the setting — a failed webp
      // conversion must never archive JPEG data under a .webp name.
      const ext = shot.uri.split('.').pop()?.toLowerCase() === 'webp' ? 'webp' : 'jpg';
      const { path, size } = await archiveShot(shot.uri, ext);
      if (coords) {
        dlog('[camen] geotag', coords.lat.toFixed(5), coords.lon.toFixed(5));
        try {
          await injectGpsExif(path, coords.lat, coords.lon);
        } catch (e) {
          dlog('[camen] gps exif failed:', e);
        }
      }
      let thumbPath = '';
      try {
        thumbPath = await makeThumb(path);
      } catch {
        // thumb is a convenience — never blocks the save
      }
      let galleryUri: string | null = null;
      try {
        const asset = await MediaLibrary.createAssetAsync(path);
        galleryUri = asset?.uri ?? null;
      } catch (e) {
        dlog('[camen] gallery export failed:', e);
      }
      // `raw` marks speed-priority burst originals: no crop, no filter grade,
      // no preset recipe touched them — the log must not claim otherwise.
      insertShot({
        created_at: Date.now(),
        path,
        thumb_path: thumbPath,
        gallery_uri: galleryUri,
        filter_id: meta.raw ? 'none' : settings.filterId,
        facing,
        width: shot.width,
        height: shot.height,
        size_bytes: size,
        flash_mode: settings.flashMode,
        zoom_ratio: facing === 'back' ? zoomRatio : 1,
        timer_seconds: settings.timerSeconds,
        edge_light: settings.edgeLight,
        device: 'Redmi K80 Pro',
        framing: meta.raw ? 'full' : settings.framing,
        preset_id: meta.raw ? 'standard' : settings.preset,
        preset_sub: meta.raw ? 'standard' : settings.presetSub,
        ev: meta.ev,
        iso: meta.raw ? 0 : settings.iso,
        tone: meta.raw ? 'ldr' : settings.tone,
        aeb: meta.aeb ? 1 : 0,
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (!meta.aeb) showToast('Saved');
      setSaveError(false);
      void refreshThumbnail();
    },
    [
      archiveShot,
      facing,
      makeThumb,
      refreshThumbnail,
      settings.edgeLight,
      settings.filterId,
      settings.flashMode,
      settings.framing,
      settings.iso,
      settings.preset,
      settings.presetSub,
      settings.timerSeconds,
      settings.tone,
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
        if (ok || now - start > STEADY_TIMEOUT_MS) {
          finish({ canceled: false });
        }
      });
    });
  }, []);

  // ---- capture ------------------------------------------------------------
  const capture = useCallback(async () => {
    if (phaseRef.current !== 'ready' || !cameraRef.current) return;
    phaseRef.current = 'capturing';
    setPhase('capturing');
    let useScreenFlash = false;
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
      phaseRef.current = 'saving';
      setPhase('saving');

      const coords = await fetchCoords();
      const frame: CapturedFrame = {
        uri: photo.uri,
        width: photo.width ?? 0,
        height: photo.height ?? 0,
        orientation: (photo.exif as { Orientation?: number } | undefined)?.Orientation,
      };

      // Process the main shot AND every AEB variant BEFORE archiving anything —
      // archiving moves cache files, which would starve the remaining variants.
      const results: { shot: CapturedFrame; meta: { ev: number; aeb: boolean } }[] = [];
      results.push({ shot: await processCapture(frame, ev), meta: { ev, aeb: false } });
      if (settings.aeb) {
        for (const bracket of [-0.7, 0.7]) {
          try {
            results.push({
              shot: await processCapture(frame, ev + bracket),
              meta: { ev: ev + bracket, aeb: true },
            });
          } catch (e) {
            dlog('[camen] aeb variant failed:', e);
          }
        }
      }

      // Archive everything, then reclaim the cache (original + intermediates).
      // Archived finals were moved away; deleteAsync is idempotent anyway.
      const cleanup = [frame.uri, ...results.flatMap((r) => r.shot.extras ?? [])];
      try {
        for (const r of results) {
          await saveShot(r.shot, r.meta.aeb ? null : coords, r.meta);
        }
        if (settings.aeb && results.length === 3) showToast('AEB ×3 saved');
      } catch (e) {
        dlog('[camen] save failed:', e);
        setSaveError(true);
        showToast('Save failed');
      } finally {
        for (const uri of cleanup) {
          void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        }
      }
    } catch (e) {
      dlog('[camen] capture failed:', e);
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
      setCountdown({ active: true, total, remaining: seconds });
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
          setCountdown({ active: true, total, remaining: remainingMs / 1000 });
        }
      }, 50);
    },
    [],
  );

  const switchFacing = useCallback(() => {
    const next = facing === 'back' ? 'front' : 'back';
    if (next === 'front' ? !profile.hasFront : !profile.hasBack) return;
    if (intervalRef.current) cancelCountdown();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    patch({ facing: next });
  }, [cancelCountdown, facing, patch, profile]);

  // ---- rapid fire ------------------------------------------------------------
  const startBurst = useCallback(() => {
    if (burstActiveRef.current || phaseRef.current !== 'ready' || !cameraRef.current) return;
    burstActiveRef.current = true;
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
        } catch (e) {
          dlog('[camen] burst save failed:', e);
          setSaveError(true);
        }
      }
      if (collected.length > 0) showToast(`Rapid ×${collected.length}`);
      phaseRef.current = 'ready';
      setPhase('ready');
    })();
  }, [fetchCoords, saveShot, settings.shutterSound, showToast]);

  // ---- shutter ------------------------------------------------------------
  const onShutter = useCallback(() => {
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
    settings.rapidFire,
    settings.timerSeconds,
    startBurst,
    startCountdown,
    steady.active,
  ]);

  const onShutterRelease = useCallback(() => {
    if (tapTimerRef.current) {
      // Released before the hold threshold → processed single shot.
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      void capture();
      return;
    }
    burstActiveRef.current = false;
  }, [capture]);

  // ---- ring light ------------------------------------------------------------
  const ringMode: RingMode =
    phase === 'capturing' || phase === 'saving'
      ? 'firing'
      : countdown.active
        ? 'breath'
        : 'idle';
  const ringIntense = countdown.active && countdown.remaining <= 1;

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
    ringMode,
    ringIntense,
    thumbUri,
    saveError,
    toast,
    ev,
    setEv,
    burst,
    steady,
  };
}
