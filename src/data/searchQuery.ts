import type { ArchiveQuery, SortDirection, SortField } from '../domain/types';
import type { SqlParam } from './SqlDatabase';

/**
 * Translates an ArchiveQuery into one parameterised SQL statement.
 *
 * Rules that keep it safe and predictable:
 * - User text is only ever bound as a parameter, never concatenated.
 * - LIKE wildcards in user text (% and _) are escaped, so searching "100%"
 *   matches the literal string.
 * - Sort column and direction come from a whitelist, because ORDER BY cannot
 *   be parameterised.
 * - `f.id` is the final tie-breaker so ordering is stable between reloads.
 *
 * Note: a leading-wildcard LIKE cannot use the display_name index, so text
 * search scans the files table. That is fine for a personal archive of
 * thousands of entries; FTS5 would be the next step beyond that.
 */

/** Column list shared by every SELECT on `files` (aliased as f). */
export const FILE_COLUMNS = `
  f.id, f.display_name, f.original_name, f.mime_type, f.category, f.size_bytes,
  f.imported_at, f.source_modified_at, f.last_known_modified_at, f.storage_path,
  f.content_hash, f.status, f.status_checked_at`;

const SORT_COLUMNS: Record<SortField, string> = {
  importedAt: 'f.imported_at',
  sizeBytes: 'f.size_bytes',
  displayName: 'f.display_name COLLATE NOCASE',
};

const DIRECTIONS: Record<SortDirection, string> = { asc: 'ASC', desc: 'DESC' };

export const DEFAULT_SORT = { field: 'importedAt', direction: 'desc' } as const;

export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function buildSearchQuery(query: ArchiveQuery): { sql: string; params: SqlParam[] } {
  const where: string[] = [];
  const params: SqlParam[] = [];

  const text = query.text?.trim();
  if (text) {
    const pattern = `%${escapeLike(text)}%`;
    where.push(`(
      f.display_name LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM file_tags ft JOIN tags t ON t.id = ft.tag_id
        WHERE ft.file_id = f.id AND t.name LIKE ? ESCAPE '\\'
      )
    )`);
    params.push(pattern, pattern);
  }

  if (query.categories && query.categories.length > 0) {
    where.push(`f.category IN (${query.categories.map(() => '?').join(', ')})`);
    params.push(...query.categories);
  }

  if (query.statuses && query.statuses.length > 0) {
    where.push(`f.status IN (${query.statuses.map(() => '?').join(', ')})`);
    params.push(...query.statuses);
  }

  if (query.tagId) {
    where.push('EXISTS (SELECT 1 FROM file_tags ft2 WHERE ft2.file_id = f.id AND ft2.tag_id = ?)');
    params.push(query.tagId);
  }

  const sort = query.sort ?? DEFAULT_SORT;
  const column = SORT_COLUMNS[sort.field] ?? SORT_COLUMNS.importedAt;
  const direction = DIRECTIONS[sort.direction] ?? 'DESC';

  const sql = [
    `SELECT ${FILE_COLUMNS} FROM files f`,
    where.length > 0 ? `WHERE ${where.join('\n  AND ')}` : '',
    `ORDER BY ${column} ${direction}, f.id ${direction}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { sql, params };
}
