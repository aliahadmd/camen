/**
 * Node unit tests for the portrait depth math (portraitMath.ts) — run with:
 *   node scripts/test-portrait-math.ts
 * Node 24 strips TS types natively; the .ts extension in the import is required.
 * No expo/native imports allowed in portraitMath.ts — that's what keeps this testable.
 */
import assert from 'node:assert/strict';

import {
  APERTURE_STOPS,
  bokehToFNumber,
  bokehToStopIndex,
  blurF32,
  buildDepthLayers,
  compositePortrait,
  downsampleMask,
  maskCoverage,
  sampleF32,
  stopIndexToBokeh,
} from '../src/features/portraitMath.ts';

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log('  ok —', name);
}

// ---- aperture mapping -------------------------------------------------------
ok('stop ↔ bokeh round-trip + endpoints', () => {
  assert.equal(stopIndexToBokeh(0), 1);
  assert.equal(stopIndexToBokeh(7), 0);
  for (let i = 0; i <= 7; i++) {
    assert.equal(bokehToStopIndex(stopIndexToBokeh(i)), i);
  }
  assert.equal(bokehToFNumber(1), 1.4);
  assert.equal(bokehToFNumber(0), 16);
  assert.equal(APERTURE_STOPS[bokehToStopIndex(0.71)], 2.8);
});

// ---- blur -------------------------------------------------------------------
ok('blurF32 preserves the mean and flattens a constant plane', () => {
  const w = 40;
  const h = 30;
  const flat = new Float32Array(w * h).fill(0.73);
  const out = blurF32(flat, w, h, 5, 2);
  for (let i = 0; i < out.length; i++) assert.ok(Math.abs(out[i] - 0.73) < 1e-6);

  const noise = new Float32Array(w * h).map((_, i) => (i % 3) * 0.5);
  const meanIn = noise.reduce((a, b) => a + b, 0) / noise.length;
  const blurred = blurF32(noise, w, h, 4);
  const meanOut = blurred.reduce((a, b) => a + b, 0) / blurred.length;
  assert.ok(Math.abs(meanIn - meanOut) < 1e-6);
  const varIn = noise.reduce((a, v) => a + (v - meanIn) ** 2, 0) / noise.length;
  const varOut = blurred.reduce((a, v) => a + (v - meanOut) ** 2, 0) / blurred.length;
  assert.ok(varOut < varIn * 0.2, `variance should collapse: ${varOut} vs ${varIn}`);
});

// ---- mask plumbing ----------------------------------------------------------
ok('downsampleMask keeps a uniform mask uniform and coverage honest', () => {
  const mask = new Float32Array(64 * 64).fill(0.4);
  const grid = downsampleMask(mask, 64, 64, 16, 16);
  for (const v of grid) assert.ok(Math.abs(v - 0.4) < 1e-6);
  assert.ok(Math.abs(maskCoverage(grid) - 0.4) < 1e-6);
});

ok('sampleF32 clamps outside coordinates', () => {
  const src = new Float32Array([1, 2, 3, 4]);
  assert.equal(sampleF32(src, 2, 2, -5, -5), 1);
  assert.equal(sampleF32(src, 2, 2, 99, 99), 4);
  assert.equal(sampleF32(src, 2, 2, 0.5, 0.5), 2.5);
});

// ---- layer build + composite ------------------------------------------------
// Synthetic scene: 64×64 grid. Sharp checkerboard background + bright specular;
// centered person block (uniform gray). Composite runs at "full res" 128×128.
function buildScene() {
  const gw = 64;
  const gh = 64;
  const r = new Uint8Array(gw * gh);
  const g = new Uint8Array(gw * gh);
  const b = new Uint8Array(gw * gh);
  const mask = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const p = y * gw + x;
      const subject = x >= 20 && x < 44 && y >= 20 && y < 44;
      if (subject) {
        r[p] = 180;
        g[p] = 150;
        b[p] = 130;
        mask[p] = 1;
      } else {
        const checker = (x >> 1) % 2 === (y >> 1) % 2 ? 200 : 20; // high-frequency bg
        r[p] = checker;
        g[p] = checker;
        b[p] = checker;
      }
    }
  }
  // bright specular in the background (glow source)
  for (let y = 2; y < 8; y++) {
    for (let x = 2; x < 8; x++) {
      const p = y * gw + x;
      r[p] = 255;
      g[p] = 255;
      b[p] = 255;
    }
  }
  return { gw, gh, ch: { r, g, b }, mask };
}

const scene = buildScene();
const layers = buildDepthLayers(scene.ch, scene.gw, scene.gh, scene.mask, {
  bokeh: 0.9,
  bokehGlow: 0.5,
  bgTone: 0,
});

