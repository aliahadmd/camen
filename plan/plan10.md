# Chapter 10 — Polish, On-Device Testing & Release Build

**Goal:** Make it feel like one object: consistent haptics, animations that never block capture,
batteries of on-device checks, then a real installable APK/AAB via EAS.

**Depends on:** Chapters 1–9 (all features in).

## Tasks

- [ ] **Motion & feel pass**
  - One haptics vocabulary app-wide: light tap = selection, medium = capture, success = photo saved.
  - All control transitions ≤200ms; capture path is never animation-blocked (shutter responds on
    `onPressIn`, not release).
  - Control rails auto-fade after 4s of inactivity while previewing; any touch restores them.
- [ ] **Cold-start pass:** preview must be up in <2s on the physical phone; defer gallery-thumbnail
  fetch and settings hydration off the critical path.
- [ ] **Full on-device test checklist** (run it, tick it):
  - [ ] Back camera: shot with LED flash, with torch, with grid, zoomed to max stop, each filter
  - [ ] Front camera: selfie with ring-flash burst, mirrored correctly, timer 2s and custom 7s
  - [ ] Timer cancel mid-count, double-tap shutter stress (20 rapid shots), airplane-mode gallery save
  - [ ] Brightness always restored; no state leaks between front/back switches
  - [ ] App backgrounded mid-countdown and mid-flash-burst → no crash, brightness restored
- [ ] **Release config** (`app.json`): camera + media-library permission strings ("Camen needs the
  camera to take photos" — no sneaky wording), orientation locked to portrait, dark icon 1024×1024
  (flat ring mark on `ink` background), matching splash.
- [ ] **Builds:** `eas build -p android --profile preview` (APK for sideloading on your phone) and
  `--profile production` (AAB). Development build profile with the v2 filter module if Chapter 8 chose it.
- [ ] Tag the release, write a short CHANGELOG in `plan/` (what shipped, known limits — e.g. front
  screen-flash behavior on your specific ROM).

## Implementation notes

Performance rule for this app: the camera preview must stay at full frame rate while grid, ring and
filter overlay are visible. If the filter overlay costs frames, drop its update rate, not the
preview's — and prefer `react-native-reanimated` worklets over JS-thread state updates for
gestures and the countdown.

## Acceptance

- [ ] Every checkbox in the on-device test list is ticked against the physical phone
- [ ] `eas build` APK installs and all features work in the standalone build (not just Expo Go)
- [ ] Cold start to live preview under 2s; no dropped frames with all overlays on
- [ ] Icon, splash, permission strings ship; release tagged with CHANGELOG
