import { SqliteFileRepository } from '../src/data/FileRepository';
import { NoViewerAppError } from '../src/domain/errors';
import { AvailabilityService } from '../src/services/AvailabilityService';
import { Mutex } from '../src/services/concurrency';
import { ImportService } from '../src/services/ImportService';
import { OpenService } from '../src/services/OpenService';
import type { ExternalViewer } from '../src/storage/ExternalViewer';
import { MemoryFileStore, PICKER_CACHE } from './fakes/MemoryFileStore';
import { createTestDatabase } from './support/nodeSqlite';

async function setup() {
  const db = await createTestDatabase();
  const files = new SqliteFileRepository(db);
  const store = new MemoryFileStore();
  let clock = 0;
  const now = () => ++clock;
  let seq = 0;
  const importer = new ImportService({ store, files, archiveLock: new Mutex(), newId: () => `id${++seq}`, now });
  const availability = new AvailabilityService({ files, store, now });
  const viewer = { open: jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined) } satisfies ExternalViewer;
  const opener = new OpenService({ availability, viewer });

  const add = async (name: string, mimeType: string) => {
    const uri = `${PICKER_CACHE}${name}`;
    store.addSource(uri, `content of ${name}`);
    const summary = await importer.importFiles([{ uri, name, mimeType, size: null, lastModified: null }]);
    const outcome = summary.results[0].outcome;
    if (outcome.kind !== 'imported') throw new Error('setup import failed');
    return outcome.file;
  };
  return { files, store, viewer, opener, add };
}

describe('OpenService', () => {
  it('shows images in-app and sends documents to an external viewer', async () => {
    const { opener, viewer, add } = await setup();
    const photo = await add('photo.jpg', 'image/jpeg');
    const pdf = await add('scan.pdf', 'application/pdf');

    expect((await opener.open(photo.id)).kind).toBe('show-in-app');
    expect((await opener.open(pdf.id)).kind).toBe('opened');
    expect(viewer.open).toHaveBeenCalledTimes(1);
    expect(viewer.open).toHaveBeenCalledWith(pdf.storagePath, 'application/pdf');
  });

  it('does not launch a viewer for a file deleted since the last scan; marks it missing', async () => {
    const { opener, viewer, store, files, add } = await setup();
    const pdf = await add('scan.pdf', 'application/pdf');
    store.files.delete(pdf.storagePath);

    const result = await opener.open(pdf.id);

    expect(result).toMatchObject({ kind: 'unavailable', message: expect.stringMatching(/re-link/) });
    expect(viewer.open).not.toHaveBeenCalled();
    expect((await files.getById(pdf.id))?.status).toBe('missing');
  });

  it('marks the entry unreadable when the viewer fails to launch', async () => {
    const { opener, viewer, files, add } = await setup();
    const doc = await add('notes.docx', 'application/octet-stream');
    viewer.open.mockRejectedValueOnce(new Error('FileUriExposedException'));

    const result = await opener.open(doc.id);

    expect(result).toMatchObject({ kind: 'failed', message: expect.stringMatching(/marked unreadable/) });
    expect((await files.getById(doc.id))?.status).toBe('unreadable');
  });

  it('does not blame the file when no app can open its type', async () => {
    const { opener, viewer, files, add } = await setup();
    const doc = await add('book.epub', 'application/epub+zip');
    viewer.open.mockRejectedValueOnce(new NoViewerAppError('application/epub+zip'));

    const result = await opener.open(doc.id);

    expect(result).toMatchObject({ kind: 'no-viewer', message: expect.stringMatching(/No app on this device/) });
    expect((await files.getById(doc.id))?.status).toBe('available');
  });

  it('records a failed in-app image display as unreadable', async () => {
    const { opener, files, add } = await setup();
    const photo = await add('broken.jpg', 'image/jpeg');
    await opener.reportDisplayFailure(photo.id);
    expect((await files.getById(photo.id))?.status).toBe('unreadable');
  });
});
