/**
 * Capture presets (plan/plan18.md) — photographic styles baked at develop time.
 * A preset is a tonal recipe; the chosen color filter still layers its own
 * color cast on top. No beauty processing, no face reshaping — tonal only.
 *
 * Sub-presets are lighting/look variations within a preset
 * (e.g. Portrait → Nature Light / Studio Light / Contour Light).
 */
import type { DevelopOptions } from './gradePhoto';
import { loadUserPresets, type UserPreset } from './userPresets';

export type PresetSub = { id: string; name: string };

export type CapturePreset = {
  id: string;
  name: string;
  blurb: string;
  subs: PresetSub[];
  /** Develop recipe for each sub (keyed by sub id). */
  recipes: Record<string, DevelopOptions>;
};

export const CAPTURE_PRESETS: CapturePreset[] = [
  {
    id: 'standard',
    name: 'Standard',
    blurb: 'Neutral, straight out of the sensor',
    subs: [{ id: 'standard', name: 'Standard' }],
    recipes: {
      standard: {},
    },
  },
  {
    id: 'natural',
    name: 'Natural',
    blurb: 'Slightly lower saturation, controlled highlights, moderate contrast, skin preserved',
    subs: [
      { id: 'natural-bright', name: 'Bright' },
      { id: 'natural-balanced', name: 'Balanced' },
      { id: 'natural-soft', name: 'Soft' },
    ],
    recipes: {
      'natural-bright': {
        exposure: 0.15,
        contrast: 0.1,
        highlights: 0.15,
        saturation: 0.94,
        orangeSaturation: 0.9,
        rolloff: 0.35,
      },
      'natural-balanced': {
        exposure: 0.05,
        contrast: 0.1,
        highlights: 0.18,
        saturation: 0.94,
        orangeSaturation: 0.9,
        rolloff: 0.35,
      },
      'natural-soft': {
        exposure: 0.0,
        contrast: 0.06,
        highlights: 0.2,
        saturation: 0.93,
        orangeSaturation: 0.9,
        rolloff: 0.4,
      },
    },
  },
  {
    id: 'masculine',
    name: 'Masculine',
    blurb: 'Deeper blacks, cooler shadows, warm skin, stronger micro-contrast',
    subs: [
      { id: 'masculine-iron', name: 'Iron' },
      { id: 'masculine-steel', name: 'Steel' },
      { id: 'masculine-forge', name: 'Forge' },
    ],
    recipes: {
      'masculine-iron': {
        contrast: 0.16,
        shadows: 0.24,
        temperature: -0.04,
        temperatureSplit: { shadow: [0.16, 0.22, 0.3], highlight: [0.3, 0.24, 0.16], strength: 0.3 },
        saturation: 0.94,
        microContrast: 0.38,
      },
      'masculine-steel': {
        contrast: 0.14,
        shadows: 0.2,
        temperature: -0.08,
        temperatureSplit: { shadow: [0.14, 0.2, 0.28], highlight: [0.3, 0.26, 0.2], strength: 0.35 },
        saturation: 0.92,
        microContrast: 0.34,
      },
      'masculine-forge': {
        contrast: 0.14,
        shadows: 0.18,
        temperature: 0.06,
        temperatureSplit: { shadow: [0.2, 0.18, 0.14], highlight: [0.32, 0.24, 0.14], strength: 0.3 },
        saturation: 0.95,
        orangeSaturation: 0.95,
        microContrast: 0.32,
      },
    },
  },
  {
    id: 'night',
    name: 'Night',
    blurb:
      'Real night capture: exposure lift + deep shadow recovery + highlight protection, noise-masking grain. Selecting it arms the night pipeline.',
    subs: [
      { id: 'night-city', name: 'City' },
      { id: 'night-neon', name: 'Neon' },
      { id: 'night-moon', name: 'Moon' },
    ],
    recipes: {
      // The night combination, shared direction per sub:
      //  - exposure +0.10…+0.20 — the sensor underexposes night scenes; lift it
      //  - shadows −0.40…−0.50 — crushed dark areas must open up
      //  - highlights +0.20…+0.30 — signs/streetlights clip first at night
      //  - LOW contrast + gentle sharpen — amplifying contrast/noise ruins night
      //  - grain 0.30…0.40 — masks the lifted-shadow noise instead of removing it
      //  - vignette — focuses the frame and hides noisiest corners
      'night-city': {
        exposure: 0.3,
        contrast: 0.04,
        shadows: -0.45,
        highlights: 0.25,
        temperature: 0.02,
        temperatureSplit: { shadow: [0.12, 0.2, 0.3], highlight: [0.36, 0.27, 0.16], strength: 0.35 },
        saturation: 0.95,
        orangeSaturation: 0.9,
        microContrast: 0.2,
        sharpen: 0.18,
        grain: 0.3,
        vignette: 0.15,
      },
      'night-neon': {
        exposure: 0.32,
        contrast: 0.08,
        shadows: -0.4,
        highlights: 0.3,
        temperature: -0.02,
        temperatureSplit: { shadow: [0.15, 0.12, 0.32], highlight: [0.4, 0.18, 0.3], strength: 0.4 },
        saturation: 1.05,
        orangeSaturation: 0.88,
        microContrast: 0.22,
        sharpen: 0.2,
        grain: 0.32,
        vignette: 0.18,
      },
      'night-moon': {
        exposure: 0.35,
        contrast: 0.02,
        shadows: -0.5,
        highlights: 0.2,
        temperature: -0.08,
        temperatureSplit: { shadow: [0.1, 0.16, 0.28], highlight: [0.24, 0.28, 0.34], strength: 0.35 },
        saturation: 0.9,
        microContrast: 0.15,
        sharpen: 0.15,
        grain: 0.4,
        vignette: 0.2,
      },
    },
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    blurb: 'Filmic contrast, teal shadows, warm highlights, subtle vignette, film grain',
    subs: [
      { id: 'cinematic-teal', name: 'Teal' },
      { id: 'cinematic-indie', name: 'Indie' },
      { id: 'cinematic-noir', name: 'Noir' },
    ],
    recipes: {
      'cinematic-teal': {
        contrast: 0.16,
        shadows: 0.12,
        highlights: 0.1,
        temperatureSplit: { shadow: [0.08, 0.26, 0.34], highlight: [0.42, 0.3, 0.16], strength: 0.5 },
        saturation: 0.94,
        vignette: 0.22,
        grain: 0.5,
      },
      'cinematic-indie': {
        contrast: 0.12,
        shadows: -0.08,
        highlights: 0.12,
        temperatureSplit: { shadow: [0.14, 0.24, 0.3], highlight: [0.46, 0.36, 0.22], strength: 0.4 },
        saturation: 0.96,
        vignette: 0.15,
        grain: 0.65,
      },
      'cinematic-noir': {
        contrast: 0.2,
        shadows: 0.16,
        highlights: 0.08,
        temperatureSplit: { shadow: [0.1, 0.2, 0.3], highlight: [0.4, 0.36, 0.28], strength: 0.45 },
        saturation: 0.5,
        vignette: 0.28,
        grain: 0.7,
      },
    },
  },
  {
    id: 'portrait',
    name: 'Portrait',
    blurb: 'Skin protected, background contrast, subtle sharpening, controlled highlights',
    subs: [
      { id: 'portrait-nature', name: 'Nature Light' },
      { id: 'portrait-studio', name: 'Studio Light' },
      { id: 'portrait-contour', name: 'Contour Light' },
    ],
    recipes: {
      'portrait-nature': {
        highlights: 0.18,
        contrast: 0.08,
        temperature: 0.05,
        saturation: 0.95,
        orangeSaturation: 0.85,
        sharpen: 0.22,
        rolloff: 0.35,
        vignette: 0.08,
      },
      'portrait-studio': {
        highlights: 0.2,
        contrast: 0.12,
        saturation: 0.94,
        orangeSaturation: 0.85,
        sharpen: 0.28,
        rolloff: 0.35,
      },
      'portrait-contour': {
        highlights: 0.2,
        contrast: 0.14,
        microContrast: 0.3,
        orangeSaturation: 0.85,
        sharpen: 0.3,
        rolloff: 0.35,
        vignette: 0.12,
      },
    },
  },
  // ---- former filter looks, rebuilt as presets (v1.12 removed the filter
  // system — every look is now a bundle of manual develop values) ----
  {
    id: 'film',
    name: 'Film',
    blurb: 'Warm, soft contrast, lifted blacks — golden hour and outdoors',
    subs: [
      { id: 'film-warm', name: 'Warm' },
      { id: 'film-golden', name: 'Golden' },
    ],
    recipes: {
      'film-warm': {
        exposure: 0.06,
        contrast: 0.06,
        shadows: -0.08,
        temperature: 0.15,
        saturation: 0.94,
        vignette: 0.12,
      },
      'film-golden': {
        exposure: 0.1,
        contrast: 0.08,
        shadows: -0.12,
        temperature: 0.22,
        saturation: 0.96,
        grain: 0.2,
        vignette: 0.15,
      },
    },
  },
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'Clean, polished, formal — LinkedIn and Instagram safe',
    subs: [
      { id: 'classic-clean', name: 'Clean' },
      { id: 'classic-formal', name: 'Formal' },
    ],
    recipes: {
      'classic-clean': {
        exposure: 0.05,
        contrast: 0.14,
        highlights: 0.06,
        temperature: 0.02,
        saturation: 0.92,
        orangeSaturation: 0.9,
      },
      'classic-formal': {
        exposure: 0.05,
        contrast: 0.15,
        highlights: 0.08,
        temperature: 0.02,
        saturation: 0.9,
        orangeSaturation: 0.88,
        sharpen: 0.2,
        rolloff: 0.25,
      },
    },
  },
  {
    id: 'onyx',
    name: 'Onyx',
    blurb: 'High-contrast black & white — timeless strong portraits',
    subs: [
      { id: 'onyx-pure', name: 'Pure' },
      { id: 'onyx-smoke', name: 'Smoke' },
    ],
    recipes: {
      'onyx-pure': {
        exposure: 0.02,
        contrast: 0.18,
        bw: true,
      },
      'onyx-smoke': {
        exposure: 0.02,
        contrast: 0.2,
        shadows: 0.15,
        grain: 0.25,
        vignette: 0.2,
        bw: true,
      },
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    blurb: 'Dark and crisp, defined jaw, deeper shadows',
    subs: [
      { id: 'graphite-core', name: 'Core' },
      { id: 'graphite-deep', name: 'Deep' },
    ],
    recipes: {
      'graphite-core': {
        exposure: -0.06,
        contrast: 0.16,
        shadows: 0.24,
        temperature: -0.04,
        saturation: 0.86,
        orangeSaturation: 0.85,
        vignette: 0.3,
      },
      'graphite-deep': {
        exposure: -0.08,
        contrast: 0.18,
        shadows: 0.28,
        temperature: -0.06,
        saturation: 0.84,
        orangeSaturation: 0.85,
        microContrast: 0.3,
        vignette: 0.35,
      },
    },
  },
];

