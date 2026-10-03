import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AvailabilityMonitor } from '../src/ui/AvailabilityMonitor';
import { ServicesProvider } from '../src/ui/ServicesProvider';
import { useTheme } from '../src/ui/theme/theme';

export default function RootLayout() {
  const { colors, dark } = useTheme();

  // Native root view colour (seen behind screen transitions and the keyboard);
  // without this, dark mode flashes white.
  useEffect(() => {
    setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  return (
    <SafeAreaProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ServicesProvider>
        <AvailabilityMonitor />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Archive' }} />
          <Stack.Screen name="file/[id]" options={{ title: '' }} />
          <Stack.Screen name="tags" options={{ title: 'Tags' }} />
          <Stack.Screen name="integrity" options={{ title: 'Integrity' }} />
          <Stack.Screen name="viewer/[id]" options={{ title: '' }} />
          {__DEV__ ? <Stack.Screen name="debug" options={{ title: 'Debug tools' }} /> : null}
        </Stack>
      </ServicesProvider>
    </SafeAreaProvider>
  );
}
