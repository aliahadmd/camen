import type { DevelopOptions } from './gradePhoto';
import { isRecord, sanitizeDevelopOptions } from './developValidation';

export type UserPreset = { id: string; name: string; develop: DevelopOptions };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
const KEY = 'camen.userpresets.v1';

export function createPresetStore(storage: Storage, now = Date.now) {
  let cached: UserPreset[] = [];
  let sequence = 0;
  // Set when the stored blob exists but cannot be parsed. Writes then REFUSE:
  // persisting an emptied list would destroy every saved preset after one
  // truncated write. The corrupt blob is left untouched for manual recovery.
  let corrupt = false;
  let chain: Promise<unknown> = Promise.resolve();
  const serialize = <T>(job: () => Promise<T>): Promise<T> => {
    const next = chain.then(job, job);
    chain = next.catch(() => {});
    return next;
  };
  const snapshot = () => JSON.parse(JSON.stringify(cached)) as UserPreset[];
  const read = async (): Promise<UserPreset[]> => {
    const raw = await storage.getItem(KEY);
    if (raw === null) {
      corrupt = false;
      return [];
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { corrupt = true; return []; }
    if (!Array.isArray(parsed)) {
      corrupt = true;
      return [];
    }
    corrupt = false;
    const ids = new Set<string>();
    return parsed.flatMap((p): UserPreset[] => {
      if (!isRecord(p) || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string' || !isRecord(p.develop)) return [];
      ids.add(p.id);
      return [{ id: p.id, name: p.name, develop: sanitizeDevelopOptions(p.develop) }];
    });
  };
  const assertWritable = (): void => {
    if (corrupt) throw new Error('Preset storage is corrupt — write refused to preserve data');
  };
  return {
    load: snapshot,
    refresh: () => serialize(async () => { cached = await read(); return snapshot(); }),
    save: (name: string, develop: DevelopOptions) => serialize(async () => {
      const list = await read();
      assertWritable();
      let id: string;
      do { id = `u${now()}-${++sequence}`; } while (list.some((p) => p.id === id));
      const preset = { id, name: name.trim() || `Preset ${list.length + 1}`, develop: sanitizeDevelopOptions(develop) };
      const next = [...list, preset];
      await storage.setItem(KEY, JSON.stringify(next));
      cached = next;
      return JSON.parse(JSON.stringify(preset)) as UserPreset;
    }),
    delete: (id: string) => serialize(async () => {
      await read();
      assertWritable();
      const next = cached.filter((p) => p.id !== id);
      await storage.setItem(KEY, JSON.stringify(next));
      cached = next;
    }),
  };
}
