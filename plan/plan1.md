# Chapter 1 — Project Foundation & Design System

**Goal:** An Expo project named *Camen* boots on the connected phone with the dark, masculine
design tokens in place and an empty full-screen canvas where the camera will live.

**Depends on:** nothing.

## Tasks

- [ ] Scaffold: `npx create-expo-app@latest Camen --template blank-typescript` inside this folder
      (keep this `plan/` directory outside the app folder or ignore it).
- [ ] Clean the template: single `App.tsx`, no welcome screen, remove unused assets.
- [ ] Install base libs: `npx expo install expo-camera expo-media-library expo-haptics expo-brightness`
- [ ] Define the design system in `src/theme.ts`:
  - Colors: `ink #0B0C0E` (background), `panel #16181B`, `bone #E8E6E1` (primary text),
    `muted #8A8F98`, accent `brass #C9A96A` (single accent, used sparingly).
  - Type: one family (Space Grotesk or Inter), monospaced numerals for countdown/zoom.
  - Spacing scale: 4 / 8 / 12 / 16 / 24; corner radius: 20 for control chips.
- [ ] Layout skeleton in `App.tsx`: full-bleed black viewfinder placeholder (SafeAreaView),
      reserved bottom control rail (~96px) and top status rail (~48px).
- [ ] `app.json`: app name `Camen`, dark splash, `userInterfaceStyle: "dark"`,
      android camera permission entry.
- [ ] Run on the phone: `npx expo start`, open in Expo Go / dev client, confirm full-screen canvas.

## Implementation notes

```
App.tsx
src/
  theme.ts            ← tokens only, no logic
  components/         ← added in later chapters (Grid, FlashRing, FilterCarousel, …)
  features/
    deviceProfile.ts  ← Chapter 3
    filters.ts        ← Chapter 8
```

Design rule for the whole app: **controls must never sit on top of the subject's face area** —
rails live in the letterboxed zones outside the 3:4 preview, controls are icon-first, text is
uppercase + letterspaced at 11px for labels.

## Acceptance

- [ ] App boots on the physical phone, black canvas, no template UI
- [ ] Theme tokens imported, zero hardcoded colors in `App.tsx`
- [ ] Safe-area respected on notched device
