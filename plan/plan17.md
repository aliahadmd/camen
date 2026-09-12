# Chapter 17 — GPU Grading Migration (VisionCamera + Skia, dev build)

**Goal:** Replace the JS develop pipeline and the overlay-tint preview with
**GPU grading on the camera stream** using `react-native-vision-camera` +
`@shopify/react-native-skia`. Same look on the live preview and the saved file,
instant capture, and access to the tools Skia ships: color matrices,
brightness/contrast/saturation/hue, blur, blend modes, custom SkSL runtime
shaders, GPU texture rendering.

**Gated on:** a development build (Chapter 10 step 1). Skia and VisionCamera ship
native code and are **not available in Expo Go** — this is the one remaining
reason the current release (v1.6.1) uses the JS fallback pipeline
(`gradePhoto.ts`) and overlay previews.

## Tool mapping (what replaces what)

| Current (Expo Go fallback) | Skia / VisionCamera (dev build) |
|---|---|
| Overlay-tint preview approximation | **Runtime shader on the live stream** — the exact look, real time |
| `jpeg-js` decode + JS pixel loop (2–4 s) | GPU shader via `SkImage.makeShader` + `makeImageSnapshotAsync` (milliseconds) |
| `PhotoGrade` exposure/contrast/temp/saturation | `ColorFilter.MakeMatrix` (4×5 color matrix) — one GPU pass |
| Shadows/highlights/vignette/grain | SkSL `RuntimeEffect` (same shader reused for preview + capture) |
| Skin-zone saturation heuristic | Proper HSV hue-range mask in SkSL (true "no orange skin" control) |
| Blur (future portrait) | `ImageFilter.MakeBlur` |
| Edge Light / filter layering | Skia `BlendMode` composition |
| `expo-camera` CameraView | `react-native-vision-camera` `Camera` + `SkiaFrameProcessor` |

## Architecture

```
VisionCamera (frames) ──► SkiaFrameProcessor ──► RuntimeShader(grade.sksl) ──► preview canvas
                                                      │
takePhoto() ──────────► same shader ──► makeImageSnapshot ──► JPEG/WEBP ──► archive/DB/gallery
```

- **One shader = one look.** `PhotoGrade` stays the data source of truth; a small
  compiler emits the SkSL uniforms (exposure, contrast, WB, saturation,
  skin-hue mask, vignette, grain, B&W mixer) from the same presets in
  `filters.ts`. What you see is literally what you save.
- **EXIF/GPS** still injected with `piexifjs` after the snapshot (unchanged).
- **ISO/HDR honesty**: VisionCamera exposes real low-light boost and format-level
  controls; HDR can become true multi-frame later. Until then the simulated
  grain/gain remains, now GPU-accelerated.

## Tasks

- [ ] Chapter 10 step 1: create the development build (`eas build -p android
      --profile development` or `npx expo run:android` locally)
- [ ] Install `react-native-vision-camera` + `react-native-skia`; replace
      `expo-camera` CameraView with VisionCamera `Camera`
- [ ] Port `PhotoGrade` presets → SkSL runtime shader (unit-checked against the
      JS engine output on a reference shot)
- [ ] Live preview: `SkiaFrameProcessor` renders the graded stream at full frame
      rate; remove overlay-tint approximation
- [ ] Capture: `takePhoto()` → shader snapshot → archive/DB/gallery (reuse
      Chapter 13 flow); switch `expo-media-library` to the modern API
- [ ] Keep the JS pipeline as a fallback flag for one release, then delete
- [ ] Re-verify: EV ruler, framings, timer, rapid fire, anti-shake, geotag —
      all through the new camera

## Acceptance

- [ ] Live preview shows the **exact** filter look (no approximation), 30+ fps
- [ ] Filtered capture is instant (no DEVELOPING delay)
- [ ] Grain/vignette/skin-zone grading visibly better than the JS fallback
- [ ] All Chapter 13–15 features still pass their acceptance lists
- [ ] Expo Go fallback release retained (v1.6.1 tag) for emergencies
