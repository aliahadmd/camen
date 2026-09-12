# Chapter 12 — Masculine Grade System (Real Filters, Not Tints)

**Goal:** Replace the v1 tint approximations with **six curated masculine looks**
that are genuinely baked into the saved photo — natural skin, controlled contrast,
no beauty processing. Based on the user's style table, upgraded with a real
per-pixel grading pipeline.

**Depends on:** Chapters 2, 8, 9.

## Style table (user's plan, kept)

| Preset | Look | Best for |
|--------|------|----------|
| **Natural** ⭐ | Natural skin, slightly brighter, crisp | Daily selfies, profile photos |
| **Cinematic** ⭐ | Deeper shadows, cooler tones | Night, street, serious portraits |
| **Film** | Slightly warm, soft contrast, lifted blacks | Outdoor / golden hour |
| **Classic** | Clean, polished, masculine | Formal clothes, LinkedIn, Instagram |
| **Onyx** | Black & white, high contrast, timeless | Strong portraits |
| **Graphite** | Dark & crisp, defined jaw/beard | Bearded/masculine portraits |

Hard rules: no face reshaping, no plastic skin, no eye enhancement, no HDR halos,
no orange skin, no "beauty" smoothing.

## Upgrade over the v1 tint plan — real grading at capture

Expo Go cannot grade the live preview stream, but the **saved photo can be truly
graded** in JS with `jpeg-js` (pure JS, works in Expo Go):

1. `takePictureAsync` → cache JPEG
2. `expo-image-manipulator` resizes to ≤2560px long edge (native, fast)
3. `jpeg-js` decode → single-pass per-pixel grade → encode (quality 90)
4. Save the developed file to the gallery; original discarded

Per-pixel pipeline (all recipes are data, in `filters.ts`):

- **White balance** — temperature (±R/B channel multipliers)
- **Exposure** — power-of-two multiplier
- **Contrast** — pivot-0.5 S-curve, kept ≤0.20 (moderate, per best practice)
- **Shadows / highlights** — luminance-masked multiplicative adjustment
  (crush for Graphite/Cinematic, lift for Film)
- **B&W channel mixer** — Onyx only (R .30 / G .55 / B .15: smooth skin, dark skies)
- **Saturation with skin control** — global saturation plus a skin-hue-zone
  desaturation (`orangeSaturation ≈ 0.88`) — the "controlled orange" rule
- **Vignette** — cheap per-row/column squared-distance falloff
  (Cinematic 0.25, Graphite 0.30, Film 0.12)

The **live preview stays an approximation** (layered overlays — a gray veil
mathematically desaturates, warm/cool veils suggest WB), but the saved photo now
carries the real look. This replaces plan8's "v2 needs a dev build" position:
grading at capture works inside Expo Go today.

## Performance envelope

- Process dimension capped at 2560px long edge (~4.9MP)
- Channel ops via 256-entry LUTs; per-pixel pass inlined
- Expected 2–4s per filtered shot → visible "DEVELOPING" state on the shutter
- Unfiltered shots skip the pipeline entirely (zero cost)

## Tasks

- [x] `filters.ts` rewrite: 7 presets (None + 6 styles) with `PhotoGrade` recipes
      + improved preview overlay recipes + swatches
- [x] `gradePhoto.ts`: LUT builder, pixel pass, file pipeline (resize → decode →
      grade → encode → base64 → cache file)
- [x] `useCamera`: grade during 'saving' phase; fallback to original on failure
- [x] "DEVELOPING" indicator while grading
- [x] On-device verification: capture per preset, pull file, inspect grade

## Acceptance

- [x] Saved photo visibly carries the selected look (deepened shadows on
      Graphite, warm tone on Film, true B&W on Onyx)
- [x] Skin reads natural — no orange cast, no plastic smoothing
- [x] Unfiltered captures are bit-identical fast path as before
- [x] Grading failure never loses the shot (falls back to the original)
- [x] All six styles selectable in the carousel; selection persists
