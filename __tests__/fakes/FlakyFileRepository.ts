import type { FileRepository } from '../../src/data/FileRepository';
import type { ArchiveFile, ArchiveQuery } from '../../src/domain/types';

/**
 * Decorates a real FileRepository (SQLite via node:sqlite) and fails `insert`
 * on demand, to exercise the pipeline's compensation path.
 */
export class FlakyFileRepository implements FileRepository {
  failInsertWhen: (file: ArchiveFile) => boolean = () => false;

  constructor(private readonly inner: FileRepository) {}

  insert(file: ArchiveFile): Promise<void> {
    if (this.failInsertWhen(file)) return Promise.reject(new Error('SQLITE_FULL: database or disk is full'));
    return this.inner.insert(file);
  }
  getById(id: string) {
    return this.inner.getById(id);
  }
  findByHash(hash: string, size: number) {
    return this.inner.findByHash(hash, size);
  }
  listStoragePaths() {
    return this.inner.listStoragePaths();
  }
  listAll() {
    return this.inner.listAll();
  }
  search(query: ArchiveQuery) {
    return this.inner.search(query);
  }
  rename(id: string, name: string) {
    return this.inner.rename(id, name);
  }
  delete(id: string) {
    return this.inner.delete(id);
  }
}
