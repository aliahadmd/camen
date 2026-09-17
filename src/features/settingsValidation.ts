import type { Settings } from './settings';
import type { DevelopOptions } from './gradePhoto';
import { isRecord, sanitizeDevelopOptions } from './developValidation';

export function loadSettingsValue(value: unknown, defaults: Settings, recipe: (preset: string, sub: string) => DevelopOptions): Settings {
  const raw = isRecord(value) ? value : {};
  const out = { ...defaults, develop: {} } as Settings;
  for (const key of ['location', 'mirrorFront', 'shutterSound', 'antiShake', 'rapidFire', 'aeb'] as const) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  const enums = {
    facing: ['front', 'back'], mode: ['photo', 'video'], format: ['jpeg', 'webp'],
    grid: ['off', 'thirds', 'golden'], flashMode: ['auto', 'on', 'off'],
    framing: ['full', 'instagram', 'square', 'story', 'wechat', 'wide'],
  };
  for (const key of Object.keys(enums) as (keyof typeof enums)[]) {
    const v = raw[key];
    if (typeof v === 'string' && enums[key].includes(v)) Object.assign(out, { [key]: v });
  }
  for (const [key, min, max] of [['timerSeconds', 0, 30], ['iso', 0, 3200], ['zoomBackRatio', 0.6, 10], ['edgeLight', 0, 3]] as const) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) out[key] = key === 'zoomBackRatio' ? v : Math.round(v);
  }
  for (const key of ['preset', 'presetSub'] as const) {
    if (typeof raw[key] === 'string' && raw[key].length > 0) out[key] = raw[key];
  }
  let develop: unknown = raw.develop;
  if (!Object.hasOwn(raw, 'develop')) {
    try { develop = recipe(out.preset, out.presetSub); } catch { develop = {}; }
  }
  out.develop = sanitizeDevelopOptions(develop);
  if (raw.tone === 'hdr') out.develop.hdr = true;
  return out;
}
