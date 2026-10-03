import type { FileRepository } from '../data/FileRepository';
import { ARCHIVE_DIR, STAGING_DIR, type FileStore } from '../storage/FileStore';
import type { Mutex } from './concurrency';

export interface ReconciliationReport {
  stagingRemoved: number;
  orphansRemoved: number;
  pickerCacheCleared: number;
}

/**
 * Startup cleanup that restores the "disk ⊇ DB" invariant after a crash.
 *
 * - Everything in archive/.staging/ is an interrupted copy → delete it.
 * - A file in archive/ without a DB row means the app died between the move
 *   (step 5) and the insert (step 6) → delete it.
 * - Copies the document picker left in the app cache are temporary and are
 *   deleted (the user's originals are never in that folder).
 *
 * It only looks at the app's own folders. It never rescans the device and
 * never creates DB rows: the database is the source of truth for what is in
 * the archive, the disk is only ever trimmed to match it.
 */
export class ReconciliationService {
  constructor(
    private readonly deps: { store: FileStore; files: FileRepository; archiveLock: Mutex },
  ) {}

  run(): Promise<ReconciliationReport> {
    return this.deps.archiveLock.runExclusive(async () => {
      const { store, files } = this.deps;
      await store.ensureDirectories();

      let stagingRemoved = 0;
      for (const name of await store.list(STAGING_DIR)) {
        if (await tryRemove(store, `${STAGING_DIR}/${name}`)) stagingRemoved++;
      }

      const known = new Set(await files.listStoragePaths());
      let orphansRemoved = 0;
      for (const name of await store.list(ARCHIVE_DIR)) {
        const path = `${ARCHIVE_DIR}/${name}`;
        if (!known.has(path) && (await tryRemove(store, path))) orphansRemoved++;
      }

      const pickerCacheCleared = await store.clearPickerCache().catch(() => 0);

      return { stagingRemoved, orphansRemoved, pickerCacheCleared };
    });
  }
}

async function tryRemove(store: FileStore, path: string): Promise<boolean> {
  try {
    await store.remove(path);
    return true;
  } catch {
    return false; // try again next launch
  }
}
