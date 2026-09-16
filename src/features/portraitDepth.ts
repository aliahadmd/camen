import * as FileSystem from 'expo-file-system/legacy';
import jpeg from 'jpeg-js';

import { rlog } from '../log';
import { base64ToBytes, toBase64 } from './gradePhoto';
import {
  bokehToStopIndex,
  bokehToFNumber,
  buildDepthLayers,
  compositePortrait,
  downsampleChannel,
  downsampleMask,
  maskCoverage,
} from './portraitMath';
import { getSelfieMask, type DepthMask } from './vision';

/** Portrait depth options carried in DevelopOptions (bokeh 0 = portrait off). */
export type PortraitDepthOptions = { bokeh: number; bokehGlow: number; bgTone: number };

/** Human label for the current aperture, e.g. `f/2.8`. */
export function apertureLabel(bokeh: number): string {
  return `f/${bokehToFNumber(bokeh)}`;
}

/** f-stop ruler index for the current strength (0…7). */
export function apertureIndex(bokeh: number): number {
  return bokehToStopIndex(bokeh);
}

/** Working grid long edge — all blur work happens here, composite stays full-res. */
const GRID_EDGE = 512;
/** Below/above this subject coverage the mask is junk — skip blurring entirely. */
const MIN_COVERAGE = 0.015;
const MAX_COVERAGE = 0.985;

/**
 * Applies portrait depth bokeh to a developed JPEG: person stays sharp, the
 * background gets a proximity-ramped blur with optional highlight glow and
 * tone shift. Returns null when segmentation says there is no usable subject
 * (caller keeps the graded capture). Runs inside the caller's watchdog.
 */
export async function applyPortraitDepth(
  fileUri: string,
  maskProvider: () => Promise<DepthMask | null>,
  opts: PortraitDepthOptions,
): Promise<{ uri: string; width: number; height: number } | null> {
  rlog('[camen] portrait: fetching mask');
  const mask = await maskProvider();
  if (!mask) return null;

  // Read + decode the developed frame (same plumbing as developPhoto).
  const b64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const raw = jpeg.decode(base64ToBytes(b64), { useTArray: true });
  const w = raw.width;
  const h = raw.height;
  rlog('[camen] portrait: decoded', w, 'x', h, 'mask', mask.width, 'x', mask.height);

  // Grid geometry — same aspect as the frame.
  const scale = GRID_EDGE / Math.max(w, h);
  const gw = Math.max(8, Math.round(w * scale));
  const gh = Math.max(8, Math.round(h * scale));

  const srcRGBA = raw.data;
  const ch = {
    r: new Uint8Array(w * h),
    g: new Uint8Array(w * h),
    b: new Uint8Array(w * h),
  };
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    ch.r[p] = srcRGBA[i];
    ch.g[p] = srcRGBA[i + 1];
    ch.b[p] = srcRGBA[i + 2];
  }

  const gridCh = {
    r: downsampleChannel(ch.r, w, h, gw, gh),
    g: downsampleChannel(ch.g, w, h, gw, gh),
    b: downsampleChannel(ch.b, w, h, gw, gh),
  };
  const gridMask = downsampleMask(mask.data, mask.width, mask.height, gw, gh);
  const coverage = maskCoverage(gridMask);
  if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) {
    rlog('[camen] portrait: coverage', coverage.toFixed(3), '— no usable subject, skipping');
    return null;
  }

  rlog('[camen] portrait: building layers');
  const layers = buildDepthLayers(gridCh, gw, gh, gridMask, opts);

  rlog('[camen] portrait: compositing');
  compositePortrait(srcRGBA, w, h, layers, opts.bokehGlow);

  // Encode + write beside the other develop cache files.
  rlog('[camen] portrait: encoding');
  const out = jpeg.encode({ data: srcRGBA, width: w, height: h }, 90);
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('no cache directory');
  const outUri = `${cacheDir}camen_portrait_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outUri, toBase64(out.data), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { uri: outUri, width: w, height: h };
}
