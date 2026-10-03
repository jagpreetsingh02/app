import { NoViewerAppError, NotFoundError, errorMessage } from '../domain/errors';
import type { ArchiveFile } from '../domain/types';
import type { ExternalViewer } from '../storage/ExternalViewer';
import type { AvailabilityService } from './AvailabilityService';

export type OpenResult =
  /** Images are shown by the app's own viewer. */
  | { kind: 'show-in-app'; file: ArchiveFile }
  | { kind: 'opened'; file: ArchiveFile }
  /** The file is missing or unreadable; its status has been updated. */
  | { kind: 'unavailable'; file: ArchiveFile; message: string }
  /** The file is healthy but no installed app handles this type. */
  | { kind: 'no-viewer'; file: ArchiveFile; message: string }
  /** Launching failed for another reason; the entry is now marked unreadable. */
  | { kind: 'failed'; file: ArchiveFile; message: string };

/**
 * Opening a file never throws for file problems. It re-checks availability
 * first (on-demand check), so a file deleted since the last scan is reported
 * as missing instead of handing a broken URI to another app.
 */
export class OpenService {
  constructor(private readonly deps: { availability: AvailabilityService; viewer: ExternalViewer }) {}

  async open(id: string): Promise<OpenResult> {
    const checked = await this.deps.availability.checkFile(id);
    if (!checked) throw new NotFoundError('Archive entry');
    const { file, result } = checked;

    if (result.status !== 'available') {
      const message =
        result.status === 'missing'
          ? 'This file is no longer in the archive’s storage. Its details are kept; you can re-link it from the file’s page.'
          : `This file can’t be read. ${result.reason ?? ''}`.trim();
      return { kind: 'unavailable', file, message };
    }

    if (file.category === 'image') return { kind: 'show-in-app', file };

    try {
      await this.deps.viewer.open(file.storagePath, file.mimeType);
      return { kind: 'opened', file };
    } catch (err) {
      if (err instanceof NoViewerAppError) {
        return { kind: 'no-viewer', file, message: `${err.message} Install a viewer app and try again.` };
      }
      await this.deps.availability.markUnreadable(file.id);
      return {
        kind: 'failed',
        file: { ...file, status: 'unreadable' },
        message: `The file couldn’t be opened, so it has been marked unreadable. (${errorMessage(err)})`,
      };
    }
  }

  /** Called by the in-app image viewer when the image fails to decode. */
  reportDisplayFailure(id: string): Promise<void> {
    return this.deps.availability.markUnreadable(id);
  }
}
