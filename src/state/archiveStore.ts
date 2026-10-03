import { create } from 'zustand';

/**
 * A change counter for the archive. Anything that modifies entries (import,
 * rename, remove, tag edits) bumps it; screens that show archive data reload
 * when it changes. Simple and explicit, no query cache needed.
 */
export const useArchiveVersion = create<{ version: number }>(() => ({ version: 0 }));

export function notifyArchiveChanged(): void {
  useArchiveVersion.setState((s) => ({ version: s.version + 1 }));
}
