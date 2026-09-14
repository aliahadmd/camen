# Camen — CHANGELOG

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
