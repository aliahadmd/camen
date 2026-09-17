import piexif from 'piexifjs';

export function geotagJpeg(base64: string, lat: number, lon: number): string {
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
    throw new Error('Invalid GPS coordinates');
  }
  const toDms = (value: number): [number, number][] => {
    const total = Math.round(Math.abs(value) * 360000);
    return [[Math.floor(total / 360000), 1], [Math.floor(total / 6000) % 60, 1], [total % 6000, 100]];
  };
  const dataUrl = `data:image/jpeg;base64,${base64}`;
  // Preserve all existing IFDs, including mirrored orientation and thumbnails.
  const ifds = piexif.load(dataUrl);
  ifds.GPS = {
    ...(ifds.GPS ?? {}),
    [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
    [piexif.GPSIFD.GPSLatitudeRef]: lat < 0 ? 'S' : 'N',
    [piexif.GPSIFD.GPSLatitude]: toDms(lat),
    [piexif.GPSIFD.GPSLongitudeRef]: lon < 0 ? 'W' : 'E',
    [piexif.GPSIFD.GPSLongitude]: toDms(lon),
  };
  return piexif.insert(piexif.dump(ifds), dataUrl).replace(/^data:image\/jpeg;base64,/, '');
}
