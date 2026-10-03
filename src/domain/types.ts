/**
 * Pure domain types. Nothing in this folder imports React, Expo or SQLite,
 * so every other layer can depend on it and tests can use it directly.
 */

/** Coarse grouping used for filtering, icons and choosing how to preview. */
export type FileCategory = 'image' | 'pdf' | 'document' | 'other';

/**
 * Availability of the archive's private copy.
 * - available:  the file exists and has the size we recorded.
 * - missing:    the file is gone (deleted externally, storage cleared, moved).
 * - unreadable: the file exists but cannot be read, has the wrong size,
 *               or failed to open in a viewer.
 */
export type FileStatus = 'available' | 'missing' | 'unreadable';

export const FILE_CATEGORIES: readonly FileCategory[] = ['image', 'pdf', 'document', 'other'];
export const FILE_STATUSES: readonly FileStatus[] = ['available', 'missing', 'unreadable'];

export interface ArchiveFile {
  id: string;
  /** User-editable name shown in the UI (rename changes only this). */
  displayName: string;
  /** Name of the file when it was picked; never changes. */
  originalName: string;
  mimeType: string;
  category: FileCategory;
  sizeBytes: number;
  /** Epoch ms. */
  importedAt: number;
  /** Modification time reported by the picker, if the platform provided one. */
  sourceModifiedAt: number | null;
  /** Modification time of our copy, refreshed every time the integrity check stats it. */
  lastKnownModifiedAt: number | null;
  /** Path RELATIVE to the app document directory, e.g. "archive/<id>.pdf". */
  storagePath: string;
  /** "sha256:<hex>" or "fp:<hex>" (see ImportService for the trade-off). */
  contentHash: string;
  status: FileStatus;
  statusCheckedAt: number | null;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: number;
}

export interface TagWithCount extends Tag {
  fileCount: number;
}

/** An archive entry joined with its tags, as shown in lists and the detail screen. */
export interface ArchiveFileWithTags extends ArchiveFile {
  tags: Tag[];
}

export type SortField = 'importedAt' | 'sizeBytes' | 'displayName';
export type SortDirection = 'asc' | 'desc';

/** Everything the Archive screen can ask for. Translated to SQL by the data layer. */
export interface ArchiveQuery {
  /** Matches display name OR any tag name (case-insensitive substring). */
  text?: string;
  categories?: FileCategory[];
  statuses?: FileStatus[];
  /** Entries must carry this tag. */
  tagId?: string;
  sort?: { field: SortField; direction: SortDirection };
}

/** A file handed to the import pipeline (normalised from the document picker result). */
export interface ImportSource {
  /** Readable URI of the picked file (a cache copy made by the picker). */
  uri: string;
  name: string;
  mimeType: string | null;
  /** Size reported by the picker, if any. The pipeline re-checks it. */
  size: number | null;
  /** Modification time reported by the picker, if any (epoch ms). */
  lastModified: number | null;
}

export type ImportOutcome =
  | { kind: 'imported'; file: ArchiveFile }
  | { kind: 'duplicate'; existing: ArchiveFile; source: ImportSource }
  | { kind: 'failed'; reason: string; code: string }
  | { kind: 'cancelled' };

export interface ImportItemResult {
  /** Index in the picked list, stable for the UI. */
  index: number;
  name: string;
  outcome: ImportOutcome;
}

export interface ImportSummary {
  results: ImportItemResult[];
  imported: number;
  duplicates: number;
  failed: number;
  cancelled: number;
  wasCancelled: boolean;
}

/** Pipeline steps, reported to the UI for per-file progress. */
export type ImportStep =
  | 'queued'
  | 'validating'
  | 'copying'
  | 'verifying'
  | 'hashing'
  | 'checking-duplicates'
  | 'finalizing'
  | 'saving'
  | 'done';
