import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { Camera } from 'expo-camera';

/**
 * What the connected phone can actually do. Static facts come from the adb dump
 * of this exact device (plan/hardware-report.md); the runtime probe verifies them.
 */
export type DeviceProfile = {
  hasBack: boolean;
  hasFront: boolean;
  backFlash: 'led' | 'screen' | 'none';
  frontFlash: 'screen' | 'none';
  /** Real zoom ratio stops offered as UI presets (back camera). */
  zoomStops: number[];
  zoomMinRatio: number;
  zoomMaxRatio: number;
  /** Max capture resolution [w, h] per facing, from the HAL probe. */
  maxDims: { back: [number, number]; front: [number, number] };
  /** True once a runtime probe has confirmed the static data. */
  verified: boolean;
};

/** Redmi K80 Pro (`miro`) — probed 2026-09-12, see plan/hardware-report.md. */
export const REDMI_K80_PRO: DeviceProfile = {
  hasBack: true,
  hasFront: true,
  backFlash: 'led',
  frontFlash: 'screen',
  zoomStops: [0.6, 1, 2.5, 10],
  zoomMinRatio: 0.6,
  zoomMaxRatio: 10,
  verified: false,
  maxDims: { back: [4096, 3072], front: [2592, 1944] },
};

/** Emulator / probe-failure profile: fully usable, minimal controls. */
export const FALLBACK_PROFILE: DeviceProfile = {
  hasBack: true,
  hasFront: false,
  backFlash: 'led',
  frontFlash: 'screen',
  zoomStops: [1],
  zoomMinRatio: 1,
  zoomMaxRatio: 1,
  verified: false,
  maxDims: { back: [1920, 1440], front: [1280, 960] },
};

type RawCameraType = { type?: string } | string;

/**
 * Verify the static profile at runtime. expo-camera SDK 57 has no static
 * camera-enumeration API, so this is best-effort: if the API reappears it is
 * used, otherwise the static adb facts stand unverified.
 */
export async function probeDeviceProfile(): Promise<DeviceProfile> {
  try {
    const getTypes = (
      Camera as unknown as {
        getAvailableCameraTypesAsync?: () => Promise<RawCameraType[]>;
      }
    ).getAvailableCameraTypesAsync;
    if (typeof getTypes !== 'function') return { ...REDMI_K80_PRO };
    const types = await getTypes.call(Camera);
    let hasFront = false;
    let hasBack = false;
    for (const t of types ?? []) {
      const v = typeof t === 'string' ? t : t?.type;
      if (v === 'front') hasFront = true;
      if (v === 'back') hasBack = true;
    }
    if (!hasBack && !hasFront) return FALLBACK_PROFILE;
    return { ...REDMI_K80_PRO, hasBack, hasFront, verified: true };
  } catch {
    return { ...REDMI_K80_PRO };
  }
}

export const clampRatio = (p: DeviceProfile, r: number): number =>
  Math.min(p.zoomMaxRatio, Math.max(p.zoomMinRatio, r));

/** Expo's `zoom` prop is normalized 0…1 across the device range — convert. */
export const ratioToNormalized = (p: DeviceProfile, r: number): number => {
  const span = p.zoomMaxRatio - p.zoomMinRatio;
  return span > 0 ? (clampRatio(p, r) - p.zoomMinRatio) / span : 0;
};

export const normalizedToRatio = (p: DeviceProfile, z: number): number =>
  p.zoomMinRatio + Math.min(1, Math.max(0, z)) * (p.zoomMaxRatio - p.zoomMinRatio);

const Ctx = createContext<DeviceProfile>(REDMI_K80_PRO);

export function DeviceProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<DeviceProfile>(REDMI_K80_PRO);

  useEffect(() => {
    let alive = true;
    probeDeviceProfile().then((p) => {
      if (alive) setProfile(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  return <Ctx.Provider value={profile}>{children}</Ctx.Provider>;
}

export const useDeviceProfile = (): DeviceProfile => useContext(Ctx);
