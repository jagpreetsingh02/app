import { SqliteFileRepository } from '../src/data/FileRepository';
import { SqliteTagRepository } from '../src/data/TagRepository';
import { NotFoundError, ValidationError } from '../src/domain/errors';
import { ArchiveService } from '../src/services/ArchiveService';
import { Mutex } from '../src/services/concurrency';
import { ImportService } from '../src/services/ImportService';
import { ReconciliationService } from '../src/services/ReconciliationService';
import { TagService } from '../src/services/TagService';
import { ARCHIVE_DIR } from '../src/storage/FileStore';
import { MemoryFileStore, PICKER_CACHE } from './fakes/MemoryFileStore';
import { createTestDatabase } from './support/nodeSqlite';

async function setup() {
  const db = await createTestDatabase();
  const files = new SqliteFileRepository(db);
  const tagRepo = new SqliteTagRepository(db);
  const store = new MemoryFileStore();
  const archiveLock = new Mutex();
  let seq = 0;
  const newId = () => `id${++seq}`;
  const now = () => 1_700_000_000_000;
  const importer = new ImportService({ store, files, archiveLock, newId, now });
  const archive = new ArchiveService({ files, tags: tagRepo, store });
  const tags = new TagService({ tags: tagRepo, newId, now });
  const reconciliation = new ReconciliationService({ store, files, archiveLock });

  const importText = async (name: string, content: string) => {
    const uri = `${PICKER_CACHE}${name}`;
    store.addSource(uri, content);
    const summary = await importer.importFiles([{ uri, name, mimeType: null, size: null, lastModified: null }]);
    const outcome = summary.results[0].outcome;
    if (outcome.kind !== 'imported') throw new Error(`import failed: ${JSON.stringify(outcome)}`);
    return outcome.file;
  };

  return { files, tagRepo, store, importer, archive, tags, reconciliation, importText };
}

describe('TagService', () => {
  it('creates tags with normalised names and rejects bad ones', async () => {
    const { tags } = await setup();
    const tag = await tags.create('  Work   notes ');
    expect(tag.name).toBe('Work notes');

    await expect(tags.create('work NOTES')).rejects.toThrow(ValidationError);
    await expect(tags.create('   ')).rejects.toThrow('Tag name cannot be empty.');
    await expect(tags.create('x'.repeat(41))).rejects.toThrow(/at most 40/);
  });

  it('assigns, unassigns, finds-or-creates, and deletes without touching files', async () => {
    const { tags, importText, files } = await setup();
    const f = await importText('a.txt', 'a');

    const work = await tags.addToFile(f.id, 'Work');
    const again = await tags.addToFile(f.id, 'work'); // existing tag, any case
    expect(again.id).toBe(work.id);
    expect((await tags.listForFile(f.id)).map((t) => t.name)).toEqual(['Work']);
    expect((await tags.list())[0].fileCount).toBe(1);

    await tags.unassign(f.id, work.id);
    expect(await tags.listForFile(f.id)).toEqual([]);

    await tags.assign(f.id, work.id);
    await tags.delete(work.id);
    expect(await tags.list()).toEqual([]);
    expect(await files.getById(f.id)).not.toBeNull();
  });
});

