import { SqliteFileRepository } from '../src/data/FileRepository';
import { SqliteTagRepository } from '../src/data/TagRepository';
import type { ArchiveFile } from '../src/domain/types';
import { AvailabilityService } from '../src/services/AvailabilityService';
import { CancelToken, Mutex } from '../src/services/concurrency';
import { ImportService } from '../src/services/ImportService';
import { ARCHIVE_DIR } from '../src/storage/FileStore';
import { MemoryFileStore, PICKER_CACHE } from './fakes/MemoryFileStore';
import { createTestDatabase } from './support/nodeSqlite';

async function setup(batchSize = 25) {
  const db = await createTestDatabase();
  const files = new SqliteFileRepository(db);
  const tags = new SqliteTagRepository(db);
  const store = new MemoryFileStore();
  let clock = 1_000_000;
  const now = () => ++clock;
  let seq = 0;
  const importer = new ImportService({ store, files, archiveLock: new Mutex(), newId: () => `id${++seq}`, now });
  const availability = new AvailabilityService({ files, store, now, batchSize });

  const importMany = async (...contents: string[]): Promise<ArchiveFile[]> => {
    const sources = contents.map((content, i) => {
      const uri = `${PICKER_CACHE}${seq}-${i}.txt`;
      store.addSource(uri, content);
      return { uri, name: `file ${content}.txt`, mimeType: null, size: null, lastModified: null };
    });
    const summary = await importer.importFiles(sources);
    return summary.results.map((r) => {
      if (r.outcome.kind !== 'imported') throw new Error('setup import failed');
      return r.outcome.file;
    });
  };

  return { files, tags, store, availability, importMany };
}

describe('AvailabilityService', () => {
  it('a file deleted externally becomes missing and its metadata is retained', async () => {
    const { files, tags, store, availability, importMany } = await setup();
    const [file] = await importMany('passport');
    const tag = { id: 't', name: 'ID', createdAt: 0 };
    await tags.create(tag);
    await tags.assign(file.id, tag.id);
    store.files.delete(file.storagePath);

    const checked = await availability.checkFile(file.id);

    expect(checked?.result.status).toBe('missing');
    const after = await files.getById(file.id);
    // Everything except the status columns is exactly as imported.
    expect(after).toEqual({ ...file, status: 'missing', statusCheckedAt: after!.statusCheckedAt });
    expect(after!.statusCheckedAt).toBeGreaterThan(file.statusCheckedAt!);
    expect(after!.lastKnownModifiedAt).toBe(file.lastKnownModifiedAt); // last known value kept
    expect(await tags.listForFile(file.id)).toEqual([tag]);
  });

  it('marks a file that exists but cannot be read as unreadable', async () => {
    const { store, availability, importMany } = await setup();
    const [file] = await importMany('locked');
    store.unreadable.add(file.storagePath);

    const checked = await availability.checkFile(file.id);
    expect(checked?.result).toMatchObject({ status: 'unreadable', reason: expect.stringMatching(/Cannot read/) });
  });

  it('marks a file as unreadable when the OS refuses to stat it', async () => {
    const { store, availability, importMany } = await setup();
    const [file] = await importMany('denied');
    store.failWhen.stat = (path) => path === file.storagePath;

    expect((await availability.checkFile(file.id))?.result.status).toBe('unreadable');
  });

  it('detects a size mismatch (truncated or replaced copy)', async () => {
    const { store, availability, importMany } = await setup();
    const [file] = await importMany('full content');
    store.files.set(file.storagePath, { bytes: new Uint8Array(3), modifiedAt: 5 });

    const checked = await availability.checkFile(file.id);
    expect(checked?.result).toMatchObject({ status: 'unreadable', reason: expect.stringMatching(/expected 12 bytes, found 3/) });
  });

  it('flips back to available when the file is healthy again, refreshing the modification time', async () => {
    const { store, availability, importMany } = await setup();
    const [file] = await importMany('flaky');
    const bytes = store.files.get(file.storagePath)!;
    store.files.delete(file.storagePath);
    await availability.checkFile(file.id);

    store.files.set(file.storagePath, { ...bytes, modifiedAt: 777 });
    const checked = await availability.checkFile(file.id);
    expect(checked?.file).toMatchObject({ status: 'available', lastKnownModifiedAt: 777 });
  });

  it('scan reports correct counts and lists the problem files', async () => {
    const { store, availability, importMany } = await setup(2);
    const [ok1, gone, ok2, broken, ok3] = await importMany('1', '2', '3', '4', '5');
    store.files.delete(gone.storagePath);
    store.unreadable.add(broken.storagePath);
    const progress: [number, number][] = [];

    const report = await availability.scan({ onProgress: (checked, total) => progress.push([checked, total]) });

    expect(report).toMatchObject({ checked: 5, available: 3, missing: 1, unreadable: 1, changed: 2 });
    expect(report.problems.map((p) => [p.id, p.status])).toEqual([
      [gone.id, 'missing'],
      [broken.id, 'unreadable'],
    ]);
    expect(progress).toEqual([[0, 5], [2, 5], [4, 5], [5, 5]]); // batches of 2
    void [ok1, ok2, ok3];
  });

  it('never deletes records or files, even when every file is gone', async () => {
    const { files, store, availability, importMany } = await setup();
    const imported = await importMany('a', 'b', 'c');
    for (const f of imported) store.files.delete(f.storagePath);
    const orphanFree = store.paths(ARCHIVE_DIR);

    const report = await availability.scan();

    expect(report.missing).toBe(3);
    expect((await files.listAll()).map((f) => f.id).sort()).toEqual(imported.map((f) => f.id).sort());
    expect(store.paths(ARCHIVE_DIR)).toEqual(orphanFree);
  });

  it('a second scan request while one is running shares it', async () => {
    const { availability, importMany } = await setup();
    await importMany('a', 'b');
    const first = availability.scan();
    const second = availability.scan();
    expect(second).toBe(first);
    await first;
    expect(availability.isScanning).toBe(false);
  });

  it('can be cancelled between batches', async () => {
    const { availability, importMany } = await setup(1);
    await importMany('a', 'b', 'c');
    const token = new CancelToken();
    const report = await availability.scan({
      token,
      onProgress: (checked) => checked === 1 && token.cancel(),
    });
    expect(report.checked).toBe(1);
  });

  it('markUnreadable records a failed open without touching anything else', async () => {
    const { files, availability, importMany } = await setup();
    const [file] = await importMany('x');
    await availability.markUnreadable(file.id);
    expect(await files.getById(file.id)).toMatchObject({ ...file, status: 'unreadable', statusCheckedAt: expect.any(Number) });
  });
});
