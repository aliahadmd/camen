import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type GridMode = 'off' | 'thirds' | 'golden';
export type FlashSetting = 'auto' | 'on' | 'off';

export type Settings = {
  grid: GridMode;
  flashMode: FlashSetting;
  facing: 'back' | 'front';
  filterId: string;
  /** Capture timer seconds; 0 = off. */
  timerSeconds: number;
  /** Mirror front-camera preview and captured selfie (what-you-see-is-what-you-get). */
  mirrorFront: boolean;
  /** Last zoom ratio used on the back camera, restored on switch. */
  zoomBackRatio: number;
  /** Edge Light level for front-camera selfies: 0 off, 1 low, 2 medium, 3 high. */
  edgeLight: number;
  /** Framing preset id (full / instagram / square / story / wechat / wide). */
  framing: string;
  /** Geo-tag captures with GPS coordinates. */
  location: boolean;
  /** Saved file format. */
  format: 'jpeg' | 'webp';
  /** Play the hardware shutter sound on capture. */
  shutterSound: boolean;
  /** Anti-shake: wait for a steady hold before capturing. */
  antiShake: boolean;
  /** Hold the shutter for a full-resolution burst. */
  rapidFire: boolean;
  /** Tone style: LDR (neutral) or HDR (lifted shadows, recovered highlights). */
  tone: 'ldr' | 'hdr';
  /** Auto-exposure bracketing: save −EV / 0 / +EV variants of each shot. */
  aeb: boolean;
  /** Simulated ISO. 0 = auto (no gain). */
  iso: number;
};

export const DEFAULT_SETTINGS: Settings = {
  grid: 'off',
  flashMode: 'auto',
  facing: 'back',
  filterId: 'none',
  timerSeconds: 0,
  mirrorFront: true,
  zoomBackRatio: 1,
  edgeLight: 0,
  framing: 'full',
  location: false,
  format: 'jpeg',
  shutterSound: true,
  antiShake: false,
  rapidFire: true,
  tone: 'ldr',
  aeb: false,
  iso: 0,
};

const STORAGE_KEY = 'camen.settings.v1';

type SettingsContextValue = {
  settings: Settings | null;
  patch: (partial: Partial<Settings>) => void;
};

const Ctx = createContext<SettingsContextValue>({ settings: null, patch: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const latest = useRef<Settings | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let loaded: Settings = { ...DEFAULT_SETTINGS };
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) loaded = { ...loaded, ...(JSON.parse(raw) as Partial<Settings>) };
      } catch {
        // corrupted store — fall back to defaults
      }
      if (!alive) return;
      latest.current = loaded;
      setSettings(loaded);
    })();
    return () => {
      alive = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const patch = useCallback((partial: Partial<Settings>) => {
    const base = latest.current;
    if (!base) return;
    const next = { ...base, ...partial };
    latest.current = next;
    setSettings(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    }, 300);
  }, []);

  return <Ctx.Provider value={{ settings, patch }}>{children}</Ctx.Provider>;
}

export const useSettings = (): SettingsContextValue => useContext(Ctx);
