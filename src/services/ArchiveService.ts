import type { FileRepository } from '../data/FileRepository';
import type { TagRepository } from '../data/TagRepository';
import { NotFoundError, ValidationError } from '../domain/errors';
import type { ArchiveFile, ArchiveFileWithTags } from '../domain/types';
import type { FileStore } from '../storage/FileStore';

export const MAX_NAME_LENGTH = 255;

/** Operations on a single archive entry: detail, rename, remove. */
export class ArchiveService {
  constructor(private readonly deps: { files: FileRepository; tags: TagRepository; store: FileStore }) {}

  async getDetail(id: string): Promise<ArchiveFileWithTags | null> {
    const file = await this.deps.files.getById(id);
    if (!file) return null;
    return { ...file, tags: await this.deps.tags.listForFile(id) };
  }

  /** Renames the entry as shown in the app. The stored file keeps its name. */
  async rename(id: string, rawName: string): Promise<string> {
    const name = rawName.replace(/[\r\n]+/g, ' ').trim();
    if (!name) throw new ValidationError('Name cannot be empty.');
    if (name.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`Names can be at most ${MAX_NAME_LENGTH} characters.`);
    }
    if (!(await this.deps.files.rename(id, name))) throw new NotFoundError('Archive entry');
    return name;
  }

  /**
   * "Remove from archive": deletes the record AND the archive's private copy.
   * The user's original file on the device is never touched (we never kept a
   * reference to it — only to our own copy).
   *
   * The row goes first. If the app dies before the copy is deleted, the copy
   * is an unreferenced file that startup reconciliation removes. Doing it the
   * other way round could leave a record pointing at a deleted file.
   */
  async remove(id: string): Promise<void> {
    const file = await this.deps.files.getById(id);
    if (!file) throw new NotFoundError('Archive entry');
    await this.deps.files.delete(id);
    try {
      await this.deps.store.remove(file.storagePath);
    } catch {
      // Left for reconciliation; the entry is already gone from the archive.
    }
  }

  /** file:// URI of the private copy, for thumbnails and viewers. */
  fileUri(file: Pick<ArchiveFile, 'storagePath'>): string {
    return this.deps.store.toUri(file.storagePath);
  }
}
