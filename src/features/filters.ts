/**
 * Masculine grade system — plan/plan12.md.
 *
 * Six curated looks + None. No beauty processing: no face reshaping, no plastic
 * skin, no eye enhancement, no HDR halos, no orange skin.
 *
 * Every preset carries TWO representations of the same look:
 *  - `grade`    — a real per-pixel color grade baked into the SAVED photo
 *                 (see gradePhoto.ts). This is the source of truth.
 *  - `overlay`  — a live-preview approximation for the viewfinder (Expo Go
 *                 cannot grade the camera stream); layered tints, where a gray
 *                 veil genuinely desaturates and warm/cool veils suggest WB.
 */
export type PhotoGrade = {
  /** Exposure shift in EV (±0.25 typical). */
  exposure?: number;
  /** Contrast amount pivoted at mid-gray. Keep ≤ 0.20 — moderate, never harsh. */
  contrast?: number;
  /** > 0 deepens shadows (jaw/beard definition), < 0 lifts them (film matte). */
  shadows?: number;
  /** > 0 recovers (slightly darkens) highlights. */
  highlights?: number;
  /** -1 cool … +1 warm white balance. */
  temperature?: number;
  /** Global saturation multiplier. 1 = untouched. */
  saturation?: number;
  /** Desaturation applied inside the skin-hue zone — the "no orange skin" rule. */
  orangeSaturation?: number;
  /** B&W channel mixer [R, G, B] — smooth skin, controlled skies. */
  bwMix?: [number, number, number];
  /** Corner falloff 0…0.4. */
  vignette?: number;
  /** Film grain strength 0…1. */
  grain?: number;
};

export type FilterLayer = {
  color: string;
  opacity: number;
};

export type FilterPreset = {
  id: string;
  name: string;
  /** What it is for, shown nowhere — kept for the record and review. */
  blurb: string;
  /** Live-preview approximation layers. */
  overlay: FilterLayer[];
  /** Real grade applied to the saved photo. */
  grade: PhotoGrade;
  /** Gradient stops for the carousel swatch. */
  swatch: [string, string];
};

export const FILTERS: FilterPreset[] = [
  {
    id: 'none',
    name: 'None',
    blurb: 'Clean sensor output — zero cost fast path',
    overlay: [],
    grade: {},
    swatch: ['#E8E6E1', '#16181B'],
  },
  {
    id: 'natural',
    name: 'Natural',
    blurb: 'Natural skin, slightly brighter, crisp — daily selfies, profile photos',
    grade: {
      exposure: 0.15,
      contrast: 0.08,
      temperature: 0.06,
      saturation: 0.96,
      orangeSaturation: 0.92,
    },
    overlay: [
      { color: '#FFFFFF', opacity: 0.05 },
      { color: '#C9A96A', opacity: 0.04 },
    ],
    swatch: ['#F2E9DC', '#B99B6B'],
  },
  {
    id: 'cinema',
    name: 'Cinematic',
    blurb: 'Deeper shadows, cooler tones — night, street, serious portraits',
    grade: {
      exposure: -0.05,
      contrast: 0.14,
      shadows: 0.22,
      highlights: 0.1,
      temperature: -0.14,
      saturation: 0.9,
      vignette: 0.25,
    },
    overlay: [
      { color: '#3E5A75', opacity: 0.1 },
      { color: '#0B1220', opacity: 0.1 },
    ],
    swatch: ['#31404F', '#8FA5B5'],
  },
  {
    id: 'film',
    name: 'Film',
    blurb: 'Slightly warm, soft contrast, lifted blacks — outdoor / golden hour',
    grade: {
      exposure: 0.06,
      contrast: 0.06,
      shadows: -0.08,
      temperature: 0.15,
      saturation: 0.94,
      vignette: 0.12,
    },
    overlay: [
      { color: '#C98A4B', opacity: 0.1 },
      { color: '#EFE3C8', opacity: 0.05 },
    ],
    swatch: ['#E4B87F', '#8A5A33'],
  },
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'Clean, polished, masculine — formal clothes, LinkedIn, Instagram',
    grade: {
      exposure: 0.05,
      contrast: 0.14,
      highlights: 0.06,
      temperature: 0.02,
      saturation: 0.92,
      orangeSaturation: 0.9,
    },
    overlay: [{ color: '#8A8F98', opacity: 0.05 }],
    swatch: ['#D8D4CC', '#4E5258'],
  },
  {
    id: 'onyx',
    name: 'Onyx',
    blurb: 'High-contrast black & white, timeless — strong portraits',
    grade: {
      exposure: 0.02,
      contrast: 0.18,
      bwMix: [0.3, 0.55, 0.15],
    },
    overlay: [{ color: '#7A7D82', opacity: 0.45 }],
    swatch: ['#141518', '#C9C7C2'],
  },
  {
    id: 'graphite',
    name: 'Graphite',
    blurb: 'Dark & crisp, defined jaw/beard, deeper shadows — masculine portraits',
    grade: {
      exposure: -0.06,
      contrast: 0.16,
      shadows: 0.24,
      temperature: -0.04,
      saturation: 0.86,
      orangeSaturation: 0.85,
      vignette: 0.3,
    },
    overlay: [
      { color: '#14181D', opacity: 0.12 },
      { color: '#33414D', opacity: 0.06 },
    ],
    swatch: ['#2B3138', '#767E88'],
  },
];

export const getPreset = (id: string): FilterPreset =>
  FILTERS.find((f) => f.id === id) ?? FILTERS[0];

/** True when the preset would alter the saved photo. */
export const hasGrade = (p: FilterPreset): boolean =>
  p.grade != null && Object.keys(p.grade).length > 0;
