import type { FileRepository } from '../data/FileRepository';
import type { TagRepository } from '../data/TagRepository';
import type { ArchiveFileWithTags, ArchiveQuery } from '../domain/types';

/**
 * Search, filter and sort. Everything runs as SQL against the persisted
 * database: the device is never rescanned to answer a query.
 */
export class SearchService {
  constructor(private readonly deps: { files: FileRepository; tags: TagRepository }) {}

  async search(query: ArchiveQuery): Promise<ArchiveFileWithTags[]> {
    const files = await this.deps.files.search(query);
    const tagsByFile = await this.deps.tags.listForFiles(files.map((f) => f.id));
    return files.map((f) => ({ ...f, tags: tagsByFile.get(f.id) ?? [] }));
  }
}
