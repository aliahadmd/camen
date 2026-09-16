import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';

import { dlog, rlog } from '../log';

/** Cap the developed image's long edge — keeps JS processing in the 2–4s range. */
const MAX_DIM = 2560;

/**
 * Base color-grade descriptors. Since v1.12 the filter system is gone — this
 * type now only feeds the LUT builder inside applyGrade.
 */
export type PhotoGrade = {
  /** Exposure shift in EV. */
  exposure?: number;
  /** Contrast amount pivoted at mid-gray. */
  contrast?: number;
  /** > 0 deepens shadows, < 0 lifts them. */
  shadows?: number;
  /** > 0 recovers (slightly darkens) highlights. */
  highlights?: number;
  /** -1 cool … +1 warm white balance. */
  temperature?: number;
  /** Global saturation multiplier. 1 = untouched. */
  saturation?: number;
  /** Desaturation applied inside the skin-hue zone. */
  orangeSaturation?: number;
  /** B&W channel mixer [R, G, B]. */
  bwMix?: [number, number, number];
  /** Corner falloff 0…0.4. */
  vignette?: number;
  /** Film grain strength 0…1. */
  grain?: number;
};

// ImageManipulator's native render context rejects concurrent calls ("Call to
// function 'Context.renderAsync' has been rejected") when several run back to
// back — AEB bursts + thumbnails hit exactly that. All manipulator work is
// serialized through this chain, with one delayed retry as a belt-and-braces.
let manipChain: Promise<unknown> = Promise.resolve();

function isManipRace(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return msg.includes('renderAsync') || msg.includes('Context.');
}

export function queuedManipulate<T>(job: () => Promise<T>): Promise<T> {
  const run = manipChain.then(job, job);
  manipChain = run.then(
    () => undefined,
    () => undefined,
  );
  rlog('[camen] manip: queued');
  return run.catch(async (e: unknown) => {
    if (!isManipRace(e)) throw e;
    rlog('[camen] manip: race detected, retrying once');
    await new Promise((r) => setTimeout(r, 180));
    // Retry inside the chain so it stays serialized.
    return queuedManipulate(job);
  });
}

type LutSet = { r: Uint8Array; g: Uint8Array; b: Uint8Array };

/** Per-channel tone curve: white balance → exposure → contrast. */
function buildLuts(grade: PhotoGrade): LutSet {
  const ev = Math.pow(2, grade.exposure ?? 0);
  const t = grade.temperature ?? 0;
  const c = grade.contrast ?? 0;
  const muls = [ev * (1 + 0.1 * t), ev * (1 + 0.02 * t), ev * (1 - 0.1 * t)];
  const mk = (mul: number) => {
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const v = ((i / 255) * mul - 0.5) * (1 + c) + 0.5;
      lut[i] = v < 0 ? 0 : v > 1 ? 255 : Math.round(v * 255);
    }
    return lut;
  };
  return { r: mk(muls[0]), g: mk(muls[1]), b: mk(muls[2]) };
}

/**
 * Single in-place pass over RGBA pixels: tone LUTs → luminance-masked shadow/highlight
 * shaping → split-toning → B&W mixer or saturation (with skin control) →
 * micro-contrast → fine sharpen → highlight rolloff → vignette → grain.
 */
