import type { FileRepository } from '../data/FileRepository';
import {
  CancelledError,
  ImportError,
  SimulatedCrashError,
  errorMessage,
  type ImportErrorCode,
} from '../domain/errors';
import { categorize, resolveMimeType, storageExtension } from '../domain/fileKinds';
import type {
  ArchiveFile,
  ImportItemResult,
  ImportOutcome,
  ImportSource,
  ImportStep,
  ImportSummary,
} from '../domain/types';
import { ARCHIVE_DIR, STAGING_DIR, type FileStore } from '../storage/FileStore';
import { CancelToken, Mutex, runPool } from './concurrency';

export const IMPORT_CONCURRENCY = 2;

export interface ImportServiceDeps {
  store: FileStore;
  files: FileRepository;
  /** Shared with ReconciliationService so the two never interleave. */
  archiveLock: Mutex;
  newId: () => string;
  now: () => number;
}

export interface ImportOptions {
  token?: CancelToken;
  onProgress?: (index: number, step: ImportStep) => void;
  /** Indexes the user chose to "keep anyway" after a duplicate warning. */
  allowDuplicates?: ReadonlySet<number>;
  /** Debug only: emulate the app dying between step 5 (move) and step 6 (insert). */
  simulateCrashAfterMove?: boolean;
}

/**
 * The import pipeline. Invariant: a DB row is only ever written AFTER the file
 * is complete and in its final place, and if writing the row fails the file is
 * removed again. So the database can never reference a file that was not fully
 * imported. Anything a crash leaves behind is on disk only (a staging .part
 * file or an unreferenced archive file) and ReconciliationService deletes it on
 * the next launch.
 *
 * Per file:
 *   1. validate source (readable, size > 0)
 *   2. copy to archive/.staging/<id>.part
 *   3. verify copied size, compute content hash
 *   4. duplicate check (same hash + size already archived)
 *   5. atomic rename to archive/<id>.<ext>
 *   6. insert DB row in an exclusive transaction (compensate on failure)
 *   7. report imported / duplicate / failed(reason)
 */
export class ImportService {
  constructor(private readonly deps: ImportServiceDeps) {}

  importFiles(sources: readonly ImportSource[], options: ImportOptions = {}): Promise<ImportSummary> {
    const token = options.token ?? new CancelToken();
    // Set when a simulated crash happens so the other lane stops dead too,
    // without cleaning up, the way a killed process would.
    const crash = { happened: false };
    const commitLock = new Mutex();

    return this.deps.archiveLock.runExclusive(async () => {
      const outcomes = await runPool(sources, IMPORT_CONCURRENCY, (source, index) =>
        this.importOne(source, index, token, crash, commitLock, options),
      );
      const results: ImportItemResult[] = outcomes.map((outcome, index) => ({
        index,
        name: sources[index].name,
        outcome,
      }));
      return summarize(results, token.isCancelled);
    });
  }