describe('ArchiveService', () => {
  it('renames only the display name', async () => {
    const { archive, importText, store } = await setup();
    const f = await importText('scan.pdf', 'pdf');

    expect(await archive.rename(f.id, '  Passport\nscan ')).toBe('Passport scan');
    const after = await archive.getDetail(f.id);
    expect(after).toMatchObject({ displayName: 'Passport scan', originalName: 'scan.pdf', storagePath: f.storagePath });
    expect(store.paths(ARCHIVE_DIR)).toEqual([f.storagePath]);
  });

  it('rejects empty or too-long names and unknown entries', async () => {
    const { archive, importText } = await setup();
    const f = await importText('a.txt', 'a');
    await expect(archive.rename(f.id, '   ')).rejects.toThrow(ValidationError);
    await expect(archive.rename(f.id, 'x'.repeat(256))).rejects.toThrow(ValidationError);
    await expect(archive.rename('nope', 'name')).rejects.toThrow(NotFoundError);
  });

  it('remove deletes the record, its tag links and the private copy', async () => {
    const { archive, tags, importText, store, files } = await setup();
    const f = await importText('a.txt', 'a');
    const keep = await importText('b.txt', 'b');
    const tag = await tags.addToFile(f.id, 'temp');

    await archive.remove(f.id);

    expect(await files.getById(f.id)).toBeNull();
    expect(store.paths(ARCHIVE_DIR)).toEqual([keep.storagePath]);
    expect((await tags.list()).find((t) => t.id === tag.id)?.fileCount).toBe(0);
    await expect(archive.remove(f.id)).rejects.toThrow(NotFoundError);
  });

  it('remove still succeeds when the private copy is already gone', async () => {
    const { archive, importText, store, files } = await setup();
    const f = await importText('a.txt', 'a');
    store.files.delete(f.storagePath); // deleted externally

    await archive.remove(f.id);
    expect(await files.getById(f.id)).toBeNull();
  });

  it('if deleting the copy fails, the record is still gone and startup cleanup removes the copy', async () => {
    const { archive, importText, store, files, reconciliation } = await setup();
    const f = await importText('a.txt', 'a');
    store.failWhen.remove = () => true;

    await archive.remove(f.id);
    expect(await files.getById(f.id)).toBeNull(); // never a record without a file
    expect(store.paths(ARCHIVE_DIR)).toEqual([f.storagePath]);

    store.failWhen.remove = undefined;
    const report = await reconciliation.run();
    expect(report.orphansRemoved).toBe(1);
    expect(store.paths(ARCHIVE_DIR)).toEqual([]);
  });
});

describe('picker cache copies', () => {
  const src = (store: MemoryFileStore, name: string, content: string) => {
    const uri = `${PICKER_CACHE}${name}`;
    store.addSource(uri, content);
    return { uri, name, mimeType: null, size: null, lastModified: null };
  };

  it('are deleted after imported, failed and cancelled outcomes', async () => {
    const { importer, store } = await setup();
    store.failWhen.copyIn = (uri) => uri.endsWith('bad.txt');
    await importer.importFiles([src(store, 'good.txt', 'g'), src(store, 'bad.txt', 'b')]);
    expect(store.pickerCacheUris()).toEqual([]);
  });

  it('are kept for duplicates until released, so "keep anyway" still works', async () => {
    const { importer, store } = await setup();
    await importer.importFiles([src(store, 'one.txt', 'same')]);
    const dup = src(store, 'two.txt', 'same');

    const summary = await importer.importFiles([dup]);
    expect(summary.duplicates).toBe(1);
    expect(store.pickerCacheUris()).toEqual([dup.uri]);

    const kept = await importer.importFiles([dup], { allowDuplicates: new Set([0]) });
    expect(kept.imported).toBe(1);
    expect(store.pickerCacheUris()).toEqual([]);
  });

  it('releaseSources deletes duplicates the user did not keep', async () => {
    const { importer, store } = await setup();
    await importer.importFiles([src(store, 'one.txt', 'same')]);
    const dup = src(store, 'two.txt', 'same');
    await importer.importFiles([dup]);

    await importer.releaseSources([dup]);
    expect(store.pickerCacheUris()).toEqual([]);
  });

  it('a failed release never fails the import', async () => {
    const { importer, store } = await setup();
    store.failWhen.releaseSource = () => true;
    const summary = await importer.importFiles([src(store, 'a.txt', 'a')]);
    expect(summary.imported).toBe(1);
  });

  it('leftovers are cleared by startup reconciliation', async () => {
    const { reconciliation, store } = await setup();
    store.addSource(`${PICKER_CACHE}left-over.pdf`, 'x');
    store.addSource('file:///storage/emulated/0/Download/original.pdf', 'user file');

    const report = await reconciliation.run();

    expect(report.pickerCacheCleared).toBe(1);
    expect([...store.sources.keys()]).toEqual(['file:///storage/emulated/0/Download/original.pdf']);
  });
});