ok('subject mask survives feathering at the center', () => {
  assert.ok(Math.abs(layers.sharp[32 * 64 + 32] - 1) < 0.05, 'center stays ~1');
  assert.ok(layers.sharp[0] < 0.01, 'far corner stays ~0');
});

ok('proximity is higher next to the subject than far away', () => {
  const near = layers.proximity[20 * 64 + 10]; // 10px left of subject edge
  const far = layers.proximity[60 * 64 + 2]; // far corner
  assert.ok(near > far + 0.05, `near ${near} should exceed far ${far}`);
});

ok('far band destroys the background checkerboard, near band softens it', () => {
  const variance = (arr) => {
    let varSum = 0;
    // sample a clean bg strip: left of the subject (x<20) and well below the
    // specular block (y>8) so blur bleed-in from either can't dominate
    const vals = [];
    for (let y = 30; y < 40; y++) for (let x = 2; x < 10; x++) vals.push(arr[y * 64 + x]);
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    for (const v of vals) varSum += (v - mean) ** 2;
    return varSum / vals.length;
  };
  const origVar = variance(Float32Array.from(scene.ch.r));
  const nearVar = variance(layers.near.r);
  const farVar = variance(layers.far.r);
  assert.ok(farVar < origVar * 0.05, `far should flatten: ${farVar} vs ${origVar}`);
  assert.ok(nearVar < origVar * 0.5 && nearVar > farVar, 'near band between original and far');
});

ok('composite keeps subject pixels exact and blurs the far background', () => {
  // Full-res composite at 2× the grid so each grid cell covers 2×2 pixels.
  const w = 128;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const sp = (y >> 1) * 64 + (x >> 1);
      data[p * 4] = scene.ch.r[sp];
      data[p * 4 + 1] = scene.ch.g[sp];
      data[p * 4 + 2] = scene.ch.b[sp];
      data[p * 4 + 3] = 255;
    }
  }
  compositePortrait(data, w, h, layers, 0);

  const px = (x, y) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  // subject center — untouched (m ≈ 1)
  assert.deepEqual(px(63, 63), [180, 150, 130]);
  // far background — mid-gray (checker collapsed toward ~110), NOT 200 or 20
  const [br, bg2, bb] = px(5, 63);
  assert.ok(Math.abs(br - 110) < 25 && Math.abs(bg2 - 110) < 25 && Math.abs(bb - 110) < 25,
    `far bg should be blurred mid-gray, got ${br},${bg2},${bb}`);
  // background no longer contains the extreme checker values
  let minV = 255;
  let maxV = 0;
  for (let y = 40; y < 88; y += 4) {
    for (let x = 2; x < 32; x += 4) {
      const v = px(x, y)[0];
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  assert.ok(maxV - minV < 40, `bg dynamic range should shrink, got ${maxV - minV}`);
});

ok('bgTone < 0 darkens the background without touching the subject', () => {
  const layers2 = buildDepthLayers(scene.ch, scene.gw, scene.gh, scene.mask, {
    bokeh: 0.9,
    bokehGlow: 0,
    bgTone: -0.8,
  });
  const w = 128;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const sp = (y >> 1) * 64 + (x >> 1);
      data[p * 4] = scene.ch.r[sp];
      data[p * 4 + 1] = scene.ch.g[sp];
      data[p * 4 + 2] = scene.ch.b[sp];
      data[p * 4 + 3] = 255;
    }
  }
  compositePortrait(data, w, h, layers2, 0);
  const i = (100 * w + 5) * 4; // clean bg (left of subject, below specular)
  const subj = (63 * w + 63) * 4; // subject center
  assert.equal(data[subj], 180, 'subject unchanged under bgTone');
  assert.ok(data[i] < 75, `stage-darkened bg should be dark, got ${data[i]}`);
});

ok('glow bleeds energy into the blurred background near highlights', () => {
  const w = 128;
  const h = 128;
  const paint = (glowAmount) => {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const sp = (y >> 1) * 64 + (x >> 1);
        data[p * 4] = scene.ch.r[sp];
        data[p * 4 + 1] = scene.ch.g[sp];
        data[p * 4 + 2] = scene.ch.b[sp];
        data[p * 4 + 3] = 255;
      }
    }
    compositePortrait(data, w, h, layers, glowAmount);
    return data[((5 * w + 5) * 4) + 0]; // bg pixel below the specular block
  };
  const without = paint(0);
  const withGlow = paint(0.6);
  assert.ok(withGlow > without + 10, `glow should add energy: ${withGlow} vs ${without}`);
});

console.log(`\n${passed} portrait math tests passed.`);
