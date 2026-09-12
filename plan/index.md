# Camen — Master Build Plan

**Camen** is a minimalist camera app for men: one screen, a big clean viewfinder, and a handful
of deliberate controls. No settings forests, no clutter. Everything you need in one glance.

> Status key: ☐ not started · ◐ in progress · ☑ done

---

## Product vision

- **One screen.** The preview is the app. Controls sit in thin rails (top / bottom), auto-fade after inactivity.
- **Masculine by design.** Dark charcoal UI, monospaced numerals, a single warm-metal accent color. Filters tuned for muted, gritty, low-saturation looks — not beauty filters.
- **Real hardware, real limits.** Every control (zoom presets, flash, front camera) is driven by what the connected phone actually supports, with graceful fallbacks.

## Feature spec

| # | Feature | Spec |
|---|---------|------|
| 1 | Grid overlay | Rule-of-thirds and golden-ratio grid, thin 1px lines, toggle persisted |
| 2 | Flashlight (torch) | Continuous LED torch on back camera |
| 3 | Front camera | One-tap front/back switch |
| 4 | **Flash ring** | Light ring around **every side** of the viewfinder; glows as flash during capture (screen-flash burst + max brightness on front camera) |
| 5 | Capture timer | 2s / 5s / 10s / custom seconds, circular countdown ring, cancelable, synced with the flash ring |
| 6 | Zoom | Pinch-to-zoom across the real 0.6×–10× range + preset pills **0.6 / 1 / 2.5 / 10** |
| 7 | Men's filters | Horizontally scrollable snap carousel; ~10 curated presets (Noir, Carbon, Steel, Copper…) |

## Tech stack

- **Expo (React Native, TypeScript)** — single-screen app, no router needed (or a flat expo-router setup)
- `expo-camera` (`CameraView`) — preview, capture, facing, flash, zoom
- `expo-media-library` — save shots to the device gallery
- `expo-brightness` — max-brightness burst for the screen-flash ring
- `expo-haptics`, `expo-av` — shutter feedback (haptics, click sound)
- Filters: v1 = GPU-cheap overlay tints in Expo Go; v2 = true pixel filters in a development build (see `plan8.md`)

## Roadmap

| Ch | Chapter | File | Status |
|----|---------|------|--------|
| 1 | Project foundation & design system | [plan1.md](plan1.md) | ☑ |
| 2 | Camera core: preview, permissions, capture | [plan2.md](plan2.md) | ☑ |
| 3 | Hardware awareness: probe the real device | [plan3.md](plan3.md) | ☑ |
| 4 | Flash, torch, front camera & the flash ring | [plan4.md](plan4.md) | ☑ |
| 5 | Grid overlays | [plan5.md](plan5.md) | ☑ |
| 6 | Zoom: pinch + hardware presets | [plan6.md](plan6.md) | ☑ |
| 7 | Capture timer (2/5/10/custom) | [plan7.md](plan7.md) | ☑ |
| 8 | Men's filter system (horizontal carousel) | [plan8.md](plan8.md) | ☑ (v1; v2 pixel filters pending dev build) |
| 9 | Capture pipeline, gallery & settings persistence | [plan9.md](plan9.md) | ☑ |
| 10 | Polish, on-device testing & release build | [plan10.md](plan10.md) | ◐ (polish + on-device tests done; EAS build pending) |
| 11 | Edge Light (front-camera fill light) | [plan11.md](plan11.md) | ☑ |
| 12 | Masculine grade system (real capture filters) | [plan12.md](plan12.md) | ☑ |
| 13 | Camera data (SQLite), picture sizes & shot preview | [plan13.md](plan13.md) | ☑ |
| 14 | Named framings (Instagram/Square/…) & settings screen | [plan14.md](plan14.md) | ☑ |
| 15 | Pro capture suite (EV, anti-shake, rapid fire, HDR/AEB/ISO, location, format) | [plan15.md](plan15.md) | ☑ |
| 16 | Zoom scrollbar, reusable ruler & richer haptics | [plan16.md](plan16.md) | ☑ |
| 17 | GPU grading migration (VisionCamera + Skia, dev build) | [plan17.md](plan17.md) | ☐ gated on dev build |

Implementation notes and deviations found during on-device testing are recorded in
[CHANGELOG.md](CHANGELOG.md).

**Dependency order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10.
Chapters 5, 6, 7, 8 are independent of each other after 2/3 — they can be built in any order.

## Hardware — probed and locked in

Target device identified over adb on 2026-09-12: **Redmi K80 Pro** (Snapdragon 8 Elite, Android 16).
Full data in [hardware-report.md](hardware-report.md), raw dump in
[hardware-dump-2026-09-12.txt](hardware-dump-2026-09-12.txt). Headlines that shape the app:

- **Back camera:** logical 3-lens stack — 0.6× ultrawide f/2.2, 1× main f/1.6 with OIS, ~2.5× tele
  f/2.0 — with a real zoom ratio range of **0.6×–10×** and an LED flash. ~12.6 MP output.
- **Front camera:** f/2.2, ~5 MP, fixed focus, and **no flash unit** — so the flash ring
  (screen-flash burst) is mandatory for selfies, not just aesthetic.
- **Zoom presets** ship as `0.6 / 1 / 2.5 / 10` mapped onto the real ratio range.
- Chapter 3's adb probe is **done**; what remains there is the runtime probe (expo-camera side)
  and wiring the `DeviceProfile` into the UI.

## Scope interpretation

"A zoom filter with 2-second, 5-second, 10-second, or custom-second capture peak" is planned as the
**capture timer** (Chapter 7), with **zoom** handled separately (Chapter 6). If you actually meant a
burst mode or auto-capture on peak, flag it and Chapter 7 will be re-scoped.

## Working agreement

- Every chapter file ends with an **Acceptance** checklist — a chapter is done only when every box ticks.
- Test on the real phone from Chapter 2 onward (`npx expo start` → Expo Go / dev client).
