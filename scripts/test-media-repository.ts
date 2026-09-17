/**
 * Node integration tests for the recoverable archive repository
 * (src/features/mediaRepository.ts) — run with:
 *   node scripts/test-media-repository.ts
 *
 * Real in-memory-but-crashable adapters: the IO layer is a working file
 * system (Node fs) and the DB layer a working relational store (better-sqlite
 * is NOT available — an in-memory SQL-shaped store enforcing the UNIQUE path
 * contract stands in; the Expo adapter maps the same three db functions onto
 * the real SQLite database). Fault injection crashes savePhoto after each
 * journal stage; a fresh repository instance then recovers and the assertions
 * check: no lost media, no duplicate rows, no fabricated metadata.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createMediaRepository,
  baseNameFromTimestamp,
  decodeBase64,
  parseImageDimensions,
  type Journal,
  type JournalStage,
  type RepositoryDb,
  type RepositoryIO,
  type StatInfo,
} from '../src/features/mediaRepository.ts';
import type { NewShot, ShotRow } from '../src/data/db.ts';

let passed = 0;
async function ok(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log('  ok —', name);
}

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** A real directory-backed IO adapter with crashable mutations. */
function makeNodeIO(root: string, fault: { failOn?: (op: string, p: string) => boolean } = {}) {
  const io: RepositoryIO = {
    async ensureDir(p) {
      if (fault.failOn?.('ensureDir', p)) throw new Error('injected ensureDir failure');
      fs.mkdirSync(p, { recursive: true });
    },
    async exists(p) {
      return fs.existsSync(p);
    },
    async stat(p) {
      try {
        const s = fs.statSync(p);
        return { size: s.size, mtime: s.mtimeMs };
      } catch {
        return null;
      }
    },
    async readFile(p) {
      try {
        return fs.readFileSync(p, 'utf8');
      } catch {
        return null;
      }
    },
    async readBytes(p, maxLen) {
      try {
        const fh = fs.openSync(p, 'r');
        const buf = Buffer.alloc(maxLen);
        const n = fs.readSync(fh, buf, 0, maxLen, 0);
        fs.closeSync(fh);
        return new Uint8Array(buf.subarray(0, n));
      } catch {
        return null;
      }
    },
    async writeFile(p, data) {
      if (fault.failOn?.('write', p)) throw new Error('injected write failure');
      fs.writeFileSync(p, data, 'utf8');
    },
    async deleteFile(p) {
      fs.rmSync(p, { force: true });
    },
    async rename(from, to) {
      if (fault.failOn?.('rename', from) || fault.failOn?.('rename', to)) {
        throw new Error('injected rename failure');
      }
      fs.renameSync(from, to);
    },
    async copy(from, to) {
      if (fault.failOn?.('copy', from) || fault.failOn?.('copy', to)) {
        throw new Error('injected copy failure');
      }
      fs.copyFileSync(from, to);
    },
    async listDir(p) {
      try {
        return fs.readdirSync(p).filter((n) => !fs.statSync(path.join(p, n)).isDirectory());
      } catch {
        return [];
      }
    },
  };
  return io;
}

/**
 * SQL-shaped store honoring the shots UNIQUE(path) contract, with an optional
 * outage window to simulate transient DB failures.
 */
function makeMemoryDb(): RepositoryDb & {
  rows: Map<string, ShotRow>;
  nextId: { v: number };
  outage: { until: number | null; calls: number };
} {
  const rows = new Map<string, ShotRow>();
  const nextId = { v: 1 };
  const outage = { until: 0, calls: 0 };
  return {
    rows,
    nextId,
    outage,
    async insertShotIfMissing(shot: NewShot): Promise<number | null> {
      outage.calls++;
      if (Date.now() < outage.until) throw new Error('db temporarily unavailable');
      if (rows.has(shot.path)) return null;
      const id = nextId.v++;
      rows.set(shot.path, { ...shot, id });
      return id;
    },
    async updateShotAssets(p, patch) {
      outage.calls++;
      if (Date.now() < outage.until) throw new Error('db temporarily unavailable');
      const row = rows.get(p);
      if (!row) throw new Error('no row for ' + p);
      if (patch.thumb_path !== undefined) row.thumb_path = patch.thumb_path;
      if (patch.gallery_uri !== undefined) row.gallery_uri = patch.gallery_uri;
    },
    async getShotByPath(p) {
      return rows.get(p) ?? null;
    },
  };
}