export function applyGrade(
  data: Uint8Array,
  w: number,
  h: number,
  grade: PhotoGrade,
  extras: {
    microContrast?: number;
    sharpen?: number;
    splitShadow?: [number, number, number];
    splitHighlight?: [number, number, number];
    splitStrength?: number;
    rolloff?: number;
    /** Varies the grain pattern per photo so it never repeats identically. */
    seed?: number;
    /** Monochrome switch — applies the smooth-skin B&W channel mix. */
    bw?: boolean;
    /** Skin-zone soft smoothing 0…1. */
    skinSmooth?: number;
  } = {},
): void {
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  const lut = buildLuts(grade);
  const shadows = grade.shadows ?? 0;
  const highlights = grade.highlights ?? 0;
  const sat = grade.saturation ?? 1;
  const orange = grade.orangeSaturation ?? 1;
  const bw = grade.bwMix ?? (extras.bw ? ([0.3, 0.55, 0.15] as [number, number, number]) : undefined);
  const vig = grade.vignette ?? 0;
  const micro = extras.microContrast ?? 0;
  const sharpen = extras.sharpen ?? 0;
  const splitShadow = extras.splitShadow;
  const splitHighlight = extras.splitHighlight;
  const splitStrength = extras.splitStrength ?? 0;
  const rolloff = extras.rolloff ?? 0;
  const grainSeed = extras.seed ?? 0;
  const needsTone = shadows !== 0 || highlights !== 0;

  // Pass 1: tone LUT + record luminance (needed for micro/sharpen)
  const lum = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const r = lut.r[px[i]];
    const g = lut.g[px[i + 1]];
    const b = lut.b[px[i + 2]];
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    lum[p] = (r * 77 + g * 150 + b * 29) >> 8;
  }

  // Pass 2: micro-contrast — unsharp against a half-res blurred luminance
  if (micro > 0) {
    const w2 = Math.max(1, w >> 1);
    const h2 = Math.max(1, h >> 1);
    const small = new Uint8Array(w2 * h2);
    for (let y = 0; y < h2; y++) {
      const sy = Math.min(h - 1, y * 2);
      for (let x = 0; x < w2; x++) {
        const sx = Math.min(w - 1, x * 2);
        small[y * w2 + x] = lum[sy * w + sx];
      }
    }
    const blurred = boxBlurU8(small, w2, h2, 6);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(h2 - 1, y >> 1);
      const y0 = Math.min(h2 - 1, fy);
      const y1 = Math.min(h2 - 1, fy + 1);
      const wy = (y & 1) * 0.5;
      for (let x = 0; x < w; x++) {
        const fx = Math.min(w2 - 1, x >> 1);
        const x0 = Math.min(w2 - 1, fx);
        const x1 = Math.min(w2 - 1, fx + 1);
        const wx = (x & 1) * 0.5;
        const top = blurred[y0 * w2 + x0] * (1 - wx) + blurred[y0 * w2 + x1] * wx;
        const bot = blurred[y1 * w2 + x0] * (1 - wx) + blurred[y1 * w2 + x1] * wx;
        const i4 = (y * w + x) * 4;
        const detail = lum[y * w + x] - (top * (1 - wy) + bot * wy);
        const amt = micro * 1.5;
        px[i4] += detail * amt;
        px[i4 + 1] += detail * amt;
        px[i4 + 2] += detail * amt;
      }
    }
    // Sharpen reads luminance — refresh it so it reflects the micro-contrast
    // pass just applied instead of the pre-pass snapshot.
    if (sharpen > 0) {
      for (let p = 0, i = 0; p < w * h; p++, i += 4) {
        lum[p] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
      }
    }
  }

  // Pass 3: fine sharpen — small-radius unsharp, gentler on skin tones
  if (sharpen > 0) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const c = lum[y * w + x];
        const avg =
          (lum[(y - 1) * w + x - 1] + lum[(y - 1) * w + x] + lum[(y - 1) * w + x + 1] +
           lum[y * w + x - 1] + lum[y * w + x + 1] +
           lum[(y + 1) * w + x - 1] + lum[(y + 1) * w + x] + lum[(y + 1) * w + x + 1]) / 8;
        const detail = c - avg;
        const warmSkin = px[i] > px[i + 2] && px[i] > 90;
        const d = detail * sharpen * (warmSkin ? 0.4 : 1);
        px[i] += d;
        px[i + 1] += d;
        px[i + 2] += d;
      }
    }
  }

  // Pass 3.5: skin smoothing — half-res blur blended only inside the warm-skin
  // hue zone (same heuristic as the orange-saturation control), with the zone
  // mask itself blurred so the transition has no visible boundary.
  const smooth = extras.skinSmooth ?? 0;
  if (smooth > 0) {
    const w2 = Math.max(1, w >> 1);
    const h2 = Math.max(1, h >> 1);
    const rs = new Uint8Array(w2 * h2);
    const gs = new Uint8Array(w2 * h2);
    const bs = new Uint8Array(w2 * h2);
    const zone = new Uint8Array(w2 * h2);
    for (let y = 0; y < h2; y++) {
      const sy = Math.min(h - 1, y * 2);
      for (let x = 0; x < w2; x++) {
        const sx = Math.min(w - 1, x * 2);
        const i = (sy * w + sx) * 4;
        const p = y * w2 + x;
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        rs[p] = r;
        gs[p] = g;
        bs[p] = b;
        zone[p] = r > g && g >= b - 13 && r - b > 25 && r > 64 ? 255 : 0;
      }
    }
    const radius = Math.max(2, Math.round(Math.min(w2, h2) * 0.006 * (0.5 + smooth)));
    const rsB = boxBlurU8(rs, w2, h2, radius);
    const gsB = boxBlurU8(gs, w2, h2, radius);
    const bsB = boxBlurU8(bs, w2, h2, radius);
    const zoneB = boxBlurU8(zone, w2, h2, 3);
    const amt = smooth * 0.65;
    for (let y = 0; y < h; y++) {
      const fy = Math.min(h2 - 1, y >> 1);
      const y1 = Math.min(h2 - 1, fy + 1);
      const wy = (y & 1) * 0.5;
      for (let x = 0; x < w; x++) {
        const fx = Math.min(w2 - 1, x >> 1);
        const x1 = Math.min(w2 - 1, fx + 1);
        const wx = (x & 1) * 0.5;
        const zo = fy * w2 + fx;
        const zr = fy * w2 + x1;
        const top = zoneB[zo] * (1 - wx) + zoneB[zr] * wx;
        const bot = zoneB[y1 * w2 + fx] * (1 - wx) + zoneB[y1 * w2 + x1] * wx;
        const mz = ((top * (1 - wy) + bot * wy) / 255) * amt;
        if (mz <= 0.002) continue;
        const i4 = (y * w + x) * 4;
        const to = zo;
        const tr = rsB[to] * (1 - wx) + rsB[zr] * wx;
        const tg = gsB[to] * (1 - wx) + gsB[zr] * wx;
        const tb = bsB[to] * (1 - wx) + bsB[zr] * wx;
        const br = rsB[y1 * w2 + fx] * (1 - wx) + rsB[y1 * w2 + x1] * wx;
        const bg = gsB[y1 * w2 + fx] * (1 - wx) + gsB[y1 * w2 + x1] * wx;
        const bb = bsB[y1 * w2 + fx] * (1 - wx) + bsB[y1 * w2 + x1] * wx;
        px[i4] += ((tr * (1 - wy) + br * wy) - px[i4]) * mz;
        px[i4 + 1] += ((tg * (1 - wy) + bg * wy) - px[i4 + 1]) * mz;
        px[i4 + 2] += ((tb * (1 - wy) + bb * wy) - px[i4 + 2]) * mz;
      }
    }
  }

  // Pass 4: per-pixel color shaping — shadows/highlights masks, split-toning,
  // saturation with skin-zone control, B&W mixer, rolloff, vignette, grain.
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    let r = px[i] / 255;
    let g = px[i + 1] / 255;
    let b = px[i + 2] / 255;
    let lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (needsTone) {
      if (shadows !== 0) {
        const m = (1 - lum) * (1 - lum);
        const f = 1 - shadows * 0.45 * m;
        r *= f;
        g *= f;
        b *= f;
      }
      if (highlights !== 0) {
        const m = lum * lum;
        const f = 1 - highlights * 0.45 * m;
        r *= f;
        g *= f;
        b *= f;
      }
    }

    if (splitStrength > 0 && splitShadow) {
      const sm = (1 - lum) * (1 - lum) * splitStrength;
      r += (splitShadow[0] - r) * sm;
      g += (splitShadow[1] - g) * sm;
      b += (splitShadow[2] - b) * sm;
    }
    if (splitStrength > 0 && splitHighlight) {
      const hm = lum * lum * splitStrength;
      r += (splitHighlight[0] - r) * hm;
      g += (splitHighlight[1] - g) * hm;
      b += (splitHighlight[2] - b) * hm;
    }

    if (bw) {
      const k = bw[0] * r + bw[1] * g + bw[2] * b;
      r = k;
      g = k;
      b = k;
    } else {
      let s = sat;
      if (orange !== 1 && r > g && g >= b - 0.05 && r - b > 0.1 && r > 0.25) {
        s *= orange;
      }
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * s;
      g = l + (g - l) * s;
      b = l + (b - l) * s;
    }

    if (rolloff > 0 && lum > 0.72) {
      const f = 1 - rolloff * 0.4 * ((lum - 0.72) / 0.28);
      r *= f;
      g *= f;
      b *= f;
    }

    if (vig > 0) {
      const x = p % w;
      const y = (p / w) | 0;
      const dx = x / w - 0.5;
      const dy = y / h - 0.5;
      const f = 1 - vig * 2 * (dx * dx + dy * dy);
      r *= f;
      g *= f;
      b *= f;
    }

    if (grade.grain) {
      const n =
        (Math.sin((p % w) * 12.9898 + (p / w | 0) * 78.233 + grainSeed) - 0.5) *
        grade.grain * 0.12;
      r += n;
      g += n;
      b += n;
    }

    px[i] = r * 255;
    px[i + 1] = g * 255;
    px[i + 2] = b * 255;
  }
}

