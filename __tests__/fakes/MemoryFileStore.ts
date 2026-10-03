import { createHash } from 'node:crypto';

import type { FileStat, FileStore } from '../../src/storage/FileStore';

type Op = 'statSource' | 'copyIn' | 'stat' | 'move' | 'remove' | 'list' | 'hash' | 'probeReadable';

/**
 * In-memory FileStore with failure injection.
 *
 * `sources` simulates files on the device (picker URIs), `files` simulates the
 * app's document directory keyed by relative path. `failWhen` decides, per
 * operation, whether a call should throw. A failing copy writes a partial
 * file first, like a real interrupted copy would.
 */
export class MemoryFileStore implements FileStore {
  readonly sources = new Map<string, Uint8Array>();
  readonly files = new Map<string, { bytes: Uint8Array; modifiedAt: number }>();
  readonly unreadable = new Set<string>();
  failWhen: Partial<Record<Op, (arg: string) => boolean>> = {};
  /** Called before every operation; lets a test act "mid-pipeline" (e.g. cancel). */
  onOperation?: (op: Op, arg: string) => void;
  private clock = 1_000;

  addSource(uri: string, content: string | Uint8Array): void {
    this.sources.set(uri, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  }

  paths(prefix = ''): string[] {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }

  private enter(op: Op, arg: string): void {
    this.onOperation?.(op, arg);
    if (this.failWhen[op]?.(arg)) throw new Error(`Injected ${op} failure for ${arg}`);
  }

  async ensureDirectories(): Promise<void> {}

  async statSource(uri: string): Promise<FileStat> {
    this.enter('statSource', uri);
    const bytes = this.sources.get(uri);
    return bytes ? { exists: true, size: bytes.length, modifiedAt: 500 } : { exists: false, size: 0, modifiedAt: null };
  }

  async copyIn(uri: string, dest: string): Promise<void> {
    const bytes = this.sources.get(uri);
    if (this.failWhen.copyIn?.(uri)) {
      // Simulate a copy that died halfway.
      if (bytes) this.files.set(dest, { bytes: bytes.slice(0, bytes.length >> 1), modifiedAt: this.clock++ });
      throw new Error(`Injected copyIn failure for ${uri}`);
    }
    this.enter('copyIn', uri);
    if (!bytes) throw new Error(`ENOENT ${uri}`);
    this.files.set(dest, { bytes: bytes.slice(), modifiedAt: this.clock++ });
  }

  async stat(path: string): Promise<FileStat> {
    this.enter('stat', path);
    const file = this.files.get(path);
    return file ? { exists: true, size: file.bytes.length, modifiedAt: file.modifiedAt } : { exists: false, size: 0, modifiedAt: null };
  }

  async move(from: string, to: string): Promise<void> {
    this.enter('move', from);
    const file = this.files.get(from);
    if (!file) throw new Error(`ENOENT ${from}`);
    if (this.files.has(to)) throw new Error(`EEXIST ${to}`);
    this.files.delete(from);
    this.files.set(to, file);
  }

  async remove(path: string): Promise<void> {
    this.enter('remove', path);
    this.files.delete(path);
  }

  async list(dir: string): Promise<string[]> {
    this.enter('list', dir);
    const prefix = `${dir}/`;
    return this.paths(prefix)
      .map((p) => p.slice(prefix.length))
      .filter((rest) => !rest.includes('/')); // direct children only, like the real store
  }

  async hash(path: string, size: number): Promise<string> {
    this.enter('hash', path);
    const file = this.files.get(path);
    if (!file) throw new Error(`ENOENT ${path}`);
    return `sha256:${createHash('sha256').update(file.bytes.subarray(0, size)).digest('hex')}`;
  }

  async probeReadable(path: string): Promise<void> {
    this.enter('probeReadable', path);
    if (!this.files.has(path)) throw new Error(`ENOENT ${path}`);
    if (this.unreadable.has(path)) throw new Error(`EACCES ${path}`);
  }

  toUri(path: string): string {
    return `file:///memory/${path}`;
  }
}