  private async importOne(
    source: ImportSource,
    index: number,
    token: CancelToken,
    crash: { happened: boolean },
    commitLock: Mutex,
    options: ImportOptions,
  ): Promise<ImportOutcome> {
    const { store, files } = this.deps;
    const progress = (step: ImportStep) => options.onProgress?.(index, step);
    const checkpoint = () => {
      if (crash.happened) throw new SimulatedCrashError();
      token.throwIfCancelled();
    };

    const id = this.deps.newId();
    const stagingPath = `${STAGING_DIR}/${id}.part`;
    let finalPath: string | null = null; // set once step 5 has succeeded
    let inserted = false;

    try {
      // 1. Validate
      checkpoint();
      progress('validating');
      const sourceStat = await step('SOURCE_UNREADABLE', 'The selected file could not be read', () =>
        store.statSource(source.uri),
      );
      if (!sourceStat.exists) {
        throw new ImportError('SOURCE_UNREADABLE', 'The selected file no longer exists.');
      }
      if (sourceStat.size <= 0) {
        throw new ImportError('SOURCE_EMPTY', 'The selected file is empty.');
      }

      // 2. Copy into staging
      checkpoint();
      progress('copying');
      await step('COPY_FAILED', 'Could not copy the file into the archive', () =>
        store.copyIn(source.uri, stagingPath),
      );

      // 3. Verify size, then hash the copy we now own
      checkpoint();
      progress('verifying');
      const staged = await step('COPY_FAILED', 'Could not verify the copied file', () => store.stat(stagingPath));
      if (!staged.exists || staged.size !== sourceStat.size) {
        throw new ImportError(
          'SIZE_MISMATCH',
          `Copy is incomplete (${staged.size} of ${sourceStat.size} bytes).`,
        );
      }
      checkpoint();
      progress('hashing');
      const contentHash = await step('HASH_FAILED', 'Could not read the copied file', () =>
        store.hash(stagingPath, staged.size),
      );

      // Steps 4–6 run one file at a time (per import run). Copy and hash are
      // parallel, but if two identical files were checked concurrently both
      // would pass the duplicate check before either was inserted.
      return await commitLock.runExclusive(async (): Promise<ImportOutcome> => {
        // 4. Duplicate check
        checkpoint();
        progress('checking-duplicates');
        if (!options.allowDuplicates?.has(index)) {
          const existing = await step('DB_FAILED', 'Could not check for duplicates', () =>
            files.findByHash(contentHash, staged.size),
          );
          if (existing) {
            await safeRemove(store, stagingPath);
            progress('done');
            return { kind: 'duplicate', existing, source };
          }
        }

        // 5. Atomic move into place
        checkpoint();
        progress('finalizing');
        const mimeType = resolveMimeType(source.name, source.mimeType);
        const target = `${ARCHIVE_DIR}/${id}.${storageExtension(source.name, mimeType)}`;
        await step('MOVE_FAILED', 'Could not move the file into the archive', () =>
          store.move(stagingPath, target),
        );
        finalPath = target;

        if (options.simulateCrashAfterMove) {
          crash.happened = true;
          throw new SimulatedCrashError();
        }

        // 6. Record it. Last cancellation point: after this the import is done.
        checkpoint();
        progress('saving');
        const now = this.deps.now();
        const finalStat = await step('MOVE_FAILED', 'Could not verify the archived file', () => store.stat(target));
        const file: ArchiveFile = {
          id,
          displayName: source.name,
          originalName: source.name,
          mimeType,
          category: categorize(mimeType),
          sizeBytes: staged.size,
          importedAt: now,
          sourceModifiedAt: validTimestamp(source.lastModified),
          lastKnownModifiedAt: finalStat.modifiedAt,
          storagePath: target,
          contentHash,
          status: 'available',
          statusCheckedAt: now,
        };
        await step('DB_FAILED', 'Could not save the archive record', () => files.insert(file));
        inserted = true;

        // 7. Report
        progress('done');
        return { kind: 'imported', file };
      });
    } catch (err) {
      if (err instanceof SimulatedCrashError) {
        // Behave like a dead process: leave everything exactly where it is.
        throw err;
      }
      // Compensation. Order matters: staging first, then the moved file if
      // its row was never written. Removal failures are swallowed; anything
      // left over is reclaimed by reconciliation on the next launch.
      await safeRemove(store, stagingPath);
      if (finalPath && !inserted) await safeRemove(store, finalPath);

      progress('done');
      if (err instanceof CancelledError) return { kind: 'cancelled' };
      if (err instanceof ImportError) return { kind: 'failed', code: err.code, reason: err.message };
      return { kind: 'failed', code: 'UNKNOWN', reason: errorMessage(err) };
    }
  }
}

/** Runs one pipeline step, converting any thrown error into a typed ImportError. */
async function step<T>(code: ImportErrorCode, message: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ImportError || err instanceof CancelledError) throw err;
    throw new ImportError(code, `${message}: ${errorMessage(err)}`, { cause: err });
  }
}

async function safeRemove(store: FileStore, path: string): Promise<void> {
  try {
    await store.remove(path);
  } catch {
    // Intentionally ignored — see compensation comment above.
  }
}

/** Android's picker sometimes reports 0 or nothing; treat that as unknown. */
function validTimestamp(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function summarize(results: ImportItemResult[], wasCancelled: boolean): ImportSummary {
  const count = (kind: ImportOutcome['kind']) => results.filter((r) => r.outcome.kind === kind).length;
  return {
    results,
    imported: count('imported'),
    duplicates: count('duplicate'),
    failed: count('failed'),
    cancelled: count('cancelled'),
    wasCancelled,
  };
}
