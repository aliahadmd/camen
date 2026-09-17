import type { DevelopOptions } from './gradePhoto';

/** Pure persistence/processing contract; never import the native grading runtime. */
export const DEFAULT_DEVELOP_OPTIONS = Object.freeze({
  ev: 0, iso: 0, hdr: false, exposure: 0, contrast: 0, shadows: 0,
  highlights: 0, temperature: 0, saturation: 1, orangeSaturation: 1,
  microContrast: 0, sharpen: 0, rolloff: 0, vignette: 0, grain: 0,
  splitStrength: 0, bw: false, bokeh: 0, bgTone: 0, skinSmooth: 0,
  // Absent glow is dynamic: bokeh * 0.45. Explicit zero must survive storage.
  bokehGlow: undefined,
} satisfies DevelopOptions);

/** Bounds match manual controls; hidden recipe strengths are normalized 0…1. */
export const DEVELOP_NUMBER_RANGES = {
  ev: [-4, 4], iso: [0, 3200], exposure: [-0.5, 0.5], contrast: [-0.3, 0.5],
  shadows: [-1, 1], highlights: [0, 1], temperature: [-1, 1],
  saturation: [0, 1.5], orangeSaturation: [0.7, 1.1], microContrast: [0, 1],
  sharpen: [0, 1], rolloff: [0, 1], vignette: [0, 0.6], grain: [0, 1],
  splitStrength: [0, 1], bokeh: [0, 1], bokehGlow: [0, 1], bgTone: [-1, 1],
  skinSmooth: [0, 1],
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function rgb(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  // Index explicitly: Array.every skips holes.
  if (![0, 1, 2].every((i) => isNumberInRange(value[i], 0, 1))) return undefined;
  return [value[0], value[1], value[2]];
}

/** Drop invalid/unknown fields, not coerce or clamp corruption into active effects.
 * Preserve explicit neutral overrides and clone tuples (no caller-owned references).
 */
export function sanitizeDevelopOptions(value: unknown): DevelopOptions {
  if (!isRecord(value)) return {};
  const out: DevelopOptions = {};
  for (const key of Object.keys(DEVELOP_NUMBER_RANGES) as (keyof typeof DEVELOP_NUMBER_RANGES)[]) {
    const [min, max] = DEVELOP_NUMBER_RANGES[key];
    const n = value[key];
    if (isNumberInRange(n, min, max)) out[key] = n;
  }
  for (const key of ['hdr', 'bw'] as const) {
    if (typeof value[key] === 'boolean') out[key] = value[key];
  }
  for (const key of ['splitShadow', 'splitHighlight'] as const) {
    const color = rgb(value[key]);
    if (color) out[key] = color;
  }
  const split = value.temperatureSplit;
  if (isRecord(split)) {
    const shadow = rgb(split.shadow);
    const highlight = rgb(split.highlight);
    if (shadow && highlight && isNumberInRange(split.strength, 0, 1)) {
      out.temperatureSplit = { shadow, highlight, strength: split.strength };
    }
  }
  return out;
}

/** Canonical semantic recipe for comparison/processing decisions, NOT persistence.
 * Resolves legacy split aliases with the same precedence as developPhoto, removes
 * neutral scalars and inactive split/depth controls. No runtime Expo dependency.
 */
export function normalizeDevelopOptions(value: unknown): DevelopOptions {
  const d = sanitizeDevelopOptions(value);
  const out: DevelopOptions = {};
  for (const key of Object.keys(DEVELOP_NUMBER_RANGES) as (keyof typeof DEVELOP_NUMBER_RANGES)[]) {
    if (['splitStrength', 'bokehGlow', 'bgTone'].includes(key)) continue;
    const n = d[key];
    if (n !== undefined && n !== DEFAULT_DEVELOP_OPTIONS[key]) out[key] = n;
  }
  if ((out.iso ?? 0) <= 100) delete out.iso;
  if (d.hdr) out.hdr = true;
  if (d.bw) out.bw = true;
  const strength = d.splitStrength ?? d.temperatureSplit?.strength ?? 0;
  const shadow = d.splitShadow ?? d.temperatureSplit?.shadow;
  const highlight = d.splitHighlight ?? d.temperatureSplit?.highlight;
  if (strength > 0 && (shadow || highlight)) {
    out.splitStrength = strength;
    if (shadow) out.splitShadow = shadow;
    if (highlight) out.splitHighlight = highlight;
  }
  if ((d.bokeh ?? 0) > 0) {
    const glow = d.bokehGlow ?? d.bokeh! * 0.45;
    if (glow !== d.bokeh! * 0.45) out.bokehGlow = glow;
    if (d.bgTone) out.bgTone = d.bgTone;
  }
  return out;
}

/** Whether the tonal pass changes pixels. Depth-only recipes deliberately return
 * false; use scope='all' to include the separate portrait pass. Pass the FINAL
 * merged options ({ev, iso, ...recipe}) so overrides match developPhoto exactly.
 */
export function hasEffectiveDevelop(value: unknown, scope: 'tone' | 'all' = 'tone'): boolean {
  const d = normalizeDevelopOptions(value);
  if (scope === 'all' && (d.bokeh ?? 0) > 0) return true;
  delete d.bokeh;
  delete d.bokehGlow;
  delete d.bgTone;
  // EV and recipe exposure are additive; ISO > 100 also introduces grain.
  const exposure = (d.ev ?? 0) + (d.exposure ?? 0);
  delete d.ev;
  delete d.exposure;
  if (exposure !== 0) return true;
  if (d.bw) {
    delete d.saturation;
    delete d.orangeSaturation;
  }
  return Object.keys(d).length > 0;
}
