import { Redirect } from 'expo-router';
import type { ComponentType } from 'react';

// In production builds Metro folds __DEV__ to false and drops this require,
// so the debug screen's code is not even in the bundle.
const DebugScreen: ComponentType | null = __DEV__
  ? require('../src/ui/screens/DebugScreen').DebugScreen
  : null;

export default function DebugRoute() {
  if (!DebugScreen) return <Redirect href="/" />;
  return <DebugScreen />;
}
