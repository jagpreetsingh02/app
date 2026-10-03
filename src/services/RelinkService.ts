import type { FileRepository } from '../data/FileRepository';
import { NotFoundError, errorMessage } from '../domain/errors';
import { formatBytes } from '../domain/fileKinds';
import type { ArchiveFile, ImportSource } from '../domain/types';
import { STAGING_DIR, type FileStore } from '../storage/FileStore';
import type { Mutex } from './concurrency';

export type RelinkResult =
  | { kind: 'relinked'; file: ArchiveFile }
  /** The picked file is not the archived file. Nothing was changed. */
  | { kind: 'mismatch'; message: string }
  /** Something went wrong (unreadable source, copy failure). Nothing was changed. */
  | { kind: 'failed'; message: string };

/**
 * Re-link: restores a missing or unreadable entry from a file the user picks
 * again. The picked file must be byte-for-byte the archived one (same size
 * and content hash); otherwise it is refused and nothing changes. This keeps
 * the record's hash, size and history truthful.
 *
 * Same staging discipline as import: the copy is verified in staging and
 * only then moved over the archive path, so a failure never leaves a
 * half-written file where the archive expects a good one.
 */
export class RelinkService {
  constructor(
    private readonly deps: { files: FileRepository; store: FileStore; archiveLock: Mutex; now: () => number },
  ) {}

  async relink(fileId: string, source: ImportSource): Promise<RelinkResult> {
    try {
      // Shares the archive lock with import and reconciliation, so startup
      // cleanup cannot delete our staging file mid-relink.
      return await this.deps.archiveLock.runExclusive(() => this.run(fileId, source));
    } finally {
      try {
        await this.deps.store.releaseSource(source.uri);
      } catch {
        // Only the picker's cache copy; cleared at next startup anyway.
      }
    }
  }

  private async run(fileId: string, source: ImportSource): Promise<RelinkResult> {
    const { files, store } = this.deps;
    const record = await files.getById(fileId);
    if (!record) throw new NotFoundError('Archive entry');
    if (record.status === 'available') {
      return { kind: 'failed', message: 'This file is available; there is nothing to re-link.' };
    }

    let sourceSize: number;
    try {
      const stat = await store.statSource(source.uri);
      if (!stat.exists) return { kind: 'failed', message: 'The selected file could not be found.' };
      sourceSize = stat.size;
    } catch (err) {
      return { kind: 'failed', message: `The selected file could not be read: ${errorMessage(err)}` };
    }

    // Cheap check first: different size means different content.
    if (sourceSize !== record.sizeBytes) {
      return {
        kind: 'mismatch',
        message: `That’s a different file: it is ${formatBytes(sourceSize)}, but “${record.displayName}” was ${formatBytes(record.sizeBytes)}. Nothing was changed.`,
      };
    }

    const stagingPath = `${STAGING_DIR}/${record.id}.relink.part`;
    try {
      await store.copyIn(source.uri, stagingPath);
      const staged = await store.stat(stagingPath);
      if (!staged.exists || staged.size !== record.sizeBytes) {
        return { kind: 'failed', message: 'The file could not be copied completely. Nothing was changed.' };
      }
      const hash = await store.hash(stagingPath, staged.size);
      if (hash !== record.contentHash) {
        return {
          kind: 'mismatch',
          message: `That file has the same size but different content than “${record.displayName}”, so it can’t be re-linked. Nothing was changed.`,
        };
      }

      // Verified. Replace whatever is at the archive path (nothing if
      // missing, a damaged copy if unreadable) with the verified copy.
      await store.remove(record.storagePath);
      await store.move(stagingPath, record.storagePath);
      const restored = await store.stat(record.storagePath);
      await files.updateStatus({
        id: record.id,
        status: 'available',
        checkedAt: this.deps.now(),
        lastKnownModifiedAt: restored.modifiedAt,
      });
      return { kind: 'relinked', file: (await files.getById(record.id)) ?? record };
    } catch (err) {
      return { kind: 'failed', message: `Re-link failed: ${errorMessage(err)}` };
    } finally {
      try {
        await store.remove(stagingPath);
      } catch {
        // Staging is wiped by reconciliation on next launch.
      }
    }
  }
}
