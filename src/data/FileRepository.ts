import type { ArchiveFile, ArchiveQuery, FileCategory, FileStatus } from '../domain/types';
import { FILE_COLUMNS, buildSearchQuery } from './searchQuery';
import type { SqlDatabase, SqlParam } from './SqlDatabase';

/** Persistence for archive entries. All SQL for the `files` table lives here. */
export interface FileRepository {
  /** Inserts a fully-imported file in one exclusive transaction. */
  insert(file: ArchiveFile): Promise<void>;
  getById(id: string): Promise<ArchiveFile | null>;
  /** Exact duplicate lookup: same content hash AND same size. */
  findByHash(contentHash: string, sizeBytes: number): Promise<ArchiveFile | null>;
  /** Every storage path the DB knows about (used by reconciliation). */
  listStoragePaths(): Promise<string[]>;
  /** Newest first. */
  listAll(): Promise<ArchiveFile[]>;
  /** Text / category / status / tag filters and sorting, all in SQL. */
  search(query: ArchiveQuery): Promise<ArchiveFile[]>;
  /** Changes only the user-facing name; the stored file is untouched. */
  rename(id: string, displayName: string): Promise<boolean>;
  /** Returns whether a row was deleted. */
  delete(id: string): Promise<boolean>;
}

interface FileRow {
  id: string;
  display_name: string;
  original_name: string;
  mime_type: string;
  category: FileCategory;
  size_bytes: number;
  imported_at: number;
  source_modified_at: number | null;
  last_known_modified_at: number | null;
  storage_path: string;
  content_hash: string;
  status: FileStatus;
  status_checked_at: number | null;
}

export function rowToFile(row: FileRow): ArchiveFile {
  return {
    id: row.id,
    displayName: row.display_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    category: row.category,
    sizeBytes: row.size_bytes,
    importedAt: row.imported_at,
    sourceModifiedAt: row.source_modified_at,
    lastKnownModifiedAt: row.last_known_modified_at,
    storagePath: row.storage_path,
    contentHash: row.content_hash,
    status: row.status,
    statusCheckedAt: row.status_checked_at,
  };
}

export class SqliteFileRepository implements FileRepository {
  constructor(private readonly db: SqlDatabase) {}

  async insert(file: ArchiveFile): Promise<void> {
    const params: SqlParam[] = [
      file.id,
      file.displayName,
      file.originalName,
      file.mimeType,
      file.category,
      file.sizeBytes,
      file.importedAt,
      file.sourceModifiedAt,
      file.lastKnownModifiedAt,
      file.storagePath,
      file.contentHash,
      file.status,
      file.statusCheckedAt,
    ];
    await this.db.transaction((tx) =>
      tx.run(
        `INSERT INTO files (
           id, display_name, original_name, mime_type, category, size_bytes,
           imported_at, source_modified_at, last_known_modified_at, storage_path,
           content_hash, status, status_checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params,
      ),
    );
  }

  async getById(id: string): Promise<ArchiveFile | null> {
    const row = await this.db.getFirst<FileRow>(`SELECT ${FILE_COLUMNS} FROM files f WHERE f.id = ?`, [id]);
    return row ? rowToFile(row) : null;
  }

  async findByHash(contentHash: string, sizeBytes: number): Promise<ArchiveFile | null> {
    const row = await this.db.getFirst<FileRow>(
      `SELECT ${FILE_COLUMNS} FROM files f
       WHERE f.content_hash = ? AND f.size_bytes = ?
       ORDER BY f.imported_at ASC LIMIT 1`,
      [contentHash, sizeBytes],
    );
    return row ? rowToFile(row) : null;
  }

  async listStoragePaths(): Promise<string[]> {
    const rows = await this.db.getAll<{ storage_path: string }>('SELECT storage_path FROM files');
    return rows.map((r) => r.storage_path);
  }

  async listAll(): Promise<ArchiveFile[]> {
    const rows = await this.db.getAll<FileRow>(
      `SELECT ${FILE_COLUMNS} FROM files f ORDER BY f.imported_at DESC, f.id`,
    );
    return rows.map(rowToFile);
  }

  async search(query: ArchiveQuery): Promise<ArchiveFile[]> {
    const { sql, params } = buildSearchQuery(query);
    const rows = await this.db.getAll<FileRow>(sql, params);
    return rows.map(rowToFile);
  }

  async rename(id: string, displayName: string): Promise<boolean> {
    const result = await this.db.run('UPDATE files SET display_name = ? WHERE id = ?', [displayName, id]);
    return result.changes > 0;
  }

  async delete(id: string): Promise<boolean> {
    // file_tags rows go with it via ON DELETE CASCADE.
    const result = await this.db.run('DELETE FROM files WHERE id = ?', [id]);
    return result.changes > 0;
  }
}