/** Separable box blur (horizontal + vertical sliding-window passes). */
function boxBlurU8(src: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    const cnt = radius * 2 + 1;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / cnt;
      const addX = Math.min(w - 1, x + radius + 1);
      const remX = Math.max(0, x - radius);
      sum += src[row + addX] - src[row + remX];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let cnt = 0;
    for (let y = -radius; y <= radius; y++) {
      const yy = Math.min(h - 1, Math.max(0, y));
      sum += tmp[yy * w + x];
      cnt++;
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / cnt;
      const addY = Math.min(h - 1, y + radius + 1);
      const remY = Math.max(0, y - radius);
      sum += tmp[addY * w + x] - tmp[remY * w + x];
    }
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64[i]] = i;

/** Exported for the portrait depth pipeline (same decode path). */
export function base64ToBytes(b64: string): Uint8Array {
  const len = b64.length;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(Math.floor((len / 4) * 3) - pad);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[b64[i]];
    const b = B64_LOOKUP[b64[i + 1]];
    const c = B64_LOOKUP[b64[i + 2]];
    const d = B64_LOOKUP[b64[i + 3]];
    out[o++] = (a << 2) | (b >> 4);
    if (c !== undefined) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d !== undefined) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

/** Exported for the portrait depth pipeline (same encode path). */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < n;
    const has2 = i + 2 < n;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += has1 ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += has2 ? B64[b2 & 63] : '=';
  }
  return out;
}

