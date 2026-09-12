# Chapter 14 — Named Framings & Settings Screen

**Goal:** Replace raw pixel sizes with **named framing presets** (Instagram, Square,
Story, WeChat, Wide, Full). The viewfinder masks itself to the chosen shape
(WYSIWYG), the capture is center-cropped to match, and the picker lives in a new
**Settings screen** — decluttering the dashboard.

**Depends on:** Chapters 12–13.

## Design decisions (best practice)

1. **Framing, not resolution, is the user-facing concept.** Social platforms are
   defined by *aspect* (Instagram post 4:5, square 1:1, story 9:16, WeChat moments
   4:3, wide 16:9). Resolution stays at the sensor's maximum and the photo is
   **center-cropped** to the framing — quality is never thrown away, and no pixel
   numbers need to make sense to the user (though the settings rows still show the
   resolved pixels for the current camera).
2. **WYSIWYG viewfinder:** the CameraView is laid out inside the framed rect
   (letterboxed by the ink background) instead of filling the screen. Grid and the
   filter preview are constrained to the same rect; flash ring and Edge Light stay
   screen-wide (they are light, not composition).
3. **Capture = crop:** after `takePictureAsync`, the shot is natively center-cropped
   to the framing aspect (before grading, so grading works on fewer pixels).
   Resolution cap for grading (2560px) is unchanged and documented.
4. **Settings screen** (`gear` icon, top rail): FRAMING list (name + aspect +
   resolved pixels for the current camera, radio-select), MIRROR front toggle,
   DEVICE info. Replaces the dashboard SizeChip entirely.

## Presets

| Name | Aspect | Back (resolved) | Front (resolved) |
|------|--------|-----------------|-------------------|
| Full | native 4:3 | 4096×3072 | 2592×1944 |
| Instagram | 4:5 | 2456×3072 | 1554×1944 |
| Square | 1:1 | 3072×3072 | 1944×1944 |
| Story | 9:16 | 1728×3072 | 1094×1944 |
| WeChat | 4:3, capped 2560 | 2560×1920 | 1944×1458 |
| Wide | 16:9 | 4096×2304 | 2592×1458 |

(WeChat renders Moments-friendly at a 2560px cap; Wide uses the full sensor width.)

## Tasks

- [x] `framings.ts`: preset data + aspect resolve/crop helpers
- [x] Settings: `framing: string` (default `full`), persisted
- [x] `cropToAspect` in gradePhoto (native center-crop before grading)
- [x] CameraScreen: framed CameraView/grid/filter layout, gear button
- [x] `SettingsScreen.tsx`: framing rows + mirror toggle + device info
- [x] Remove SizeChip from the dashboard and the pictureSize plumbing
- [x] DB: `framing` column (guarded migration) + per-shot record

## Acceptance

- [x] Selecting Square shows a square viewfinder; the saved file is square
      (verified on device: 2560×2560 Graphite-graded square, 12:01 AM record)
- [x] All six framings resolve to correct pixel dims for both cameras
- [x] Settings screen lists presets with names + resolved pixels; selection persists
- [x] Dashboard is decluttered (SizeChip removed); no regression to other features
- [x] Full still captures max-resolution unfiltered shots (quality preserved)
