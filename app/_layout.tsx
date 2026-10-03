import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ServicesProvider } from '../src/ui/ServicesProvider';
import { useTheme } from '../src/ui/theme/theme';

export default function RootLayout() {
  const { colors, dark } = useTheme();

  return (
    <SafeAreaProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ServicesProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Archive' }} />
          <Stack.Screen name="file/[id]" options={{ title: '' }} />
          <Stack.Screen name="tags" options={{ title: 'Tags' }} />
          <Stack.Screen name="integrity" options={{ title: 'Integrity' }} />
        </Stack>
      </ServicesProvider>
    </SafeAreaProvider>
  );
}
