import * as FileSystem from 'expo-file-system/legacy';
import { geotagJpeg } from './gpsExif';

/** Writes to a caller-owned copy so failure never corrupts the capture. */
export async function injectGpsExif(jpegUri: string, lat: number, lon: number): Promise<void> {
  const base64 = await FileSystem.readAsStringAsync(jpegUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const output = geotagJpeg(base64, lat, lon);
  await FileSystem.writeAsStringAsync(jpegUri, output, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
