declare module 'jpeg-js' {
  export interface RawImageData {
    width: number;
    height: number;
    data: Uint8Array;
    comments?: string[];
  }
  export interface DecodeOptions {
    useTArray?: boolean;
    colorTransform?: boolean;
    formatAsRGBA?: boolean;
    maxMemoryUsageInMB?: number;
  }
  export function decode(data: Uint8Array, opts?: DecodeOptions): RawImageData;
  export function encode(
    imgData: { data: Uint8Array; width: number; height: number },
    quality?: number,
  ): RawImageData;
}
