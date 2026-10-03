import { SqliteFileRepository } from '../src/data/FileRepository';
import { SqliteTagRepository } from '../src/data/TagRepository';
import type { ArchiveFile } from '../src/domain/types';
import { createTestDatabase } from './support/nodeSqlite';

function makeFile(id: string, overrides: Partial<ArchiveFile> = {}): ArchiveFile {
  return {
    id,
    displayName: `${id}.txt`,
    originalName: `${id}.txt`,
    mimeType: 'text/plain',
    category: 'document',
    sizeBytes: 10,
    importedAt: 1000,
    sourceModifiedAt: null,
    lastKnownModifiedAt: null,
    storagePath: `archive/${id}.txt`,
    contentHash: `sha256:${id}`,
    status: 'available',
    statusCheckedAt: null,
    ...overrides,
  };
}

async function setup() {
  const db = await createTestDatabase();
  return { files: new SqliteFileRepository(db), tags: new SqliteTagRepository(db) };
}

describe('SqliteFileRepository', () => {
  it('round-trips a record', async () => {
    const { files } = await setup();
    const file = makeFile('f1', { sourceModifiedAt: 42 });
    await files.insert(file);
    expect(await files.getById('f1')).toEqual(file);
  });

  it('matches duplicates on hash AND size', async () => {
    const { files } = await setup();
    await files.insert(makeFile('f1', { contentHash: 'sha256:x', sizeBytes: 10 }));
    expect((await files.findByHash('sha256:x', 10))?.id).toBe('f1');
    expect(await files.findByHash('sha256:x', 11)).toBeNull();
  });

  it('refuses two records pointing at the same stored file', async () => {
    const { files } = await setup();
    await files.insert(makeFile('f1'));
    await expect(files.insert(makeFile('f2', { storagePath: 'archive/f1.txt' }))).rejects.toThrow(/UNIQUE/);
  });
});

describe('SqliteTagRepository', () => {
  it('assigns, counts, unassigns and cascades on delete', async () => {
    const { files, tags } = await setup();
    await files.insert(makeFile('f1'));
    await files.insert(makeFile('f2'));
    await tags.create({ id: 't1', name: 'Work', createdAt: 1 });
    await tags.create({ id: 't2', name: 'archive', createdAt: 2 });

    await tags.assign('f1', 't1');
    await tags.assign('f1', 't1'); // idempotent
    await tags.assign('f2', 't1');
    await tags.assign('f1', 't2');

    expect((await tags.listWithCounts()).map((t) => [t.name, t.fileCount])).toEqual([
      ['archive', 1],
      ['Work', 2],
    ]);
    expect((await tags.listForFile('f1')).map((t) => t.name)).toEqual(['archive', 'Work']);
    expect((await tags.findByName('WORK'))?.id).toBe('t1');

    await tags.unassign('f1', 't1');
    const byFile = await tags.listForFiles(['f1', 'f2']);
    expect(byFile.get('f1')!.map((t) => t.id)).toEqual(['t2']);
    expect(byFile.get('f2')!.map((t) => t.id)).toEqual(['t1']);

    // Deleting a file removes its links; deleting a tag leaves files alone.
    await files.delete('f2');
    expect((await tags.listWithCounts()).find((t) => t.id === 't1')?.fileCount).toBe(0);
    await tags.delete('t2');
    expect(await files.getById('f1')).not.toBeNull();
    expect(await tags.listForFile('f1')).toEqual([]);
  });
});
