# Camen

<p align="center"><img src="assets/banner.png" width="480" alt="Camen"></p>

**A minimalist camera for men.** One screen, a big clean viewfinder, and a handful of
deliberate controls. No beauty filters, no settings forests — dark charcoal UI,
brass accents, monospaced numerals, and grading tuned for muted, gritty looks.

Built for the **Redmi K80 Pro** (`miro`, Snapdragon 8 Elite) — the device profile,
zoom stops, flash hardware, and sensor limits are probed and hardcoded to this phone.

## Features

- **Photo + Video** — flip between modes with one tap; shutter toggles
  recording (REC timer, up to 10 min/clip), videos land in the same archive
  and log
- **Capture presets** — Standard, Natural, Masculine (Iron/Steel/Forge), Night
  (City/Neon/Moon), Cinematic (Teal/Indie/Noir), Portrait — baked at develop time
  (split-toning, micro-contrast, film grain, vignette, highlight rolloff)
- **Men's filter carousel** — removed in v1.12; the capture presets and the
  ADJUST panel are the whole look system now
- **Named framings** — Full, Instagram 4:5, Square, Story 9:16, WeChat 4:3, Wide
  16:9; the viewfinder masks to the framing and the shot is center-cropped
- **Pro capture** — EV ruler (±2 EV in ¼ stops), anti-shake steady-wait, rapid
  fire (tap = processed shot, hold = full-res burst), timer with countdown ring,
  AEB bracketing, simulated ISO with grain, HDR tone
- **Edge Light** — screen-border fill light for selfies (the front lens has no
  flash unit) + real white screen flash at capture
- **Shot log** — every capture indexed in SQLite (filter, preset, EV, ISO, GPS,
  framing, zoom…) with an in-app SHOTS browser: ALL/PHOTOS/VIDEOS tabs, inline
  video playback, share and delete; the app-owned archive folder is the source
  of truth
- **Geotagging** — optional GPS EXIF injection that preserves the original EXIF

## Install (no Play Store)

Grab the newest `Camen-vX.Y.Z.apk` from [Releases](../../releases), open it on
your phone, and allow "Install unknown apps" when prompted. The APK is signed —
keep installing newer releases over it.

## Build it yourself

**Note:** the native portrait features (tap-to-focus/AF·AE lock, ML Kit depth
bokeh) need a real build — Expo Go cannot run the patched expo-camera or the
local `modules/camen-vision` module.

```bash
npm install
npx expo start          # JS-only development (no portrait/focus patches)
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
