# Chapter 7 — Capture Timer (2s / 5s / 10s / Custom)

**Goal:** Hands-off shots: pick 2, 5, 10 or a custom number of seconds, the shutter arms a circular
countdown ring, and the **flash ring** breathes faster as zero approaches — then fires.

**Depends on:** Chapters 2, 4 (flash ring), 6 (visual language).

## Tasks

- [ ] **Timer chip** in the bottom rail: tap opens a compact chooser — `2  5  10  ⋯` where `⋯`
      opens a stepper for custom seconds (1–30). Selection shows as a small clock icon with the
      number; `off` is one more tap on the same chip.
- [ ] **CountdownRing component**: circular progress ring around the shutter button
      (Reanimated + SVG circle, stroke-dashoffset driven). Monospaced numeral in the center ticks
      `5…4…3…2…1`. Tapping the shutter **mid-count cancels** (haptic + ring collapses).
- [ ] **Sync with the flash ring**: ring glows in slow "breaths" while counting; in the final 1s it
      ramps to full brightness (prep for screen-flash), then Chapter 4's capture flow fires at zero.
- [ ] Tick feedback: silent-ish tick each second (`expo-av` short tone or haptic `impactAsync`
      — haptics default, sound optional in settings to keep the app quiet).
- [ ] Timer is **one-shot**: after capture it returns to `off` (selfies shouldn't re-arm), but the
      last used custom duration is remembered by the settings store.
- [ ] Edge cases: timer + front camera + flash `On` must compose correctly (countdown → ring-flash
      burst → photo); screen sleep disabled during countdown (`KeepAwake`).

## Implementation notes

Use a single `setInterval`/`requestAnimationFrame` loop owned by the camera hook, with a cancel
token — never nested timers. The countdown drives three things off one state machine:
`CountdownRing` (progress), `FlashRing` (breath phase), `shutterEnabled` (cancel vs capture).

State machine: `idle → armed(duration) → counting(t) → (cancel | fire → capturing → idle)`.

## Acceptance

- [ ] 2/5/10 presets and custom duration all work on the physical device
- [ ] Countdown ring is smooth; numeral legible; mid-count tap cancels cleanly
- [ ] Flash-ring breathing ramps into the flash burst at zero; photo captured exactly once
- [ ] Timer stays single-shot, custom duration persists, screen doesn't sleep mid-count
