import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import piexif from 'piexifjs';
import { geotagJpeg } from '../src/features/gpsExif.ts';

const encoded = jpeg.encode({ width: 2, height: 2, data: Buffer.from(Array(4).fill([120, 80, 40, 255]).flat()) }, 90);
const original = `data:image/jpeg;base64,${encoded.data.toString('base64')}`;
const withExif = piexif.insert(piexif.dump({ '0th': { [piexif.ImageIFD.Make]: 'Camen fixture', [piexif.ImageIFD.Orientation]: 6 } }), original).split(',')[1];
const coordinate = (parts: number[][], ref: string) =>
  (parts[0][0] / parts[0][1] + parts[1][0] / parts[1][1] / 60 + parts[2][0] / parts[2][1] / 3600) * (ref === 'S' || ref === 'W' ? -1 : 1);
for (const [lat, lon] of [[23.8103, 90.4125], [-33.8688, -151.2093], [89.9999999, 179.9999999], [0, 0]]) {
  const result = geotagJpeg(withExif, lat, lon);
  const read = piexif.load(`data:image/jpeg;base64,${result}`);
  assert.ok(Math.abs(coordinate(read.GPS[piexif.GPSIFD.GPSLatitude], read.GPS[piexif.GPSIFD.GPSLatitudeRef]) - lat) < 0.000003);
  assert.ok(Math.abs(coordinate(read.GPS[piexif.GPSIFD.GPSLongitude], read.GPS[piexif.GPSIFD.GPSLongitudeRef]) - lon) < 0.000003);
  assert.equal(read['0th'][piexif.ImageIFD.Make], 'Camen fixture');
  assert.equal(read['0th'][piexif.ImageIFD.Orientation], 6);
  assert.deepEqual(jpeg.decode(Buffer.from(result, 'base64')).data, jpeg.decode(encoded.data).data);
}
assert.throws(() => geotagJpeg(withExif, 91, 0), /Invalid GPS/);
console.log('GPS JPEG round trips passed: coordinates, hemispheres, rounding, EXIF and pixels preserved.');

const hook = readFileSync(new URL('../src/features/useCamera.ts', import.meta.url), 'utf8');
const save = hook.slice(hook.indexOf('const saveShot = useCallback('), hook.indexOf('const saveShot = useCallback(') + 7000);
assert.match(save, /await injectGpsExif\(/, 'saveShot must write GPS to the JPEG, not only the database');
assert.match(save, /sourceUri: archiveSource/, 'archive must use the prepared GPS copy');
console.log('GPS save-path wiring passed.');
