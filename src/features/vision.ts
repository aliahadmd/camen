import { rlog } from '../log';
import { decodeNativeMask, type DepthMask } from './visionMask';
export type { DepthMask } from './visionMask';

type NativeSegmentResult = { width: number; height: number; mask: Uint8Array };
type NativeVision = { segmentSelfie(uri: string, rawSizeMask: boolean): Promise<NativeSegmentResult> };

// Undefined = not resolved yet, null = native module missing (no bokeh this session).
let nativeMod: NativeVision | null | undefined;

function loadNative(): NativeVision | null {
  if (nativeMod !== undefined) return nativeMod;
  try {
    // Lazy require so a stale build without the native module degrades to
    // "portrait blur unavailable" instead of crashing the camera at startup.
    // Metro interop: the ES module ships the native module as .default.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const imported = require('../../modules/camen-vision');
    nativeMod = ((imported && imported.default) || imported) as NativeVision;
  } catch (e) {
    rlog('[camen] camen-vision native module unavailable:', e);
    nativeMod = null;
  }
  return nativeMod;
}

/** Runs ML Kit selfie segmentation on an image file. Null when unavailable. */
export async function getSelfieMask(uri: string): Promise<DepthMask | null> {
  const mod = loadNative();
  if (!mod) return null;
  const res = await mod.segmentSelfie(uri, true);
  // The bridge result is untrusted: validate shape/length/confidences before it
  // reaches the portrait pipeline (audit: "settings and native-mask results
  // lack shape/length validation").
  try {
    return decodeNativeMask(res);
  } catch (e) {
    rlog('[camen] invalid segmentation payload:', e);
    return null;
  }
}
