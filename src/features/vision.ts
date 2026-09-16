import { rlog } from '../log';

/** Person-confidence mask at the decoded bitmap's resolution. */
export type DepthMask = { width: number; height: number; data: Float32Array };

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
  // Little-endian float32 confidences arrive as bytes; view them as floats,
  // copying only if the backing buffer is misaligned (defensive — it never is).
  const bytes = res.mask;
  const data =
    bytes.byteOffset % 4 === 0
      ? new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2)
      : new Float32Array(new Uint8Array(bytes).buffer);
  return { width: res.width, height: res.height, data };
}
