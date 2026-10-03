import { useEffect, useState } from 'react';

/** Returns `value` once it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type LoadState<T> =
  | { kind: 'loading'; data: T | null }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; message: string; data: T | null };

/**
 * Runs `load` whenever `deps` change, ignoring results of superseded calls
 * (fast typing must not let an older, slower query overwrite a newer one).
 * Keeps showing the previous data while reloading, to avoid flicker.
 */
export function useLoader<T>(load: () => Promise<T>, deps: readonly unknown[]): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ kind: 'loading', data: null });

  useEffect(() => {
    let current = true;
    setState((prev) => ({ kind: 'loading', data: prev.data }));
    load().then(
      (data) => current && setState({ kind: 'ready', data }),
      (err: unknown) =>
        current &&
        setState((prev) => ({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
          data: prev.data,
        })),
    );
    return () => {
      current = false;
    };
  }, deps);

  return state;
}
