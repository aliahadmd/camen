# Camen — current working-tree audit

Date: 2026-09-17  
Baseline: current staged and unstaged v1.16.0 working tree; HEAD `08a3216`.  
Mode: assessment only. No application fixes, installs, builds, commits, pushes or publication performed.

## Executive assessment

Camen has a coherent architecture for an offline, single-device camera. The current working tree fixes many defects from the previous audit, but still has correctness gaps at the boundaries between UI units, camera capabilities, async processing and persistence. Passing TypeScript and portrait-math tests do not cover these integration paths.

The clearest current defects are the countdown numeral displaying milliseconds, incorrect front-camera zoom normalization, saved rear zoom not restoring at startup, concurrent preset writes losing updates, incomplete settings validation, and a preview that does not consistently describe the saved media. Release reproduction and archive recovery also need stronger contracts.

Severity: P1 = potential capture loss/unavailability; P2 = functional correctness or release reliability; P3 = lower-impact maintenance/hardening. Findings below distinguish source-established behavior from device-dependent concerns. None is claimed newly reproduced on the Redmi.

## Scope and evidence

The coordinator read the complete camera engine/screen, grading, preset, portrait, native module and camera patch; all smaller visual components; settings, user-preset storage, geotagging, database, types, entry points and the test script. The completed ecosystem reviewer read root/module configuration, README, all 18 plan chapters, master plan, changelog, curated hardware report, portrait implementation plan, metadata pointers and relevant generated Android build/manifest configuration. Installed native camera capture, focus, preview and image-loader code was inspected selectively.

The separate storage/settings/UI reviewer was stopped before returning a final report. Its pending findings are not included as verified results. In particular, this report does not claim a completed line-by-line review of ShotsScreen, SettingsScreen and DevelopPanel. Statements about those files from the historical audit are not automatically carried forward.

The lockfile/dependency tree and generated output were inspected selectively. The 46,291-line raw hardware dump was counted, not read in full. Binary assets/APKs, every dependency source file, physical-device behavior, clean-checkout builds and backup behavior were not audited. The earlier approximate 31k-line count included generated module intermediates and is not an application-source count.

## Project goal and architecture

Camen is an offline-first, minimalist photo/video camera for Ali's Redmi K80 Pro. It uses a charcoal/brass interface, photographic recipes, user-saved looks, optional GPS and an app-owned archive. Distribution is a locally signed, sideloaded Android APK; no backend or authentication service is evident in first-party application source.

- **Bootstrap:** Buffer polyfill, gesture/safe-area providers and settings/device-profile contexts.
- **UI:** CameraScreen composes the live finder, controls and overlaid settings/shot screens.
- **Orchestration:** useCamera owns shutter, countdown, steady detection, burst, recording, processing and saving.
- **Image processing:** native ImageManipulator for geometry/format; jpeg-js and typed arrays for tonal grading and JPEG encoding.
- **Portrait:** local Android Expo module uses ML Kit person segmentation; JS math generates synthetic background blur, glow and compositing.
- **Persistence:** AsyncStorage settings/presets; permanent files and thumbnails; gallery exports; SQLite metadata with WAL and parameterized queries.
- **Native integration:** patch-package patch adds focus props and changes Android zoom mapping.

Stack verified by ecosystem review: Expo SDK 57, React Native 0.86.3, React 19.2.3, Reanimated 4.5.1, worklets 0.10.1, ML Kit selfie segmentation 16.0.0-beta6. Native portrait implementation is Android-only; iOS parity is not established.

### Actual capability boundaries

EV and ISO are post-capture gain/grain, not native sensor controls. AEB creates three developments of one exposure. HDR is a tone look; Night is a low-light recipe rather than multi-frame stacking. Portrait uses a person-confidence mask and proximity heuristic, not measured depth. Aperture labels are synthetic blur strengths. Preview veils approximate a subset of the recipe. Videos and rapid bursts bypass photo development.

These are valid scope choices when described honestly. They should not be confused with camera-HAL capabilities or native computational photography.

