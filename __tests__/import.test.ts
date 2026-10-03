import { SqliteFileRepository } from '../src/data/FileRepository';
import { SimulatedCrashError } from '../src/domain/errors';
import type { ImportSource, ImportStep } from '../src/domain/types';
import { CancelToken, Mutex, runPool } from '../src/services/concurrency';
import { ImportService } from '../src/services/ImportService';
import { ReconciliationService } from '../src/services/ReconciliationService';
import { ARCHIVE_DIR, STAGING_DIR } from '../src/storage/FileStore';
import { FlakyFileRepository } from './fakes/FlakyFileRepository';
import { MemoryFileStore, PICKER_CACHE } from './fakes/MemoryFileStore';
import { createTestDatabase } from './support/nodeSqlite';

async function setup() {
  const db = await createTestDatabase();
  const files = new FlakyFileRepository(new SqliteFileRepository(db));
  const store = new MemoryFileStore();
  const archiveLock = new Mutex();
  let seq = 0;
  const importer = new ImportService({
    store,
    files,
    archiveLock,
    newId: () => `id${++seq}`,
    now: () => 1_700_000_000_000,
  });
  const reconciliation = new ReconciliationService({ store, files, archiveLock });

  const source = (name: string, content: string, mimeType: string | null = null): ImportSource => {
    const uri = `${PICKER_CACHE}${name}`;
    store.addSource(uri, content);
    return { uri, name, mimeType, size: content.length, lastModified: 1_600_000_000_000 };
  };

  /**
   * The core invariant, checked after every scenario: no staging leftovers,
   * every DB row points at a file that exists, and every archived file has a row.
   */
  const expectConsistent = async () => {
    expect(store.paths(`${STAGING_DIR}/`)).toEqual([]);
    const rowPaths = (await files.listStoragePaths()).sort();
    const diskPaths = store.paths(`${ARCHIVE_DIR}/`);
    expect(diskPaths).toEqual(rowPaths);
  };

  return { db, files, store, importer, reconciliation, source, expectConsistent };
}

