import { MIGRATIONS, prepareDatabase } from '../src/data/schema';
import { categorize, extensionOf, formatBytes, resolveMimeType, storageExtension } from '../src/domain/fileKinds';
import { fingerprintInput, toHex } from '../src/storage/hashing';
import { createTestDatabase } from './support/nodeSqlite';

describe('file classification', () => {
  it('categorises the three required types and falls back to other', () => {
    expect(categorize('image/png')).toBe('image');
    expect(categorize('application/pdf')).toBe('pdf');
    expect(categorize('text/plain')).toBe('document');
    expect(
      categorize('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe('document');
    expect(categorize('application/zip')).toBe('other');
  });

  it('uses the extension when the picker reports a generic MIME type', () => {
    expect(resolveMimeType('notes.TXT', 'application/octet-stream')).toBe('text/plain');
    expect(resolveMimeType('scan.pdf', null)).toBe('application/pdf');
    expect(resolveMimeType('photo.jpg', 'image/jpeg')).toBe('image/jpeg');
    expect(resolveMimeType('mystery', '')).toBe('application/octet-stream');
  });

  it('derives a safe storage extension', () => {
    expect(extensionOf('a.b.Docx')).toBe('docx');
    expect(extensionOf('.hidden')).toBe('');
    expect(storageExtension('report', 'application/pdf')).toBe('pdf');
    expect(storageExtension('weird.$$$', 'application/x-unknown')).toBe('bin');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
  });
});

describe('hashing helpers', () => {
  it('hex-encodes bytes', () => {
    expect(toHex(new Uint8Array([0, 15, 255]).buffer)).toBe('000fff');
  });

  it('includes the size in the fingerprint input', () => {
    const a = fingerprintInput(10, new Uint8Array([1]), new Uint8Array([2]));
    const b = fingerprintInput(11, new Uint8Array([1]), new Uint8Array([2]));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe('database migrations', () => {
  it('creates the schema and records the version', async () => {
    const db = await createTestDatabase();
    const version = await db.getFirst<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(MIGRATIONS.length);

    const tables = await db.getAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual(['file_tags', 'files', 'tags']);
  });

  it('is idempotent when the app restarts', async () => {
    const db = await createTestDatabase();
    await expect(prepareDatabase(db)).resolves.toBeUndefined();
  });

  it('enforces case-insensitive unique tag names', async () => {
    const db = await createTestDatabase();
    await db.run('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', ['1', 'Work', 0]);
    await expect(
      db.run('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', ['2', 'work', 0]),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('rejects invalid status values', async () => {
    const db = await createTestDatabase();
    await expect(
      db.run(
        `INSERT INTO files (id, display_name, original_name, mime_type, category, size_bytes,
           imported_at, storage_path, content_hash, status)
         VALUES ('f', 'a', 'a', 'text/plain', 'document', 1, 0, 'archive/f.txt', 'h', 'lost')`,
      ),
    ).rejects.toThrow(/CHECK/);
  });
});
