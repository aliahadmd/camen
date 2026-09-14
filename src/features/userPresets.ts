import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DevelopOptions } from './gradePhoto';

/**
 * User-defined presets — any develop configuration the user saves under a
 * name. These live in AsyncStorage (not the built-in list) and behave exactly
 * like built-ins: selecting one loads its values into the manual controls.
 */
export type UserPreset = {
  /** `u<timestamp>` — stable id, also used in shot logs as `user:<id>`. */
  id: string;
  name: string;
  develop: DevelopOptions;
};

const KEY = 'camen.userpresets.v1';

export function loadUserPresets(): UserPreset[] {
  // Synchronous callers (picker render) get a cached list; keep it fresh via
  // the async loader on mount.
  return cached;
}

let cached: UserPreset[] = [];

export async function refreshUserPresets(): Promise<UserPreset[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as UserPreset[]) : [];
  } catch {
    cached = [];
  }
  return cached;
}

export async function saveUserPreset(name: string, develop: DevelopOptions): Promise<UserPreset> {
  const list = await refreshUserPresets();
  const preset: UserPreset = {
    id: `u${Date.now()}`,
    name: name.trim() || `Preset ${list.length + 1}`,
    develop: JSON.parse(JSON.stringify(develop)),
  };
  cached = [...list, preset];
  await AsyncStorage.setItem(KEY, JSON.stringify(cached));
  return preset;
}

export async function deleteUserPreset(id: string): Promise<void> {
  cached = (await refreshUserPresets()).filter((p) => p.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(cached));
}

/** Display name for a shot logged against a user preset (`user:<id>`). */
export function userPresetName(loggedId: string): string | null {
  if (!loggedId.startsWith('user:')) return null;
  const id = loggedId.slice(5);
  return cached.find((p) => p.id === id)?.name ?? 'My preset';
}
