/**
 * Capture presets (plan/plan18.md) — photographic styles baked at develop time.
 * A preset is a tonal recipe; the chosen color filter still layers its own
 * color cast on top. No beauty processing, no face reshaping — tonal only.
 *
 * Sub-presets are lighting/look variations within a preset
 * (e.g. Portrait → Nature Light / Studio Light / Contour Light).
 */
import type { DevelopOptions } from './gradePhoto';

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
    blurb: 'Shadow recovery, highlight protection, cyan shadows, warm skin, subtle grain',
    subs: [
      { id: 'night-city', name: 'City' },
      { id: 'night-neon', name: 'Neon' },
      { id: 'night-moon', name: 'Moon' },
    ],
    recipes: {
      'night-city': {
        shadows: -0.25,
        highlights: 0.22,
        temperatureSplit: { shadow: [0.14, 0.24, 0.34], highlight: [0.3, 0.28, 0.22], strength: 0.4 },
        temperature: 0.03,
        grain: 0.3,
        vignette: 0.12,
      },
      'night-neon': {
        shadows: -0.2,
        highlights: 0.25,
        temperatureSplit: { shadow: [0.1, 0.22, 0.36], highlight: [0.32, 0.26, 0.2], strength: 0.45 },
        saturation: 1.04,
        grain: 0.35,
        vignette: 0.15,
      },
      'night-moon': {
        shadows: -0.28,
        highlights: 0.2,
        temperature: -0.06,
        temperatureSplit: { shadow: [0.12, 0.2, 0.3], highlight: [0.26, 0.3, 0.34], strength: 0.4 },
        grain: 0.45,
        vignette: 0.18,
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

/** Resolve the develop recipe for a preset + sub id. */
export function presetRecipe(presetId: string, subId: string): DevelopOptions {
  const preset = getPreset(presetId);
  return (
    preset.recipes[subId] ?? preset.recipes[Object.keys(preset.recipes)[0]] ?? {}
  );
}

export function presetSubName(presetId: string, subId: string): string {
  const preset = getPreset(presetId);
  const sub = preset.subs.find((s) => s.id === subId);
  return sub?.name ?? preset.subs[0]?.name ?? '';
}
