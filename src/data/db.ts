import * as SQLite from 'expo-sqlite';
import { ensurePathIndex } from './pathIndex';

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

/**
 * Guarded init: an open/migration failure is stored, not silently swallowed —
 * every repository call then throws a clear error (the save pipeline shows
 * "Save failed" and compensates instead of stranding unindexed files).
 */
let db: SQLite.SQLiteDatabase | null = null;
let initError: unknown = null;
try {
  db = SQLite.openDatabaseSync('camen.db');
  // Cheap writes, crash-safe — the plan promised WAL; actually enable it.
  db.execSync('PRAGMA journal_mode = WAL');
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
  `);
  // idx_shots_created (created_at) was dead weight — every query orders by id
  // or filters by path. Drop it from databases created before this change.
  db.execSync('DROP INDEX IF EXISTS idx_shots_created');

  // Column migrations, checked against the real schema instead of
  // try/catch-swallowing every ALTER failure (which also hid disk/corruption
  // errors behind "column already exists").
  const existing = new Set(
    db
      .getAllSync<{ name: string }>('PRAGMA table_info(shots)')
      .map((r) => r.name),
  );
  const migrations: string[] = [
    // v1.4: framing
    'framing TEXT',
    // v1.5: pro capture columns
    'ev REAL',
    'iso INTEGER',
    'tone TEXT',
    'aeb INTEGER',
    'lat REAL',
    'lon REAL',
    'preset_id TEXT',
    'preset_sub TEXT',
    // v1.10: video support
    "media_type TEXT NOT NULL DEFAULT 'photo'",
    'duration_ms INTEGER',
    // v1.15: portrait depth strength actually used for the shot
    'bokeh REAL',
  ];
  for (const col of migrations) {
    const name = col.split(' ')[0];
    if (existing.has(name)) continue;
    try {
      db.execSync(`ALTER TABLE shots ADD COLUMN ${col}`);
    } catch (e) {
      throw new Error(`shots migration failed for column ${name}`, { cause: e });
    }
  }

  ensurePathIndex(db);
} catch (e) {
  initError = e;
  db = null;
  console.error('[camen] shots database init failed:', e);
}

function requireDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('shots database unavailable', { cause: initError });
  }
  return db;
}

const SHOT_COLUMNS = `created_at, path, thumb_path, gallery_uri, filter_id, facing,
       width, height, size_bytes, flash_mode, zoom_ratio, timer_seconds,
       edge_light, device, framing, ev, iso, tone, aeb, lat, lon, preset_id,
       preset_sub, media_type, duration_ms, bokeh`;

export function insertShot(s: NewShot): number {
  const d = requireDb();
  const res = d.runSync(
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
    requireDb().getFirstSync<ShotRow>('SELECT * FROM shots ORDER BY id DESC LIMIT 1') ??
    null
  );
}

export function recentShots(limit = 200, mediaType?: 'photo' | 'video'): ShotRow[] {
  const d = requireDb();
  if (mediaType) {
    return d.getAllSync<ShotRow>(
      'SELECT * FROM shots WHERE media_type = ? ORDER BY id DESC LIMIT ?',
      [mediaType, limit],
    );
  }
  return d.getAllSync<ShotRow>(
    'SELECT * FROM shots ORDER BY id DESC LIMIT ?',
    [limit],
  );
}

/** Older-than-cursor page for the SHOTS grid (keyset pagination). */
export function recentShotsBefore(
  limit: number,
  beforeId: number,
  mediaType?: 'photo' | 'video',
): ShotRow[] {
  const d = requireDb();
  if (mediaType) {
    return d.getAllSync<ShotRow>(
      'SELECT * FROM shots WHERE media_type = ? AND id < ? ORDER BY id DESC LIMIT ?',
      [mediaType, beforeId, limit],
    );
  }
  return d.getAllSync<ShotRow>(
    'SELECT * FROM shots WHERE id < ? ORDER BY id DESC LIMIT ?',
    [beforeId, limit],
  );
}

export function deleteShot(id: number): void {
  requireDb().runSync('DELETE FROM shots WHERE id = ?', [id]);
}

/** Total shots and total archive bytes — for the settings DEVICE section. */
export function archiveStats(): { count: number; bytes: number } {
  const row = requireDb().getFirstSync<{ c: number; b: number | null }>(
    'SELECT COUNT(*) AS c, SUM(size_bytes) AS b FROM shots',
  );
  return { count: row?.c ?? 0, bytes: row?.b ?? 0 };
}

export function countShots(): number {
  return requireDb().getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM shots')?.c ?? 0;
}

// ---- F10: recoverable archive repository support ---------------------------

/**
 * Idempotent insert keyed on the archive path. Returns the new row id, or
 * null when a row for this path already exists (the recovery replay relies on
 * this instead of deleting + reinserting).
 */
export function insertShotIfMissing(s: NewShot): number | null {
  const d = requireDb();
  const existing = d.getFirstSync<{ id: number }>(
    'SELECT id FROM shots WHERE path = ? LIMIT 1',
    [s.path],
  );
  if (existing) return null;
  const res = d.runSync(
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

/** The indexed row for an archive path, if any. */
export function getShotByPath(path: string): ShotRow | null {
  return (
    requireDb().getFirstSync<ShotRow>('SELECT * FROM shots WHERE path = ? LIMIT 1', [path]) ??
    null
  );
}

/**
 * Back-fills the optional asset fields (thumb, gallery) on an already-indexed
 * shot. Used by recovery (blank optional columns) and by the hook after it
 * finishes thumbnail/gallery work for a save that indexed early.
 */
export function updateShotAssets(
  path: string,
  patch: { thumb_path?: string; gallery_uri?: string | null },
): void {
  const sets: string[] = [];
  const args: (string | null)[] = [];
  if (patch.thumb_path !== undefined) {
    sets.push('thumb_path = ?');
    args.push(patch.thumb_path);
  }
  if (patch.gallery_uri !== undefined) {
    sets.push('gallery_uri = ?');
    args.push(patch.gallery_uri);
  }
  if (sets.length === 0) return;
  args.push(path);
  requireDb().runSync(`UPDATE shots SET ${sets.join(', ')} WHERE path = ?`, args);
}
