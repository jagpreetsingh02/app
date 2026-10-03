import type { FileRepository } from '../data/FileRepository';
import { errorMessage } from '../domain/errors';
import type { ArchiveFile, FileStatus } from '../domain/types';
import type { FileStore } from '../storage/FileStore';
import type { CancelToken } from './concurrency';

export interface CheckResult {
  status: FileStatus;
  /** Modification time of our copy, when it could be read. */
  modifiedAt: number | null;
  /** Why the file is not available (for the UI); null when healthy. */
  reason: string | null;
}

export interface ScanReport {
  checked: number;
  available: number;
  missing: number;
  unreadable: number;
  /** Entries whose status differs from before the scan. */
  changed: number;
  /** Missing and unreadable entries, with their new status. */
  problems: ArchiveFile[];
}

export interface ScanOptions {
  onProgress?: (checked: number, total: number) => void;
  token?: CancelToken;
}

export const SCAN_BATCH_SIZE = 25;

/**
 * Checks that each entry's private copy still exists, can be read, and has
 * the size recorded at import.
 *
 * It ONLY ever updates status, status_checked_at and last_known_modified_at.
 * A missing file never deletes or otherwise changes its record: the metadata
 * stays visible so the user can see what was lost and re-link it.
 */
export class AvailabilityService {
  private runningScan: Promise<ScanReport> | null = null;

  constructor(
    private readonly deps: {
      files: FileRepository;
      store: FileStore;
      now: () => number;
      batchSize?: number;
    },
  ) {}

  /** Classifies one entry without writing anything. */
  async inspect(file: ArchiveFile): Promise<CheckResult> {
    const { store } = this.deps;
    let stat;
    try {
      stat = await store.stat(file.storagePath);
    } catch (err) {
      return { status: 'unreadable', modifiedAt: null, reason: `Cannot access the file: ${errorMessage(err)}` };
    }
    if (!stat.exists) {
      return { status: 'missing', modifiedAt: null, reason: 'The archived copy no longer exists.' };
    }
    if (stat.size !== file.sizeBytes) {
      return {
        status: 'unreadable',
        modifiedAt: stat.modifiedAt,
        reason: `The archived copy has changed size (expected ${file.sizeBytes} bytes, found ${stat.size}).`,
      };
    }
    try {
      await store.probeReadable(file.storagePath);
    } catch (err) {
      return { status: 'unreadable', modifiedAt: stat.modifiedAt, reason: `Cannot read the file: ${errorMessage(err)}` };
    }
    return { status: 'available', modifiedAt: stat.modifiedAt, reason: null };
  }

  /** Checks one entry now and records the result. Returns the updated entry. */
  async checkFile(id: string): Promise<{ file: ArchiveFile; result: CheckResult } | null> {
    const file = await this.deps.files.getById(id);
    if (!file) return null;
    const checkedAt = this.deps.now();
    const result = await this.inspect(file);
    await this.record(file.id, result, checkedAt);
    const updated = (await this.deps.files.getById(id)) ?? file;
    return { file: updated, result };
  }

  /** Records that opening the file failed (it exists but cannot be used). */
  async markUnreadable(id: string): Promise<void> {
    await this.deps.files.updateStatus({ id, status: 'unreadable', checkedAt: this.deps.now(), lastKnownModifiedAt: null });
  }

  /**
   * Checks every entry in batches, yielding to the event loop between batches
   * so the UI stays responsive. Concurrent callers (launch, foreground, the
   * Integrity screen) share the same run instead of scanning twice.
   */
  scan(options: ScanOptions = {}): Promise<ScanReport> {
    if (!this.runningScan) {
      this.runningScan = this.runScan(options).finally(() => {
        this.runningScan = null;
      });
    }
    return this.runningScan;
  }

  get isScanning(): boolean {
    return this.runningScan !== null;
  }

  private async runScan({ onProgress, token }: ScanOptions): Promise<ScanReport> {
    const { files } = this.deps;
    const batchSize = this.deps.batchSize ?? SCAN_BATCH_SIZE;
    const total = await files.count();
    const report: ScanReport = { checked: 0, available: 0, missing: 0, unreadable: 0, changed: 0, problems: [] };
    onProgress?.(0, total);

    let afterId: string | null = null;
    for (;;) {
      if (token?.isCancelled) break;
      const batch = await files.listPage(afterId, batchSize);
      if (batch.length === 0) break;

      for (const file of batch) {
        const checkedAt = this.deps.now();
        const result = await this.inspect(file);
        await this.record(file.id, result, checkedAt);

        report.checked++;
        report[result.status]++;
        if (result.status !== file.status) report.changed++;
        if (result.status !== 'available') report.problems.push({ ...file, status: result.status, statusCheckedAt: checkedAt });
      }

      afterId = batch[batch.length - 1].id;
      onProgress?.(report.checked, Math.max(total, report.checked));
      await yieldToUi();
    }
    return report;
  }

  private async record(id: string, result: CheckResult, checkedAt: number): Promise<void> {
    await this.deps.files.updateStatus({
      id,
      status: result.status,
      checkedAt,
      lastKnownModifiedAt: result.modifiedAt,
    });
  }
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
