/**
 * Content-hash policy, shared by the real store and the test fake.
 *
 * Files up to FULL_HASH_MAX_BYTES get a full SHA-256 ("sha256:<hex>").
 * Bigger files get a fingerprint: SHA-256 over (size, first 1 MB, last 1 MB)
 * ("fp:<hex>"). Reading a whole multi-hundred-MB video into memory to hash it
 * would be slow and risk running out of memory on low-end phones; the
 * fingerprint is cheap but can, in theory, call two different large files with
 * identical size, head and tail "duplicates". The prefix keeps the two schemes
 * from ever being compared with each other.
 */

export const FULL_HASH_MAX_BYTES = 50 * 1024 * 1024;
export const FINGERPRINT_CHUNK_BYTES = 1024 * 1024;

export function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/** Bytes fed to SHA-256 for the large-file fingerprint. */
export function fingerprintInput(size: number, head: Uint8Array, tail: Uint8Array): Uint8Array<ArrayBuffer> {
  const header = new TextEncoder().encode(`size:${size};`);
  const out = new Uint8Array(header.length + head.length + tail.length);
  out.set(header, 0);
  out.set(head, header.length);
  out.set(tail, header.length + head.length);
  return out;
}
