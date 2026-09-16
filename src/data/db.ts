import * as SQLite from 'expo-sqlite';

/**
 * Camen's shot log — the app's own camera data index (plan/plan13.md).
 * The archive folder is the source of truth for pixels; this DB is the index
 * and the metadata record. WAL mode keeps writes cheap.
 */
export type ShotRow = {
  id: number;
  created_at: number;
  path: string;
  thumb_path: string;
  gallery_uri: string | null;
  filter_id: string;
  facing: string;
  width: number;
  height: number;
  size_bytes: number | null;
  flash_mode: string;
  zoom_ratio: number | null;
  timer_seconds: number;
  edge_light: number;
  device: string;
  framing: string;
  ev: number;
  iso: number;
  tone: string;
  aeb: number;
  lat: number | null;
  lon: number | null;
  preset_id: string;
  preset_sub: string;
  media_type: 'photo' | 'video';
  duration_ms: number | null;
  /** Portrait depth strength used (v1.15). Null for videos/bursts/pre-bokeh shots. */
  bokeh?: number | null;
};

export type NewShot = Omit<ShotRow, 'id'>;

const db = SQLite.openDatabaseSync('camen.db');

db.execSync(`
  CREATE TABLE IF NOT EXISTS shots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    path TEXT NOT NULL,
    thumb_path TEXT NOT NULL,
    gallery_uri TEXT,
    filter_id TEXT NOT NULL,
    facing TEXT NOT NULL,
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
`);

// v1.4: framing column (guarded — idempotent across upgrades)
try {
  db.execSync('ALTER TABLE shots ADD COLUMN framing TEXT');
} catch {
  // column already exists
}

// v1.5: pro capture columns (guarded — idempotent across upgrades)
for (const col of [
  'ev REAL',
  'iso INTEGER',
  'tone TEXT',
  'aeb INTEGER',
  'lat REAL',
  'lon REAL',
  'preset_id TEXT',
  'preset_sub TEXT',
]) {
  try {
    db.execSync(`ALTER TABLE shots ADD COLUMN ${col}`);
  } catch {
    // column already exists
  }
}

// v1.10: video support (guarded — idempotent across upgrades)
for (const col of ["media_type TEXT NOT NULL DEFAULT 'photo'", 'duration_ms INTEGER']) {
  try {
    db.execSync(`ALTER TABLE shots ADD COLUMN ${col}`);
  } catch {
    // column already exists
  }
}

// v1.15: portrait depth strength actually used for the shot (guarded)
try {
  db.execSync('ALTER TABLE shots ADD COLUMN bokeh REAL');
} catch {
  // column already exists
}

const SHOT_COLUMNS = `created_at, path, thumb_path, gallery_uri, filter_id, facing,
       width, height, size_bytes, flash_mode, zoom_ratio, timer_seconds,
       edge_light, device, framing, ev, iso, tone, aeb, lat, lon, preset_id,
       preset_sub, media_type, duration_ms, bokeh`;

export function insertShot(s: NewShot): number {
  const res = db.runSync(
    `INSERT INTO shots
       (${SHOT_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.created_at,
      s.path,
      s.thumb_path,
      s.gallery_uri,
      s.filter_id,
      s.facing,
      s.width,
      s.height,
      s.size_bytes,
      s.flash_mode,
      s.zoom_ratio,
      s.timer_seconds,
      s.edge_light,
      s.device,
      s.framing,
      s.ev,
      s.iso,
      s.tone,
      s.aeb,
      s.lat,
      s.lon,
      s.preset_id,
      s.preset_sub,
      s.media_type,
      s.duration_ms,
      s.bokeh ?? null,
    ],
  );
  return res.lastInsertRowId;
}

export function latestShot(): ShotRow | null {
  return (
    db.getFirstSync<ShotRow>('SELECT * FROM shots ORDER BY id DESC LIMIT 1') ??
    null
  );
}

export function recentShots(limit = 200, mediaType?: 'photo' | 'video'): ShotRow[] {
  if (mediaType) {
    return db.getAllSync<ShotRow>(
      'SELECT * FROM shots WHERE media_type = ? ORDER BY id DESC LIMIT ?',
      [mediaType, limit],
    );
  }
  return db.getAllSync<ShotRow>(
    'SELECT * FROM shots ORDER BY id DESC LIMIT ?',
    [limit],
  );
}

export function deleteShot(id: number): void {
  db.runSync('DELETE FROM shots WHERE id = ?', [id]);
}

/** Total shots and total archive bytes — for the settings DEVICE section. */
export function archiveStats(): { count: number; bytes: number } {
  const row = db.getFirstSync<{ c: number; b: number | null }>(
    'SELECT COUNT(*) AS c, SUM(size_bytes) AS b FROM shots',
  );
  return { count: row?.c ?? 0, bytes: row?.b ?? 0 };
}

export function countShots(): number {
  return db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM shots')?.c ?? 0;
}
