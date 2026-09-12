import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';

import type { PhotoGrade } from './filters';

/** Cap the developed image's long edge — keeps JS processing in the 2–4s range. */
const MAX_DIM = 2560;

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
 * Single in-place pass over RGBA pixels: tone LUTs → luminance-masked
 * shadow/highlight shaping → B&W mixer or saturation (with skin-hue control) →
 * vignette. Written against a Uint8ClampedArray view so clamping is free.
 */
function applyGrade(
  raw: Uint8Array,
  w: number,
  h: number,
  grade: PhotoGrade,
): void {
  const px = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.length);
  const lut = buildLuts(grade);
  const shadows = grade.shadows ?? 0;
  const highlights = grade.highlights ?? 0;
  const sat = grade.saturation ?? 1;
  const orange = grade.orangeSaturation ?? 1;
  const bw = grade.bwMix;
  const vig = grade.vignette ?? 0;
  const needsSat = !bw && (sat !== 1 || orange !== 1);
  const needsTone = shadows !== 0 || highlights !== 0;

  const rowF = new Float32Array(h);
  const colF = new Float32Array(w);
  if (vig > 0) {
    for (let y = 0; y < h; y++) {
      const d = y / h - 0.5;
      rowF[y] = 1 - vig * 2 * d * d;
    }
    for (let x = 0; x < w; x++) {
      const d = x / w - 0.5;
      colF[x] = 1 - vig * 2 * d * d;
    }
  }

  let i = 0;
  for (let y = 0; y < h; y++) {
    const rowVig = vig > 0 ? rowF[y] : 1;
    for (let x = 0; x < w; x++, i += 4) {
      let r = lut.r[px[i]];
      let g = lut.g[px[i + 1]];
      let b = lut.b[px[i + 2]];

      if (needsTone || vig > 0) {
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        let f = rowVig * (vig > 0 ? colF[x] : 1);
        if (needsTone) {
          if (shadows !== 0) {
            const mask = (1 - lum) * (1 - lum);
            f *= 1 - shadows * 0.45 * mask;
          }
          if (highlights !== 0) {
            const mask = lum * lum;
            f *= 1 + highlights * 0.45 * mask;
          }
        }
        r *= f;
        g *= f;
        b *= f;
      }

      if (bw) {
        const gray = bw[0] * r + bw[1] * g + bw[2] * b;
        r = gray;
        g = gray;
        b = gray;
      } else if (needsSat) {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        let s = sat;
        // skin-hue zone: r dominant, warm, not extreme — desaturate it only
        if (orange !== 1 && r > g && g >= b - 12 && r - b > 24 && r > 60) {
          s *= orange;
        }
        r = l + (r - l) * s;
        g = l + (g - l) * s;
        b = l + (b - l) * s;
      }

      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64[i]] = i;

function base64ToBytes(b64: string): Uint8Array {
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

function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < n;
    const has2 = i + 2 < n;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    parts.push(B64[b0 >> 2]);
    parts.push(B64[((b0 & 3) << 4) | (b1 >> 4)]);
    parts.push(has1 ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=');
    parts.push(has2 ? B64[b2 & 63] : '=');
  }
  return parts.join('');
}

/**
 * Center-crops a captured JPEG to the framing aspect (native, fast). Runs
 * BEFORE grading so the grade processes only the kept pixels.
 */
export async function cropToAspect(
  uri: string,
  width: number,
  height: number,
  aspect: number,
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
  const actions: ImageManipulator.Action[] = [
    { crop: { originX: x, originY: y, width: cw, height: ch } },
  ];
  if (maxLongEdge && Math.max(cw, ch) > maxLongEdge) {
    actions.push(
      cw >= ch
        ? { resize: { width: maxLongEdge } }
        : { resize: { height: maxLongEdge } },
    );
  }
  const out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.95,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: out.uri, width: out.width, height: out.height };
}

/** Develop-time capture options from the dashboard (Chapter 15). */
export type DevelopOptions = {
  /** Manual exposure compensation in EV (−2…+2). */
  ev?: number;
  /** Simulated ISO: gain + proportional grain. 0/undefined = none. */
  iso?: number;
  /** Tone style: HDR lifts shadows and recovers highlights. */
  tone?: 'ldr' | 'hdr';
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
    const resized = await ImageManipulator.manipulateAsync(sourceUri, [action], {
      compress: 0.95,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    uri = resized.uri;
  }

  // 2. Read + decode. (RN fetch on file:// returns error-text bodies for
  // missing/unreadable files, so read bytes through the file system module.)
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const raw = jpeg.decode(base64ToBytes(b64), { useTArray: true });

  // 3. Grade in place, with EV / simulated-ISO / HDR tone folded into the grade.
  const isoGain = options.iso && options.iso > 0 ? options.iso / 100 : 0;
  const evBoost = (isoGain > 0 ? Math.log2(isoGain) : 0) + (options.ev ?? 0);
  const effective: PhotoGrade =
    options.tone === 'hdr'
      ? {
          ...grade,
          exposure: (grade.exposure ?? 0) + evBoost,
          contrast: Math.min(grade.contrast ?? 0, 0.08),
          shadows: -0.18,
          highlights: 0.25,
          saturation: Math.max(grade.saturation ?? 1, 1.02),
        }
      : { ...grade, exposure: (grade.exposure ?? 0) + evBoost };
  applyGrade(raw.data, raw.width, raw.height, effective);

  // 4. Simulated ISO grain, proportional to sqrt(gain).
  if (isoGain > 1) {
    const amp = Math.min(30, Math.sqrt(isoGain) * 7);
    for (let i = 0; i < raw.data.length; i += 4) {
      const n = (Math.random() - 0.5) * amp;
      // Uint8ClampedArray is not required here — clamp manually.
      raw.data[i] = Math.max(0, Math.min(255, raw.data[i] + n));
      raw.data[i + 1] = Math.max(0, Math.min(255, raw.data[i + 1] + n));
      raw.data[i + 2] = Math.max(0, Math.min(255, raw.data[i + 2] + n));
    }
  }

  // 5. Encode + write to cache.
  const out = jpeg.encode({ data: raw.data, width: raw.width, height: raw.height }, 90);
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('no cache directory');
  const outUri = `${cacheDir}camen_developed_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outUri, toBase64(out.data), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { uri: outUri, width: raw.width, height: raw.height };
}
