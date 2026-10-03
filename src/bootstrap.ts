import type { SqlDatabase } from './data/SqlDatabase';
import { openArchiveDatabase } from './data/sqlite';
import { ExpoFileStore } from './storage/ExpoFileStore';
import type { FileStore } from './storage/FileStore';

/**
 * Composition root: the only place that knows about concrete implementations.
 * It wires SQLite and the Expo file system into the services, and the UI only
 * ever sees the resulting `AppServices` object.
 */

export interface AppServices {
  fileStore: FileStore;
}

// Kept module-private so UI code cannot reach the raw database handle.
let database: SqlDatabase | null = null;

export async function createAppServices(): Promise<AppServices> {
  database ??= await openArchiveDatabase();
  const fileStore = new ExpoFileStore();
  await fileStore.ensureDirectories();
  return { fileStore };
}
