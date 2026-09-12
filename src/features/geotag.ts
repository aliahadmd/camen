import * as FileSystem from 'expo-file-system/legacy';
import * as piexif from 'piexifjs';

/**
 * Injects GPS coordinates into a JPEG's EXIF (best-effort, in place).
 * piexifjs is pure JS — works in Expo Go. The DB row keeps lat/lon as the
 * reliable record even if EXIF injection fails.
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

  const exifBytes = piexif.dump({ '0th': {}, GPS: gps });
  const newDataUrl = piexif.insert(exifBytes, dataUrl);
  const outB64 = newDataUrl.replace(/^data:image\/jpeg;base64,/, '');
  await FileSystem.writeAsStringAsync(jpegUri, outB64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
