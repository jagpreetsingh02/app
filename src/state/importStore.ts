import { create } from 'zustand';

import { SimulatedCrashError, errorMessage } from '../domain/errors';
import type { ImportOutcome, ImportSource, ImportStep, ImportSummary } from '../domain/types';
import { CancelToken } from '../services/concurrency';
import { summarize, type ImportService } from '../services/ImportService';
import { notifyArchiveChanged } from './archiveStore';

export interface ImportItemView {
  index: number;
  name: string;
  size: number | null;
  step: ImportStep;
  outcome: ImportOutcome | null;
}

interface ImportState {
  phase: 'idle' | 'running' | 'finished';
  items: ImportItemView[];
  summary: ImportSummary | null;
  /** Set when the run itself aborted (only the debug crash simulation). */
  fatalError: string | null;
  cancelRequested: boolean;

  start(importer: ImportService, sources: ImportSource[], options?: { simulateCrash?: boolean }): Promise<void>;
  cancel(): void;
  keepDuplicate(importer: ImportService, index: number): Promise<void>;
  /** Closes the sheet and deletes the picker copies of duplicates not kept. */
  dismiss(importer: ImportService): void;
}

// Not part of the rendered state; only the running import needs it.
let activeToken: CancelToken | null = null;

export const useImportStore = create<ImportState>((set, get) => ({
  phase: 'idle',
  items: [],
  summary: null,
  fatalError: null,
  cancelRequested: false,

  async start(importer, sources, options = {}) {
    if (get().phase === 'running') return;
    const token = new CancelToken();
    activeToken = token;
    set({
      phase: 'running',
      summary: null,
      fatalError: null,
      cancelRequested: false,
      items: sources.map((s, index) => ({ index, name: s.name, size: s.size, step: 'queued', outcome: null })),
    });

    try {
      const summary = await importer.importFiles(sources, {
        token,
        // Hard-wired off in production builds, whatever the caller passes.
        simulateCrashAfterMove: __DEV__ && options.simulateCrash === true,
        onProgress: (index, step) => updateItem(set, index, { step }),
      });
      set((state) => ({
        phase: 'finished',
        summary,
        items: state.items.map((item) => ({ ...item, step: 'done', outcome: summary.results[item.index].outcome })),
      }));
      notifyArchiveChanged();
    } catch (err) {
      const message =
        err instanceof SimulatedCrashError
          ? 'Simulated crash: the import stopped between saving the file and recording it. Restart the app; startup cleanup will remove the orphaned file.'
          : errorMessage(err);
      set({ phase: 'finished', fatalError: message });
      notifyArchiveChanged();
    } finally {
      activeToken = null;
    }
  },

  cancel() {
    activeToken?.cancel();
    set({ cancelRequested: true });
  },

  async keepDuplicate(importer, index) {
    const item = get().items[index];
    if (get().phase === 'running' || item?.outcome?.kind !== 'duplicate') return;
    const source = item.outcome.source;
    set({ phase: 'running', cancelRequested: false });
    updateItem(set, index, { step: 'queued', outcome: null });

    const token = new CancelToken();
    activeToken = token;
    try {
      const summary = await importer.importFiles([source], {
        token,
        allowDuplicates: new Set([0]),
        onProgress: (_i, step) => updateItem(set, index, { step }),
      });
      updateItem(set, index, { step: 'done', outcome: summary.results[0].outcome });
    } catch (err) {
      updateItem(set, index, { step: 'done', outcome: { kind: 'failed', code: 'UNKNOWN', reason: errorMessage(err) } });
    } finally {
      activeToken = null;
      notifyArchiveChanged();
      set((state) => ({
        phase: 'finished',
        summary: summarize(
          state.items.map((i) => ({ index: i.index, name: i.name, outcome: i.outcome ?? { kind: 'cancelled' } })),
          state.summary?.wasCancelled ?? false,
        ),
      }));
    }
  },

  dismiss(importer) {
    if (get().phase === 'running') return;
    const unkept = get()
      .items.map((item) => item.outcome)
      .flatMap((outcome) => (outcome?.kind === 'duplicate' ? [outcome.source] : []));
    void importer.releaseSources(unkept);
    set({ phase: 'idle', items: [], summary: null, fatalError: null, cancelRequested: false });
  },
}));

function updateItem(
  set: (fn: (state: ImportState) => Partial<ImportState>) => void,
  index: number,
  patch: Partial<ImportItemView>,
): void {
  set((state) => ({
    items: state.items.map((item) => (item.index === index ? { ...item, ...patch } : item)),
  }));
}
