# Chapter 16 — Zoom Scrollbar, Reusable Ruler & Richer Haptics

**Goal:** One button opens a **zoom scrollbar** (continuous zoom, no reset). The
horizontal ruler is generalized so **any scalar parameter** can use it (EV, zoom
now; ISO/timer later), and scrolling feels like iOS: per-tick haptic ticks.

**Depends on:** Chapter 15 (EV ruler, haptics).

## Design

1. **Generic `Ruler.tsx`** — replaces the EV-only ruler. Props: min/max/step,
   value, onChange, onCommit (scroll end), format callback, tick pixel width.
   Ticks: minor = hairline, major (integer value) = taller + label. Center brass
   dot + live readout (`EV +0.25`, `2.4×`).
2. **Zoom button on the pills row** — a `tune` icon button after the last pill
   toggles the zoom ruler strip. Scrolling it zooms **continuously in real time**
   (each tick calls setZoomRatio → live preview zoom), commit persists on release.
   No value is ever reset by opening/closing the ruler.
3. **Haptics like iPhone**: minor tick → `selectionAsync` (Android EFFECT_CLICK,
   the crisp Taptic-like tick); major tick → `impactAsync(Rigid)`; 60 ms throttle.
4. **EV ruler keeps working** — same component, EV chip toggles it; opening one
   ruler closes the other (one strip, one parameter at a time — minimalism).

## Tasks

- [x] `Ruler.tsx` generic component (ticks, majors, haptics, readout, onCommit)
- [x] Pills row: zoom-ruler toggle button (tune icon)
- [x] CameraScreen: ruler strip renders EV or Zoom by mode; EV chip stays
- [x] Remove `EvRuler.tsx`
- [x] Device verify: zoom ruler scrolls → preview zooms live → pills update;
      EV ruler unchanged; no reset on open/close

## Acceptance

- [x] Tune button opens/closes the zoom scrollbar; zoom value never resets
- [x] Scrolling zooms the preview live with per-tick haptics; pills re-highlight
- [x] EV ruler still works via the EV chip
- [x] tsc clean; no regression to capture pipeline
