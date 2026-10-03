import { randomUUID } from 'expo-crypto';

import { SqliteFileRepository } from './data/FileRepository';
import { openArchiveDatabase } from './data/sqlite';
import { SqliteTagRepository } from './data/TagRepository';
import { ArchiveService } from './services/ArchiveService';
import { AvailabilityService } from './services/AvailabilityService';
import type { DebugService } from './services/DebugService';
import { Mutex } from './services/concurrency';
import { ImportService } from './services/ImportService';
import { OpenService } from './services/OpenService';
import { ReconciliationService, type ReconciliationReport } from './services/ReconciliationService';
import { RelinkService } from './services/RelinkService';
import { SearchService } from './services/SearchService';
import { TagService } from './services/TagService';
import { pickImportSources, pickSingleSource } from './storage/documentPicker';
import { ExpoFileStore } from './storage/ExpoFileStore';
import { ExpoExternalViewer } from './storage/ExternalViewer';
import type { ImportSource } from './domain/types';

/**
 * Composition root: the only place that knows about concrete implementations.
 * It wires SQLite and the Expo file system into the services; the UI only
 * ever sees the resulting `AppServices` object (no DB handle, no file paths).
 */

export interface AppServices {
  archive: ArchiveService;
  availability: AvailabilityService;
  search: SearchService;
  tags: TagService;
  importer: ImportService;
  opener: OpenService;
  relinker: RelinkService;
  /** Pickers wait for startup cleanup first: it empties the picker cache folder. */
  pickFiles: () => Promise<ImportSource[] | null>;
  pickFile: () => Promise<ImportSource | null>;
  /** Development builds only; always null in production. */
  debug: DebugService | null;
  /** Startup cleanup, started in the background; resolves when it is done. */
  reconciliation: Promise<ReconciliationReport | null>;
}

export async function createAppServices(): Promise<AppServices> {
  const db = await openArchiveDatabase();
  const store = new ExpoFileStore();
  await store.ensureDirectories();

  const files = new SqliteFileRepository(db);
  const tags = new SqliteTagRepository(db);
  const archiveLock = new Mutex();

  const reconciler = new ReconciliationService({ store, files, archiveLock });
  // Not awaited: first render must not wait for disk cleanup. Imports queue
  // behind it on archiveLock, so they can never race it.
  const reconciliation = reconciler.run().catch((err: unknown) => {
    console.warn('Startup reconciliation failed; will retry next launch', err);
    return null;
  });

  const availability = new AvailabilityService({ files, store, now: Date.now });

  return {
    archive: new ArchiveService({ files, tags, store }),
    availability,
    opener: new OpenService({ availability, viewer: new ExpoExternalViewer() }),
    relinker: new RelinkService({ files, store, archiveLock, now: Date.now }),
    search: new SearchService({ files, tags }),
    tags: new TagService({ tags, newId: randomUUID, now: Date.now }),
    importer: new ImportService({ store, files, archiveLock, newId: randomUUID, now: Date.now }),
    pickFiles: async () => {
      await reconciliation;
      return pickImportSources();
    },
    pickFile: async () => {
      await reconciliation;
      return pickSingleSource();
    },
    // Guarded require: production bundles drop the module entirely.
    debug: __DEV__ ? new (require('./services/DebugService').DebugService as typeof DebugService)({ files, store }) : null,
    reconciliation,
  };
}
