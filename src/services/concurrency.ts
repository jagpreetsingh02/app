import { CancelledError } from '../domain/errors';

/** Cooperative cancellation: the pipeline calls `throwIfCancelled()` between steps. */
export class CancelToken {
  private cancelled = false;

  get isCancelled(): boolean {
    return this.cancelled;
  }

  cancel(): void {
    this.cancelled = true;
  }

  throwIfCancelled(): void {
    if (this.cancelled) throw new CancelledError();
  }
}

/**
 * Minimal async mutex. Import and reconciliation both take the "archive lock"
 * so startup cleanup can never delete a file that an import has just moved
 * into archive/ but not yet recorded, nor wipe an in-flight staging file.
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.tail.then(work);
    // The next waiter starts after this one settles, success or failure.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

/**
 * Runs `worker` over `items` with at most `limit` in flight, preserving result
 * order. Normal failures are returned as results by the workers; a thrown
 * error (only the simulated crash) stops that lane, and the pool rejects only
 * after every lane has stopped, so nothing keeps running behind the caller.
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  const settled = await Promise.allSettled(lanes);
  const failure = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
  if (failure) throw failure.reason;
  return results;
}
