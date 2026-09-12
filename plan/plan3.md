# Chapter 3 — Hardware Awareness: Probe the Real Device

**Goal:** A `DeviceProfile` describing what the phone can actually do, probed from the OS at runtime,
driving which controls appear and how zoom maps. The static probe is **done** (see
[hardware-report.md](hardware-report.md)) — this chapter turns it into runtime code.

**Depends on:** Chapter 2.

## Probed device (done 2026-09-12)

**Redmi K80 Pro** (`miro`, Snapdragon 8 Elite, Android 16). Public cameras: back logical
(3 physical lenses: 0.6× ultrawide f/2.2, 1× main f/1.6 OIS, ~2.5× tele f/2.0; zoom range
**0.6–10×**; LED flash; ~12.6 MP output) and front (f/2.2, ~5 MP, **no flash unit**, fixed focus).
Full data: [hardware-report.md](hardware-report.md).

## Tasks

- [x] **Install platform-tools on the Mac** — done (`/Volumes/essd/android/sdk`, `ANDROID_HOME` set).
- [x] **adb hardware dump** — done, archived as [hardware-dump-2026-09-12.txt](hardware-dump-2026-09-12.txt),
      summarized in [hardware-report.md](hardware-report.md).
- [ ] Runtime probe in `src/features/deviceProfile.ts`:
  - `Camera.getAvailableCameraTypesAsync()` → confirm both sides present on the connected phone.
  - Cross-check the runtime result against the static report; log any drift (HAL updates can shift zoom ranges).
  - Store the zoom mapping: this device reports a real ratio range (0.6–10 back), so
    `zoomNormalized: false` and `presetRatio ↔ normalizedZoom` conversion lives here
    (`normalized = (ratio - 0.6) / (10 - 0.6)`).
- [ ] Ship the profile (pre-filled with probed values, runtime-verified at boot):

  ```ts
  type DeviceProfile = {
    hasBack: boolean; hasFront: boolean;
    backFlash: 'led' | 'screen' | 'none';
    frontFlash: 'screen' | 'none';
    zoomStops: number[];
    zoomNormalized: boolean;
  };

  const K80ProProfile: DeviceProfile = {
    hasBack: true, hasFront: true,
    backFlash: 'led',
    frontFlash: 'screen',          // front has NO flash unit — ring screen-flash is mandatory
    zoomStops: [0.6, 1, 2.5, 10],
    zoomNormalized: false,
  };
  ```

- [ ] Gate the UI on the profile: front-camera button shown (device has one); torch button only on
      back (front has no LED); zoom pills from `zoomStops` on back only (front zoom is digital-only,
      default hidden per Chapter 6); ring-flash strategy per side (Chapter 4 consumes this).

## Implementation notes

- Probe once at app start, memoize, expose via `DeviceProfileProvider`. Never re-probe on camera
  switches (slow).
- The static report is the source of truth for optical facts; the runtime probe is a sanity check —
  if runtime disagrees (e.g. zoom range differs after an OTA), prefer the **narrower** range.
- Fallback profile (emulator / probe failure): back+LED, no front, single 1× stop — app stays usable.

## Acceptance

- [x] `hardware-report.md` contains the real dump (Redmi K80 Pro, lenses, flash, zoom 0.6–10×)
- [ ] App logs/renders its detected `DeviceProfile` at startup and it matches the report
- [ ] Controls adapt: front toggle shown, torch back-only, zoom pills [0.6, 1, 2.5, 10] on back
