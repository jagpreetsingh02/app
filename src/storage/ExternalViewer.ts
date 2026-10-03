import { File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { shareAsync } from 'expo-sharing';
import { Platform } from 'react-native';

import { NoViewerAppError, errorMessage } from '../domain/errors';

/** Hands an archived file to another app for viewing. */
export interface ExternalViewer {
  /** Rejects with NoViewerAppError if nothing can open it, or another error if launching failed. */
  open(path: string, mimeType: string): Promise<void>;
}

// android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const LAUNCH_GRACE_MS = 1500;

/**
 * Android: ACTION_VIEW with a content:// URI from expo-file-system's
 * FileProvider (`File.contentUri`) and a temporary read grant, so the viewer
 * can read our private file without us exposing a file:// path.
 * iOS: the share sheet, which includes "Open in…" / Quick Look options.
 */
export class ExpoExternalViewer implements ExternalViewer {
  async open(path: string, mimeType: string): Promise<void> {
    const file = new File(Paths.document, ...path.split('/').filter(Boolean));

    if (Platform.OS !== 'android') {
      await shareAsync(file.uri, { mimeType, dialogTitle: 'Open with…' });
      return;
    }

    const launch = startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      type: mimeType,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
    // startActivityAsync only resolves when the user comes BACK from the
    // viewer. Launch failures reject immediately, so wait briefly for those
    // and otherwise treat the viewer as opened.
    launch.catch(() => undefined); // a late rejection after the grace period is not actionable
    try {
      await Promise.race([launch, delay(LAUNCH_GRACE_MS)]);
    } catch (err) {
      if (/No Activity found|ActivityNotFound/i.test(errorMessage(err))) throw new NoViewerAppError(mimeType);
      throw err;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
