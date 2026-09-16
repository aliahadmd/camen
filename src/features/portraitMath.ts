/**
 * Pure math for the portrait depth pipeline — NO imports, so the whole file
 * runs in Node for unit tests (the established gradePhoto test practice).
 *
 * Model: ML Kit gives a person-confidence mask. We feather it (sharp edge),
 * blur it hard (proximity = cheap distance-to-subject), blur the background
 * in two bands (near bg light, far bg heavy — the classic two-band fake
 * depth-of-field), extract bright highlights as a colored bokeh-glow layer,
 * and composite everything at full resolution.
 */

/** Standard full-stop aperture scale, wide → narrow. Index 0 = f/1.4 (max blur). */
export const APERTURE_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16] as const;

/** f-stop ruler index (0…7) → bokeh strength 0…1. f/16 → 0, f/1.4 → 1. */
export function stopIndexToBokeh(idx: number): number {
  const i = Math.min(APERTURE_STOPS.length - 1, Math.max(0, Math.round(idx)));
  return 1 - i / (APERTURE_STOPS.length - 1);
}

/** Bokeh strength 0…1 → nearest f-stop ruler index. */
export function bokehToStopIndex(bokeh: number): number {
  return Math.min(
    APERTURE_STOPS.length - 1,
    Math.max(0, Math.round((1 - bokeh) * (APERTURE_STOPS.length - 1))),
  );
}

/** Bokeh strength → nearest f number for labels. */
export function bokehToFNumber(bokeh: number): number {
  return APERTURE_STOPS[bokehToStopIndex(bokeh)];
}

/** Separable box blur over a float32 plane (in values, not bytes). */
export function blurF32(src: Float32Array, w: number, h: number, radius: number, passes = 1): Float32Array {
  let cur = src;
  for (let p = 0; p < passes; p++) {
    cur = boxBlurF32Once(cur, w, h, radius);
  }
  return cur;
}

function boxBlurF32Once(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const cnt = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / cnt;
      sum += src[row + Math.min(w - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / cnt;
      sum += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x];
    }
  }
  return out;
}

/** Bilinear sample of a float32 plane, coordinates clamped to the plane. */
export function sampleF32(src: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.min(w - 1, Math.max(0, x));
  const cy = Math.min(h - 1, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const wx = cx - x0;
  const wy = cy - y0;
  const top = src[y0 * w + x0] * (1 - wx) + src[y0 * w + x1] * wx;
  const bot = src[y1 * w + x0] * (1 - wx) + src[y1 * w + x1] * wx;
  return top * (1 - wy) + bot * wy;
}

/** Downsamples a mask plane to the working grid (bilinear — the mask is smooth). */
export function downsampleMask(
  mask: Float32Array,
  mw: number,
  mh: number,
  gw: number,
  gh: number,
): Float32Array {
  const out = new Float32Array(gw * gh);
  const sx = mw / gw;
  const sy = mh / gh;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      out[y * gw + x] = sampleF32(mask, mw, mh, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
    }
  }
  return out;
}

/** Downsamples one uint8 channel to the grid (nearest — blur absorbs the noise). */
export function downsampleChannel(
  src: Uint8Array,
  w: number,
  h: number,
  gw: number,
  gh: number,
): Uint8Array {
  const out = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    const sy = Math.min(h - 1, (y * h / gh) | 0);
    for (let x = 0; x < gw; x++) {
      const sx = Math.min(w - 1, (x * w / gw) | 0);
      out[y * gw + x] = src[sy * w + sx];
    }
  }
  return out;
}

export type DepthBand = { r: Float32Array; g: Float32Array; b: Float32Array };

export type DepthLayers = {
  gridW: number;
  gridH: number;
  /** Feathered subject mask (0 background … 1 subject). */
  sharp: Float32Array;
  /** Hard-blurred mask — 1 near the subject, 0 far away (proximity proxy). */
  proximity: Float32Array;
  /** Lightly blurred background band. */
  near: DepthBand;
  /** Heavily blurred background band (far depth). */
  far: DepthBand;
  /** Blurred highlight extraction (colored bokeh bleed), or null when off. */
  glow: DepthBand | null;
};

/**
 * Builds the blurred depth layers at grid resolution. The person mask drives
 * everything: feathered for the composite edge, hard-blurred for the depth
 * ramp (more blur the farther the background is from the subject).
 */
