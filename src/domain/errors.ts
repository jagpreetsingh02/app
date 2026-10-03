/**
 * Typed errors so services can report a stable `code` (used in tests and the
 * import summary) plus a human-readable message (shown to the user).
 */

export type ImportErrorCode =
  | 'SOURCE_UNREADABLE'
  | 'SOURCE_EMPTY'
  | 'COPY_FAILED'
  | 'SIZE_MISMATCH'
  | 'HASH_FAILED'
  | 'MOVE_FAILED'
  | 'DB_FAILED'
  | 'SIMULATED_CRASH'
  | 'UNKNOWN';

export class ImportError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Thrown when the user cancels; never shown as a failure. */
export class CancelledError extends Error {
  constructor() {
    super('Import cancelled');
    this.name = 'CancelledError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

/** Validation problems the UI should show verbatim (e.g. duplicate tag name). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