## Current functional findings

### F01 — P2: Countdown numeral displays milliseconds as seconds

**Source:** src/features/useCamera.ts:765–785; src/components/CountdownRing.tsx:22–23,49.

The hook now supplies both `remaining` and `total` in milliseconds, fixing the old arc mismatch. CountdownRing still computes the visible numeral using `Math.ceil(remaining)`. A ten-second timer initially displays 10000, then values near 9950, instead of 10, 9, etc. The arc ratio is now correct.

**Recommendation:** Define the component's unit contract explicitly; divide remaining milliseconds by 1000 for the numeral. Add endpoint tests covering 10000, 1001, 1000 and 1 milliseconds. This is a regression in the partial fix of historical A21, not the old arc issue repeated.

### F02 — P2: Front-camera zoom uses the rear camera's normalization range

**Source:** src/features/deviceProfile.tsx:25–34,84–86; src/features/useCamera.ts:91–105; src/components/CameraScreen.tsx:243; patches/expo-camera+57.0.5.patch:82–89. Hardware evidence: plan/hardware-report.md:49.

JS normalizes all zoom against 0.6–10. The patched native implementation interpolates against the active camera's actual minimum/maximum. The curated hardware report gives front zoom as 1–10. Consequently front `1×` sends `(1−0.6)/9.4`, which native maps to approximately 1.383×, not 1×. The UI also allows the rear range on front.

**Recommendation:** Resolve ranges per active camera and share that contract across labels, normalization and native controls. Confirm the reported range on hardware; the numerical mismatch is source-established, not a fresh sensor measurement.

### F03 — P2: Persisted rear zoom is not restored on a normal cold start

**Source:** src/components/CameraScreen.tsx:84–89; src/features/useCamera.ts:91–99.

useCamera mounts before AsyncStorage resolves and receives DEFAULT_SETTINGS, initializing zoom to 1. Its restore effect depends only on `facing`. When persisted settings resolve with the usual rear facing and a different saved zoom, facing has not changed, so the effect does not run. Switching away and back can restore it, but initial launch does not.

**Recommendation:** Hydrate the camera state after settings readiness, or explicitly handle initial settings hydration without overwriting an active zoom gesture.

### F04 — P2: User-preset mutations can overwrite one another

**Source:** src/features/userPresets.ts:51–65.

Save and delete independently perform asynchronous read-modify-write operations on one storage key. If two operations read the same starting list before either write finishes, the last write discards the other operation. Two deletes can resurrect a just-deleted preset; two saves can lose one entry. IDs also use only Date.now(), so same-millisecond concurrent saves can collide.

**Recommendation:** Serialize preset mutations, allocate collision-resistant IDs and publish the cache only after durable success. This is a still-present portion of historical A23, not a new claim that error alerts are missing.

### F05 — P2: Preset cache is mutated before persistence succeeds

**Source:** src/features/userPresets.ts:58–65; src/features/presets.ts:428–465.

Save/delete assign the new global cache before awaiting AsyncStorage.setItem. A rejected write leaves the in-memory recipe resolver disagreeing with durable storage. For deletion, the picker can still retain its memoized entry while presetRecipe can no longer find it; RESET or preset comparisons can then fall back to Standard despite the reported failure.

**Recommendation:** Commit cached state only after successful persistence, or roll it back on failure. Combine this with serialized writes.

### F06 — P2: Valid but malformed settings JSON can leave startup unresolved

**Source:** src/features/settings.tsx:133–156; src/features/userPresets.ts:33–43.

Only JSON.parse is protected by the load catch. A truthy primitive payload such as `"bad"` or `1` reaches `'develop' in storedRaw`, which throws outside that catch. The async load never calls setSettings and CameraScreen stays on its loading background. A legacy object with a non-string preset can similarly enter presetRecipe before sanitization.

The sanitizer also accepts arbitrary objects as develop recipes without validating nested numeric/color fields. User-preset validation accepts arrays as develop objects. This leaves crash/corrupt-processing cases beyond the earlier null guard.

