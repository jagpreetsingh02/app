import type { Tag, TagWithCount } from '../domain/types';
import type { SqlDatabase } from './SqlDatabase';

/** Persistence for tags and the file↔tag link table. */
export interface TagRepository {
  /** Throws if a tag with the same name (case-insensitive) exists. */
  create(tag: Tag): Promise<void>;
  findByName(name: string): Promise<Tag | null>;
  getById(id: string): Promise<Tag | null>;
  /** Removes the tag and (via cascade) its links. Files are untouched. */
  delete(id: string): Promise<void>;
  listWithCounts(): Promise<TagWithCount[]>;
  /** Idempotent. */
  assign(fileId: string, tagId: string): Promise<void>;
  unassign(fileId: string, tagId: string): Promise<void>;
  listForFile(fileId: string): Promise<Tag[]>;
  listForFiles(fileIds: string[]): Promise<Map<string, Tag[]>>;
}

interface TagRow {
  id: string;
  name: string;
  created_at: number;
}

function rowToTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export class SqliteTagRepository implements TagRepository {
  constructor(private readonly db: SqlDatabase) {}

  async create(tag: Tag): Promise<void> {
    await this.db.run('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', [
      tag.id,
      tag.name,
      tag.createdAt,
    ]);
  }

  async findByName(name: string): Promise<Tag | null> {
    // `name` is declared COLLATE NOCASE, so = is case-insensitive.
    const row = await this.db.getFirst<TagRow>('SELECT id, name, created_at FROM tags WHERE name = ?', [name]);
    return row ? rowToTag(row) : null;
  }

  async getById(id: string): Promise<Tag | null> {
    const row = await this.db.getFirst<TagRow>('SELECT id, name, created_at FROM tags WHERE id = ?', [id]);
    return row ? rowToTag(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM tags WHERE id = ?', [id]);
  }

  async listWithCounts(): Promise<TagWithCount[]> {
    const rows = await this.db.getAll<TagRow & { file_count: number }>(
      `SELECT t.id, t.name, t.created_at, COUNT(ft.file_id) AS file_count
       FROM tags t LEFT JOIN file_tags ft ON ft.tag_id = t.id
       GROUP BY t.id
       ORDER BY t.name COLLATE NOCASE`,
    );
    return rows.map((r) => ({ ...rowToTag(r), fileCount: r.file_count }));
  }

  async assign(fileId: string, tagId: string): Promise<void> {
    await this.db.run('INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)', [fileId, tagId]);
  }

  async unassign(fileId: string, tagId: string): Promise<void> {
    await this.db.run('DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?', [fileId, tagId]);
  }

  async listForFile(fileId: string): Promise<Tag[]> {
    const rows = await this.db.getAll<TagRow>(
      `SELECT t.id, t.name, t.created_at FROM tags t
       JOIN file_tags ft ON ft.tag_id = t.id
       WHERE ft.file_id = ?
       ORDER BY t.name COLLATE NOCASE`,
      [fileId],
    );
    return rows.map(rowToTag);
  }

  async listForFiles(fileIds: string[]): Promise<Map<string, Tag[]>> {
    const result = new Map<string, Tag[]>(fileIds.map((id) => [id, []]));
    if (fileIds.length === 0) return result;
    // Chunked to stay well under SQLite's bound-parameter limit.
    for (let i = 0; i < fileIds.length; i += 500) {
      const chunk = fileIds.slice(i, i + 500);
      const rows = await this.db.getAll<TagRow & { file_id: string }>(
        `SELECT ft.file_id, t.id, t.name, t.created_at FROM file_tags ft
         JOIN tags t ON t.id = ft.tag_id
         WHERE ft.file_id IN (${chunk.map(() => '?').join(',')})
         ORDER BY t.name COLLATE NOCASE`,
        chunk,
      );
      for (const row of rows) result.get(row.file_id)?.push(rowToTag(row));
    }
    return result;
  }
}