/** Center-crops a captured JPEG to the framing aspect (native, fast). */
export async function cropToAspect(
  uri: string,
  width: number,
  height: number,
  aspect: number | null,
  maxLongEdge?: number,
): Promise<{ uri: string; width: number; height: number }> {
  if (!aspect || width <= 0 || height <= 0) {
    return { uri, width, height };
  }
  let cw = width;
  let ch = height;
  let x = 0;
  let y = 0;
  if (width / height > aspect) {
    cw = Math.round(height * aspect);
    x = Math.round((width - cw) / 2);
  } else {
    ch = Math.round(width / aspect);
    y = Math.round((height - ch) / 2);
  }
  const needsResize = !!maxLongEdge && Math.max(cw, ch) > maxLongEdge;
  // No-op guard: a full-frame "crop" without a resize would only re-encode
  // the JPEG for nothing (and every extra manipulator call is a chance for
  // the native render context to race under load).
  if (cw === width && ch === height && !needsResize) {
    return { uri, width, height };
  }
  const actions: ImageManipulator.Action[] = [
    { crop: { originX: x, originY: y, width: cw, height: ch } },
  ];
  if (needsResize) {
    actions.push(
      cw >= ch
        ? { resize: { width: maxLongEdge } }
        : { resize: { height: maxLongEdge } },
    );
  }
  return queuedManipulate(() =>
    ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.95,
      format: ImageManipulator.SaveFormat.JPEG,
    }),
  ).then((out) => ({ uri: out.uri, width: out.width, height: out.height }));
}

/** Develop-time capture options: EV/ISO/HDR + capture-preset tonal recipe. */
export type DevelopOptions = {
  /** Manual exposure compensation in EV (−2…+2). */
  ev?: number;
  /** Simulated ISO: gain + proportional grain. 0/undefined = none. */
  iso?: number;
  /** HDR look: lifted shadows, recovered highlights, extra rolloff. */
  hdr?: boolean;
  /** Split-toning: shadow + highlight tint colors (0…1 rgb) and strength. */
  temperatureSplit?: {
    shadow: [number, number, number];
    highlight: [number, number, number];
    strength: number;
  };
  /** Capture-preset tonal recipe (plan18). */
  exposure?: number;
  contrast?: number;
  /** negative = lift/recover, positive = deepen */
  shadows?: number;
  /** positive = protect/recover highlights */
  highlights?: number;
  temperature?: number;
  saturation?: number;
  orangeSaturation?: number;
  microContrast?: number;
  sharpen?: number;
  rolloff?: number;
  vignette?: number;
  grain?: number;
  splitShadow?: [number, number, number];
  splitHighlight?: [number, number, number];
  splitStrength?: number;
  /** Monochrome: B&W with the smooth-skin channel mix. */
  bw?: boolean;
  /** Portrait depth: background blur strength 0…1 (0 = off). See portraitDepth.ts. */
  bokeh?: number;
  /** Bokeh glow: highlight bleed into the blurred background 0…1. */
  bokehGlow?: number;
  /** Background tone shift −1 (darkened stage) … +1 (lifted, dreamy). */
  bgTone?: number;
  /** Skin-zone soft smoothing 0…1 (subtle by design). */
  skinSmooth?: number;
};