**Recommendation:** Validate parsed top-level data before migrations; validate recipe fields and numeric bounds; provide a safe fallback for the entire loading pipeline. This is residual historical A23.

### F07 — P2: FULL preview and video previews can disagree with saved framing

**Source:** src/features/framings.ts:19,42–43; src/components/CameraScreen.tsx:216–250,284–289; src/features/useCamera.ts:921,939–943.

FULL is documented as native 4:3, but `frameRect(null, …)` fills the whole screen rather than a native-aspect rectangle. The native preview uses fill behavior and the capture use-case group inspected does not supply a shared ViewPort crop. A tall display can therefore show a cropped finder while the saved FULL photo retains more scene.

Video continues to use the selected photo framing and recipe veils even though recording is ungraded and receives no corresponding crop/develop pass. A square/toned video preview does not promise a square/toned recorded file correctly.

**Recommendation:** Give photo and video explicit preview/output contracts; show native-aspect FULL accurately and hide unsupported video treatments. Exact field-of-view differences need a device framing test.

### F08 — P1 conditional: A stalled manipulator can still hold the shutter indefinitely

**Source:** src/features/gradePhoto.ts:43–68; src/features/useCamera.ts:268–303,321–329,398–405,453–455.

Retry counts now bound rejected operations, but not a native promise that never settles. Such a promise holds the global manipChain. Rotation, crop, conversion and thumbnail calls have no settling deadline. Even if development's Promise.race times out, saving can then await a thumbnail queued behind the same stalled operation indefinitely.

**Recommendation:** A capture-session deadline must cover every awaited stage and optional thumbnails must not block saving indefinitely. Native/queue cancellation or isolation is necessary; a timeout alone does not recover the underlying queue. No actual native hang was reproduced in this audit.

### F09 — P2: Timed-out work keeps running and output ownership is incomplete

**Source:** src/features/useCamera.ts:321–329,370–382,692–713; src/features/gradePhoto.ts:534–559,601–605.

Promise.race does not cancel the losing development/portrait job. A late result can write a cache file that no caller records or removes. The cleanup list includes source and extras but not all final output URIs; failed archive attempts and move-to-copy fallbacks can therefore strand finals. The development resize intermediate is only removed after successful decode, not on read/decode failure.

**Recommendation:** Track every created artifact under a capture-session owner and reclaim in finally, including late results and failed finals. Preserve recoverable captures separately from disposable intermediates. This is a remaining error-path issue, not the fixed normal-path resize leak.

### F10 — P2: Process interruption can orphan permanent captures before database insertion

**Source:** src/features/useCamera.ts:442–519; src/data/db.ts:164–201.

Saving moves the capture into permanent storage before GPS, thumbnail, permission/export and database insertion. The new insert catch compensates for a caught SQL exception, but cannot run after process death. The browser reads SQLite, and no archive reconciliation mechanism is present in the reviewed persistence helpers. An interruption between the permanent move and INSERT can leave a real photo invisible to the index.

**Recommendation:** Persist recoverable pending-save state, then finalize idempotently; reconcile archive/index discrepancies. A file-backed camera archive needs crash recovery in addition to caught-exception cleanup. Residual historical A19.

### F11 — P2: A neutral adjustment can unnecessarily downscale and recompress a photo

**Source:** src/features/useCamera.ts:309–315; src/features/gradePhoto.ts:7–8,534–544.

needsDevelop tests recipe key presence rather than effective values. `{hdr:false}`, `{exposure:0}` or `{saturation:1}` all trigger the full develop path despite being neutral. Large images are capped to 2560 and re-encoded. The empty Standard recipe bypasses this path, so semantically identical settings can produce different resolution and compression.

**Recommendation:** Use a shared semantic normalization/default model when testing whether development is necessary. Keep an explicit opt-in processing policy if neutral recompression is intended.

### F12 — P3: Permission denial has no in-app permanent-denial recovery

