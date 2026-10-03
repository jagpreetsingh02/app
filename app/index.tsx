import { Stack, router } from 'expo-router';
import { View } from 'react-native';

import { IconButton } from '../src/ui/components/IconButton';
import { ArchiveScreen } from '../src/ui/screens/ArchiveScreen';

export default function ArchiveRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              {__DEV__ ? <IconButton icon="bug-outline" label="Debug tools" onPress={() => router.push('/debug')} /> : null}
              <IconButton icon="pricetags-outline" label="Tags" hint="Create, delete and browse tags" onPress={() => router.push('/tags')} />
              <IconButton
                icon="shield-checkmark-outline"
                label="Integrity scan"
                hint="Checks every archived file"
                onPress={() => router.push('/integrity')}
              />
            </View>
          ),
        }}
      />
      <ArchiveScreen />
    </>
  );
}
