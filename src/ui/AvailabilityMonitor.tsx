import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAvailabilityStore } from '../state/availabilityStore';
import { useServices } from './ServicesProvider';

/**
 * Renders nothing. Runs the availability scan in the background after
 * startup cleanup has finished, and again whenever the app returns to the
 * foreground (files may have been deleted while it was in the background).
 * Nothing waits on it: the archive is usable immediately.
 */
export function AvailabilityMonitor() {
  const { availability, reconciliation } = useServices();
  const runScan = useAvailabilityStore((s) => s.runScan);

  useEffect(() => {
    let mounted = true;
    void reconciliation.then(() => {
      if (mounted) void runScan(availability, 'launch');
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runScan(availability, 'foreground');
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [availability, reconciliation, runScan]);

  return null;
}