**Source:** src/components/CameraScreen.tsx:206–212; src/components/PermissionGate.tsx:6–23.

The denial screen always requests permission again, without using canAskAgain or offering an OS Settings route. After permanent denial the action can do nothing useful, leaving users to find application settings themselves.

**Recommendation:** Distinguish requestable denial from permanent denial and offer the appropriate recovery action.

### F13 — P3: Ruler marks are offset by half a tick

**Source:** src/components/Ruler.tsx:67–68,101–105,138–141.

The content starts with viewport/2 padding and each tick's line is centered in a stepPx-wide cell. At offset zero the first visible line is therefore stepPx/2 to the right of the center indicator. The conversion and snapping nevertheless assume index = offset/stepPx. Numeric values and visible marks are consistently half a cell apart.

**Recommendation:** Account for half-cell width in padding/offset geometry and verify first, middle and last marks. Small external value changes are also deliberately ignored by the current 1.5-tick synchronization threshold and should receive interaction testing.

## Native/image concerns requiring further validation

These are not presented as fresh device reproductions.

1. **Orientation normalization:** useCamera.ts:268–281 explicitly rotates EXIF 6/8 through ImageManipulator. The installed image-loader manipulation path uses Glide, which normally applies EXIF orientation while decoding; an extra transform can double-rotate. EXIF 2/3/4/5/7 are not explicitly handled, while installed expo-camera records mirrored orientations when `exif:true`. Direct jpeg-js paths ignore orientation. Normalize once for all eight EXIF orientations and use returned dimensions rather than assuming a swap. Validate portrait, landscape, upside-down and mirrored capture fixtures before a fix.
2. **AF·AE LOCK wording:** the patch retains AF/AE metering regions with disableAutoCancel; it does not explicitly request Camera2 AE lock. Persistent AE metering is not equivalent to exposure-value lock. Completion/failure of startFocusAndMetering is not connected to the UI, which immediately claims a lock. Validate the intended exposure behavior and camera support before retaining that label.
3. **Focus point versus preview crop:** native DisplayOrientedMeteringPointFactory uses raw view dimensions rather than PreviewView's crop-aware meteringPointFactory. Non-native aspect previews can meter a different sensor region from the visible tap. This is distinct from the already-fixed JS double subtraction.
4. **Portrait edge halos:** buildDepthLayers blurs the complete RGB image, including foreground subject pixels, before masking the composite. Bright/colorful subjects can bleed into nearby background blur. This is a source-established mechanism; visual severity has not been measured. Test high-contrast hair/shoulder edges before changing the algorithm.
5. **UI responsiveness:** JPEG decode/encode, grading, base64 conversion and compositing execute synchronous loops on the JS thread. Timer callbacks cannot interrupt them. Measure device latency/memory and consider moving expensive stages to a native/worker/GPU implementation based on results rather than merely adding Promise timeouts.

## Build, dependency and privacy findings

### E01 — P2: Release customization is not fully reproducible from tracked configuration

**Sources:** README.md:52–57; app.json:28–55; .gitignore:5–7; existing android/app/build.gradle:85,95–122 and android/build.gradle:26–30.

The ignored generated Android project contains versionCode 16, NDK 27.2.12479018 and custom release signing setup. Tracked app configuration does not encode all of these. Fresh checkout/prebuild does not recreate the exact locally used release configuration. Signing secrets must remain external; nonsecret build identity and provisioning instructions should be reproducible. No secrets are printed here. Historical build concern remains open.

### E02 — P2 hardening: Broad merged permissions and backup policy need review

**Source:** existing android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml:18,23,28,54,66.

The existing merged release manifest declares READ_MEDIA_AUDIO, SYSTEM_ALERT_WINDOW, WRITE_SETTINGS and ACTIVITY_RECOGNITION, and allowBackup=true. Window-only brightness is the documented design. Private photos and GPS warrant an explicit backup policy and least-privilege permission inventory. These are declarations/defaults, not evidence of grants, transfer or exploitation. No backup test was performed.

