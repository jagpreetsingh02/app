import { getDocumentAsync } from 'expo-document-picker';

import type { ImportSource } from '../domain/types';

/**
 * Opens the system picker and normalises the result into ImportSources.
 * Returns null if the user dismissed the picker.
 *
 * copyToCacheDirectory: true makes the picker hand back a file:// copy in the
 * app cache. Android content:// URIs are not reliably readable by the file
 * system API afterwards, and the copy also means the user's original file is
 * never opened for writing by us.
 */
export async function pickImportSources(): Promise<ImportSource[] | null> {
  const result = await getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
  if (result.canceled) return null;
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name || 'Untitled',
    mimeType: asset.mimeType ?? null,
    size: asset.size ?? null,
    lastModified: asset.lastModified ?? null,
  }));
}