function makeMeta(created_at: number, over: Partial<NewShot> = {}) {
  return {
    created_at,
    filter_id: 'none',
    facing: 'back',
    width: 12,
    height: 9,
    flash_mode: 'off',
    zoom_ratio: 1,
    timer_seconds: 0,
    edge_light: 0,
    device: 'test',
    framing: 'full',
    preset_id: 'standard',
    preset_sub: 'standard',
    ev: 0,
    iso: 100,
    tone: 'ldr',
    aeb: 0,
    lat: null,
    lon: null,
    media_type: 'photo' as const,
    duration_ms: null,
    bokeh: null,
    ...over,
  };
}

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'camen-repo-'));
}

// A minimal valid JPEG (SOI + SOF0 with 3×2 pixels + EOI).
const JPEG_HEAD = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x09, 0x00, 0x0c, 0x03, 0x01, 0x11, 0x00,
  0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
]);

async function main() {
  // ---- pure helpers --------------------------------------------------------
  await ok('parseImageDimensions reads a real JPEG SOF header', () => {
    const dims = parseImageDimensions(new Uint8Array(JPEG_HEAD));
    assert.deepEqual(dims, { width: 12, height: 9 });
  });
  await ok('parseImageDimensions refuses non-image bytes (unknown stays unknown)', () => {
    assert.equal(parseImageDimensions(new Uint8Array(64).fill(0x41)), null);
    assert.equal(parseImageDimensions(new Uint8Array(10)), null);
  });
  await ok('decodeBase64 round-trips', () => {
    const b = Buffer.from('camen-bytes');
    assert.deepEqual(Buffer.from(decodeBase64(b.toString('base64'))), b);
  });

  // ---- save: happy path ----------------------------------------------------
  await ok('savePhoto archives pixels, indexes complete metadata, retires journal', async () => {
    const root = tmpRoot();
    const io = makeNodeIO(root);
    const db = makeMemoryDb();
    const repo = createMediaRepository(io, db, {
      archiveDir: path.join(root, 'camen'),
      journalDir: path.join(root, 'camen', 'journals'),
    });
    const src = path.join(root, 'cache.jpg');
    fs.writeFileSync(src, JPEG_HEAD);

    const created = 1710000000123;
    const res = await repo.savePhoto({
      sourceUri: src,
      extension: 'jpg',
      meta: makeMeta(created),
    });

    // Archive file exists under a deterministic CAM_ name from created_at.
    assert.equal(res.path, path.join(root, 'camen', `${baseNameFromTimestamp(created)}.jpg`));
    assert.equal(fs.readFileSync(res.path).compare(JPEG_HEAD), 0);
    // Source cache file SURVIVES (copy, not move) — its owner cleans up.
    assert.ok(fs.existsSync(src), 'source must survive savePhoto');

    // Index row holds the complete metadata.
    const row = db.rows.get(res.path)!;
    assert.equal(row.preset_id, 'standard');
    assert.equal(row.media_type, 'photo');
    assert.equal(row.size_bytes, JPEG_HEAD.length);
    assert.equal(row.width, 12);

    // Success: no journal left behind.
    const journals = await io.listDir(path.join(root, 'camen', 'journals'));
    assert.equal(journals.length, 0);

    fs.rmSync(root, { recursive: true, force: true });
  });

  // ---- crash at each stage, then recover -----------------------------------
  const stages: JournalStage[] = ['journal', 'staged', 'archived', 'indexed'];
  for (const stage of stages) {
    await ok(`crash after "${stage}" then recover: media kept, exactly one row`, async () => {
      const root = tmpRoot();
      const dir = path.join(root, 'camen');
      const io = makeNodeIO(root);
      const db = makeMemoryDb();
      const created = 1710000000123;
      const src = path.join(root, 'cache2.jpg');
      fs.writeFileSync(src, JPEG_HEAD);

      let crashed = false;
      const repo = createMediaRepository(io, db, {
        archiveDir: dir,
        journalDir: path.join(dir, 'journals'),
        injectCrash: (actualStage) => {
          if (actualStage === stage) {
            crashed = true;
            throw new Error('simulated crash');
          }
        },
      });

      await assert.rejects(
        () => repo.savePhoto({ sourceUri: src, extension: 'jpg', meta: makeMeta(created) }),
        /simulated crash/,
      );
      assert.ok(crashed);

      // The source cache file must survive every crash point.
      assert.ok(fs.existsSync(src), 'source survives crash');

      // A fresh repository instance (the next app launch) recovers.
      const repo2 = createMediaRepository(io, db, {
        archiveDir: dir,
        journalDir: path.join(dir, 'journals'),
      });
      const report = await repo2.recover();

      assert.deepEqual(report.completed.length, 1, JSON.stringify(report));
      assert.equal(report.failed.length, 0);

      // The archived file exists with the original bytes.
      const files = (await io.listDir(dir)).filter((n) => !n.includes('journals'));
      assert.equal(files.filter((n) => n.endsWith('.jpg')).length, 1);
      const dest = path.join(dir, files[0]);
      assert.equal(fs.readFileSync(dest).compare(JPEG_HEAD), 0);

      // Exactly ONE index row — recovery is idempotent; replaying again
      // changes nothing.
      const report2 = await repo2.recover();
      assert.equal(report2.completed.length, 0);
      assert.equal(db.rows.size, 1);

      const [row] = [...db.rows.values()];
      assert.equal(row.path, dest);
      assert.equal(row.created_at, created);
      assert.equal(row.preset_id, 'standard');
      assert.equal(row.media_type, 'photo');
      assert.equal(row.size_bytes, JPEG_HEAD.length);
      // Optional asset fields are blank until the hook back-fills them.
      assert.equal(row.thumb_path, '');
      assert.equal(row.gallery_uri, null);

      // Recovery retried from the SOURCE when the archive copy was missing —
      // no journal was deleted without success.
      assert.equal((await io.listDir(path.join(dir, 'journals'))).length, 0);

      fs.rmSync(root, { recursive: true, force: true });
    });
  }

  // ---- crash between archived and indexed + DB outage ----------------------
  await ok('transient DB failure at index stage retains journal and file; retries later', async () => {
    const root = tmpRoot();
    const dir = path.join(root, 'camen');
    const io = makeNodeIO(root);
    const db = makeMemoryDb();
    const src = path.join(root, 'cache3.jpg');
    fs.writeFileSync(src, JPEG_HEAD);

    const repo = createMediaRepository(io, db, {
      archiveDir: dir,
      journalDir: path.join(dir, 'journals'),
    });
    // Simulate the DB going down right before the insert.
    db.outage.until = Date.now() + 10_000;
    await assert.rejects(() =>
      repo.savePhoto({ sourceUri: src, extension: 'jpg', meta: makeMeta(1710000000456) }),
    );
    db.outage.until = 0;

    // The archived file must NOT be deleted on the DB failure (old behavior
    // deleted the archive + thumb on insert failure).
    const archived = (await io.listDir(dir)).filter((n) => n.endsWith('.jpg'));
    assert.equal(archived.length, 1, 'archived pixels survive a DB failure');
    assert.ok(fs.existsSync(src), 'source survives too');

    const report = await repo.recover();
    assert.equal(report.completed.length, 1, JSON.stringify(report));
    assert.equal(db.rows.size, 1);
    const [row] = [...db.rows.values()];
    assert.equal(row.size_bytes, JPEG_HEAD.length);

    fs.rmSync(root, { recursive: true, force: true });
  });

  await ok('failed journal replay never falls through to legacy metadata import', async () => {
    const root = tmpRoot();
    try {
      const dir = path.join(root, 'camen');
      const io = makeNodeIO(root);
      const db = makeMemoryDb();
      const opts = { archiveDir: dir, journalDir: path.join(dir, 'journals') };
      const src = path.join(root, 'source.jpg');
      fs.writeFileSync(src, JPEG_HEAD);
      await assert.rejects(createMediaRepository(io, db, {
        ...opts, injectCrash(stage) { if (stage === 'archived') throw new Error('crash'); },
      }).savePhoto({ sourceUri: src, extension: 'jpg', meta: makeMeta(1710000000000, { preset_id: 'custom' }) }));
      const insert = db.insertShotIfMissing;
      let calls = 0;
      db.insertShotIfMissing = async (shot) => {
        if (++calls === 1) throw new Error('one transient failure');
        return insert(shot);
      };
      const repo = createMediaRepository(io, db, opts);
      const failed = await repo.recover();
      assert.equal(failed.failed.length, 1);
      assert.equal(failed.imported.length, 0, 'retained journal must own its archive');
      assert.equal(db.rows.size, 0);
      assert.equal((await repo.recover()).completed.length, 1);
      assert.equal([...db.rows.values()][0].preset_id, 'custom');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  // ---- updateAssets ----------------------------------------------------------
  await ok('updateAssets back-fills thumb/gallery on the recovered row', async () => {
    const root = tmpRoot();
    const dir = path.join(root, 'camen');
    const io = makeNodeIO(root);
    const db = makeMemoryDb();
    const repo = createMediaRepository(io, db, {
      archiveDir: dir,
      journalDir: path.join(dir, 'journals'),
    });
    const src = path.join(root, 'cache4.jpg');
    fs.writeFileSync(src, JPEG_HEAD);
    const res = await repo.savePhoto({
      sourceUri: src,
      extension: 'jpg',
      meta: makeMeta(1710000000789),
    });
    assert.equal(res.thumbPath, null);

    await repo.updateAssets(res.path, {
      thumb_path: '/thumbs/t.jpg',
      gallery_uri: 'content://media/1',
    });
    const row = db.rows.get(res.path)!;
    assert.equal(row.thumb_path, '/thumbs/t.jpg');
    assert.equal(row.gallery_uri, 'content://media/1');

    fs.rmSync(root, { recursive: true, force: true });
  });

  // ---- recovery with everything gone ----------------------------------------
  await ok('journal whose archive AND source are missing is retained and reported', async () => {
    const root = tmpRoot();
    const dir = path.join(root, 'camen');
    const io = makeNodeIO(root);
    const db = makeMemoryDb();
    const repo = createMediaRepository(io, db, {
      archiveDir: dir,
      journalDir: path.join(dir, 'journals'),
    });

    // Hand-write a journal pointing at nothing.
    const j: Journal = {
      version: 1,
      id: 'CAM_20240101_000000_000.jpg',
      stage: 'journal',
      archivePath: path.join(dir, 'CAM_20240101_000000_000.jpg'),
      stagingPath: path.join(dir, 'CAM_20240101_000000_000.jpg.staging'),
      sourceUri: path.join(root, 'gone-cache.jpg'),
      meta: makeMeta(1700000000000),
    };
    fs.mkdirSync(path.join(dir, 'journals'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'journals', 'CAM_20240101_000000_000.jpg.journal.json'),
      JSON.stringify(j),
    );

    const report = await repo.recover();
    assert.equal(report.completed.length, 0);
    assert.equal(report.failed.length, 1);
    assert.match(report.failed[0].reason, /both missing/);
    // Journal is NOT deleted.
    assert.equal(
      fs.existsSync(path.join(dir, 'journals', 'CAM_20240101_000000_000.jpg.journal.json')),
      true,
    );

    fs.rmSync(root, { recursive: true, force: true });
  });

  // ---- legacy orphan reconcile ----------------------------------------------
  await ok('legacy orphan photos are imported with parsed dimensions; indexed files skipped', async () => {
    const root = tmpRoot();
    const dir = path.join(root, 'camen');
    fs.mkdirSync(dir, { recursive: true });
    const io = makeNodeIO(root);
    const db = makeMemoryDb();

    // Pre-repository save: full-size file in the archive root, no journal, no row.
    fs.writeFileSync(path.join(dir, 'CAM_20231225_101010_123.jpg'), JPEG_HEAD);
    // A video orphan — dimensions unknown (0), never fabricated.
    fs.writeFileSync(path.join(dir, 'CAM_20231225_101011_123.mp4'), Buffer.from('not really an mp4'));
    // An unrecognized file must be left alone, not imported.
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'hello');

    const repo = createMediaRepository(io, db, {
      archiveDir: dir,
      journalDir: path.join(dir, 'journals'),
      now: () => 1710000000000,
    });
    const report = await repo.recover();

    assert.equal(report.imported.length, 2, JSON.stringify(report));
    assert.equal(report.skipped, 0);

    const photo = db.rows.get(path.join(dir, 'CAM_20231225_101010_123.jpg'))!;
    assert.equal(photo.width, 12); // parsed from actual JPEG bytes
    assert.equal(photo.height, 9);
    assert.equal(photo.media_type, 'photo');
    assert.equal(photo.size_bytes, JPEG_HEAD.length);
    assert.ok(photo.created_at > 0);

    const video = db.rows.get(path.join(dir, 'CAM_20231225_101011_123.mp4'))!;
    assert.equal(video.media_type, 'video');
    assert.equal(video.width, 0, 'video dimensions stay unknown, not fabricated');
    assert.equal(video.height, 0);

    // No file was deleted by reconcile.
    assert.ok(fs.existsSync(path.join(dir, 'CAM_20231225_101010_123.jpg')));
    assert.ok(fs.existsSync(path.join(dir, 'notes.txt')));

    // Second run: everything already indexed → skipped, still nothing deleted.
    const again = await repo.recover();
    assert.equal(again.imported.length, 0);
    assert.equal(again.skipped, 2);
    assert.equal(db.rows.size, 2);

    fs.rmSync(root, { recursive: true, force: true });
  });

  await ok('legacy import falls back to mtime for created_at and keeps honest zeros', async () => {
    const root = tmpRoot();
    const dir = path.join(root, 'camen');
    fs.mkdirSync(dir, { recursive: true });
    const io = makeNodeIO(root);
    const db = makeMemoryDb();
    const orphan = path.join(dir, 'CAM_20220101_090000_500.jpg');
    fs.writeFileSync(orphan, JPEG_HEAD);
    const mtime = new Date('2022-01-01T00:00:00Z').getTime();
    fs.utimesSync(orphan, mtime / 1000, mtime / 1000);

    const repo = createMediaRepository(io, db, {
      archiveDir: dir,
      journalDir: path.join(dir, 'journals'),
    });
    const report = await repo.recover();
    assert.equal(report.imported.length, 1);
    const row = db.rows.get(orphan)!;
    assert.equal(row.created_at, mtime);

    fs.rmSync(root, { recursive: true, force: true });
  });

  // ---- collision determinism -------------------------------------------------
  await ok('partial staging copy is not promoted: interrupted copy retries from source', async () => {
    const root = tmpRoot();
    try {
      const dir = path.join(root, 'camen');
      const io = makeNodeIO(root);
      const db = makeMemoryDb();
      const opts = { archiveDir: dir, journalDir: path.join(dir, 'journals') };
      const src = path.join(root, 'cache-copy.jpg');
      fs.writeFileSync(src, JPEG_HEAD);

      // Crash exactly on the staging copy operation — the journal still says
      // 'journal' and the staging file is a partial copy.
      const repo = createMediaRepository(io, db, opts);
      const origCopy = io.copy.bind(io);
      (io as RepositoryIO).copy = async (from, to) => {
        if (from === src && to.endsWith('.staging')) {
          fs.writeFileSync(to, Buffer.from([JPEG_HEAD[0]])); // truncated write
          throw new Error('injected copy failure');
        }
        return origCopy(from, to);
      };
      await assert.rejects(() =>
        repo.savePhoto({ sourceUri: src, extension: 'jpg', meta: makeMeta(1710000000123) }));

      const staging = (await io.listDir(dir)).find((name) => name.endsWith('.staging'))!;
      assert.equal(fs.statSync(path.join(dir, staging)).size, 1);
      io.copy = origCopy;
      // Fresh instance recovers by retrying the copy from the (intact) source.
      const repo2 = createMediaRepository(io, db, opts);
      const report = await repo2.recover();
      assert.equal(report.completed.length, 1, JSON.stringify(report));
      const files = (await io.listDir(dir)).filter((n) => n.endsWith('.jpg'));
      assert.equal(files.length, 1);
      assert.equal(fs.readFileSync(path.join(dir, files[0])).compare(JPEG_HEAD), 0,
        'archived bytes must be the complete source, not the partial copy');
      assert.equal(fs.existsSync(src), true, 'source survives');
      assert.equal((await io.listDir(dir)).filter((n) => n.endsWith('.staging')).length, 0,
        'staging leftovers are consumed, never left behind');
      assert.equal(db.rows.size, 1);
      const row = [...db.rows.values()][0];
      assert.equal(row.preset_id, 'standard');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await ok('save without a source requires a durably completed staging copy, then verifies bytes', async () => {
    const root = tmpRoot();
    try {
      const dir = path.join(root, 'camen');
      const io = makeNodeIO(root);
      const db = makeMemoryDb();
      const opts = { archiveDir: dir, journalDir: path.join(dir, 'journals') };
      const src = path.join(root, 'cache-vanish.jpg');
      fs.writeFileSync(src, JPEG_HEAD);

      const repo = createMediaRepository(io, db, {
        ...opts, injectCrash(stage) { if (stage === 'staged') throw new Error('crash'); },
      });
      await assert.rejects(() =>
        repo.savePhoto({ sourceUri: src, extension: 'jpg', meta: makeMeta(1710000000321) }));
      fs.rmSync(src); // cache vanished after 'staged' — the only durable copy

      const repo2 = createMediaRepository(io, db, opts);
      const report = await repo2.recover();
      assert.equal(report.completed.length, 1, JSON.stringify(report));
      const files = (await io.listDir(dir)).filter((n) => n.endsWith('.jpg'));
      assert.equal(files.length, 1);
      assert.equal(fs.readFileSync(path.join(dir, files[0])).compare(JPEG_HEAD), 0,
        'promotion from staging requires complete bytes');

      // Truncated staging with the same journal shape must NOT promote.
      const root2 = tmpRoot();
      try {
        const dir2 = path.join(root2, 'camen');
        const io2 = makeNodeIO(root2);
        const db2 = makeMemoryDb();
        const src2 = path.join(root2, 'cache2.jpg');
        fs.writeFileSync(src2, JPEG_HEAD);
        const repo3 = createMediaRepository(io2, db2, {
          archiveDir: dir2, journalDir: path.join(dir2, 'journals'),
          injectCrash(stage) { if (stage === 'staged') throw new Error('crash'); },
        });
        await assert.rejects(() =>
          repo3.savePhoto({ sourceUri: src2, extension: 'jpg', meta: makeMeta(1710000000321) }));
        // Truncate the staging file, then remove the source.
        const staging = fs.readdirSync(dir2).find((n) => n.endsWith('.staging'))!;
        fs.writeFileSync(path.join(dir2, staging), Buffer.from([JPEG_HEAD[0]]));
        fs.rmSync(src2);
        const failed = await createMediaRepository(io2, db2, {
          archiveDir: dir2, journalDir: path.join(dir2, 'journals'),
        }).recover();
        assert.equal(failed.completed.length, 0);
        assert.equal(failed.failed.length, 1);
        assert.equal(db2.rows.size, 0);
        assert.equal(fs.readdirSync(dir2).some((n) => n.endsWith('.staging')), true,
          'rejected staging is kept (never promoted, never destroyed)');
      } finally { fs.rmSync(root2, { recursive: true, force: true }); }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await ok('concurrent savePhoto calls land distinct archive names with one row each', async () => {
    const root = tmpRoot();
    try {
      const dir = path.join(root, 'camen');
      const io = makeNodeIO(root);
      const db = makeMemoryDb();
      const repo = createMediaRepository(io, db, {
        archiveDir: dir, journalDir: path.join(dir, 'journals'),
      });
      const src = path.join(root, 'conc.jpg');
      fs.writeFileSync(src, JPEG_HEAD);
      const results = await Promise.all([0, 1, 2, 3].map((i) =>
        repo.savePhoto({ sourceUri: src, extension: 'jpg', meta: makeMeta(1710000000777 + i) })));
      const paths = new Set(results.map((r) => r.path));
      assert.equal(paths.size, 4, 'every save gets a distinct archive path');
      assert.equal(db.rows.size, 4);
      assert.equal(new Set([...db.rows.values()].map((r) => r.id)).size, 4, 'distinct row ids');
      const archives = (await io.listDir(dir)).filter((n) => n.endsWith('.jpg'));
      assert.equal(archives.length, 4, 'no archive file was overwritten');
      for (const p of paths) {
        assert.equal(fs.readFileSync(p).compare(JPEG_HEAD), 0, 'each archive holds complete bytes');
      }
      assert.equal((await io.listDir(path.join(dir, 'journals'))).length, 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await ok('path-index migration preserves duplicates and constrains fresh databases', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { ensurePathIndex } = await import('../src/data/pathIndex.ts');
    for (const duplicates of [false, true]) {
      const sqlite = new DatabaseSync(':memory:');
      try {
        sqlite.exec('CREATE TABLE shots (id INTEGER PRIMARY KEY, path TEXT NOT NULL)');
        sqlite.exec("INSERT INTO shots VALUES (1, '/duplicate.jpg')");
        if (duplicates) sqlite.exec("INSERT INTO shots VALUES (2, '/duplicate.jpg')");
        const adapter = {
          execSync: (sql: string) => sqlite.exec(sql),
          getFirstSync: <T,>(sql: string) => (sqlite.prepare(sql).get() as T | undefined) ?? null,
        };
        ensurePathIndex(adapter);
        ensurePathIndex(adapter);
        const count = sqlite.prepare('SELECT COUNT(*) AS n FROM shots').get()!;
        assert.equal(count.n, duplicates ? 2 : 1);
        assert.equal(sqlite.prepare("PRAGMA index_list(shots)").get()!.unique, duplicates ? 0 : 1);
        if (!duplicates) assert.throws(() => sqlite.exec("INSERT INTO shots VALUES (3, '/duplicate.jpg')"), /UNIQUE/);
      } finally { sqlite.close(); }
    }
  });
  await ok('same-millisecond saves never overwrite: collision walk keeps both', async () => {
    const root = tmpRoot();
    const dir = path.join(root, 'camen');
    const io = makeNodeIO(root);
    const db = makeMemoryDb();
    const repo = createMediaRepository(io, db, {
      archiveDir: dir,
      journalDir: path.join(dir, 'journals'),
    });
    const src = path.join(root, 'c.jpg');
    fs.writeFileSync(src, JPEG_HEAD);

    const r1 = await repo.savePhoto({ sourceUri: src, extension: 'jpg', meta: makeMeta(1710000000999) });
    const r2 = await repo.savePhoto({ sourceUri: src, extension: 'jpg', meta: makeMeta(1710000000999) });

    assert.notEqual(r1.path, r2.path);
    assert.equal(r2.path, path.join(dir, `${baseNameFromTimestamp(1710000000999)}-1.jpg`));
    assert.equal(db.rows.size, 2);
    assert.equal((await io.listDir(dir)).filter((n) => n.endsWith('.jpg')).length, 2);

    fs.rmSync(root, { recursive: true, force: true });
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