### E03 — P3: Moderate dependency advisory in the build-tool chain

Successful npm audit returned 11 moderate entries, zero high/critical. The underlying reported uuid@7.0.3 advisory is GHSA-w5hq-g745-h8pq, propagated through xcode and Expo configuration tooling. These are not 11 independent confirmed application vulnerabilities and no Android runtime exploitability is claimed.

The tool's suggested fixes include incompatible Expo/Sharing downgrades. Do not run force-fix blindly; resolve through a compatible upstream dependency update and verify native patches.

### E04 — P3: Release/test metadata drift

package.json and app.json say 1.16.0; package-lock.json root versions remain 1.13.0; plan/CHANGELOG.md latest heading is 1.15.0. Lockfile dependency declarations match the manifest, so the stale version alone does not prove npm ci failure. No npm test script exists, and scripts are excluded from TypeScript checking. The portrait tests are manually runnable but poorly integrated into routine verification.

### E05 — P3: Native wrapper directly imports a transitive dependency

modules/camen-vision/index.ts:1 imports expo-modules-core without a direct package.json declaration. It resolves through Expo today. Declare intentional direct dependencies or document the framework-provided contract; this is upgrade fragility, not a current installation error.

## Hardcoding assessment

**Intentional and appropriate:** owner attribution/X URL; Redmi-only identity; theme/spacing tokens; photographic recipes; social framing ratios; synthetic aperture stops; processing/work-grid limits; burst limit and recording duration ceiling. These should be centralized/documented where useful, not removed simply because they are constants.

**Incorrect or fragile:** applying one rear zoom range to both cameras; hardcoding processing decisions from key presence; build identity stored only in ignored generated files; UI units without a shared contract. Static hardware data does not become runtime-verified merely because a camera-facing enumeration succeeds. Fresh capability observations should remain distinct from curated historical data.

## What improved since the previous audit

Current source establishes bounded retry counts, burst ownership of phaseRef, a video-start cancellation token, video-specific archive extensions, corrected focus-local normalization, corrected portrait near/far coefficients, corrected GPS rationals, zero-centered grain, earlier front-flash release, independent anti-shake deadline and cleanup, per-AEB save catches, normal-path development intermediate cleanup, explicit database migration/schema checks and WAL.

The native module Gradle/Kotlin sources are now staged/tracked, with root-anchored generated-project ignores. README now explains the native-build requirement and no longer presents the removed carousel/old APK as the current path. These should not be re-reported as unfixed current bugs.

This does not certify that all 24 historical findings are closed. Some fixes are partial; this report identifies residuals separately. Staged fixes are not yet durable commits.

## Verification results

| Check | Result |
|---|---|
| `npx --no-install tsc --noEmit` | PASS |
| `node scripts/test-portrait-math.ts` | PASS: 11 tests |
| Node warning | MODULE_TYPELESS_PACKAGE_JSON, nonfatal |
| `npm test` | Not run: no test script |
| `npm ls --depth=0` / full dependency tree | No reported dependency problems |
| Installed native package comparison with Expo expectations | Compared versions match |
| Reanimated/worklets peer ranges | Inspected ranges satisfied |
| `npm audit --json --ignore-scripts` | 11 moderate chain entries; 0 high/critical |
| `git apply --reverse --check patches/expo-camera+57.0.5.patch` | PASS against installed patched package |
| New native build / clean-checkout build | Not performed |
| Physical-device UI, capture, image-quality or backup validation | Not performed |
| New deterministic regression test harness | Not added or run; functional findings above are source analysis |

## Prioritized assessment

The best reliability investment is an explicit capture-session boundary and recoverable media repository, followed by a per-camera capability adapter and shared recipe/unit contracts. Small deterministic defects such as countdown rendering and zoom hydration are straightforward regression-test targets. Image orientation and native metering need fixture/device confirmation, not speculative one-line fixes.

The audit produced this report only. Existing application changes were not intentionally modified, no release was built or published, and no commit or push was performed.
