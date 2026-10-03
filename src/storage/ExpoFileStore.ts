import * as Crypto from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { ARCHIVE_DIR, STAGING_DIR, type FileStat, type FileStore } from './FileStore';
import {
  FINGERPRINT_CHUNK_BYTES,
  FULL_HASH_MAX_BYTES,
  fingerprintInput,
  toHex,
} from './hashing';

/**
 * FileStore backed by expo-file-system's object API (`File`, `Directory`,
 * `Paths`). Copy, move and whole-file reads use the async native methods so
 * the JS thread stays free to render progress.
 */
export class ExpoFileStore implements FileStore {
  private file(path: string): File {
    return new File(Paths.document, ...splitPath(path));
  }

  private directory(path: string): Directory {
    return new Directory(Paths.document, ...splitPath(path));
  }

  async ensureDirectories(): Promise<void> {
    for (const dir of [ARCHIVE_DIR, STAGING_DIR]) {
      this.directory(dir).create({ intermediates: true, idempotent: true });
    }
  }

  async statSource(sourceUri: string): Promise<FileStat> {
    return statFile(new File(sourceUri));
  }

  async copyIn(sourceUri: string, destPath: string): Promise<void> {
    await new File(sourceUri).copy(this.file(destPath), { overwrite: true });
  }

  async releaseSource(sourceUri: string): Promise<void> {
    const file = new File(sourceUri);
    if (!isDirectChild(file.uri, pickerCacheDirectory().uri)) return;
    if (file.exists) file.delete();
  }

  async clearPickerCache(): Promise<number> {
    const dir = pickerCacheDirectory();
    if (!dir.exists) return 0;
    let removed = 0;
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      try {
        entry.delete();
        removed++;
      } catch {
        // Locked or already gone; the OS may also clear the cache itself.
      }
    }
    return removed;
  }

  async stat(path: string): Promise<FileStat> {
    return statFile(this.file(path));
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    // overwrite: false — never silently replace an existing archive file.
    await this.file(fromPath).move(this.file(toPath), { overwrite: false });
  }

  async remove(path: string): Promise<void> {
    const file = this.file(path);
    if (file.exists) file.delete();
  }

  async list(dirPath: string): Promise<string[]> {
    const dir = this.directory(dirPath);
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((entry) => entry.name);
  }

  async hash(path: string, size: number): Promise<string> {
    const file = this.file(path);
    if (size <= FULL_HASH_MAX_BYTES) {
      const bytes = await file.bytes();
      const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
      return `sha256:${toHex(digest)}`;
    }

    const handle = file.open(FileMode.ReadOnly);
    try {
      const head = handle.readBytes(FINGERPRINT_CHUNK_BYTES);
      handle.offset = Math.max(0, size - FINGERPRINT_CHUNK_BYTES);
      const tail = handle.readBytes(FINGERPRINT_CHUNK_BYTES);
      const digest = await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        fingerprintInput(size, head, tail),
      );
      return `fp:${toHex(digest)}`;
    } finally {
      handle.close();
    }
  }

  async probeReadable(path: string): Promise<void> {
    const handle = this.file(path).open(FileMode.ReadOnly);
    try {
      handle.readBytes(1);
    } finally {
      handle.close();
    }
  }

  toUri(path: string): string {
    return this.file(path).uri;
  }
}

/**
 * Where expo-document-picker puts its copies when copyToCacheDirectory is
 * true (Android: <cacheDir>/DocumentPicker, see DocumentPickerModule.kt).
 */
function pickerCacheDirectory(): Directory {
  return new Directory(Paths.cache, 'DocumentPicker');
}

/** True if `fileUri` sits directly inside `dirUri` (no traversal, no subfolders). */
function isDirectChild(fileUri: string, dirUri: string): boolean {
  const normalize = (uri: string) => decodeURIComponent(uri).replace(/\/+$/, '');
  const file = normalize(fileUri);
  const dir = `${normalize(dirUri)}/`;
  if (!file.startsWith(dir)) return false;
  const rest = file.slice(dir.length);
  return rest.length > 0 && !rest.includes('/') && rest !== '..';
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

/**
 * "Not there" is a normal answer (exists: false). Anything else — permission
 * denied, invalid URI, I/O error — is thrown so callers can report the real
 * cause instead of a misleading "file not found".
 */
function statFile(file: File): FileStat {
  const info = file.info();
  if (!info.exists) return { exists: false, size: 0, modifiedAt: null };
  return {
    exists: true,
    size: info.size ?? 0,
    modifiedAt: info.modificationTime ?? null,
  };
}
