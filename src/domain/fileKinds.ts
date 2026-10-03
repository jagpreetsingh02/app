import type { FileCategory } from './types';

/**
 * Pure helpers for classifying files. The picker's MIME type is preferred,
 * but Android sometimes reports `application/octet-stream` or nothing at all,
 * so we fall back to the extension.
 */

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
};

const DOCUMENT_MIME_PREFIXES = [
  'text/',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.',
  'application/vnd.ms-',
  'application/vnd.oasis.opendocument.',
  'application/rtf',
  'application/json',
];

const GENERIC_MIME = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/** Lower-case extension without the dot, or '' if there is none. */
export function extensionOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/** Picks the most specific MIME type available. */
export function resolveMimeType(name: string, reported: string | null | undefined): string {
  const clean = (reported ?? '').trim().toLowerCase();
  if (!GENERIC_MIME.has(clean)) return clean;
  return EXTENSION_MIME[extensionOf(name)] ?? 'application/octet-stream';
}

export function categorize(mimeType: string): FileCategory {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (DOCUMENT_MIME_PREFIXES.some((p) => mime.startsWith(p))) return 'document';
  return 'other';
}

/**
 * Extension used for the stored copy. We keep a real extension so external
 * viewers can recognise the file. Restricted to a safe charset because the
 * file name is derived from user input.
 */
export function storageExtension(name: string, mimeType: string): string {
  const ext = extensionOf(name);
  if (ext && /^[a-z0-9]{1,10}$/.test(ext)) return ext;
  const fromMime = Object.entries(EXTENSION_MIME).find(([, m]) => m === mimeType);
  return fromMime ? fromMime[0] : 'bin';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}