export function buildDepthLayers(
  ch: { r: Uint8Array; g: Uint8Array; b: Uint8Array },
  gridW: number,
  gridH: number,
  gridMask: Float32Array,
  opts: { bokeh: number; bokehGlow: number; bgTone: number },
): DepthLayers {
  const n = gridW * gridH;
  const minSide = Math.min(gridW, gridH);
  const strength = 0.35 + 0.65 * Math.min(1, Math.max(0, opts.bokeh));

  // Feathered edge (small radius) + proximity (large radius, binary-ish source).
  const hard = new Float32Array(n);
  for (let i = 0; i < n; i++) hard[i] = gridMask[i] >= 0.5 ? 1 : 0;
  const featherR = Math.max(1, Math.round(minSide * 0.012));
  const sharp = blurF32(gridMask, gridW, gridH, featherR);
  const proxR = Math.max(6, Math.round(minSide * 0.16 * strength));
  const proximity = blurF32(hard, gridW, gridH, proxR, 2);

  const nearR = Math.max(2, Math.round(minSide * 0.025 * strength));
  const farR = Math.max(6, Math.round(minSide * 0.1 * strength));
  const near: DepthBand = {
    r: blurF32(Float32Array.from(ch.r), gridW, gridH, nearR),
    g: blurF32(Float32Array.from(ch.g), gridW, gridH, nearR),
    b: blurF32(Float32Array.from(ch.b), gridW, gridH, nearR),
  };
  const far: DepthBand = {
    r: blurF32(Float32Array.from(ch.r), gridW, gridH, farR, 3),
    g: blurF32(Float32Array.from(ch.g), gridW, gridH, farR, 3),
    b: blurF32(Float32Array.from(ch.b), gridW, gridH, farR, 3),
  };

  // Bokeh glow: extract bright highlights, blur them wide so they bleed like
  // out-of-focus speculars. Colored (per-channel), screen-free additive blend.
  let glow: DepthBand | null = null;
  if (opts.bokehGlow > 0.01) {
    const gm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lum = (0.299 * ch.r[i] + 0.587 * ch.g[i] + 0.114 * ch.b[i]) / 255;
      gm[i] = lum > 0.78 ? Math.min(1, (lum - 0.78) / 0.22) : 0;
    }
    const glowR = Math.max(6, Math.round(minSide * 0.12 * strength));
    glow = {
      r: blurF32(Float32Array.from(ch.r).map((v, i) => v * gm[i]), gridW, gridH, glowR, 2),
      g: blurF32(Float32Array.from(ch.g).map((v, i) => v * gm[i]), gridW, gridH, glowR, 2),
      b: blurF32(Float32Array.from(ch.b).map((v, i) => v * gm[i]), gridW, gridH, glowR, 2),
    };
  }

  // Background tone: negative darkens + desaturates (stage light), positive
  // lifts and softens (dreamy). Applied to both bands once, not per pixel.
  const tone = opts.bgTone;
  if (Math.abs(tone) > 0.01) {
    const bright = 1 + tone * (tone < 0 ? 0.5 : 0.2);
    const satF = 1 - Math.min(0.85, Math.abs(tone) * 0.45);
    for (const band of [near, far]) {
      for (let i = 0; i < n; i++) {
        const r = band.r[i];
        const g = band.g[i];
        const b = band.b[i];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        band.r[i] = (l + (r - l) * satF) * bright;
        band.g[i] = (l + (g - l) * satF) * bright;
        band.b[i] = (l + (b - l) * satF) * bright;
      }
    }
  }

  return { gridW, gridH, sharp, proximity, near, far, glow };
}

/**
 * In-place full-resolution composite over RGBA pixels.
 *
 * The depth-ramped background (near↔far blend + glow) is pre-blended once at
 * grid resolution — every layer there is low-frequency, so per-pixel work at
 * full resolution reduces to one bilinear mask sample for the feathered edge
 * plus a nearest lookup into the pre-blended background. Keeps a 12MP-frame
 * composite in the low seconds in JS.
 */
export function compositePortrait(
  data: Uint8Array,
  w: number,
  h: number,
  layers: DepthLayers,
  glowAmount: number,
): void {
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  const { gridW, gridH, sharp, proximity, near, far, glow } = layers;
  const n = gridW * gridH;
  const useGlow = glow !== null && glowAmount > 0.01;

  // Grid-res background: near bg lightly blurred, far bg heavily blurred,
  // highlight glow bleeding in, background tone already applied to the bands.
  const bgR = new Float32Array(n);
  const bgG = new Float32Array(n);
  const bgB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const prox = proximity[i];
    const inv = 1 - prox;
    bgR[i] = near.r[i] * inv + far.r[i] * prox;
    bgG[i] = near.g[i] * inv + far.g[i] * prox;
    bgB[i] = near.b[i] * inv + far.b[i] * prox;
    if (useGlow) {
      bgR[i] += glow!.r[i] * glowAmount;
      bgG[i] += glow!.g[i] * glowAmount;
      bgB[i] += glow!.b[i] * glowAmount;
    }
  }

  const sx = gridW / w;
  const sy = gridH / h;
  for (let y = 0; y < h; y++) {
    const gy = (y + 0.5) * sy - 0.5;
    const gyRow = Math.min(gridH - 1, Math.max(0, Math.round(gy))) * gridW;
    for (let x = 0; x < w; x++) {
      const m = sampleF32(sharp, gridW, gridH, (x + 0.5) * sx - 0.5, gy);
      if (m >= 0.999) continue; // fully subject — graded pixel stays
      const gi = gyRow + Math.min(gridW - 1, Math.max(0, Math.round((x + 0.5) * sx - 0.5)));
      const i4 = (y * w + x) * 4;
      const inv = 1 - m;
      px[i4] = px[i4] * m + bgR[gi] * inv;
      px[i4 + 1] = px[i4 + 1] * m + bgG[gi] * inv;
      px[i4 + 2] = px[i4 + 2] * m + bgB[gi] * inv;
    }
  }
}

/** Mean of a mask — used to reject frames where segmentation found nothing (or everything). */
export function maskCoverage(mask: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < mask.length; i++) sum += mask[i];
  return sum / mask.length;
}
