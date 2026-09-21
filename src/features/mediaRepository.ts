import type { NewShot, ShotRow } from '../data/db';

/**
 * F10 — Recoverable archive repository, independent of the capture hook.
 *
 * Contract (plan chapter F10):
 *  1. A journal entry with the COMPLETE NewShot metadata and the final
 *     destination path is written BEFORE any pixel data is touched.
 *  2. The source cache file is COPIED (never moved) into a staging file inside
 *     the archive directory, then atomically renamed onto its final name — the
 *     capture pipeline (stage owner) keeps ownership of the source and cleans
 *     it up after savePhoto resolves.
 *  3. A synchronous, idempotent index insert happens immediately after the
 *     archive promotion. Optional fields (thumb, gallery) may be blank in a
 *     recovered row — the hook fills them later via updateAssets.
 *  4. On ANY failure after the journal write, the journal is RETAINED and the
 *     archive file is never deleted — recover() retries on next startup.
 *  5. recover() never deletes ARCHIVE media; journals whose source AND archive
 *     are both missing are kept and reported explicitly, not removed. Once a
 *     replay fully completes (pixels verified + indexed + journal retired) the
 *     redundant CACHE source is reclaimed — its owning app instance is gone.
 *     A source shared by sibling journals (AEB brackets) is only reclaimed
 *     after the LAST journal referencing it retires.
 *  6. Legacy orphan files in the archive root (pre-repository saves) are
 *     conservatively imported with honest metadata — dimensions are parsed
 *     from real bytes or left 0/unknown, never fabricated.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShotMeta = Omit<NewShot, 'path' | 'thumb_path' | 'gallery_uri' | 'size_bytes'>;

export type SavePhotoInput = {
  /** Cache file produced by the capture pipeline. COPIED, never moved/deleted. */
  sourceUri: string;
  /** Extension for the archived file (no dot), e.g. 'jpg' | 'webp' | 'mp4'. */
  extension: string;
  /** Complete shot metadata; destination name derives from meta.created_at. */
  meta: ShotMeta;
};

export type SavePhotoResult = {
  id: number;
  path: string;
  size: number;
  /** Null when the caller has not attached a thumb yet (updateAssets). */
  thumbPath: string | null;
  galleryUri: string | null;
};

export type AssetsPatch = {
  thumb_path?: string;
  gallery_uri?: string | null;
};

export type JournalStage = 'journal' | 'staged' | 'archived' | 'indexed';

export type Journal = {
  version: 1;
  id: string;
  stage: JournalStage;
  archivePath: string;
  stagingPath: string;
  sourceUri: string;
  meta: ShotMeta;
  size?: number;
};

export type RecoveryReport = {
  /** Journal ids that finished their pipeline and were retired. */
  completed: string[];
  /** Journal ids that could NOT complete — kept on disk for a later retry. */
  failed: Array<{ id: string; stage: JournalStage; reason: string }>;
  /** Legacy orphan files imported into the index. */
  imported: Array<{ path: string; media_type: 'photo' | 'video' }>;
  /** Legacy files intentionally left alone (already indexed or unrecognized). */
  skipped: number;
};

export type MediaRepository = {
  savePhoto(input: SavePhotoInput): Promise<SavePhotoResult>;
  updateAssets(path: string, patch: AssetsPatch): Promise<void>;
  recover(): Promise<RecoveryReport>;
  archiveDir(): string;
  journalDir(): string;
};

// ---------------------------------------------------------------------------
// Injected adapters
// ---------------------------------------------------------------------------

export type StatInfo = { size: number; mtime: number | null };

