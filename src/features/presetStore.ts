import type { DevelopOptions } from './gradePhoto';
import { isRecord, sanitizeDevelopOptions } from './developValidation';

export type UserPreset = { id: string; name: string; develop: DevelopOptions };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
const KEY = 'camen.userpresets.v1';

export function createPresetStore(storage: Storage, now = Date.now) {
  let cached: UserPreset[] = [];
  let sequence = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const serialize = <T>(job: () => Promise<T>): Promise<T> => {
    const next = chain.then(job, job);
    chain = next.catch(() => {});
    return next;
  };
  const snapshot = () => JSON.parse(JSON.stringify(cached)) as UserPreset[];
  const read = async () => {
    const raw = await storage.getItem(KEY);
    let parsed: unknown;
    try { parsed = raw ? JSON.parse(raw) : []; } catch { parsed = []; }
    const ids = new Set<string>();
    return (Array.isArray(parsed) ? parsed : []).flatMap((p): UserPreset[] => {
      if (!isRecord(p) || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string' || !isRecord(p.develop)) return [];
      ids.add(p.id);
      return [{ id: p.id, name: p.name, develop: sanitizeDevelopOptions(p.develop) }];
    });
  };
  return {
    load: snapshot,
    refresh: () => serialize(async () => { cached = await read(); return snapshot(); }),
    save: (name: string, develop: DevelopOptions) => serialize(async () => {
      const list = await read();
      let id: string;
      do { id = `u${now()}-${++sequence}`; } while (list.some((p) => p.id === id));
      const preset = { id, name: name.trim() || `Preset ${list.length + 1}`, develop: sanitizeDevelopOptions(develop) };
      const next = [...list, preset];
      await storage.setItem(KEY, JSON.stringify(next));
      cached = next;
      return JSON.parse(JSON.stringify(preset)) as UserPreset;
    }),
    delete: (id: string) => serialize(async () => {
      const next = (await read()).filter((p) => p.id !== id);
      await storage.setItem(KEY, JSON.stringify(next));
      cached = next;
    }),
  };
}
