import type { FileRepository } from '../data/FileRepository';
import { NotFoundError } from '../domain/errors';
import type { FileStore } from '../storage/FileStore';

/**
 * DEVELOPMENT ONLY. Constructed in bootstrap only when __DEV__ is true, so
 * production builds have no way to call it. Exists to demo edge cases.
 */
export class DebugService {
  constructor(private readonly deps: { files: FileRepository; store: FileStore }) {}

  /**
   * Deletes the archive's physical copy behind the app's back, exactly like
   * another app or the user clearing storage would. The DB row is untouched;
   * the next availability check marks it missing.
   */
  async simulateExternalDeletion(fileId: string): Promise<void> {
    const file = await this.deps.files.getById(fileId);
    if (!file) throw new NotFoundError('Archive entry');
    await this.deps.store.remove(file.storagePath);
  }
}
