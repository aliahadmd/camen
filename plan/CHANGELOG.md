# Camen — CHANGELOG

## 1.16.0 (2026-09-17) — Audit-fix pass (recovery, permissions, build config)

- **Crash-safe archive**: every save now journals intent before pixels move
  (`src/features/mediaRepository.ts`), recovers staged/archived/indexed saves on
  next launch, never promotes partial staging copies, and gates the legacy
  orphan scan on journal ownership — a transient DB failure can no longer
  strand an unindexed photo or displace its metadata.
- **GPS regression fixed**: GPS EXIF is written to a scoped copy before
  archiving (pure helper `src/features/gpsExif.ts` + Node round-trip tests);
  coordinates survive hemispheres, rounding carry, and EXIF/pixel preservation.
- **Processing runtime**: bounded deadlines (`withDeadline`), serialized native
  queue with stall detection (`ProcessingQueue`), and artifact scopes that sweep
  every intermediate including late outputs (`ArtifactScope`); thumbnails own
  their cleanup and always produce `.jpg`.
- **Settings/preset integrity**: validated hydration (`settingsValidation.ts`,
  `developValidation.ts`), serialized preset store with collision-safe IDs and
  no cache mutation on failed writes (`presetStore.ts`).
- **Camera contracts**: countdown shows seconds not milliseconds, per-facing
  zoom ranges (front 1–10, rear 0.6–10) with hydration-safe restore, half-tick
  ruler padding fix, photo-only rulers/veils in video mode, honest FOCUS /
  METERING label, permanent-denial Settings route (`PermissionGate`).
- **Build config**: `plugins/withCamenRelease.cjs` pins NDK 27.2.12479018,
  provisions release signing only from external `CAMEN_RELEASE_*` properties,
  preserves the existing keystore, and fails any release task without complete
  credentials (verified against real AGP 8.12.0); `allowBackup=false`,
  blockedPermissions, `buildFromSource: ["expo-camera"]` for the patch.
- **Dependencies**: direct `expo-modules-core`, uuid override resolved
  (audit now reports 0 vulnerabilities), `npm test` runs all suites via
  `scripts/run-tests.cjs`; 50+ new Node tests across contracts, recovery,
  GPS, processing, settings, and build config.

## 1.15.0 (2026-09-16) — Real portrait mode: tap-to-focus, AF·AE lock, depth bokeh

- **Tap-to-focus + focus lock**: tapping the viewfinder meters AF **and** AE at
  the tapped point and locks it (brass ring, "AF·AE LOCK" label); tap elsewhere
  to re-focus, tap the ring to release back to continuous AF. Double-tap still
  flips the camera; works in photo and video. Implemented with a small
  patch-package fix to expo-camera's Android metering (its one-shot focus was
  hardcoded to the top-left pixel) — `patches/expo-camera+57.0.5.patch`,
  auto-applied via `postinstall`.
- **Depth bokeh at capture**: ML Kit selfie segmentation (new local Expo module
  `modules/camen-vision`) produces a person mask; the develop pipeline feathers
  it, blurs the background in two depth bands (near bg light, far bg heavy),
  bleeds bright highlights as colored bokeh glow, and composites at full
  resolution. Subject pixels stay untouched; if segmentation finds no usable
  subject (or fails), the graded capture saves unblurred.
- **APERTURE chip + f-stop ruler** (appears when bokeh is active): f/1.4–f/16
  full stops with per-stop haptics; strength is carried in `develop`, so
  presets, MY presets and the ADJUST panel all carry it. New ADJUST rows:
  Bokeh, Glow, BG Tone, Smooth.
- **Portrait preset rebuilt**: Nature/Studio/Contour now carry bokeh + glow +
  skin smoothing; new **Stage Light** sub (f/1.4, darkened monochrome-leaning
  background). "PORTRAIT f/x" label shows what will apply.
