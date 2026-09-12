# Chapter 8 — Men's Filter System (Horizontal Carousel)

**Goal:** The heart of the app. A horizontal, snap-scrolling filter strip above the shutter: swipe
or tap to pick from ~10 curated masculine presets. Selection must be instant and obvious.

**Depends on:** Chapters 2, 9-lite (settings store from Ch. 5's `useSettings`).

## Tasks

- [ ] **Curate the preset list** (`src/features/filters.ts`) — muted, gritty, low-key looks,
      no beauty processing:

  | Preset | Character |
  |--------|-----------|
  | None | clean sensor output |
  | Noir | high-contrast B&W, deep blacks |
  | Carbon | B&W with lifted shadows, soft matte |
  | Steel | desaturated, cool cast, "machined" |
  | Copper | warm highlights, muted mids |
  | Bronze | golden-hour skin, restrained warmth |
  | Ash | flat matte, milky blacks |
  | Moss | muted green-olive shift |
  | Denim | cool blue-gray cast |
  | Fade | crushed blacks + faded film vibe |

- [ ] **FilterCarousel component** (`FlatList`, horizontal, `snapToInterval`, deceleration normal):
      each item = tinted circle swatch (the preset's palette) + uppercase 10px label below.
      Active item scales 1.15× with a spring; inactive items 0.85× ghost.
- [ ] **Live preview tint (v1, works in Expo Go):** each preset ships a color matrix rendered as a
      GPU-cheap overlay over the preview (`mix-blend` style layering + opacity). Swipe changes the
      overlay with a 150ms crossfade. Chosen filter persists via `useSettings`.
- [ ] **True pixel filters (v2, development build):** Expo Go cannot process preview frames, so saved
      photos must be processed post-capture. Options (pick one):
  - `react-native-image-filter-kit` — apply the same matrix/color ops to `photo.uri` after capture
    (drop-in, keeps everything else untouched). **Recommended.**
  - Custom Expo Module (Kotlin/CameraX `ColorMatrix` or AGSL shader) — real-time true preview,
    matches the architecture of FilterCamera / PhotonCamera; bigger lift, best result.
  - Decision recorded in this file before implementation; v1 overlay stays as fallback on
    unsupported profiles.
- [ ] Ergonomics: the carousel must be usable **one-handed** — strip sits in the letterboxed band
      above the shutter rail; tap = select; swipe = browse; selected filter name briefly appears
      center-bottom ("NOIR") then fades.
- [ ] `expo-image-manipulator` only for crop/resize housekeeping — it cannot do color filters (do not use it for this).

## Implementation notes

Define each preset once as data — a color-matrix (or GLSL vec4 op in v2) + display swatch colors —
so preview overlay and post-capture processing consume the same source of truth and the saved photo
matches what was on screen.

```ts
export type FilterPreset = {
  id: string; name: string;
  overlay: { color: string; opacity: number; blend: 'normal' | 'multiply' | 'screen' }[]; // v1
  matrix?: number[];   // v2: 4x5 color matrix for image-filter-kit / CameraX
  swatch: [string, string]; // gradient stops for the carousel swatch
};
```

## Acceptance

- [ ] Strip snaps cleanly, active preset obvious, one-handed reach confirmed on device
- [ ] Swiping updates the preview tint instantly (≤1 frame lag) with crossfade
- [ ] Selected filter persists across restarts
- [ ] (v2) Saved photo visibly carries the selected look, matching the preview closely
- [ ] "None" produces a clean, unprocessed file