/** Async file IO seam — the only thing the core knows about the filesystem. */
export type RepositoryIO = {
  ensureDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<StatInfo | null>;
  readFile(path: string): Promise<string | null>;
  readBytes(path: string, maxLen: number): Promise<Uint8Array | null>;
  writeFile(path: string, data: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  listDir(path: string): Promise<string[]>;
};

/** Async index seam — implemented over src/data/db.ts. */
export type RepositoryDb = {
  /** Returns the new row id, or null when a row for this path already exists. */
  insertShotIfMissing(shot: NewShot): Promise<number | null>;
  updateShotAssets(path: string, patch: AssetsPatch): Promise<void>;
  getShotByPath(path: string): Promise<ShotRow | null>;
};

export type RepositoryOptions = {
  archiveDir: string;
  journalDir: string;
  now?: () => number;
  /**
   * Crash/fault injection seam for tests: called AFTER each stage boundary is
   * durably recorded. Throwing from it simulates a crash at that stage.
   */
  injectCrash?: (stage: JournalStage) => void;
};

// ---------------------------------------------------------------------------
// Pure image dimension parsing — honest metadata for the orphan reconcile.
// Only real byte-derived values are reported; unknown stays 0, never guessed.
// ---------------------------------------------------------------------------

export function decodeBase64(s: string): Uint8Array {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = table.indexOf(clean[i]);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

export type ParsedDimensions = { width: number; height: number };

/**
 * Parses pixel dimensions from the first bytes of JPEG / PNG / WEBP files.
 * Returns null when the container or its size header cannot be confirmed —
 * callers must then record 0×0 (unknown), never an invented value.
 */
export function parseImageDimensions(bytes: Uint8Array): ParsedDimensions | null {
  if (bytes.length < 12) return null;

  // PNG: 8-byte signature, IHDR width/height big-endian at 16/20.
  if (
    bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return {
      width: (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19],
      height: (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23],
    };
  }

  // JPEG: 0xFFD8 then a marker walk to the first SOFn.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xff || marker === 0x00 || marker === 0x01) { i += 2; continue; }
      // Standalone markers carry no length payload.
      if (marker >= 0xd0 && marker <= 0xd9) { i += 2; continue; }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2) return null;
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        return {
          height: (bytes[i + 5] << 8) | bytes[i + 6],
          width: (bytes[i + 7] << 8) | bytes[i + 8],
        };
      }
      i += 2 + len;
    }
    return null;
  }

  // WEBP: RIFF....WEBP, then VP8 / VP8L / VP8X chunks.
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (fourcc === 'VP8 ' && bytes.length >= 30) {
      if (bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        const w = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
        const h = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
        return { width: w, height: h };
      }
      return null;
    }
    if (fourcc === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const b0 = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (b0 & 0x3fff) + 1, height: ((b0 >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X' && bytes.length >= 30) {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width: w, height: h };
    }
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Pure journal core
// ---------------------------------------------------------------------------

const JOURNAL_VERSION = 1;
export const JOURNAL_SUFFIX = '.journal.json';
const STAGING_SUFFIX = '.staging';

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', '3gp', 'webm', 'mkv', 'avi']);
const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'dng']);

export function isVideoExtension(ext: string): boolean {
  return VIDEO_EXTENSIONS.has(ext.toLowerCase());
}

function isRecognizedMediaFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  const ext = name.slice(dot + 1).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext) || PHOTO_EXTENSIONS.has(ext);
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

/** Deterministic CAM_ name derived from the shot's own created_at. */
export function baseNameFromTimestamp(ts: number): string {
  const d = new Date(ts);
  return (
    `CAM_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` +
    `_${pad(d.getMilliseconds(), 3)}`
  );
}

function journalPathFor(journalDir: string, id: string): string {
  return `${journalDir}/${id}${JOURNAL_SUFFIX}`;
}

function newShotFromJournal(j: Journal): NewShot {
  // Optional asset fields start blank on recovery — the hook back-fills them
  // through updateAssets. Never fabricate values.
  return {
    ...j.meta,
    path: j.archivePath,
    thumb_path: '',
    gallery_uri: null,
    size_bytes: j.size ?? null,
  };
}

function blankShotFromStat(
  archivePath: string,
  meta: ShotMeta,
  size: number | null,
): NewShot {
  return {
    ...meta,
    path: archivePath,
    thumb_path: '',
    gallery_uri: null,
    size_bytes: size,
  };
}

/**
 * Builds the repository around injected IO + DB adapters. All behavior —
 * journaling, staging, promotion, idempotent indexing, recovery, legacy
 * reconcile — is testable against in-memory adapters.
 */
