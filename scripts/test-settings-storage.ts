import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) { if (specifier.startsWith('.')) return next(`${specifier}.ts`, context); throw error; }
} });
const { createPresetStore } = await import('../src/features/presetStore.ts');
const { loadSettingsValue } = await import('../src/features/settingsValidation.ts');
const { hasEffectiveDevelop, sanitizeDevelopOptions } = await import('../src/features/developValidation.ts');
const defaults = { facing: 'back', mode: 'photo', preset: 'standard', presetSub: 'standard', develop: {}, timerSeconds: 0, iso: 0, zoomBackRatio: 1, edgeLight: 0, location: false } as any;
for (const bad of [null, 1, 'bad', [], true]) assert.deepEqual(loadSettingsValue(bad, defaults, () => ({})), defaults);
const valid = loadSettingsValue({ preset: 42, develop: { temperatureSplit: { shadow: [1], highlight: null, strength: 1 }, exposure: 'bad', bw: true }, location: 'yes', zoomBackRatio: -5 }, defaults, () => ({}));
assert.deepEqual(valid.develop, { bw: true });
assert.equal(valid.location, false);
assert.equal(valid.zoomBackRatio, 1);
assert.deepEqual(loadSettingsValue({ preset: 'night', tone: 'hdr' }, defaults, () => ({ exposure: 0.3 })).develop, { exposure: 0.3, hdr: true });
for (const recipe of [{}, { hdr: false }, { exposure: 0 }, { saturation: 1 }, { bokeh: 0.7 }, { splitStrength: 0.5 }]) assert.equal(hasEffectiveDevelop(recipe), false);
for (const recipe of [{ ev: 2.7 }, { iso: 200 }, { bw: true }, { temperature: 0.1 }]) assert.equal(hasEffectiveDevelop(recipe), true);
assert.deepEqual(sanitizeDevelopOptions({ splitShadow: [0, NaN, 0], grain: Infinity }), {});
let data: string | null = null;
let fail = false;
const store = createPresetStore({ getItem: async () => data, setItem: async (_key, value) => { if (fail) throw new Error('disk full'); data = value; } }, () => 1);
const [a, b] = await Promise.all([store.save('A', {}), store.save('B', { bw: true })]);
assert.notEqual(a.id, b.id);
assert.equal(store.load().length, 2);
fail = true;
await assert.rejects(store.delete(a.id), /disk full/);
assert.equal(store.load().length, 2);
await assert.rejects(store.save('C', {}), /disk full/);
assert.equal(store.load().length, 2);
fail = false;
await Promise.all([store.delete(a.id), store.delete(b.id)]);
assert.deepEqual(store.load(), []);
// A corrupt blob must never be overwritten by an emptied list — writes refuse
// until the storage reads as valid JSON again.
data = '{truncated';
const guarded = createPresetStore({ getItem: async () => data, setItem: async (_key, value) => { data = value; } }, () => 1);
await assert.rejects(guarded.save('X', {}), /corrupt/);
await assert.rejects(guarded.delete('whatever'), /corrupt/);
assert.equal(data, '{truncated', 'corrupt blob stays untouched');
assert.deepEqual(guarded.load(), []);
data = '[{"id":"u1-1","name":"Kept","develop":{}}]';
assert.deepEqual(guarded.load(), []); // stale cache until refresh
assert.equal((await guarded.refresh())[0].name, 'Kept');
await guarded.save('Y', {});
assert.equal(JSON.parse(data!).length, 2, 'writes resume once the blob is valid');
// A preset id that resolves to nothing must not survive hydration.
const coerced = loadSettingsValue({ preset: 'ghost', presetSub: 'nope' }, defaults, () => ({}));
assert.equal(coerced.preset, 'standard');
assert.equal(coerced.presetSub, 'standard');
assert.equal(loadSettingsValue({ preset: 'night' }, defaults, () => ({})).preset, 'night');
assert.equal(loadSettingsValue({ preset: 'user:u1-1' }, defaults, () => ({})).preset, 'user:u1-1');
console.log('Settings/storage regressions passed: malformed JSON, migration, neutral recipes, concurrent writes, cache rollback, corrupt-blob guard, preset-id validation.');
