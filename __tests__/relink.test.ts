import { SqliteFileRepository } from '../src/data/FileRepository';
import type { ImportSource } from '../src/domain/types';
import { AvailabilityService } from '../src/services/AvailabilityService';
import { Mutex } from '../src/services/concurrency';
import { ImportService } from '../src/services/ImportService';
import { RelinkService } from '../src/services/RelinkService';
import { STAGING_DIR } from '../src/storage/FileStore';
import { MemoryFileStore, PICKER_CACHE } from './fakes/MemoryFileStore';
import { createTestDatabase } from './support/nodeSqlite';

async function setup() {
  const db = await createTestDatabase();
  const files = new SqliteFileRepository(db);
  const store = new MemoryFileStore();
  const archiveLock = new Mutex();
  let clock = 0;
  const now = () => ++clock;
  let seq = 0;
  const importer = new ImportService({ store, files, archiveLock, newId: () => `id${++seq}`, now });
  const availability = new AvailabilityService({ files, store, now });
  const relinker = new RelinkService({ files, store, archiveLock, now });

  const pick = (name: string, content: string): ImportSource => {
    const uri = `${PICKER_CACHE}${name}`;
    store.addSource(uri, content);
    return { uri, name, mimeType: null, size: null, lastModified: null };
  };

  /** Imports a file, then deletes its archived copy and lets a check mark it missing. */
  const missingEntry = async (content: string) => {
    const summary = await importer.importFiles([pick('original.pdf', content)]);
    const outcome = summary.results[0].outcome;
    if (outcome.kind !== 'imported') throw new Error('setup import failed');
    store.files.delete(outcome.file.storagePath);
    const checked = await availability.checkFile(outcome.file.id);
    return checked!.file;
  };

  const text = (path: string) => new TextDecoder().decode(store.files.get(path)?.bytes);

  return { files, store, relinker, availability, pick, missingEntry, text };
}

describe('RelinkService', () => {
  it('restores a missing entry from a file with the same content', async () => {
    const { files, store, relinker, pick, missingEntry, text } = await setup();
    const missing = await missingEntry('the real bytes');
    expect(missing.status).toBe('missing');

    const result = await relinker.relink(missing.id, pick('found-it-again.pdf', 'the real bytes'));

    expect(result.kind).toBe('relinked');
    const restored = await files.getById(missing.id);
    // Status restored; identity, name, hash and path are exactly as before.
    expect(restored).toMatchObject({
      ...missing,
      status: 'available',
      statusCheckedAt: expect.any(Number),
      lastKnownModifiedAt: expect.any(Number),
    });
    expect(text(missing.storagePath)).toBe('the real bytes');
    expect(store.paths(`${STAGING_DIR}/`)).toEqual([]);
    expect(store.pickerCacheUris()).toEqual([]); // picker copy released
  });

  it('refuses a file with the same size but different content and changes nothing', async () => {
    const { files, store, relinker, pick, missingEntry } = await setup();
    const missing = await missingEntry('AAAAAAAA');

    const result = await relinker.relink(missing.id, pick('impostor.pdf', 'BBBBBBBB'));

    expect(result).toMatchObject({ kind: 'mismatch', message: expect.stringMatching(/different content.*Nothing was changed/) });
    expect(await files.getById(missing.id)).toEqual(missing);
    expect(store.files.has(missing.storagePath)).toBe(false);
    expect(store.paths(`${STAGING_DIR}/`)).toEqual([]);
    expect(store.pickerCacheUris()).toEqual([]);
  });

  it('refuses a file of a different size without copying it', async () => {
    const { files, store, relinker, pick, missingEntry } = await setup();
    const missing = await missingEntry('short');
    const copies: string[] = [];
    store.onOperation = (op, arg) => op === 'copyIn' && copies.push(arg);

    const result = await relinker.relink(missing.id, pick('bigger.pdf', 'much longer content'));

    expect(result).toMatchObject({ kind: 'mismatch', message: expect.stringMatching(/different file/) });
    expect(copies).toEqual([]);
    expect(await files.getById(missing.id)).toEqual(missing);
  });

  it('replaces a damaged copy for an unreadable entry', async () => {
    const { files, store, relinker, availability, pick, text } = await setup();
    const importer = new ImportService({
      store,
      files,
      archiveLock: new Mutex(),
      newId: () => 'u1',
      now: () => 1,
    });
    await importer.importFiles([pick('doc.pdf', 'GOODGOOD')]);
    const [entry] = await files.listAll();
    store.files.set(entry.storagePath, { bytes: new TextEncoder().encode('BAD'), modifiedAt: 2 }); // truncated
    expect((await availability.checkFile(entry.id))?.file.status).toBe('unreadable');

    const result = await relinker.relink(entry.id, pick('doc-again.pdf', 'GOODGOOD'));

    expect(result.kind).toBe('relinked');
    expect(text(entry.storagePath)).toBe('GOODGOOD');
    expect((await availability.checkFile(entry.id))?.file.status).toBe('available');
  });

  it('refuses to touch an entry that is available', async () => {
    const { files, store, relinker, pick } = await setup();
    const importer = new ImportService({ store, files, archiveLock: new Mutex(), newId: () => 'a1', now: () => 1 });
    await importer.importFiles([pick('fine.pdf', 'fine')]);
    const [entry] = await files.listAll();

    const result = await relinker.relink(entry.id, pick('other.pdf', 'fine'));
    expect(result.kind).toBe('failed');
    expect(await files.getById(entry.id)).toEqual(entry);
  });

  it('fails cleanly when the picked file cannot be read or copied', async () => {
    const { files, store, relinker, pick, missingEntry } = await setup();
    const missing = await missingEntry('payload');

    store.failWhen.statSource = () => true;
    expect((await relinker.relink(missing.id, pick('a.pdf', 'payload'))).kind).toBe('failed');
    store.failWhen.statSource = undefined;

    store.failWhen.copyIn = () => true; // leaves a partial staging file
    const result = await relinker.relink(missing.id, pick('b.pdf', 'payload'));
    expect(result).toMatchObject({ kind: 'failed', message: expect.stringMatching(/Re-link failed/) });
    expect(store.paths(`${STAGING_DIR}/`)).toEqual([]);
    expect(await files.getById(missing.id)).toEqual(missing);
  });
});
