# Chapter 5 — Grid Overlays

**Goal:** Composition helpers, done quietly: a grid overlay over the preview that toggles with one
tap and remembers its state. Minimal by default — off until asked.

**Depends on:** Chapter 2.

## Tasks

- [ ] **Grid component** (`src/components/Grid.tsx`): absolutely-positioned `View`s drawing 1px
      lines (hairline, 30% white) — pure views, no images, negligible cost.
- [ ] Two modes, cycled by one tap on the grid icon (top rail):
  - `thirds` — lines at 1/3 and 2/3, vertical + horizontal
  - `golden` — lines at 0.382 and 0.618, slightly stronger center lines
  - `off` — no overlay
- [ ] Grid respects the camera's aspect ratio — lines are computed from measured preview bounds
      (`onLayout`), not screen constants.
- [ ] Persist last-used mode with the settings store (Chapter 9 store lands here as a tiny
      `useSettings` hook — AsyncStorage-backed — so grid, flash mode and filter persist).
- [ ] Tiny mode label ("THIRDS" / "GOLDEN") fades in next to the icon for 1s after switching, then fades.

## Implementation notes

Grid is drawn *over* the preview but *under* the flash ring, and must not intercept touches
(`pointerEvents="none"`), so pinch-zoom (Ch. 6) and tap-to-focus keep working through it.

```
<CameraView>
  <Grid mode={gridMode} bounds={previewBounds} />   ← pointerEvents none
  <FlashRing state={ringState} />
</CameraView>
```

## Acceptance

- [ ] Tap cycles off → thirds → golden → off, lines correct for the actual preview rect
- [ ] Overlay is hairline-thin, non-interactive, sits under the ring
- [ ] Mode survives app restart
