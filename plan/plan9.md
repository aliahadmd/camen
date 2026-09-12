# Chapter 9 — Capture Pipeline, Gallery & Settings Persistence

**Goal:** Shots land in the gallery with correct orientation and metadata; a last-shot thumbnail
gives quiet confirmation; all feature settings survive restarts through one small store.

**Depends on:** Chapters 2, 4, 7, 8 (integrates everything that sets state).

## Tasks

- [ ] **Capture pipeline hardening** (extends `useCamera`):
  - Queue captures — ignore shutter taps while a shot is processing (debounced busy state).
  - `quality: 0.92`, handle EXIF orientation (let `takePictureAsync` apply it; verify portrait photos
    are upright in gallery on the physical device).
  - Mirror front-camera photos to match the mirrored preview (consistent "what you see is what you get"),
    toggleable later in settings if it annoys.
  - File naming `camen_YYYYMMDD_HHMMSS.jpg` before handing to `MediaLibrary.createAssetAsync`.
- [ ] **Last-shot thumbnail** (bottom-left corner, 40px round): shows the most recent capture via
      `MediaLibrary.getAssetsAsync({ first: 1, sortBy: creationDate })`; tap opens the photo in the
      system gallery. Fades in after each shot.
- [ ] **Settings store** (`src/features/useSettings.ts`, AsyncStorage JSON):
      `{ grid, flashMode, facing, filterId, timerSeconds, mirrorFront, timerSound }` — single
      `load()/patch()` API, written on change (debounced 300ms), loaded before first render of controls.
- [ ] **Failure handling:** disk-full / permission-revoked mid-session → capture shows a subtle red
      ring pulse on the shutter and the app keeps functioning (photo still shown via preview URI even
      if gallery save failed).
- [ ] Verify saved assets carry EXIF (timestamp) and land in the standard camera folder on your phone.

## Implementation notes

Keep the pipeline synchronous-looking from the UI: `shoot()` returns void, state machine
`ready → capturing → saving → ready` drives shutter disabled-look and thumbnail refresh. All
feature flags read from the store at mount — no prop-drilling, one context.

## Acceptance

- [ ] Rapid shutter taps can't crash or double-save; every successful shot lands in the gallery
- [ ] Front-camera selfie in the gallery matches the mirrored preview orientation
- [ ] Thumbnail updates after each shot and deep-links to the system gallery
- [ ] Every Chapter 4–8 setting survives force-kill and relaunch
