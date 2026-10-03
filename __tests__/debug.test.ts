import { SqliteFileRepository } from '../src/data/FileRepository';
import { AvailabilityService } from '../src/services/AvailabilityService';
import { Mutex } from '../src/services/concurrency';
import { DebugService } from '../src/services/DebugService';
import { ImportService } from '../src/services/ImportService';
import { MemoryFileStore, PICKER_CACHE } from './fakes/MemoryFileStore';
import { createTestDatabase } from './support/nodeSqlite';

describe('DebugService.simulateExternalDeletion', () => {
  it('removes only the physical file; the next check marks the entry missing', async () => {
    const db = await createTestDatabase();
    const files = new SqliteFileRepository(db);
    const store = new MemoryFileStore();
    const importer = new ImportService({ store, files, archiveLock: new Mutex(), newId: () => 'f1', now: () => 1 });
    store.addSource(`${PICKER_CACHE}a.pdf`, 'pdf');
    await importer.importFiles([{ uri: `${PICKER_CACHE}a.pdf`, name: 'a.pdf', mimeType: null, size: null, lastModified: null }]);
    const [entry] = await files.listAll();

    await new DebugService({ files, store }).simulateExternalDeletion(entry.id);

    expect(store.files.has(entry.storagePath)).toBe(false);
    expect(await files.getById(entry.id)).toEqual(entry); // DB untouched until checked
    const checked = await new AvailabilityService({ files, store, now: () => 2 }).checkFile(entry.id);
    expect(checked?.file.status).toBe('missing');
  });
});
