/**
 * Everything the services need from the file system, behind an interface so
 * the import pipeline can be unit-tested with an in-memory fake that injects
 * failures at any step.
 *
 * Paths are RELATIVE to the app's document directory (e.g. "archive/abc.pdf").
 * Absolute URIs are only used for the picked source file (`sourceUri`) and are
 * produced on demand by `toUri()` for viewers. Storing relative paths matters
 * because the absolute container path can change across app updates/restores.
 */

export const ARCHIVE_DIR = 'archive';
export const STAGING_DIR = 'archive/.staging';

export interface FileStat {
  exists: boolean;
  size: number;
  /** Epoch ms, when the platform reports it. */
  modifiedAt: number | null;
}

export interface FileStore {
  /** Creates archive/ and archive/.staging/ if needed. Idempotent. */
  ensureDirectories(): Promise<void>;

  /**
   * Stats a picked file by absolute URI. A missing file resolves with
   * `exists: false`; any other failure (e.g. permission denied) rejects with
   * the platform's error so it can be reported, never masked as "missing".
   */
  statSource(sourceUri: string): Promise<FileStat>;

  /** Copies an absolute source URI to a relative destination (overwriting). */
  copyIn(sourceUri: string, destPath: string): Promise<void>;

  /** Same contract as statSource, for a path inside app storage. */
  stat(path: string): Promise<FileStat>;

  /**
   * Renames within app storage. Same-volume rename, so it is atomic: the
   * destination either does not exist yet or is complete.
   */
  move(fromPath: string, toPath: string): Promise<void>;

  /** Deletes a file if present. Idempotent: deleting nothing is not an error. */
  remove(path: string): Promise<void>;

  /** File names (not directories) directly inside `dirPath`. Empty if dir is missing. */
  list(dirPath: string): Promise<string[]>;

  /** Content hash, "sha256:<hex>" or "fp:<hex>" for very large files. */
  hash(path: string, size: number): Promise<string>;

  /** Throws if the file cannot actually be read (permissions, I/O error). */
  probeReadable(path: string): Promise<void>;

  /** Absolute file:// URI for handing the file to a viewer or <Image>. */
  toUri(path: string): string;
}
