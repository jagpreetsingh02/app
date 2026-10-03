import type { SqlDatabase } from './SqlDatabase';

/**
 * Schema and migrations. Kept free of Expo imports so the same code runs in
 * the app and in Jest (against node:sqlite).
 *
 * Migrations are an append-only list. `PRAGMA user_version` stores how many
 * have been applied; each one runs in its own transaction together with the
 * version bump, so a crash mid-migration leaves the previous version intact.
 * Never edit a shipped migration — add a new one.
 */

export const MIGRATIONS: readonly string[] = [
  // v1 — initial schema
  `
  CREATE TABLE files (
    id                      TEXT    PRIMARY KEY NOT NULL,
    display_name            TEXT    NOT NULL,
    original_name           TEXT    NOT NULL,
    mime_type               TEXT    NOT NULL,
    category                TEXT    NOT NULL CHECK (category IN ('image','pdf','document','other')),
    size_bytes              INTEGER NOT NULL CHECK (size_bytes >= 0),
    imported_at             INTEGER NOT NULL,
    source_modified_at      INTEGER,
    last_known_modified_at  INTEGER,
    storage_path            TEXT    NOT NULL UNIQUE,
    content_hash            TEXT    NOT NULL,
    status                  TEXT    NOT NULL DEFAULT 'available'
                                    CHECK (status IN ('available','missing','unreadable')),
    status_checked_at       INTEGER
  );

  CREATE TABLE tags (
    id          TEXT    PRIMARY KEY NOT NULL,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE file_tags (
    file_id  TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    tag_id   TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
  );

  CREATE INDEX idx_files_display_name ON files(display_name COLLATE NOCASE);
  CREATE INDEX idx_files_category     ON files(category);
  CREATE INDEX idx_files_status       ON files(status);
  CREATE INDEX idx_files_imported_at  ON files(imported_at);
  CREATE INDEX idx_files_size_bytes   ON files(size_bytes);
  CREATE INDEX idx_files_hash_size    ON files(content_hash, size_bytes);
  CREATE INDEX idx_file_tags_tag      ON file_tags(tag_id);
  `,
];

/** Connection settings + migrations. Shared by the app and the tests. */
export async function prepareDatabase(db: SqlDatabase): Promise<void> {
  // WAL keeps reads fast while the import pipeline writes. foreign_keys is
  // per-connection and is ignored inside a transaction, so it is set first.
  await db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(db);
}

async function migrate(db: SqlDatabase): Promise<void> {
  const row = await db.getFirst<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current > MIGRATIONS.length) {
    // Database written by a newer build; refuse rather than corrupt it.
    throw new Error(
      `Database version ${current} is newer than this app supports (${MIGRATIONS.length}).`,
    );
  }

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[version]);
      // user_version lives in the DB header and is covered by the transaction.
      await tx.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