- **Skin smoothing** (`skinSmooth`): subtle blur restricted to the warm-skin
  hue zone, applied before color shaping; on by default in portrait subs.
- AEB variants share one segmentation per capture; shots log the bokeh value
  actually applied (`bokeh` column, guarded migration).
- 10 Node unit tests for the depth math (`scripts/test-portrait-math.ts`);
  typecheck clean; device verification on Redmi K80 Pro.

## 1.8.0 (2026-09-13) — Preset ears on the shutter row

- **Preset ear (left of shutter)**: shows the active capture preset name; tap
  opens the preset picker docked above the shutter row (never covering it).
- **Sub-preset ear (right of shutter)**: shows the active sub-look; tap cycles
  or opens the sub list for the active preset.
- Shutter stays perfectly centered — equal-width side slots, no layout shift
  when preset names change.
- SQLite records preset_id + preset_sub per shot.
- Verified on device: ears render, picker opens clear of the shutter, recipes
  apply at develop, layout stable.

## 1.7.0 (2026-09-13) — Capture presets & sub-presets (PRO selector)

- **Capture presets** flanking the shutter (per the user's reference UI): left ear
  = preset selector, right ear = sub-preset selector. Six presets — Standard,
  **Natural**, **Masculine**, **Night**, **Cinematic**, **Portrait** — each with
  three sub-looks (Portrait: Nature Light / Studio Light / Contour Light).
- **Recipes apply at develop time** through the grade pipeline: per-preset
  exposure/contrast/shadow-crush-or-lift/highlight-protection/temperature/
  saturation/skin-zone control + split-toning (teal shadows, warm highlights),
  micro-contrast (half-res unsharp), fine sharpen (skin-gentled), rolloff,
  grain and vignette.
- Selection persists; shots record preset + sub in SQLite (`preset_id`,
  `preset_sub` columns, guarded migration).
- Skin discipline everywhere: orange-zone desaturation 0.85–0.95, sharpening
  reduced 60% on detected skin tones, no smoothing/reshaping anywhere.
- Verified on device: Masculine/teal sub visible, recipe switch changes the
  developed output, persistence across restarts.

## 1.6.1 (2026-09-13) — Decluttered dashboard: unified ruler buttons

- **Zoom pills removed.** The dashboard now has three clean buttons —
  **ZOOM · TIMER · EV** — each opens its own horizontal ruler on click:
  zoom (0.6–10× live, 0.1 steps), timer (0–30s; 0 = off; press starts the
  countdown), EV (−2…+2 in 0.25 steps). All with per-tick haptics.
- One ruler visible at a time; tapping the active button closes it.
- Removed the timer popover (`TimerChip`) and the HAL size-probe plumbing.

## 1.6.0 (2026-09-13) — Zoom scrollbar, reusable ruler, richer haptics

- **Zoom scrollbar**: a `tune` button on the zoom-pill row opens a horizontal
  zoom ruler (0.6–10×, 0.1 steps). Scrolling zooms the preview **live** with
  per-tick haptics — minor ticks click (`selectionAsync`), integer stops give a
  rigid impact. Opening/closing never resets the zoom value; the ruler
  auto-scrolls to the current zoom and stays in two-way sync with the pills.
- **Generic `Ruler` component** replaces the EV-only ruler — any scalar parameter
  (EV, zoom, later ISO/timer) renders as a tick ruler with major/minor ticks,
  labels, center brass dot and readout. EV ruler unchanged via the EV chip;
  opening one ruler closes the other.
- Verified on device: ruler → 0.6× ultrawide with pill re-highlight; zoom value
  never resets; grid/preview crop unaffected.

## 1.5.0 (2026-09-13) — Pro capture suite

- **EV ruler** (dashboard): manual exposure-compensation dial −2…+2 EV in 0.25
  steps, tick-by-tick haptic feedback while scrolling (iOS-style), brass center
  dot + live readout. Toggled by the EV chip; applied in the develop pipeline
  (expo-camera SDK 57 has no native Android EV prop — web-only).
- **Anti-shake** (settings toggle): accelerometer steady-detection — shutter
  press enters steady-wait; capture fires at the first stable moment (smoothed
  |‖a‖−1g| < 0.05 held 600ms, 4s max, tap cancels, "HOLD STEADY/STEADY" chip).
  Device verified: STMicro lsm6dsv accelerometer + gyroscope.
- **Rapid fire**: hold the shutter for a full-resolution burst (max 30), "×N"
  counter, shots saved as originals after release (speed priority — no
  crop/grade during bursts), each with its own SQLite row.
- **HDR / LDR tone** (settings): HDR look lifts shadows 0.18 and recovers
  highlights 0.25 at develop; LDR is neutral. Tone-mapped, honestly labeled.
- **AEB bracket** (settings): each capture saves three tonal variants
  (−0.7EV / 0 / +0.7EV) as separate files.
- **Simulated ISO** (settings radio): Auto/100/200/400/800/1600/3200 — gain +
  proportional grain at develop. Honest "simulated" labeling (true sensor ISO
  needs a dev build with CameraX MANUAL_SENSOR).
- **Location geotag** (settings, off by default): foreground permission,
  per-capture coords (5s timeout), GPS EXIF injected via piexifjs (pure JS,
  round-trip tested in Node) + lat/lon in SQLite.
- **File format** (settings): JPEG or WEBP conversion at save; HEIF needs a
  dev build.
- **Shutter sound** (settings): wired to `takePictureAsync({ shutterSound })`.

## 1.4.0 (2026-09-13) — Named framings & settings screen

- **Framing presets replace raw pixel sizes.** The picker moves off the dashboard
  into a new **Settings screen** (gear icon): Full 4:3, Instagram Post 4:5,
  Square 1:1, Story 9:16, WeChat Moments 4:3 (2560 cap), Wide 16:9. Each row
  shows the resolved pixel dimensions for the active camera; selection persists.
- **WYSIWYG viewfinder**: the camera, grid and filter preview are laid out inside
  the framed rect — selecting Square shows a square viewfinder; the shot is
  center-cropped to match at full sensor quality (crop happens before grading, so
  filters work on fewer pixels and develop faster).
- Settings screen also carries the mirror-front toggle and device info.
- Dashboard decluttered: SizeChip and the HAL size probing removed.
- Verified on device: Square framing → square viewfinder → square 2560×2560
  Graphite-graded file; Full → 4096×3072 unfiltered fast path.

## 1.3.0 (2026-09-12) — SQLite camera data, picture sizes, shot preview

- **SQLite shot log** (`expo-sqlite`, `camen.db`, WAL): every capture inserts a
  row with timestamp, archive path, thumb path, gallery uri, filter, facing,
  dimensions, file size, flash mode, zoom ratio, timer and edge-light state.
- **Own-your-data save flow**: shot is moved into the app-owned persistent
  archive (`Documents/camen/CAM_YYYYMMDD_HHMMSS.jpg`, plus a 256px thumbnail in
  `camen/thumbs/`), indexed in SQLite, then exported to the system gallery.
  Gallery is now an export target — the app record never depends on it.
- **Picture size selector**: HAL sizes probed at runtime (back: 30 sizes from
  4096×3072; front: 20 from 2592×1944), curated to meaningful stops, persisted
  per facing, validated on every camera switch. HAL quirk documented: 16:9
  selections bound the short edge while keeping the native 4:3 aspect
  (1920×1080 → 1440×1080 file).
- **Shot preview fixed**: the bottom-left thumbnail now always shows the latest
  shot from SQLite (file:// — instant, permission-free), and tapping it opens the
  new full-screen SHOTS screen (grid + fullscreen viewer with monospaced
  metadata: filter, facing, dimensions, size, time). The broken gallery-intent
  path and the MediaLibrary thumbnail query were removed.

## 1.2.0 (2026-09-12) — Masculine grade system (real capture filters)

- Filter list rebuilt around six curated looks + None: **Natural**, **Cinematic**,
  **Film**, **Classic**, **Onyx** (B&W), **Graphite** — mapped from the user's
  style table. No beauty processing anywhere.
- **Saved photos are now truly graded**, not just preview-tinted: new
  `gradePhoto.ts` pipeline (native resize to ≤2560px → `jpeg-js` decode →
  single-pass per-pixel grade → encode → gallery). Recipes are pure data
  (`PhotoGrade` in `filters.ts`): exposure, contrast, shadow/highlight shaping,
  white-balance temperature, B&W channel mixer, skin-zone saturation control,
  vignette.
- Skin-tone discipline baked into every recipe: global saturation ≤0.96 and
  `orangeSaturation` 0.85–0.92 in the skin-hue zone — natural skin, never orange.
- Grading runs during the existing 'saving' phase with a "DEVELOPING" indicator
  (~2–4s); unfiltered shots keep the zero-cost fast path; any grading failure
  falls back to saving the untouched original.
- Live preview remains an honest approximation (layered veils — a gray veil
  mathematically desaturates) until a development build enables stream shaders.
- Verified on the K80 Pro: None-vs-Cinematic captures pulled from the gallery
  show deepened shadows, cooler WB and corner vignette on the graded file.

## 1.1.0 (2026-09-12) — Edge Light (front-camera fill light)

- New **Edge Light** feature (plan/plan11.md): when the front camera is open, the
  screen borders illuminate with soft white gradient bands that act as a continuous
  ring-light fill for selfies.
- One front-camera-only control cycles `OFF → LOW → MEDIUM → HIGH → OFF` with a
  haptic tick and a transient label at each step; level persists.
- Window brightness is pushed to maximum while on (window-level only — the system
  brightness setting is never modified) and restored on toggle-off, unmount, or
  app background/kill.
- Retired the old weak front "torch-as-fill" branch; the front fill light is now
  exclusively Edge Light. Verified on the K80 Pro (glow visible at all levels,
  system brightness 41 before/after, persists across restarts).

## 1.0.0 (2026-09-12) — first working build on Redmi K80 Pro

All chapters 1–9 of `plan/index.md` implemented and verified on the physical device
via Expo Go + adb-driven interaction tests. Chapter 10's EAS release build remains
(needs `eas login`).

### Shipped

- **Camera core** — `expo-camera` `CameraView`, permission gate, shutter (press-in
  responsive), capture → `MediaLibrary` save, last-shot thumbnail → system gallery
  intent, "Saved ✓" toast, save-failure red pulse.
- **Flash ring** — light ring on all four sides of the viewfinder (layered-glow
  strokes): idle 8% glow, 30% fill light, countdown breathing, full-brightness
  burst at capture.
- **Flash modes** — Auto/On/Off chip. Back camera: LED (single-strength torch
  toggle too). Front camera: native CameraX **screen flash** (`flash: 'screen'`),
  armed per-capture (see fixes).
- **Front/back switch** with camera restart; per-side zoom memory.
- **Grid** — thirds / golden ratio, hairline overlay from real preview bounds,
  cycled by one tap, persisted.
- **Zoom** — pinch (gesture-handler → normalized mapping) + preset pills
  **0.6 / 1 / 2.5 / 10** derived from the K80 Pro's real 0.6–10× ratio range
  (adb-probed). Pills hidden on front (digital-only). Transient monospaced readout.
- **Capture timer** — 2/5/10/custom (1–30s) chips, circular countdown ring around
  the shutter with monospaced numeral, cancel-by-tap, haptic ticks, screen wake
  held during countdown, one-shot re-arm-off, custom duration persisted.
- **Filters** — horizontal snap carousel, 10 presets (None, Noir, Carbon, Steel,
  Copper, Bronze, Ash, Moss, Denim, Fade), v1 = GPU tint overlay approximation
  (`matrix` field reserved for v2 pixel path), persisted selection, transient name
  label.
- **Settings store** — AsyncStorage, debounced writes; grid/flash/facing/filter/
  timer/mirror/zoom persist across restarts.
- **Polish** — haptics vocabulary (selection/light ticks, capture, success/error),
  4s-inactivity rail fade, transient labels, dark splash, portrait lock.

### Verified on device (Redmi K80 Pro, Android 16, Expo Go 57.0.9)

- Back camera shot saves at **4096×3072** (probed sensor size) ✓
- Zoom pills map to visibly correct fields of view (2.5× telephoto confirmed) ✓
- Thirds grid, torch, timer 2s countdown→auto-capture, front camera (mirrored
  selfie preview), carousel selection, persistence across restarts ✓

### Fixes found by on-device testing

1. **Expo Go 57.0.9** bundles only the legacy `ExpoMediaLibrary` native module —
   app imports `expo-media-library/legacy`; switch to `expo-media-library` main
   export in a development build (noted at `src/features/useCamera.ts`).
2. Keeping `flash='screen'` armed during back→front transitions throws
   `IllegalArgumentException (FLASH_MODE_SCREEN)` — screen flash is now armed only
   for the instant of capture.
3. Expo Go's media-library warning banner parks over the shutter row — suppressed
   via `LogBox.ignoreLogs` (App.tsx).
4. Reanimated 4 worklets cannot read React refs; pinch begin reads zoom on the JS
   thread (`runOnJS`) before updating the shared value.

### Known limits / next steps

- Front photos are unmirrored files if `mirrorFront` is off; preview always mirrors
  when on (default on).
- Filters v1: saved photos are unfiltered (preview shows the approximation); v2
  pixel path pending a development build (plan/plan8.md).
- EAS release build (APK/AAB) pending — `eas build -p android --profile preview`.
- Thumbnail list access in Expo Go is limited; full gallery reads arrive with the
  dev build.

## 2026-09-12 — Preset ear overlap fix (final, verified on device)

- Preset + sub-preset selectors now render as **inline ear chips** in the
  main row (left: preset name, right: sub name); tapping a chip opens its
  picker docked to the top of the screen — the shutter is never covered.
- Verified on Redmi K80 Pro: thumbnail / PORTRAIT / shutter / NATURE LI /
  flip all fit with clear gaps, no overlap at any screen state.
- `npx tsc --noEmit` clean.

## 2026-09-12 — Preset selector: real root cause fixed (structural)

Root cause: the picker was swapped INTO mainRow as a conditional child,
replacing its ear chip. Every open/remove re-flowed the space-between row
(shutter shifted) and the panel was absolutely positioned relative to the
bottom row (top:132 → opened below/over the shutter). Position tweaks could
never fix this.

Fix (decoupled):
- Both ear chips are now ALWAYS mounted in mainRow — the shutter never moves.
- Pickers render as a separate top-docked overlay (insets.top + 64) with a
  full-screen tap-outside backdrop, inserted at the rails container level.
- Rails are held awake while a picker is open (holdUI includes earPicker).

Verified on device: preset list (5) and sub list (3) both open at the top with
active highlight; selecting Masculine → chips read MASCULINE / IRON (auto
reset); selecting Steel → STEEL; shutter dead-center in every state.

## 2026-09-12 — Picker anchored to its button (UX refinement)

- Picker card now opens just ABOVE the selector button
  (bottom: insets.bottom + 140 → 12dp clearance over the main row),
  popover-style, instead of docking to the top of the screen.
- Verified on device: card bottom sits directly over the MASCULINE ear,
  active preset highlighted, shutter fully visible and untouched.

## 2026-09-12 — Full audit fix pass (v1.9.0)

Critical:
- C1 preset staleness: `settings.preset`/`presetSub` added to processCapture +
  saveShot deps — preset changes now reach the saved photo immediately.
- C2 AEB: all variants process BEFORE any archiving (archiving moved the
  source out from under the remaining variants — AEB could never save ×3).
- C3 filename collisions: millisecond suffix + existence walk in archiveShot.
- C4 HDR tone implemented (shadows −0.30 / highlights +0.30 / rolloff +0.25).
- C5 ISO honest: gain capped at +2 EV, proportional grain added (≤0.55),
  ISO ≤100 is a true no-op; settings copy updated.

High:
- Timer outranks rapid fire; new shutter semantics: tap = processed single,
  hold ≥260 ms = rapid raw burst.
- Cache reclaimed after every capture (original + intermediates deleted).
- Camera thumbnail uses thumb_path (was decoding the 12 MP original).
- Geotag merges into existing EXIF (DateTime/Make/Orientation survive).
- app.json: expo-location plugin added (dev-build permission), version 1.9.0.

Medium:
- Anti-shake waits BEFORE arming the screen flash (no 4 s white screen).
- Real front flash: full-screen white overlay at capture (expo-camera's
  'screen' mode is iOS-only).
- Veil split-tone preview reads temperatureSplit (was splitShadow — dead).
- Sharpen pass refreshes luminance after micro-contrast; grain seeded per
  photo (no more identical pattern); webp ext derived from actual bytes.
- Countdown fires through a ref (no stale capture closure).
- EXIF orientation guard (6/8 uprighted before crop/develop).
- Shot detail shows capture preset + sub (was filter only).
- Burst raws logged honestly (filter none / preset standard / framing full).

Cleanup:
- Removed react-native-vision-camera + @shopify/react-native-skia (unused),
  CURATED_PICTURE_SIZES, __View export, FileSystem import, dist/.
- 9 console.logs → dlog (dev-only). ISO picker = pills. @types/react → devDeps.
- package.json version synced to 1.9.0.

Verified on device (fresh bundle): tap capture, MASCULINE IRON recorded and
graded, hold-burst +3, timer countdown ring + shot, AEB ×3 (SHOTS 7→10),
front flash path, no pipeline errors. cropToAspect now skips no-op crops.
Watched: two transient ImageManipulator 'Context.renderAsync rejected'
events during back-to-back develops — fallback kept the shots; not since.

Workflow note: Expo Go can serve a stale dev bundle after Metro restarts —
force-stop the app (or `pm clear host.exp.exponent`) before trusting UI
verification.

## 2026-09-12 — v1.9.0 release

- App icon set (brass shutter ring on ink), adaptive + monochrome + splash.
- Settings footer: hardcoded "Developed by Ali" → x.com/AliAhadMd1.
- Plan closed: ch10 ☑ (local signed APK + GitHub release), ch17 superseded
  (JS pipeline retained; VisionCamera/Skia removed in audit), ch8 v2 noted.
- README with sideload + build instructions.
- Locally signed release APK (keystore/camen-release.jks, git-ignored).

## 2026-09-14 — v1.10.0 — video recording, SHOTS actions, debug-error fix

Debug error investigated & fixed:
- Dev-mode logcat hunt surfaced the real failure behind video capture:
  `ExpoCameraView.record → ERR_MISSING_PERMISSIONS: RECORD_AUDIO`. Fixed by
  requesting microphone permission before recordAsync (get → request →
  friendly toast if denied) and adding RECORD_AUDIO + NSMicrophoneUsage
  Description to the manifests.
- The intermittent `Context.renderAsync rejected` (ImageManipulator race, the
  only other error class in the logs) is now structurally fixed: ALL
  manipulator work runs through a serialized queue with one delayed retry
  (queuedManipulate in gradePhoto.ts); thumbnails included.

New features:
- VIDEO MODE — PHOTO | VIDEO switch above the chips; shutter toggles recording
  (REC badge with running timer, ring at fire brightness); max 10 min/clip;
  videos archive as .mp4, export to gallery, log media_type + duration_ms
  (DB migration v1.10), and get real frame thumbnails via expo-video-thumbnails.
  Filter carousel hides in video mode (veils don't apply to ungraded video —
  honest UI).
- SHOTS browser — ALL / PHOTOS / VIDEOS tabs; video detail plays inline
  (expo-video, looping, native controls + fullscreen); Share (system sheet)
  and Delete (removes archive file + thumb + DB row, confirm dialog) actions
  on every shot; GPS line under the metadata when geotagged.
- Double-tap the viewfinder flips the camera (blocked while recording).
- Settings DEVICE section now shows archive stats (shots + total MB).

## 2026-09-15 — v1.11.0 — presets are now REAL manual configurations

The user was right: a preset that never shows or yields its values is a black
box, not a preset. Rebuilt the semantics:

- `settings.develop` IS the develop configuration — visible, editable, persisted.
- Selecting a preset/sub WRITES its recipe into `develop` (a shortcut that
  fills the manual controls, not a hidden layer).
- New ADJUST chip (photo mode) opens a manual panel: Exposure, Warmth,
  Contrast, Shadows, Highlights, Saturation, Grain, Vignette — each showing
  its live value; RESET reloads the active preset's recipe.
- Editing any value flips the preset chip to CUSTOM (comparison by value, not
  reference); the develop veils mirror the current values, and shots taken
  with modified values log honestly as preset 'custom' (SHOTS shows CUSTOM).
- Migration: settings stored before v1.11 seed `develop` from their saved
  preset on first load (checks the stored object, not the merged default).
- Pipeline now reads settings.develop directly — the old
  presetRecipe-at-capture path is gone.

Verified on device (Expo Go, user's live session): Cinematic/Teal selection →
ADJUST shows contrast .16 / shadows .12 / highlights .10 / sat 94% / grain
50% / vignette 22%; grain drag → 100% flips chip to CUSTOM; RESET restores
CINEMATIC.

## 2026-09-15 — v1.12.0 — filters removed, presets absorb everything

The user: presets now work, so the separate filter system is redundant.
Removed it — and its capabilities live on inside the preset system:

REMOVED:
- The filter carousel and the entire filter preset list (None/Natural/
  Cinematic/Film/Classic/Onyx/Graphite). filters.ts + FilterCarousel.tsx
  deleted; filterId removed from settings (legacy key stripped on load);
  DB filter_id now always 'none' (column kept for schema stability).

ADDED to the develop system (and thus to every preset + the manual panel):
- MONO toggle — true B&W with the smooth-skin channel mix (was Onyx only).
- SKIN slider (orangeSaturation 70–110%) — the skin-tone control the filter
  grades had; presets already used it, now it's user-editable.
- Veils: monochrome shows a neutral veil.

NEW PRESETS (the old filter looks, converted to real preset bundles):
- Film (Warm / Golden), Classic (Clean / Formal),
  Onyx (Pure / Smoke — B&W), Graphite (Core / Deep).
- Total: 11 built-in presets · 25 sub-looks.

USER PRESETS:
- SAVE in the ADJUST panel stores the current develop configuration under a
  name (AsyncStorage, camen.userpresets.v1).
- The preset picker lists saved presets under an MY tag (scrollable now —
  11+ presets), each deletable with ✕; selecting one loads its values.
- Shots taken with a saved user preset log `user:<id>` and SHOTS resolves
  the name.

## 2026-09-16 — v1.12.1 — save-pipeline bug hunt (SHOTS never updated)

Symptom: captures saved the archive file but the SHOTS log stayed stale and
the shutter went busy forever.

Instrumentation (release-visible rlog) pinpointed it:
- `insertShot` SQL had **24 placeholders for 25 columns** (the v1.10 video
  columns migration missed one `?`) → every insert threw
  `24 values for 25 columns` → 'Save failed'. The v1.12 SHOT_COLUMNS refactor
  also kept the wrong count. Fixed + count-asserted (25/25/25).
- The serialized manipulator queue could HANG (not reject) when the native
  call stalls → develop awaited it forever → phase stuck at 'saving', shutter
  dead. Added a 45s watchdog: hung develops fall back to the ungraded copy
  and release the shutter.
- Gallery export now requests media permissions at first save (standalone
  builds grant at runtime); denied → archive-only, documented.
- Pipeline instrumentation (manip/decode/grade/encode timings) kept — dev
  gold: decode ~8s, grade ~8s, encode ~10s per 12MP shot in dev; release
  ~11s total.

Verified end-to-end on device: TestLookll (user preset, B&W) capture →
archive → gallery permission → SHOTS·6 grid → detail
"TESTLOOKLL · BACK · 2560×2560 · 1.2 MB".

## 2026-09-16 — v1.13.0 — exposure moves to the dashboard, joins the preset ecosystem

Design change (user-driven): the TONE & EXPOSURE section left Settings.

- HDR is now a style toggle in the ADJUST panel (next to MONO) — and because
  it lives in the develop recipe (`hdr: true`), user presets SAVE and restore
  it like any other look.
- EV + ISO combined into one EXPOSURE chip on the dashboard: tapping opens
  the EV ruler (±2 EV, ¼ stops) with ISO pills (Auto/100…3200) directly
  beneath. The chip label shows current values (e.g. `EV+0.5·400`).
- AEB is a dashboard chip (photo mode) — a capture behavior you should see
  armed before shooting, not a settings toggle.
- Settings: TONE & EXPOSURE section removed (Rapid fire / Anti-shake /
  Shutter sound / Location / Format / Framing / DEVICE remain).
- Migration: stored `tone: 'hdr'` seeds `develop.hdr`; legacy keys stripped.
- The preset/scene boundary is now explicit: ADJUST + presets = the saved
  look; EXPOSURE/AEB chips = the scene.

## 2026-09-16 — v1.13.1 — scrollable control toolbar

- The control row is now a horizontally scrollable navbar: every chip carries
  its icon + full label again (TIMER shows seconds, AEB and FLASH have their
  labels back) and new tools can be appended to the end freely.
- Status badges (Developing / Hold steady / Rapid ×N) moved to a non-scrolling
  overlay centered over the toolbar.
- ScrollView pointerEvents must be auto (not box-none) — with box-none the
  container can't become the drag target and the bar won't scroll.
- Verified on device: swipe reveals AEB → ADJUST → FLASH(AUTO/OFF); chips
  remain tappable from any scroll position; panel/pickers unaffected.

## 2026-09-16 — v1.14.0 — Night mode, rebuilt

The Night preset is now a real low-light combination, not just a tone label.
expo-camera 57 exposes no hardware night/low-light API (verified in the module
types), so the pipeline does the work:

- Exposure lift +0.25…+0.35 EV — the sensor underexposes night scenes; we
  lift it before any tone mapping
- Shadows −0.40…−0.50 — crushed dark areas open up
- Highlights +0.20…+0.30 — signs and streetlights are protected
- Micro-contrast and sharpening stay LOW at night — amplifying contrast
  amplifies noise
- Grain 0.30…0.40 — masks lifted-shadow noise instead of removing it
- Night split-tones per sub: City (teal/warm street), Neon (teal/magenta,
  saturation 1.05), Moon (cool blue, max lift for the dimmest scenes)

Plus a transient "NIGHT MODE" indicator on the dashboard when a Night preset
is armed. Verified numerically: the three recipes run through the real
applyGrade lift the dark deciles (city +4…+7, moon +2…+6 vs standard) while
highlight strips stay protected.
