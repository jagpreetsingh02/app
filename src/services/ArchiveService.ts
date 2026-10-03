import type { FileRepository } from '../data/FileRepository';
import type { TagRepository } from '../data/TagRepository';
import type { ArchiveFileWithTags } from '../domain/types';

/**
 * Read side of the archive for the UI. Phase 3 replaces `listAll` with the
 * SQL-backed search/filter/sort query.
 */
export class ArchiveService {
  constructor(private readonly deps: { files: FileRepository; tags: TagRepository }) {}

  async listAll(): Promise<ArchiveFileWithTags[]> {
    const files = await this.deps.files.listAll();
    const tagsByFile = await this.deps.tags.listForFiles(files.map((f) => f.id));
    return files.map((f) => ({ ...f, tags: tagsByFile.get(f.id) ?? [] }));
  }
}
