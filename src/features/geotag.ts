import * as FileSystem from 'expo-file-system/legacy';
import * as piexif from 'piexifjs';

/**
 * Injects GPS coordinates into a JPEG's EXIF (best-effort, in place).
 * piexifjs is pure JS — works in Expo Go. Existing EXIF (capture time, camera
 * model, orientation) is loaded and preserved; only the GPS block is written.
 * The DB row keeps lat/lon as the reliable record even if EXIF injection fails.
 */
export async function injectGpsExif(
  jpegUri: string,
  lat: number,
  lon: number,
): Promise<void> {
  const b64 = await FileSystem.readAsStringAsync(jpegUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const dataUrl = 'data:image/jpeg;base64,' + b64;

  const toDms = (v: number): [number, number][][] => {
    const abs = Math.abs(v);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = Math.round((minFloat - min) * 6000);
    return [
      [
        [deg, 1],
        [min, 1],
        [sec, 100],
      ],
    ];
  };

  const gps: Record<number, unknown> = {
    [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
    [piexif.GPSIFD.GPSLatitudeRef]: lat < 0 ? 'S' : 'N',
    [piexif.GPSIFD.GPSLatitude]: toDms(lat),
    [piexif.GPSIFD.GPSLongitudeRef]: lon < 0 ? 'W' : 'E',
    [piexif.GPSIFD.GPSLongitude]: toDms(lon),
  };

  // Merge into the photo's own EXIF instead of replacing it — the capture
  // DateTime, Make/Model and Orientation must survive the geotag.
  let ifds: Record<string, Record<number, unknown>>;
  try {
    const loaded = piexif.load(dataUrl);
    ifds = {
      '0th': { ...(loaded['0th'] ?? {}) },
      Exif: { ...(loaded['Exif'] ?? {}) },
      GPS: { ...(loaded['GPS'] ?? {}), ...gps },
    };
  } catch {
    // Unreadable EXIF (or none) — fall back to writing GPS alone.
    ifds = { '0th': {}, Exif: {}, GPS: gps };
  }

  const exifBytes = piexif.dump(ifds);
  const newDataUrl = piexif.insert(exifBytes, dataUrl);
  const outB64 = newDataUrl.replace(/^data:image\/jpeg;base64,/, '');
  await FileSystem.writeAsStringAsync(jpegUri, outB64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
