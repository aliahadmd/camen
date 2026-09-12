# Chapter 13 — Camera Data (SQLite), Picture Sizes & Shot Preview

**Goal:** Give Camen a memory and real hardware control. A SQLite database records
every shot's capture data; the user can pick the **picture size** that the K80 Pro's
HAL actually offers; and the bottom-left thumbnail opens an **in-app shot preview** —
fixing the broken gallery-intent path.

**Depends on:** Chapters 2–4, 9, 12.

## Best-practice design: own your data

The broken thumbnail had a root cause: in Expo Go, MediaLibrary reads are limited
and `content://` URIs are fragile across apps. Best practice for a camera app is to
**own the data**:

1. **App-owned archive** — every developed/original shot is moved into a persistent,
   permission-free app folder (`document/camen/CAM_YYYYMMDD_HHMMSS.jpg`). This is
   the source of truth for in-app preview/history and cannot be revoked.
2. **Gallery export stays** — `MediaLibrary.createAssetAsync` still copies the shot
   into the system gallery. Gallery is an *export target*, not our database.
3. **SQLite is the index** — one row per shot with the full capture context.
4. **Thumbnails** — a 256px preview is generated at save time into the archive
   (`thumbs/`), so grids never decode 12MP files.

## SQLite schema (expo-sqlite, sync API, `camen.db`, WAL)

```sql
CREATE TABLE IF NOT EXISTS shots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,      -- ms epoch
  path TEXT NOT NULL,               -- app-owned file:// path (source of truth)
  thumb_path TEXT NOT NULL,         -- 256px preview
  gallery_uri TEXT,                 -- content:// uri if gallery export succeeded
  filter_id TEXT NOT NULL,
  facing TEXT NOT NULL,             -- 'front' | 'back'
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size_bytes INTEGER,
  flash_mode TEXT,
  zoom_ratio REAL,
  timer_seconds INTEGER,
  edge_light INTEGER NOT NULL DEFAULT 0,
  device TEXT
);
CREATE INDEX IF NOT EXISTS idx_shots_created ON shots (created_at DESC);
```

Repository: `src/data/db.ts` — `insertShot`, `latestShot`, `recentShots`, `countShots`.

## Picture sizes — investigate, then curate

- Probe the HAL at runtime: `CameraView.getAvailablePictureSizesAsync()` per facing
  (logged once for the hardware report).
- Selector (front/back persisted separately) offers the **real HAL sizes**; selection
  validated against the live list on every camera switch (unknown → camera default).
- Grading interplay: filtered development caps at 2560px long edge (predictable
  latency); choosing full resolution is the "no-filter, max quality" path.

## Shot preview UX (masculine, minimal)

- Bottom-left thumbnail = latest shot from SQLite (file:// — instant, no permissions).
- Tap → **SHOTS screen**: dark grid (3 columns, thumbs), header `SHOTS · <count>`,
  tap a shot → fullscreen viewer with a monospaced metadata line
  (`CINEMATIC · BACK · 2560×1920 · 2.1 MB · 21:47`), chevron back. No navigation
  library — a state switch keeps the app single-screen.

## Tasks

- [x] Probe + record real picture sizes (back/front) into `hardware-report.md`
- [x] `expo-sqlite` + `src/data/db.ts` repository with migration
- [x] Save flow: develop → archive move → DB insert → gallery export (order matters)
- [x] Thumbnail from SQLite; delete the MediaLibrary query + gallery-intent path
- [x] `ShotsScreen.tsx`: grid + fullscreen viewer + metadata
- [x] `SizeChip`: picture-size popover, persisted per facing, validated on switch

## Acceptance

- [x] Every capture inserts a row; SHOTS header count matches DB
- [x] Thumbnail always shows the latest shot after relaunch (no gallery permission)
- [x] Tap thumbnail → SHOTS grid → fullscreen viewer with metadata
- [x] Picture size selectable per facing, persisted, honored by capture (verified
      by pulling gallery files and checking dimensions — 1920×1080 selection
      yields a 1440×1080 file: CameraX bounds the short edge, keeps 4:3 aspect)
- [x] No regression to grading, timer, ring, filters
