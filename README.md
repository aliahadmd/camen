# Camen

<p align="center"><img src="assets/banner.png" width="480" alt="Camen"></p>

**A minimalist camera for men.** One screen, a big clean viewfinder, and a handful of
deliberate controls. No beauty filters, no settings forests — dark charcoal UI,
brass accents, monospaced numerals, and grading tuned for muted, gritty looks.

Built for the **Redmi K80 Pro** (`miro`, Snapdragon 8 Elite) — the device profile,
zoom stops, flash hardware, and sensor limits are probed and hardcoded to this phone.

## Features

- **Capture presets** — Standard, Natural, Masculine (Iron/Steel/Forge), Night
  (City/Neon/Moon), Cinematic (Teal/Indie/Noir), Portrait — baked at develop time
  (split-toning, micro-contrast, film grain, vignette, highlight rolloff)
- **Men's filter carousel** — None/Natural/Cinematic/Film/Classic/Onyx/Graphite,
  graded per-pixel on the saved photo
- **Named framings** — Full, Instagram 4:5, Square, Story 9:16, WeChat 4:3, Wide
  16:9; the viewfinder masks to the framing and the shot is center-cropped
- **Pro capture** — EV ruler (±2 EV in ¼ stops), anti-shake steady-wait, rapid
  fire (tap = processed shot, hold = full-res burst), timer with countdown ring,
  AEB bracketing, simulated ISO with grain, HDR tone
- **Edge Light** — screen-border fill light for selfies (the front lens has no
  flash unit) + real white screen flash at capture
- **Shot log** — every capture indexed in SQLite (filter, preset, EV, ISO, GPS,
  framing, zoom…) with an in-app SHOTS browser; the app-owned archive folder is
  the source of truth
- **Geotagging** — optional GPS EXIF injection that preserves the original EXIF

## Install (no Play Store)

Download `Camen-v1.9.0.apk` from [Releases](../../releases), open it on your
phone, and allow "Install unknown apps" when prompted. The APK is signed — keep
installing newer releases over it.

## Build it yourself

```bash
npm install
npx expo start          # develop in Expo Go
```

Release APK (local signing):

```bash
npx expo prebuild -p android --no-install
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

## Tech

Expo SDK 57 · React Native 0.86 · TypeScript (strict) · expo-camera ·
expo-sqlite · expo-image-manipulator · jpeg-js (pixel grading) · piexifjs
(EXIF GPS) · react-native-reanimated + gesture-handler.

The full 18-chapter build plan and hardware probe live in [`plan/`](plan/).

---

Developed by [Ali](https://x.com/AliAhadMd1)
