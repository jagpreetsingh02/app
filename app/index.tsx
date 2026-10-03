import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Stack } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ArchiveScreen } from '../src/ui/screens/ArchiveScreen';
import { spacing, useTheme, TOUCH_TARGET } from '../src/ui/theme/theme';

export default function ArchiveRoute() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <Link href="/tags" asChild>
                <Pressable accessibilityLabel="Tags" hitSlop={8} style={{ minWidth: TOUCH_TARGET, alignItems: 'center' }}>
                  <Ionicons name="pricetags-outline" size={22} color={colors.text} />
                </Pressable>
              </Link>
              <Link href="/integrity" asChild>
                <Pressable accessibilityLabel="Integrity scan" hitSlop={8} style={{ minWidth: TOUCH_TARGET, alignItems: 'center' }}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={colors.text} />
                </Pressable>
              </Link>
            </View>
          ),
        }}
      />
      <ArchiveScreen />
    </>
  );
}
