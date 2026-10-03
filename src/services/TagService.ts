import type { TagRepository } from '../data/TagRepository';
import { ValidationError } from '../domain/errors';
import type { Tag, TagWithCount } from '../domain/types';

export const MAX_TAG_LENGTH = 40;

/** Tag rules (naming, uniqueness) on top of the tag repository. */
export class TagService {
  constructor(private readonly deps: { tags: TagRepository; newId: () => string; now: () => number }) {}

  /** Trims and collapses inner whitespace: "  work   notes " → "work notes". */
  static normalizeName(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ');
  }

  async create(rawName: string): Promise<Tag> {
    const name = TagService.normalizeName(rawName);
    if (!name) throw new ValidationError('Tag name cannot be empty.');
    if (name.length > MAX_TAG_LENGTH) {
      throw new ValidationError(`Tag names can be at most ${MAX_TAG_LENGTH} characters.`);
    }
    const existing = await this.deps.tags.findByName(name);
    if (existing) throw new ValidationError(`A tag named “${existing.name}” already exists.`);

    const tag: Tag = { id: this.deps.newId(), name, createdAt: this.deps.now() };
    try {
      await this.deps.tags.create(tag);
    } catch (err) {
      // The UNIQUE NOCASE constraint is the real guard; the lookup above just
      // gives a friendlier message in the common case.
      if (/UNIQUE/i.test(String(err))) throw new ValidationError(`A tag named “${name}” already exists.`);
      throw err;
    }
    return tag;
  }

  /** Finds a tag case-insensitively or creates it, then attaches it to the file. */
  async addToFile(fileId: string, rawName: string): Promise<Tag> {
    const name = TagService.normalizeName(rawName);
    const tag = (await this.deps.tags.findByName(name)) ?? (await this.create(name));
    await this.deps.tags.assign(fileId, tag.id);
    return tag;
  }

  assign(fileId: string, tagId: string): Promise<void> {
    return this.deps.tags.assign(fileId, tagId);
  }

  unassign(fileId: string, tagId: string): Promise<void> {
    return this.deps.tags.unassign(fileId, tagId);
  }

  /** Removes the tag from every file and deletes it. Files are not affected. */
  delete(tagId: string): Promise<void> {
    return this.deps.tags.delete(tagId);
  }

  list(): Promise<TagWithCount[]> {
    return this.deps.tags.listWithCounts();
  }

  listForFile(fileId: string): Promise<Tag[]> {
    return this.deps.tags.listForFile(fileId);
  }
}
