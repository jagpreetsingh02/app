import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { createAppServices, type AppServices } from '../bootstrap';
import { errorMessage } from '../domain/errors';
import { radius, spacing, type, useTheme, TOUCH_TARGET } from './theme/theme';

const ServicesContext = createContext<AppServices | null>(null);

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; services: AppServices }
  | { kind: 'error'; message: string };

/**
 * Opens the database before rendering any screen. If that fails (e.g. disk
 * full, corrupted DB) the user sees an explanation and a retry button instead
 * of a crash.
 */
export function ServicesProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const start = useCallback(() => {
    setState({ kind: 'loading' });
    createAppServices()
      .then((services) => setState({ kind: 'ready', services }))
      .catch((err: unknown) => setState({ kind: 'error', message: errorMessage(err) }));
  }, []);

  useEffect(start, [start]);

  if (state.kind === 'ready') {
    return <ServicesContext.Provider value={state.services}>{children}</ServicesContext.Provider>;
  }

  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      {state.kind === 'loading' ? (
        <ActivityIndicator color={colors.accent} accessibilityLabel="Opening archive" />
      ) : (
        <>
          <Text style={[type.heading, { color: colors.text }]}>Could not open the archive</Text>
          <Text style={[type.body, styles.message, { color: colors.textMuted }]}>
            {state.message}
          </Text>
          <Pressable
            onPress={start}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: colors.accent }]}
          >
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Try again</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>');
  return services;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  message: { textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  button: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
