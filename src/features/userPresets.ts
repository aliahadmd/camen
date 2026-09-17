import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPresetStore } from './presetStore';
export type { UserPreset } from './presetStore';

const store = createPresetStore(AsyncStorage);
export const loadUserPresets = store.load;
export const refreshUserPresets = () => store.refresh().catch(() => store.load());
export const saveUserPreset = store.save;
export const deleteUserPreset = store.delete;

export function userPresetName(loggedId: string): string | null {
  if (!loggedId.startsWith('user:')) return null;
  return store.load().find((p) => p.id === loggedId.slice(5))?.name ?? 'My preset';
}
