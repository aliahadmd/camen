# Chapter 11 — Edge Light (Front-Camera Fill Light)

**Goal:** A ring-light simulator for selfies: when the front camera is open, the
**borders of the screen illuminate** with a soft, bright glow that bounces fill
light onto the face — the K80 Pro's front lens has no flash unit (probed,
see [hardware-report.md](hardware-report.md)), so screen-edge light is the only
continuous fill available.

**Depends on:** Chapters 3–4 (device profile, FlashRing), 9 (settings persistence).

## UX spec

- **Front camera only.** Edge Light activates when `facing === 'front'`; switching
  to the back camera turns it off automatically (LED torch lives there).
- **One control, four states.** The top-rail ring icon (front camera only) cycles:
  `OFF → LOW → MEDIUM → HIGH → OFF`. Each step haptic-ticks and flashes a transient
  label ("Edge light · Medium") so the state is always legible.
- **Levels** change both the glow band thickness and opacity:
  | Level | Band (px) | Opacity |
  |-------|-----------|---------|
  | OFF   | 0         | 0       |
  | LOW   | 30        | 0.60    |
  | MEDIUM| 40        | 0.78    |
  | HIGH  | 52        | 0.95    |
- **Brightness boost:** while on, the app window brightness is pushed to maximum
  (window-level, no `WRITE_SETTINGS` needed) and restored on toggle-off or teardown.
- Layering: glow sits above preview/filter/grid, **below** rails and flash ring, and
  never intercepts touches.
- Supersedes the old weak "torch-as-fill" behavior on the front camera.

## Tasks

- [x] `EdgeLight.tsx` — four edge gradient strips (white → transparent toward
      center) inside an opacity-animated wrapper; band width per level.
- [x] Settings: `edgeLight: 0…3`, persisted, defaults OFF.
- [x] CameraScreen: render above overlays; front-only cycle button; transient label.
- [x] Brightness boost hook with guaranteed restore (toggle-off, unmount,
      app-death paths) — window-level `setBrightnessAsync`, never system setting.
- [x] Retire the front "torch = fill" branch from the ring state machine.

## Acceptance

- [x] Front camera: tapping the ring icon cycles the four states with visible glow
      change and labels; back camera: button absent, glow off
- [x] Selfie preview is visibly brighter at HIGH vs OFF (real fill, not just UI)
- [x] System brightness setting is untouched (window-level only); no stuck
      brightness after toggle-off, app kill, or background
- [x] State persists across restarts; no interference with capture, grid, or ring
