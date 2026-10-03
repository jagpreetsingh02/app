import { create } from 'zustand';

import { errorMessage } from '../domain/errors';
import type { AvailabilityService, ScanReport } from '../services/AvailabilityService';
import { notifyArchiveChanged } from './archiveStore';

export type ScanReason = 'launch' | 'foreground' | 'manual';

/** Automatic (launch/foreground) scans are skipped if one finished this recently. */
export const AUTO_SCAN_MIN_INTERVAL_MS = 60_000;

interface AvailabilityState {
  scanning: boolean;
  progress: { checked: number; total: number } | null;
  lastReport: ScanReport | null;
  lastFinishedAt: number | null;
  error: string | null;
  runScan(service: AvailabilityService, reason: ScanReason): Promise<void>;
}

/** Scan progress and the latest report, shared by the Integrity screen and background scans. */
export const useAvailabilityStore = create<AvailabilityState>((set, get) => ({
  scanning: false,
  progress: null,
  lastReport: null,
  lastFinishedAt: null,
  error: null,

  async runScan(service, reason) {
    const { scanning, lastFinishedAt } = get();
    if (scanning) return;
    if (reason !== 'manual' && lastFinishedAt && Date.now() - lastFinishedAt < AUTO_SCAN_MIN_INTERVAL_MS) return;

    set({ scanning: true, progress: null, error: null });
    try {
      const report = await service.scan({ onProgress: (checked, total) => set({ progress: { checked, total } }) });
      set({ lastReport: report, lastFinishedAt: Date.now() });
      if (report.changed > 0) notifyArchiveChanged();
    } catch (err) {
      set({ error: errorMessage(err) });
    } finally {
      set({ scanning: false });
    }
  },
}));
