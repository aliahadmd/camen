/** Person-confidence mask on the model's grid, not measured scene depth. */
export type DepthMask = { width: number; height: number; data: Float32Array };

// Matches the native decoded-image budget; validate before allocating JS floats.
const MAX_MASK_PIXELS = 768 * 768;

function maskSize(width: unknown, height: unknown): number {
  if (typeof width !== 'number' || typeof height !== 'number' ||
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 || width * height > MAX_MASK_PIXELS) {
    throw new Error('Invalid person mask dimensions');
  }
  return width * height;
}

export function validateDepthMask(mask: DepthMask): void {
  const count = maskSize(mask?.width, mask?.height);
  if (!(mask.data instanceof Float32Array) || mask.data.length !== count) {
    throw new Error('Invalid person mask data length/type');
  }
  for (const value of mask.data) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error('Invalid person mask confidence');
    }
  }
}

/** Decode untrusted bridge bytes explicitly as LE, including unaligned subviews. */
export function decodeNativeMask(result: unknown): DepthMask {
  if (!result || typeof result !== 'object') throw new Error('Invalid person mask result');
  const { width, height, mask } = result as Record<string, unknown>;
  const count = maskSize(width, height);
  if (!(mask instanceof Uint8Array) || mask.byteLength !== count * 4) {
    throw new Error('Invalid person mask byte length/type');
  }
  const view = new DataView(mask.buffer, mask.byteOffset, mask.byteLength);
  const data = new Float32Array(count);
  for (let i = 0; i < count; i++) data[i] = view.getFloat32(i * 4, true);
  const decoded = { width: width as number, height: height as number, data };
  validateDepthMask(decoded);
  return decoded;
}