/**
 * Develops a captured JPEG with the given grade and returns the new cache file
 * URI. Source file is left untouched (caller decides what to save).
 */
export async function developPhoto(
  sourceUri: string,
  srcWidth: number,
  srcHeight: number,
  grade: PhotoGrade,
  options: DevelopOptions = {},
): Promise<{ uri: string; width: number; height: number }> {
  // 1. Downscale natively when the sensor output exceeds the processing cap.
  let uri = sourceUri;
  if (Math.max(srcWidth, srcHeight) > MAX_DIM) {
    const action =
      srcWidth >= srcHeight ? { resize: { width: MAX_DIM } } : { resize: { height: MAX_DIM } };
    const resized = await queuedManipulate(() =>
      ImageManipulator.manipulateAsync(sourceUri, [action], {
        compress: 0.95,
        format: ImageManipulator.SaveFormat.JPEG,
      }),
    );
    uri = resized.uri;
  }

  // 2. Read + decode. (RN fetch on file:// returns error-text bodies for
  //    missing/unreadable files, so read bytes through the file system module.)
  rlog('[camen] develop: reading source');
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  rlog('[camen] develop: decoding jpeg');
  const raw = jpeg.decode(base64ToBytes(b64), { useTArray: true });
  rlog('[camen] develop: decoded', raw.width, 'x', raw.height);

  // 3. Grade in place, with EV / simulated-ISO / HDR tone folded into the grade,
  //    plus the capture-preset tonal recipe (exposure/contrast/shadows/split/…).
  //    Simulated ISO is a gain boost capped at +2 EV with proportional grain —
  //    matching what the EV ruler allows, never a runaway exposure.
  const isoStops = options.iso && options.iso > 100 ? Math.log2(options.iso / 100) : 0;
  const evBoost = Math.min(2, isoStops) + (options.ev ?? 0);
  const isoGrain = Math.min(0.55, Math.max(0, isoStops) * 0.17);
  const hdr = options.hdr === true;
  const effective: PhotoGrade = {
    ...grade,
    exposure: (grade.exposure ?? 0) + evBoost + (options.exposure ?? 0),
    contrast: (grade.contrast ?? 0) + (options.contrast ?? 0),
    shadows: (grade.shadows ?? 0) + (options.shadows ?? 0) + (hdr ? -0.3 : 0),
    highlights: (grade.highlights ?? 0) + (options.highlights ?? 0) + (hdr ? 0.3 : 0),
    temperature: (grade.temperature ?? 0) + (options.temperature ?? 0),
    saturation: (grade.saturation ?? 1) * (options.saturation ?? 1),
    orangeSaturation: (grade.orangeSaturation ?? 1) * (options.orangeSaturation ?? 1),
    vignette: Math.min(0.6, (grade.vignette ?? 0) + (options.vignette ?? 0)),
    grain: Math.min(1, (grade.grain ?? 0) + (options.grain ?? 0) + isoGrain),
  };
  applyGrade(raw.data, raw.width, raw.height, effective, {
    microContrast: options.microContrast,
    sharpen: options.sharpen,
    rolloff: (options.rolloff ?? 0) + (hdr ? 0.25 : 0),
    splitShadow: options.splitShadow ?? options.temperatureSplit?.shadow,
    splitHighlight: options.splitHighlight ?? options.temperatureSplit?.highlight,
    splitStrength: options.splitStrength ?? options.temperatureSplit?.strength,
    seed: Math.floor(Math.random() * 4096),
    bw: options.bw,
    skinSmooth: options.skinSmooth,
  });
  rlog('[camen] develop: grade applied');

  // 4. Encode + write to cache.
  rlog('[camen] develop: encoding');
  const out = jpeg.encode({ data: raw.data, width: raw.width, height: raw.height }, 90);
  rlog('[camen] develop: encoded', out.data.length, 'bytes');
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('no cache directory');
  const outUri = `${cacheDir}camen_developed_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outUri, toBase64(out.data), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { uri: outUri, width: raw.width, height: raw.height };
}
