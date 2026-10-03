import { SqliteFileRepository } from '../src/data/FileRepository';
import { buildSearchQuery, escapeLike } from '../src/data/searchQuery';
import { SqliteTagRepository } from '../src/data/TagRepository';
import type { ArchiveFile, ArchiveQuery } from '../src/domain/types';
import { SearchService } from '../src/services/SearchService';
import { createTestDatabase } from './support/nodeSqlite';

function file(id: string, overrides: Partial<ArchiveFile>): ArchiveFile {
  return {
    id,
    displayName: id,
    originalName: id,
    mimeType: 'text/plain',
    category: 'document',
    sizeBytes: 100,
    importedAt: 1000,
    sourceModifiedAt: null,
    lastKnownModifiedAt: null,
    storagePath: `archive/${id}`,
    contentHash: `sha256:${id}`,
    status: 'available',
    statusCheckedAt: null,
    ...overrides,
  };
}

/**
 * Fixture:
 *   passport.jpg   image     2 MB  day 1  available  #travel #ID
 *   Tax 2024.pdf   pdf       5 MB  day 2  missing    #finance
 *   notes.txt      document  1 KB  day 3  available
 *   100%_done.txt  document  1 KB  day 4  unreadable
 *   Trip plan.docx document  3 MB  day 5  available  #travel
 */
async function setup() {
  const db = await createTestDatabase();
  const files = new SqliteFileRepository(db);
  const tags = new SqliteTagRepository(db);
  const search = new SearchService({ files, tags });
  const DAY = 86_400_000;

  await files.insert(file('a', { displayName: 'passport.jpg', category: 'image', sizeBytes: 2_000_000, importedAt: DAY }));
  await files.insert(file('b', { displayName: 'Tax 2024.pdf', category: 'pdf', sizeBytes: 5_000_000, importedAt: 2 * DAY, status: 'missing' }));
  await files.insert(file('c', { displayName: 'notes.txt', sizeBytes: 1_000, importedAt: 3 * DAY }));
  await files.insert(file('d', { displayName: '100%_done.txt', sizeBytes: 1_000, importedAt: 4 * DAY, status: 'unreadable' }));
  await files.insert(file('e', { displayName: 'Trip plan.docx', sizeBytes: 3_000_000, importedAt: 5 * DAY }));

  await tags.create({ id: 't-travel', name: 'travel', createdAt: 0 });
  await tags.create({ id: 't-id', name: 'ID', createdAt: 0 });
  await tags.create({ id: 't-fin', name: 'Finance', createdAt: 0 });
  await tags.assign('a', 't-travel');
  await tags.assign('a', 't-id');
  await tags.assign('b', 't-fin');
  await tags.assign('e', 't-travel');

  const ids = async (query: ArchiveQuery) => (await search.search(query)).map((f) => f.id);
  return { db, files, tags, search, ids };
}

describe('SearchService (SQL against real SQLite)', () => {
  it('returns everything newest first by default', async () => {
    const { ids } = await setup();
    expect(await ids({})).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('matches file names case-insensitively, anywhere in the name', async () => {
    const { ids } = await setup();
    expect(await ids({ text: 'TAX' })).toEqual(['b']);
    expect(await ids({ text: 'plan' })).toEqual(['e']);
  });

  it('matches tag names too', async () => {
    const { ids } = await setup();
    expect(await ids({ text: 'trav' })).toEqual(['e', 'a']);
    expect(await ids({ text: 'finance' })).toEqual(['b']);
  });

  it('treats % and _ in the search text literally', async () => {
    const { ids } = await setup();
    expect(await ids({ text: '100%' })).toEqual(['d']);
    expect(await ids({ text: '%' })).toEqual(['d']);
    expect(await ids({ text: '_' })).toEqual(['d']);
  });

  it('ignores surrounding whitespace and treats blank text as no filter', async () => {
    const { ids } = await setup();
    expect(await ids({ text: '  notes  ' })).toEqual(['c']);
    expect((await ids({ text: '   ' })).length).toBe(5);
  });

  it('filters by category and availability, combined with AND', async () => {
    const { ids } = await setup();
    expect(await ids({ categories: ['image', 'pdf'] })).toEqual(['b', 'a']);
    expect(await ids({ statuses: ['missing', 'unreadable'] })).toEqual(['d', 'b']);
    expect(await ids({ categories: ['document'], statuses: ['available'] })).toEqual(['e', 'c']);
    expect(await ids({ text: 'travel', categories: ['image'] })).toEqual(['a']);
  });

  it('filters by a specific tag', async () => {
    const { ids } = await setup();
    expect(await ids({ tagId: 't-travel' })).toEqual(['e', 'a']);
    expect(await ids({ tagId: 't-travel', text: 'passport' })).toEqual(['a']);
  });

  it('sorts by size and name, with a stable tie-break', async () => {
    const { ids } = await setup();
    expect(await ids({ sort: { field: 'sizeBytes', direction: 'desc' } })).toEqual(['b', 'e', 'a', 'd', 'c']);
    expect(await ids({ sort: { field: 'sizeBytes', direction: 'asc' } })).toEqual(['c', 'd', 'a', 'e', 'b']);
    expect(await ids({ sort: { field: 'displayName', direction: 'asc' } })).toEqual(['d', 'c', 'a', 'b', 'e']);
    expect(await ids({ sort: { field: 'importedAt', direction: 'asc' } })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns each file once even when several of its tags match', async () => {
    const { ids, tags } = await setup();
    await tags.create({ id: 't-trip', name: 'trip', createdAt: 0 });
    await tags.assign('a', 't-trip');
    expect(await ids({ text: 'tr' })).toEqual(['e', 'a']);
  });

  it('attaches each file’s tags to the result', async () => {
    const { search } = await setup();
    const [passport] = await search.search({ text: 'passport' });
    expect(passport.tags.map((t) => t.name)).toEqual(['ID', 'travel']);
  });

  it('is immune to SQL injection through the search box', async () => {
    const { ids, files } = await setup();
    expect(await ids({ text: "'; DROP TABLE files; --" })).toEqual([]);
    expect(await ids({ text: "x' OR '1'='1" })).toEqual([]);
    expect((await files.listAll()).length).toBe(5);
  });
});

describe('buildSearchQuery', () => {
  it('binds user input as parameters, never inline', () => {
    const { sql, params } = buildSearchQuery({ text: "evil' --", categories: ['pdf'], statuses: ['missing'], tagId: 't1' });
    expect(sql).not.toContain('evil');
    expect(params).toEqual(["%evil' --%", "%evil' --%", 'pdf', 'missing', 't1']);
  });

  it('falls back to a safe ORDER BY for unknown sort values', () => {
    const { sql } = buildSearchQuery({ sort: { field: 'nope; DROP' as never, direction: 'sideways' as never } });
    expect(sql).toMatch(/ORDER BY f\.imported_at DESC, f\.id DESC$/);
  });

  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