export const getPreset = (id: string): CapturePreset =>
  CAPTURE_PRESETS.find((p) => p.id === id) ?? CAPTURE_PRESETS[0];

/**
 * Instant preview feedback for the active capture preset: converts the recipe's
 * tonal direction into visible veil layers (warm/cool/bright/dark/flat).
 * The saved photo gets the true numeric grade; these veils mirror its direction.
 */
export function presetVeilLayers(recipe: DevelopOptions): {
  color: string;
  opacity: number;
}[] {
  const layers: { color: string; opacity: number }[] = [];
  if (recipe.bw) {
    // Monochrome — a flat neutral veil suggests the desaturated output.
    layers.push({ color: '#7A7D82', opacity: 0.3 });
  }
  const e = recipe.exposure ?? 0;
  if (e > 0.03) layers.push({ color: '#FFFFFF', opacity: Math.min(0.16, e * 0.55) });
  if (e < -0.03) layers.push({ color: '#000000', opacity: Math.min(0.24, -e * 0.55) });
  const t = recipe.temperature ?? 0;
  if (t > 0.03) layers.push({ color: '#C98A4B', opacity: Math.min(0.26, t * 0.6) });
  if (t < -0.03) layers.push({ color: '#3E5A75', opacity: Math.min(0.26, -t * 0.6) });
  const s = recipe.saturation ?? 1;
  if (s < 0.95) layers.push({ color: '#7A7D82', opacity: Math.min(0.3, (1 - s) * 1.4) });
  const sh = recipe.shadows ?? 0;
  if (sh > 0.1) layers.push({ color: '#0A0C0E', opacity: Math.min(0.14, sh * 0.3) });
  // Split-toning — the recipes store it under `temperatureSplit`.
  const rgbOf = (c: [number, number, number]) =>
    `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
  const ts = recipe.temperatureSplit;
  if (ts && ts.strength > 0.2) {
    layers.push({ color: rgbOf(ts.shadow), opacity: Math.min(0.14, ts.strength * 0.22) });
    layers.push({ color: rgbOf(ts.highlight), opacity: Math.min(0.1, ts.strength * 0.15) });
  }
  return layers;
}

export function getPresetSub(preset: CapturePreset, subId: string): PresetSub {
  return preset.subs.find((s) => s.id === subId) ?? preset.subs[0];
}

/** True when the id refers to a user-saved preset (`user:<id>`). */
export const isUserPresetId = (id: string): boolean => id.startsWith('user:');

function findUserPreset(presetId: string): UserPreset | undefined {
  if (!isUserPresetId(presetId)) return undefined;
  return loadUserPresets().find((p) => p.id === presetId.slice(5));
}

/** Display name for any preset id — built-in or user-saved. */
export function presetDisplayName(presetId: string): string {
  const user = findUserPreset(presetId);
  if (user) return user.name;
  return getPreset(presetId).name;
}

/** Resolve the develop recipe for a preset + sub id (user presets included). */
export function presetRecipe(presetId: string, subId: string): DevelopOptions {
  const user = findUserPreset(presetId);
  if (user) return user.develop;
  const preset = getPreset(presetId);
  return (
    preset.recipes[subId] ?? preset.recipes[Object.keys(preset.recipes)[0]] ?? {}
  );
}

/** Stable key of a develop object so values can be compared, not references. */
export function developKey(d: DevelopOptions): string {
  return JSON.stringify(
    Object.keys(d)
      .sort()
      .map((k) => [k, d[k as keyof DevelopOptions]]),
  );
}

/** True when the user's develop values no longer match the selected preset. */
export function isCustomDevelop(
  develop: DevelopOptions,
  presetId: string,
  subId: string,
): boolean {
  return developKey(develop) !== developKey(presetRecipe(presetId, subId));
}

export function presetSubName(presetId: string, subId: string): string {
  const preset = getPreset(presetId);
  const sub = preset.subs.find((s) => s.id === subId);
  return sub?.name ?? preset.subs[0]?.name ?? '';
}