export function createMediaRepository(
  io: RepositoryIO,
  db: RepositoryDb,
  opts: RepositoryOptions,
): MediaRepository {
  const { archiveDir, journalDir } = opts;
  const now = opts.now ?? (() => Date.now());

  async function writeJournal(j: Journal): Promise<void> {
    const path = journalPathFor(journalDir, j.id);
    await io.writeFile(`${path}.tmp`, JSON.stringify(j));
    await io.rename(`${path}.tmp`, path);
  }

  async function readJournal(path: string): Promise<Journal | null> {
    const raw = await io.readFile(path);
    if (raw === null) return null;
    try {
      const j = JSON.parse(raw) as Journal;
      if (j.version !== JOURNAL_VERSION || !j.archivePath || !j.meta) return null;
      return j;
    } catch {
      return null;
    }
  }

  async function listJournals(): Promise<string[]> {
    const names = await io.listDir(journalDir);
    return names.filter((n) => n.endsWith(JOURNAL_SUFFIX)).sort();
  }

  async function ensureDirs(): Promise<void> {
    await io.ensureDir(archiveDir);
    await io.ensureDir(journalDir);
  }

  async function indexArchivedShot(j: Journal): Promise<number | null> {
    const size = j.size ?? (await io.stat(j.archivePath))?.size;
    const id = await db.insertShotIfMissing(newShotFromJournal({ ...j, size }));
    if (id === null) {
      const existing = await db.getShotByPath(j.archivePath);
      return existing?.id ?? null;
    }
    return id;
  }

  /** Promotes whatever pixel source exists into the final archive name. */
  async function ensureArchivePixels(j: Journal): Promise<boolean> {
    const complete = async (path: string, expected = j.size): Promise<boolean> => {
      const stat = await io.stat(path);
      return !!stat && stat.size > 0 && (expected === undefined || stat.size === expected);
    };
    if (await complete(j.archivePath)) return true;
    if (await io.exists(j.sourceUri)) {
      const source = await io.stat(j.sourceUri);
      if (!source || source.size <= 0) throw new Error('Capture source is empty');
      await io.copy(j.sourceUri, j.stagingPath);
      if (!await complete(j.stagingPath, source.size)) throw new Error('Incomplete archive copy');
      await io.rename(j.stagingPath, j.archivePath);
      return true;
    }
    // Without the source, only a verified, durably completed copy is safe.
    if (j.stage !== 'journal' && j.size !== undefined && await complete(j.stagingPath)) {
      await io.rename(j.stagingPath, j.archivePath);
      return true;
    }
    // A staging copy that can never be promoted is dead weight inside the
    // ARCHIVE dir (which is not OS-managed cache) — reclaim it. The journal
    // itself is retained so the failure stays visible in the report.
    if (await io.exists(j.stagingPath)) await io.deleteFile(j.stagingPath);
    return false;
  }

  const repo: MediaRepository = {
    archiveDir: () => archiveDir,
    journalDir: () => journalDir,

    async savePhoto(input: SavePhotoInput): Promise<SavePhotoResult> {
      await ensureDirs();

      const { sourceUri, extension, meta } = input;
      const ext = extension.replace(/^\./, '').toLowerCase();

      // Deterministic destination: derived from the shot's own created_at,
      // with a collision walk against the CURRENT archive listing so a burst
      // landing in the same millisecond never overwrites a shot.
      const base = baseNameFromTimestamp(meta.created_at);
      const existingNames = new Set(await io.listDir(archiveDir));
      let id = `${base}.${ext}`;
      let n = 1;
      while (existingNames.has(id) || existingNames.has(`${id}${STAGING_SUFFIX}`) || await io.exists(journalPathFor(journalDir, id))) {
        id = `${base}-${n}.${ext}`;
        n++;
      }
      const dest = `${archiveDir}/${id}`;
      const stagingPath = `${dest}${STAGING_SUFFIX}`;

      // Stage 1 — journal BEFORE any pixel is copied. It carries the complete
      // NewShot metadata plus both source and destination paths.
      let journal: Journal = {
        version: JOURNAL_VERSION,
        id,
        stage: 'journal',
        archivePath: dest,
        stagingPath,
        sourceUri,
        meta,
      };
      await writeJournal(journal);
      opts.injectCrash?.('journal');

      // Stage 2 — copy the source into a staging file inside the archive dir
      // (same volume → the promotion rename below is atomic). The source
      // itself is left untouched for its owner to reclaim.
      try {
        await io.copy(sourceUri, stagingPath);
      } catch (e) {
        // Nothing archived yet; the journal stays so recover() can report
        // exactly what happened (and retry if the source reappears).
        throw e;
      }
      const sourceStat = await io.stat(sourceUri);
      const stagingStat = await io.stat(stagingPath);
      if (!sourceStat || sourceStat.size <= 0 || stagingStat?.size !== sourceStat.size) {
        throw new Error('Incomplete archive copy');
      }
      journal = { ...journal, stage: 'staged', size: stagingStat.size };
      await writeJournal(journal);
      opts.injectCrash?.('staged');

      // Stage 3 — promote staging → final name, then record the real size.
      await io.rename(stagingPath, dest);
      const stat = await io.stat(dest);
      journal = { ...journal, stage: 'archived', size: stat?.size ?? 0 };
      await writeJournal(journal);
      opts.injectCrash?.('archived');

      // Stage 4 — idempotent synchronous index insert. A transient DB failure
      // here must NOT delete the archived file: the journal is retained and
      // recover() retries the insert on the next startup.
      const rowId = await indexArchivedShot(journal);
      if (rowId === null) {
        throw new Error(`index insert failed for ${dest}`);
      }
      journal = { ...journal, stage: 'indexed' };
      await writeJournal(journal);
      opts.injectCrash?.('indexed');

      // Stage 5 — fully done: retire the journal.
      await io.deleteFile(journalPathFor(journalDir, journal.id));

      const row = await db.getShotByPath(dest);
      return {
        id: rowId,
        path: dest,
        size: journal.size ?? 0,
        thumbPath: row?.thumb_path ? row.thumb_path : null,
        galleryUri: row?.gallery_uri ?? null,
      };
    },

    async updateAssets(path: string, patch: AssetsPatch): Promise<void> {
      await db.updateShotAssets(path, patch);
    },

    async recover(): Promise<RecoveryReport> {
      const report: RecoveryReport = { completed: [], failed: [], imported: [], skipped: 0 };
      await ensureDirs();

      const journalOwnedNames = new Set<string>();
      const entries: Array<{ path: string; j: Journal | null }> = [];
      for (const name of await listJournals()) {
        journalOwnedNames.add(name.slice(0, -JOURNAL_SUFFIX.length));
        const jPath = `${journalDir}/${name}`;
        const j = await readJournal(jPath);
        entries.push({ path: jPath, j });
        if (!j) {
          report.failed.push({
            id: name,
            stage: 'journal',
            reason: 'unreadable journal entry — kept for inspection',
          });
        }
      }

      // Sibling journals can share one cache source (AEB brackets processed
      // from the same capture file) — a source may only be reclaimed once
      // the LAST journal referencing it has retired.
      const sourceRefs = new Map<string, number>();
      for (const { j } of entries) {
        if (!j) continue;
        sourceRefs.set(j.sourceUri, (sourceRefs.get(j.sourceUri) ?? 0) + 1);
      }

      for (const { path: jPath, j } of entries) {
        if (!j) continue;
        try {
          const pixels = await ensureArchivePixels(j);
          if (!pixels) {
            // Both the archive file and the source are gone. Never delete the
            // journal silently — keep it and report explicitly.
            report.failed.push({
              id: j.id,
              stage: j.stage,
              reason: 'archive and source both missing — journal retained',
            });
            continue;
          }
          const id = await indexArchivedShot(j);
          if (id === null) throw new Error('Archive index unavailable');
          await io.deleteFile(jPath);
          // The replay owns the cache source now (its creating process is
          // gone) — reclaim it once no sibling journal still references it
          // so recovered saves don't leak full-size JPEGs.
          const left = (sourceRefs.get(j.sourceUri) ?? 1) - 1;
          sourceRefs.set(j.sourceUri, left);
          if (left <= 0) await io.deleteFile(j.sourceUri);
          report.completed.push(j.id);
        } catch (e) {
          // Transient failure (e.g. DB unavailable): retain the journal and
          // retry on the next startup.
          report.failed.push({
            id: j.id,
            stage: j.stage,
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // Conservative legacy reconcile: import orphan media already sitting in
      // the archive root from pre-repository saves. Nothing is ever deleted.
      const names = await io.listDir(archiveDir);
      for (const name of names) {
        // Journal metadata remains authoritative even when its SQL write fails.
        if (journalOwnedNames.has(name)) continue;
        if (!isRecognizedMediaFile(name)) continue;
        if (name.endsWith(STAGING_SUFFIX)) continue;
        const path = `${archiveDir}/${name}`;
        if (await db.getShotByPath(path)) {
          report.skipped++;
          continue;
        }
        try {
          const stat = await io.stat(path);
          const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
          const isVideo = isVideoExtension(ext);

          // Honest dimensions: parsed from real bytes for photos, unknown (0)
          // for videos — never fabricated.
          let width = 0;
          let height = 0;
          if (!isVideo) {
            const head = await io.readBytes(path, 64 * 1024);
            const dims = head ? parseImageDimensions(head) : null;
            if (dims) {
              width = dims.width;
              height = dims.height;
            }
          }

          const inserted = await db.insertShotIfMissing(
            blankShotFromStat(path, {
              created_at: stat?.mtime ?? now(),
              filter_id: 'none',
              facing: 'unknown',
              width,
              height,
              flash_mode: 'unknown',
              zoom_ratio: null,
              timer_seconds: 0,
              edge_light: 0,
              device: '',
              framing: 'full',
              preset_id: 'recovered',
              preset_sub: 'unknown',
              ev: 0,
              iso: 0,
              tone: 'ldr',
              aeb: 0,
              lat: null,
              lon: null,
              media_type: isVideo ? 'video' : 'photo',
              duration_ms: null,
              bokeh: null,
            }, stat?.size ?? null),
          );
          if (inserted !== null) {
            report.imported.push({ path, media_type: isVideo ? 'video' : 'photo' });
          } else {
            report.skipped++;
          }
        } catch {
          report.skipped++;
        }
      }

      return report;
    },
  };

  let chain: Promise<unknown> = Promise.resolve();
  const serialize = <T>(job: () => Promise<T>): Promise<T> => {
    const next = chain.then(job, job);
    chain = next.catch(() => {});
    return next;
  };
  return {
    ...repo,
    savePhoto: (input) => serialize(() => repo.savePhoto(input)),
    updateAssets: (path, patch) => serialize(() => repo.updateAssets(path, patch)),
    recover: () => serialize(() => repo.recover()),
  };
}

// ---------------------------------------------------------------------------
// Expo adapter (only evaluated inside the app, never in node tests)
// ---------------------------------------------------------------------------

declare function require(id: string): any;

let defaultRepoPromise: Promise<MediaRepository> | null = null;

/** Memoized app-side repository over expo-file-system (legacy API). */
export function getDefaultMediaRepository(): Promise<MediaRepository> {
  if (!defaultRepoPromise) defaultRepoPromise = createExpoMediaRepository().catch((error) => { defaultRepoPromise = null; throw error; });
  return defaultRepoPromise;
}

export async function createExpoMediaRepository(): Promise<MediaRepository> {
  const FS = require('expo-file-system/legacy');
  const { insertShotIfMissing, updateShotAssets, getShotByPath } = require('../data/db') as typeof import('../data/db');

  const docDir = FS.documentDirectory;
  if (!docDir) throw new Error('mediaRepository: no document directory');
  const archive = `${docDir}camen`;
  const journals = `${archive}/journals`;

  const io: RepositoryIO = {
    async ensureDir(path) {
      try {
        await FS.makeDirectoryAsync(path, { intermediates: true });
      } catch {
        // already exists
      }
    },
    async exists(path) {
      const info = await FS.getInfoAsync(path);
      return !!info.exists;
    },
    async stat(path) {
      const info = await FS.getInfoAsync(path);
      if (!info.exists) return null;
      return {
        size: typeof info.size === 'number' ? info.size : 0,
        mtime:
          typeof info.modificationTime === 'number'
            ? info.modificationTime * 1000
            : null,
      };
    },
    async readFile(path) {
      try {
        return await FS.readAsStringAsync(path, { encoding: FS.EncodingType.UTF8 });
      } catch {
        return null;
      }
    },
    async readBytes(path, maxLen) {
      try {
        const b64 = await FS.readAsStringAsync(path, {
          encoding: FS.EncodingType.Base64,
          length: maxLen,
        });
        return decodeBase64(b64);
      } catch {
        return null;
      }
    },
    async writeFile(path, data) {
      await FS.writeAsStringAsync(path, data, { encoding: FS.EncodingType.UTF8 });
    },
    async deleteFile(path) {
      try {
        await FS.deleteAsync(path, { idempotent: true });
      } catch {
        // already gone
      }
    },
    async rename(from, to) {
      await FS.moveAsync({ from, to });
    },
    async copy(from, to) {
      await FS.copyAsync({ from, to });
    },
    async listDir(path) {
      try {
        return await FS.readDirectoryAsync(path);
      } catch {
        return [];
      }
    },
  };

  const db: RepositoryDb = {
    async insertShotIfMissing(shot) {
      return insertShotIfMissing(shot);
    },
    async updateShotAssets(path, patch) {
      updateShotAssets(path, patch);
    },
    async getShotByPath(path) {
      return getShotByPath(path);
    },
  };

  return createMediaRepository(io, db, { archiveDir: archive, journalDir: journals });
}
