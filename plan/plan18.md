# Chapter 18 — Capture Presets & Sub-Presets (PRO selector)

**Goal:** Photographic-style **capture presets** flanking the shutter — preset
selector on the left, sub-preset on the right (like the reference UI: `PRO` / `+`
ears). Each preset is a tonal recipe baked at develop; each has 3 sub-looks.

**Depends on:** Chapters 12–13 (develop pipeline, SQLite).

## Presets (user's spec)

| Preset | Recipe focus |
|--------|--------------|
| **Natural** | slightly lower saturation, controlled highlights, moderate contrast, skin-tone preservation |
| **Masculine** | deeper blacks, slightly cooler shadows, warm skin, stronger micro-contrast, no smoothing |
| **Night** | shadow recovery, highlight protection, cyan-ish shadows, warm skin, subtle grain |
| **Cinematic** | filmic contrast, teal-ish shadows, warm highlights, subtle vignette, film grain |
| **Portrait** | skin-tone protection, background contrast, subtle sharpening, controlled highlights |

Sub-presets (right ear) = 3 lighting/look variations per preset; Portrait's are
the user-named **Nature Light / Studio Light / Contour Light**.

## New grade primitives (were missing — implemented in `gradePhoto.ts`)

1. **Micro-contrast** — large-radius local contrast (unsharp on luminance,
   half-res separable box blur, bilinear upsample). Masculine 0.35, Contour 0.30.
2. **Sharpen** — small-radius unsharp on full-res luminance, reduced on detected
   skin zones so faces never look harsh (Portrait 0.30).
3. **Split-toning** — shadow tint + highlight tint weighted by (1−lum)²/lum²
   masks with a balance-style strength. Cinematic teal/amber, Night cyan, page-1
   warm shadow for Masculine.
4. **Highlight rolloff** — soft shoulder compression above a knee so
   "controlled highlights" never clip harshly (Natural/Portrait 0.35).

Pipeline order (research-backed): gains/temp → contrast → shadows/highlights →
**split-toning** → BW/saturation(+skin) → **micro-contrast** → **sharpen** →
**rolloff** → grain → vignette.

## UI (dashboard)

- Left ear: preset chip (name, brass when non-Standard) → opens preset list.
- Right ear: sub-preset chip (sub name) → opens sub list for the active preset.
- Selection persists; a preset change resets the sub to that preset's default.

## Tasks

- [x] `presets.ts` — data + compile-to-develop-recipe
- [x] `gradePhoto.ts` — micro-contrast, sharpen, split-toning, rolloff
- [x] DB migrations `preset_id`, `preset_sub` + per-shot record
- [x] Dashboard ears + pickers
- [x] Verify on device (each preset visibly different; skin stays natural)

## Acceptance

- [x] All 5 presets × 3 subs selectable and persisted
- [x] Masculine/Night/Cinematic visibly differ (blacks, split-tone, grain)
- [x] Skin stays natural in Portrait (no orange, no harsh sharpening)
- [x] Every shot records preset + sub in SQLite
