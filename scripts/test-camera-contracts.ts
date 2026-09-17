import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countdownDisplay, K80_ZOOM_RANGES, ratioToNormalized, normalizedToRatio, rulerPadding, rulerIndex } from '../src/features/cameraMath.ts';
import { previewAspect, frameRect } from '../src/features/framings.ts';

for (const [ms, seconds] of [[10000, 10], [1001, 2], [1000, 1], [1, 1]]) {
  assert.equal(countdownDisplay(ms, 10000).seconds, seconds);
}
assert.equal(countdownDisplay(10000, 10000).progress, 1);
assert.equal(countdownDisplay(5000, 10000).progress, 0.5);
for (const range of Object.values(K80_ZOOM_RANGES)) {
  for (const ratio of [range.zoomMinRatio, 1, 2.5, range.zoomMaxRatio]) {
    assert.ok(Math.abs(normalizedToRatio(range, ratioToNormalized(range, ratio)) - ratio) < 1e-10);
  }
}
assert.equal(ratioToNormalized(K80_ZOOM_RANGES.front, 1), 0);
assert.equal(ratioToNormalized(K80_ZOOM_RANGES.back, 0.6), 0);
assert.equal(rulerPadding(400, 30) + 15, 200);
assert.equal(rulerIndex(90, 30, 10), 3);
assert.equal(previewAspect('photo', null), 3 / 4);
assert.equal(previewAspect('video', 1), 9 / 16);
assert.equal(frameRect(previewAspect('photo', null), 400, 800).h, 400 / (3 / 4));
const camera = readFileSync(new URL('../src/components/CameraScreen.tsx', import.meta.url), 'utf8');
assert.match(camera, /settings \? <CameraScreenReady settings=\{settings\}/);
const wrapper = camera.slice(camera.indexOf('export function CameraScreen()'), camera.indexOf('function CameraScreenReady'));
assert.ok(!wrapper.includes('useCamera('), 'engine must not mount with placeholder settings');
console.log('Camera contracts passed: countdown endpoints, active lens zoom, hydration boundary, preview aspects, ruler geometry.');
