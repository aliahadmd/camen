declare module 'piexifjs' {
  export const GPSIFD: Record<string | number, number>;
  export const ImageIFD: Record<string | number, number>;
  export const ExifIFD: Record<string | number, number>;
  export function dump(exifDict: Record<string, unknown>): string;
  export function insert(exifBytes: string, jpegData: string): string;
  export function load(jpegData: string): Record<string, unknown>;
}
