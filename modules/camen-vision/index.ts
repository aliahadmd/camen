import { requireNativeModule } from 'expo-modules-core';

export type SegmentResult = {
  /** Mask width in px (matches the decoded bitmap). */
  width: number;
  /** Mask height in px. */
  height: number;
  /** Little-endian float32 confidences (0 = background, 1 = person), row-major. */
  mask: Uint8Array;
};

declare const CamenVisionNativeModule: {
  segmentSelfie(uri: string, rawSizeMask: boolean): Promise<SegmentResult>;
};

export default requireNativeModule('CamenVision') as typeof CamenVisionNativeModule;
