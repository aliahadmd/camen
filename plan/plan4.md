# Chapter 4 — Flash, Torch, Front Camera & the Flash Ring

**Goal:** The signature feature. A glowing ring lines **every side** of the viewfinder. It behaves
as a status light by default and as a **flash** at the moment of capture. On the K80 Pro this is not
optional polish: the front camera exposes **no flash unit** (hardware-probed), so the ring
screen-flash is the only way selfies get light. Plus the LED torch and a front/back switch.

**Depends on:** Chapters 2–3.

## Device facts (from hardware-report.md)

- Back: LED flash, **single-strength torch** (`torchStrengthMaxLevel: 1`) → plain on/off toggle.
- Front: **no flash hardware** → ring screen-flash burst at max brightness is the front flash.
- Both cameras support the brightness-dwell-capture flow; back LED uses `flash: 'on'` instead.

## Tasks

- [ ] **FlashRing component** (`src/components/FlashRing.tsx`): a rounded-rect stroke inset ~6px
      around the preview, glowing via layered opacity/box-shadow style, animated with Reanimated.
      Two states:
  - `idle` — barely visible 8% white ring (so the user knows flash is armed).
  - `firing` — full-brightness white/gold ring, ~450ms pulse.
- [ ] **Ring-light capture flow** (front camera — this *is* the flash):
  1. `Brightness.setSystemBrightnessAsync(1.0)` (remember previous value)
  2. ring + full-screen white overlay go on
  3. ~250ms dwell (screen brightness ramp + sensor settle)
  4. `takePictureAsync({ flash: 'off' })` — the screen *is* the flash
  5. restore brightness, ring returns to idle
- [ ] **Torch toggle** (flashlight icon, top rail): `enableTorch` on `CameraView`, back camera only
      (device has no front LED); when front camera is active the icon instead arms the ring as a
      dim, continuous 30% glow (soft front fill light).
- [ ] **Flash mode chip** (bottom rail, one tap cycles): `Auto → On → Off`.
  - Back: `On` → LED; `Auto` → LED in low light.
  - Front: `On`/`Auto` → ring screen-flash burst (the only flash); `Off` → no burst, ring stays idle.
- [ ] **Front/back switch**: flip icon with a 250ms mirrored slide animation; ring, torch and flash
      states re-evaluate against the profile for the new side.
- [ ] Restore system brightness on app background/kill (`AppState` listener + cleanup in unmount).

## Implementation notes

- Brightness must be captured/restored even on crash paths — wrap the burst in `try/finally`.
- On HyperOS, `setSystemBrightnessAsync` may need "Modify system settings" granted once; detect
  denial and degrade to overlay-only flash (ring + white overlay at current brightness).
- Never fire the ring while the user is mid-pinch-zoom or mid-timer-cancel.

## Acceptance

- [ ] Ring visibly lines all four sides, idle glow subtle, never distracting
- [ ] Back camera: chip `On` → LED fires on shot; torch icon streams continuous light
- [ ] Front camera: capture triggers the ring-flash burst (screen at max brightness), selfie visibly lit
- [ ] Brightness always restored after capture or app exit
- [ ] Switching sides never leaves a stale torch/flash state
