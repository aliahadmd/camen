# Chapter 15 — Pro Capture Suite (EV ruler, Anti-shake, Rapid Fire, HDR/AEB/ISO, Location, Format, Sound)

**Goal:** The pro capture suite — keeping Camen minimal: capture-time tools live on
the dashboard only when they act on the *current* shot; preferences live in Settings.

**Depends on:** Chapters 9, 12, 13.

## Hardware facts (K80 Pro, probed)

- Motion: **STMicro lsm6dsv accelerometer + gyroscope** present → anti-shake viable.
- expo-camera SDK 57 has **no native EV/ISO props** on Android (web-only types) →
  EV/ISO/HDR/AEB are applied as **real per-pixel tone operations at develop time**
  (grade pipeline, Chapter 12). Honest labeling in UI: ISO is simulated (gain +
  grain), HDR is tone-mapping (not multi-frame).

## Feature → placement split (best practice)

| Feature | Where | Why |
|---------|-------|-----|
| EV ruler (−2…+2, 0.25 steps) | Dashboard strip, toggled by EV chip | real-time capture control |
| Rapid Fire (hold shutter) | Gesture — no dashboard UI | natural gesture; "×N" counter while held |
| Anti-shake steady indicator | Dashboard, only while waiting | live feedback |
| Location geotag | Settings toggle | privacy preference |
| File format JPEG/WEBP | Settings toggle | preference |
| Shutter sound | Settings toggle | preference |
| Anti-shake (auto-steady) | Settings toggle | preference |
| Tone HDR/LDR | Settings radio | style preference |
| AEB bracket (−0.7/0/+0.7) | Settings toggle | output preference (saves 3 files) |
| ISO Auto/100…3200 | Settings radio | simulated look (gain + grain), honestly labeled |

## Best-practice notes

- **Anti-shake "intelligence"**: subscribe to the accelerometer at 60ms; smooth
  magnitude with an EMA; *steady* = |‖a‖ − 9.81| < 0.30 m/s² sustained 600ms.
  Pressing the shutter with anti-shake ON enters **steady-wait**: capture fires at
  the first steady moment (max 4s, then capture anyway); tap cancels. Graceful:
  if the sensor is unavailable the feature is disabled, never blocks capture.
- **Rapid Fire**: `onPressIn` starts a full-resolution burst loop (~HAL speed),
  `onPressOut` stops; a "×N" counter shows progress; shots are saved as
  full-resolution originals (no crop/grade — speed priority, documented) after
  release; each gets its own SQLite row.
- **EV applies at develop** (grade-time exposure in the LUT) — WYSIWYG-ish via a
  preview veil approximation; true HAL EV compensation needs a dev build.
- **AEB** develops three tonal variants (−0.7EV, 0, +0.7EV) of the same capture —
  real bracketed *files*; tone variants, not sensor bracketing (impossible in Go).
- **Location**: `expo-location` foreground permission; coords fetched per capture
  (5s timeout, cached fix), stored in SQLite and injected as GPS EXIF into the
  JPEG via `piexifjs` (best-effort; DB is the fallback record).
- **Format**: JPEG (quality 92) or WEBP (quality 90, ~30% smaller) conversion at
  save; HEIF requires a dev build — out of scope in Expo Go.
- **Shutter sound**: `takePictureAsync({ shutterSound })` — hardware/region may
  still force it on some ROMs (HyperOS: best-effort).

## Tasks

- [ ] `EvRuler.tsx` — manual tick ruler with per-tick haptics (−2…+2, 0.25 step)
- [ ] Settings fields + SettingsScreen sections (CAPTURE / FORMAT / TONE)
- [ ] `useCamera`: EV state, steady-wait (accelerometer), rapid-fire burst loop,
      per-capture location fetch, shutter-sound, format conversion, AEB ×3
- [ ] `geotag.ts`: GPS EXIF injection (piexifjs) — tested in Node first
- [ ] Dashboard: EV ruler strip, steady indicator, burst counter
- [ ] DB: ev/iso/tone/aeb/lat/lon columns (guarded migrations)

## Acceptance

- [ ] EV ruler scrolls with per-tick haptics; +EV visibly brightens developed shot
- [ ] Anti-shake ON: shutter waits for steady hold (indicator), captures on steady;
      OFF: immediate; tap during wait cancels
- [ ] Rapid Fire: hold → ×N counter → N full-res shots saved, N DB rows
- [ ] HDR tone visibly lifts shadows/recovers highlights vs LDR; AEB saves 3 files
- [ ] ISO 1600+ shows grain/gain in the developed shot
- [ ] Location ON: DB row + EXIF GPS present; OFF: no GPS, no permission prompts
- [ ] WEBP files save and preview; shutter sound toggles without errors
- [ ] No regression: grading, framings, grid, ring, timer, SHOTS
