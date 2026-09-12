# Chapter 6 — Zoom: Pinch + Hardware Presets

**Goal:** Natural zoom: pinch anywhere on the viewfinder, plus tappable preset pills at the phone's
real stops. The K80 Pro exposes a genuine **0.6×–10×** ratio range with three physical lenses behind
one logical camera, so presets are optical truth, not fake labels.

**Depends on:** Chapters 2–3.

## Device facts (from hardware-report.md)

- Back: zoom ratio range **0.6–10.0**, max digital 10.0. Lenses: ultrawide (0.6×) → main (1×) →
  telephoto (~2.5× blend) → digital crop to 10×.
- Front: **1×–10× digital only**, fixed-focus 5 MP sensor → no pills on front.

## Tasks

- [ ] **Pinch gesture** (`react-native-gesture-handler` `PinchGestureHandler` or `Gesture.Pinch()`):
      pinch scale maps onto the current zoom across the full 0.6–10 ratio range; anchored and smooth
      (no jumps); works even while the grid overlay is on.
- [ ] **Zoom pills** above the shutter rail, from `DeviceProfile.zoomStops`: **`0.6` `1` `2.5` `10`**.
      Active pill fills in `brass`, others ghost-outline. Pills hidden on the front camera
      (digital-only zoom there; pinch still allowed).
- [ ] **Mapping layer** in `deviceProfile.ts` — Expo's `CameraView.zoom` is normalized 0…1 over the
      device range, so convert both directions:

  ```ts
  const ratioToNormalized = (r: number) => (r - MIN) / (MAX - MIN); // 0.6…10 on this device
  const normalizedToRatio = (z: number) => MIN + z * (MAX - MIN);
  ```

  Because the range is real, no fake preset spreading is needed (`zoomNormalized: false`).
- [ ] Animated zoom transitions when tapping a pill (animate `CameraView.zoom` over ~180ms, ease-out),
      instant zoom while pinching.
- [ ] Clamp + haptic tick (`selectionAsync`) when a pill engages; zoom resets to 1× when switching
      to the front camera and restores to last back-camera zoom on switch back (state kept per side).
- [ ] Lens behavior note: the HAL blends physical lenses automatically across the range — never
      attempt to pick physical camera IDs directly; keep everything on the logical camera.

## Implementation notes

```tsx
// inside useCamera()
const setZoomFromPinch = (scale: number) => {
  const nextRatio = clamp(startRatio * scale, 0.6, 10);
  runOnJS(setZoom)(ratioToNormalized(nextRatio));
};
```

The zoom readout ("2.5×") is NOT shown by default — minimalism. It appears as a faint monospaced
label under the top rail for 1s while actively zooming, then fades. Same pattern as the grid label.

## Acceptance

- [ ] Pinch zooms smoothly 0.6×–10× on the physical device, no flicker, works with grid on
- [ ] Pills `0.6 / 1 / 2.5 / 10` map to visibly correct fields of view (ultrawide confirmed at 0.6)
- [ ] Active pill + zoom readout behavior matches spec, haptic tick on pill select
- [ ] Per-side zoom state: front resets to 1×, back restores its last value; no pills on front
