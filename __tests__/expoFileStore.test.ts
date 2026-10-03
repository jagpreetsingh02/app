/**
 * Tests the real ExpoFileStore against a mocked expo-file-system, to pin down
 * how native errors surface. Regression for: every native error from
 * File.info() (e.g. a permission error) was swallowed and reported as
 * "file does not exist", which hid the real cause of failed imports.
 */
const mockInfo = jest.fn();

jest.mock('expo-crypto', () => ({ digest: jest.fn(), CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    info() {
      return mockInfo(this.uri);
    }
  }
  class Directory extends File {}
  return { File, Directory, Paths: { document: { uri: 'file:///docs' } }, FileMode: { ReadOnly: 'r' } };
});

import { ExpoFileStore } from '../src/storage/ExpoFileStore';

describe('ExpoFileStore.stat / statSource', () => {
  beforeEach(() => mockInfo.mockReset());

  it('reports a genuinely missing file as exists: false', async () => {
    mockInfo.mockReturnValue({ exists: false });
    await expect(new ExpoFileStore().statSource('file:///cache/a.pdf')).resolves.toEqual({
      exists: false,
      size: 0,
      modifiedAt: null,
    });
  });

  it('returns size and mtime for an existing file', async () => {
    mockInfo.mockReturnValue({ exists: true, size: 42, modificationTime: 7 });
    await expect(new ExpoFileStore().stat('archive/x.pdf')).resolves.toEqual({ exists: true, size: 42, modifiedAt: 7 });
  });

  it('propagates native errors instead of pretending the file is missing', async () => {
    mockInfo.mockImplementation(() => {
      throw new Error("Missing 'READ' permission for accessing the file");
    });
    await expect(new ExpoFileStore().statSource('file:///cache/a.pdf')).rejects.toThrow(/READ' permission/);
  });
});
