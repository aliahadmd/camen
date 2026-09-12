# Camen — Hardware Report: Redmi K80 Pro

Probed over adb on **2026-09-12** (raw dump: [hardware-dump-2026-09-12.txt](hardware-dump-2026-09-12.txt)).

## Device

| | |
|---|---|
| Marketing name | **REDMI K80 Pro** |
| Model / codename | 24122RKC7C / `miro` |
| SoC | Qualcomm Snapdragon 8 Elite (SM8750) |
| OS | Android 16 (SDK 36), HyperOS |
| adb serial | 3a9d820 (USB) |
| Android SDK path | `/Volumes/essd/android/sdk` (`ANDROID_HOME`, already in `~/.zshrc`) |

## Cameras — what the app will see

Android exposes **2 public cameras** to normal apps (the HAL has 9 devices, but 7 are vendor-internal:
duplicate logical variants and virtual EXTERNAL remap cams at 0.1x–100x — ignore them).

### Camera 0 — Back (logical, 3 physical lenses fused)

| Property | Value | Meaning for Camen |
|---|---|---|
| Facing / flash unit | BACK / **LED, TRUE** | LED torch + LED flash modes work |
| Zoom ratio range | **0.6× – 10.0×** | Real seamless ultrawide→10x; presets below |
| Max digital zoom | 10.0× | Cap pinch at 10× |
| Aperture / focal | f/1.6, 5.85mm (main logical) | Bright main lens |
| OIS | available (`[0 1]`) | Low-light shots benefit; don't fight it with stabilizing UI |
| Min focus distance | 10 diopters ≈ **10 cm** | Decent close-up range |
| Sensor array | **4096×3072 (≈12.6 MP)** — quad-binned from the 50 MP sensor | Max photo size via public API |
| JPEG max size | ≈19 MB | Fine for quality 0.92 |
| Hardware level | raw 3; capabilities incl. RAW, MANUAL_SENSOR, BURST_CAPTURE, LOGICAL_MULTI_CAMERA, 10-bit, JPEG-R | FULL/LEVEL_3-class: v2 filter path (native shader/color-matrix) is viable |
| Physical sub-lenses | ids **2, 3, 4** behind the logical camera | see table below |

Physical lenses inside the logical back camera:

| Physical id | Aperture | Focal length | Sensor array | Role |
|---|---|---|---|---|
| 2 | f/1.6 | 5.85 mm | 4096×3072 (12.6 MP) | **Main** (OIS, min focus 10 cm) |
| 3 | f/2.2 | 1.86 mm | 3280×2464 (8.1 MP, fixed focus) | **Ultrawide** → the 0.6× stop |
| 4 | f/2.0 | 9.00 mm | 4096×3072 (12.6 MP) | **Telephoto** (≈1.54× optical vs main; vendor blends to the marketed 2.5×) |

### Camera 1 — Front

| Property | Value | Meaning for Camen |
|---|---|---|
| Facing / flash unit | FRONT / **FALSE — no flash** | **The flash ring is mandatory**: screen-flash burst is the only front "flash" |
| Zoom ratio range | 1× – 10× (digital only) | Hide zoom pills on front (1× default) or offer light digital zoom |
| Aperture / focal | f/2.2, 2.24 mm | |
| Sensor array | 2592×1944 (≈5 MP, binned from 20 MP) | Selfies are lower-res — don't oversell quality |
| Min focus distance | 0 (fixed focus) | No tap-to-focus depth on front |
| Hardware level | raw 3 (FULL-class) | |

## Derived decisions for the plan

1. **Zoom presets (Chapter 6):** `[0.6, 1, 2.5, 10]` — 0.6× = ultrawide (physical), 1× = main, 2.5× ≈
   telephoto blend point, 10× = max digital. Continuous pinch between stops; clamp to 0.6–10. Expo's
   `zoom` prop is normalized 0…1 over the device range → map through `DeviceProfile`.
2. **Flash ring (Chapter 4):** front camera has **no flash unit**, so the ring screen-flash isn't a
   nice-to-have — it's the only way a front shot gets light. Back camera keeps LED (`Auto/On/Off`).
   Torch strength is single-level (`torchStrengthMaxLevel: 1`) → plain on/off toggle.
3. **DeviceProfile (Chapter 3) filled in:**

   ```ts
   const K80ProProfile: DeviceProfile = {
     hasBack: true,
     hasFront: true,
     backFlash: 'led',
     frontFlash: 'screen',        // ring screen-flash
     zoomStops: [0.6, 1, 2.5, 10],
     zoomNormalized: false,       // real ratio range available → map preset↔normalized
   };
   ```

4. **Filters (Chapter 8):** the sensor reports RAW + MANUAL_SENSOR + 10-bit — plenty of headroom;
   the v1 overlay approach works everywhere, and the v2 native color-matrix path is fully viable on
   this chipset.
5. **Resolution expectations:** back photos ≈12.6 MP, front selfies ≈5 MP via the public camera API.
   (The full 50 MP mode is a vendor path — out of scope for a minimal app.)

## Picture sizes (probed 2026-09-12, `getAvailablePictureSizesAsync`)

- **Back:** 30 sizes, largest **4096×3072** (12.6 MP), plus 3840×2160 (4K 16:9),
  3280×2464 (8 MP), 3072×3072 (square), 2560×1440, 1920×1080 … 176×144.
- **Front:** 20 sizes, largest **2592×1944** (5 MP), plus 2560×1440, 1920×1080 … 176×144.
- **HAL quirk:** CameraX preserves the native 4:3 aspect — selecting a 16:9 entry
  (e.g. 1920×1080) bounds the short edge instead (output 1440×1080).
- **Curated UI stops** (see `CURATED_PICTURE_SIZES` in `deviceProfile.tsx`):
  back = 4096 / 3840 / 3280 / 3072² / 2560 / 1920; front = 2592 / 2560 / 1920 / 1280.

## Re-probe command

```bash
ADB=/Volumes/essd/android/sdk/platform-tools/adb
$ADB devices -l
$ADB shell dumpsys media.camera > hardware-dump-$(date +%F).txt
```