describe('ImportService', () => {
  it('imports several files of different types', async () => {
    const t = await setup();
    const steps: ImportStep[] = [];
    const summary = await t.importer.importFiles(
      [
        t.source('photo.jpg', 'jpeg-bytes', 'image/jpeg'),
        t.source('scan.pdf', 'pdf-bytes', 'application/pdf'),
        t.source('notes.docx', 'docx-bytes', 'application/octet-stream'),
      ],
      { onProgress: (index, step) => index === 0 && steps.push(step) },
    );

    expect(summary).toMatchObject({ imported: 3, duplicates: 0, failed: 0, cancelled: 0, wasCancelled: false });
    const rows = await t.files.listAll();
    expect(rows.map((r) => [r.displayName, r.category]).sort()).toEqual([
      ['notes.docx', 'document'],
      ['photo.jpg', 'image'],
      ['scan.pdf', 'pdf'],
    ]);
    const pdf = rows.find((r) => r.category === 'pdf')!;
    expect(pdf.storagePath).toMatch(/^archive\/id\d+\.pdf$/);
    expect(pdf.sizeBytes).toBe('pdf-bytes'.length);
    expect(pdf.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(pdf.status).toBe('available');
    expect(pdf.sourceModifiedAt).toBe(1_600_000_000_000);
    expect(steps).toEqual([
      'validating',
      'copying',
      'verifying',
      'hashing',
      'checking-duplicates',
      'finalizing',
      'saving',
      'done',
    ]);
    await t.expectConsistent();
  });

  it('copy failure leaves no staging file and no DB row', async () => {
    const t = await setup();
    t.store.failWhen.copyIn = (uri) => uri.endsWith('broken.pdf');

    const summary = await t.importer.importFiles([t.source('broken.pdf', 'some pdf content')]);

    expect(summary.failed).toBe(1);
    expect(summary.results[0].outcome).toMatchObject({ kind: 'failed', code: 'COPY_FAILED' });
    expect(await t.files.listAll()).toEqual([]);
    await t.expectConsistent(); // the half-written .part file was removed
  });

  it('DB insert failure removes the already-moved file (compensation)', async () => {
    const t = await setup();
    t.files.failInsertWhen = () => true;

    const summary = await t.importer.importFiles([t.source('a.txt', 'hello')]);

    expect(summary.results[0].outcome).toMatchObject({ kind: 'failed', code: 'DB_FAILED' });
    expect(t.store.paths(ARCHIVE_DIR)).toEqual([]);
    expect(await t.files.listAll()).toEqual([]);
    await t.expectConsistent();
  });

  it('cancel mid-queue keeps finished files and cleans staging', async () => {
    const t = await setup();
    const token = new CancelToken();
    const sources = ['a', 'b', 'c', 'd'].map((n) => t.source(`${n}.txt`, `content ${n}`));
    // Cancel the moment the third file starts copying.
    t.store.onOperation = (op, arg) => {
      if (op === 'copyIn' && arg.endsWith('c.txt')) token.cancel();
    };

    const summary = await t.importer.importFiles(sources, { token });

    expect(summary.wasCancelled).toBe(true);
    expect(summary.results[0].outcome.kind).toBe('imported');
    expect(summary.results[2].outcome.kind).toBe('cancelled'); // in flight, cleaned up
    expect(summary.results[3].outcome.kind).toBe('cancelled'); // never started
    expect(summary.failed).toBe(0);
    expect(summary.imported + summary.cancelled).toBe(4);
    expect((await t.files.listAll()).length).toBe(summary.imported);
    await t.expectConsistent();
  });

  it('partial success: the middle file fails, the others are imported', async () => {
    const t = await setup();
    t.store.failWhen.hash = (path) => path.includes('id2');

    const summary = await t.importer.importFiles([
      t.source('one.txt', '1111'),
      t.source('two.txt', '2222'),
      t.source('three.txt', '3333'),
    ]);

    expect(summary).toMatchObject({ imported: 2, failed: 1, duplicates: 0, wasCancelled: false });
    expect(summary.results.map((r) => [r.name, r.outcome.kind])).toEqual([
      ['one.txt', 'imported'],
      ['two.txt', 'failed'],
      ['three.txt', 'imported'],
    ]);
    const failed = summary.results[1].outcome;
    expect(failed.kind === 'failed' && failed.code).toBe('HASH_FAILED');
    expect(failed.kind === 'failed' && failed.reason).toMatch(/Could not read the copied file/);
    await t.expectConsistent();
  });

  it('rejects unreadable and empty sources without touching storage', async () => {
    const t = await setup();
    const missing: ImportSource = { uri: 'file:///gone.pdf', name: 'gone.pdf', mimeType: null, size: null, lastModified: null };

    const summary = await t.importer.importFiles([missing, t.source('empty.txt', '')]);

    expect(summary.results.map((r) => r.outcome.kind === 'failed' && r.outcome.code)).toEqual([
      'SOURCE_UNREADABLE',
      'SOURCE_EMPTY',
    ]);
    expect(t.store.paths()).toEqual([]);
  });

  it('a source the OS refuses to read fails cleanly and keeps the real reason', async () => {
    const t = await setup();
    const ok = t.source('fine.txt', 'readable');
    t.store.failWhen.statSource = (uri) => uri !== ok.uri; // e.g. "Missing 'READ' permission"

    const summary = await t.importer.importFiles([t.source('locked.pdf', 'secret'), ok]);

    const failed = summary.results[0].outcome;
    expect(failed).toMatchObject({ kind: 'failed', code: 'SOURCE_UNREADABLE' });
    expect(failed.kind === 'failed' && failed.reason).toMatch(/could not be read: Injected statSource failure/);
    expect(summary.results[1].outcome.kind).toBe('imported');
    await t.expectConsistent();
  });

  describe('duplicates', () => {
    it('reports a duplicate of an archived file and stores nothing new', async () => {
      const t = await setup();
      await t.importer.importFiles([t.source('original.pdf', 'same bytes')]);
      const [original] = await t.files.listAll();

      const summary = await t.importer.importFiles([t.source('copy of original.pdf', 'same bytes')]);

      expect(summary.duplicates).toBe(1);
      const outcome = summary.results[0].outcome;
      expect(outcome.kind === 'duplicate' && outcome.existing.id).toBe(original.id);
      expect((await t.files.listAll()).length).toBe(1);
      await t.expectConsistent();
    });

    it('catches duplicates inside the same batch despite parallel copying', async () => {
      const t = await setup();
      const summary = await t.importer.importFiles([t.source('x.txt', 'twin'), t.source('y.txt', 'twin')]);
      expect(summary).toMatchObject({ imported: 1, duplicates: 1 });
      await t.expectConsistent();
    });

    it('keeps a duplicate when the user chooses "keep anyway"', async () => {
      const t = await setup();
      await t.importer.importFiles([t.source('a.txt', 'same')]);
      const summary = await t.importer.importFiles([t.source('b.txt', 'same')], {
        allowDuplicates: new Set([0]),
      });
      expect(summary.imported).toBe(1);
      expect((await t.files.listAll()).length).toBe(2);
      await t.expectConsistent();
    });

    it('does not treat same-size different-content files as duplicates', async () => {
      const t = await setup();
      const summary = await t.importer.importFiles([t.source('a.txt', 'aaaa'), t.source('b.txt', 'bbbb')]);
      expect(summary.imported).toBe(2);
    });
  });
});

describe('crash recovery', () => {
  it('a crash between move and insert leaves an orphan that reconciliation removes', async () => {
    const t = await setup();
    await t.importer.importFiles([t.source('kept.txt', 'already archived')]);

    await expect(
      t.importer.importFiles([t.source('doomed.txt', 'never recorded'), t.source('other.txt', 'in flight')], {
        simulateCrashAfterMove: true,
      }),
    ).rejects.toBeInstanceOf(SimulatedCrashError);

    // State right after the "crash": a file on disk with no row.
    const rows = await t.files.listAll();
    expect(rows.map((r) => r.displayName)).toEqual(['kept.txt']);
    expect(t.store.paths(`${ARCHIVE_DIR}/`).length).toBeGreaterThan(rows.length);

    // Next launch.
    const report = await t.reconciliation.run();

    expect(report.orphansRemoved).toBeGreaterThanOrEqual(1);
    await t.expectConsistent();
    expect(t.store.paths(`${ARCHIVE_DIR}/`)).toEqual([rows[0].storagePath]);
  });

  it('reconciliation wipes interrupted staging copies and leaves archived files alone', async () => {
    const t = await setup();
    await t.importer.importFiles([t.source('keep.pdf', 'real')]);
    const [kept] = await t.files.listAll();
    // What a killed process could leave behind:
    t.store.files.set(`${STAGING_DIR}/half.part`, { bytes: new Uint8Array(3), modifiedAt: 0 });
    t.store.files.set(`${ARCHIVE_DIR}/orphan.pdf`, { bytes: new Uint8Array(3), modifiedAt: 0 });

    const report = await t.reconciliation.run();

    expect(report).toEqual({ stagingRemoved: 1, orphansRemoved: 1, pickerCacheCleared: 0 });
    expect(t.store.paths()).toEqual([kept.storagePath]);
    expect(await t.files.getById(kept.id)).not.toBeNull();
  });

  it('reconciliation started mid-import waits instead of deleting the in-flight file', async () => {
    const t = await setup();
    // Start cleanup at the worst moment: the import is moving the file into
    // archive/ and has not inserted its row yet. Without the shared archive
    // lock, cleanup would treat that file (or its .part) as an orphan.
    let cleanup: ReturnType<typeof t.reconciliation.run> | undefined;
    t.store.onOperation = (op) => {
      if (op === 'move' && !cleanup) cleanup = t.reconciliation.run();
    };

    const summary = await t.importer.importFiles([t.source('race.txt', 'imported during startup cleanup')]);
    const report = await cleanup!;

    expect(summary.imported).toBe(1);
    expect(report).toEqual({ stagingRemoved: 0, orphansRemoved: 0, pickerCacheCleared: 0 });
    await t.expectConsistent();
  });
});

describe('runPool', () => {
  it('never runs more than the limit at once and preserves order', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5 * (6 - n)));
      inFlight--;
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });
});
