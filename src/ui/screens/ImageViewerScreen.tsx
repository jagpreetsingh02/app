import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { notifyArchiveChanged } from '../../state/archiveStore';
import { Button } from '../components/Button';
import { useLoader } from '../hooks';
import { useServices } from '../ServicesProvider';
import { spacing, type } from '../theme/theme';

/**
 * Full-screen in-app image viewer. If the image cannot be decoded, the entry
 * is marked unreadable and the user gets an explanation instead of a blank
 * screen.
 */
export function ImageViewerScreen({ id }: { id: string }) {
  const { archive, opener } = useServices();
  const detail = useLoader(() => archive.getDetail(id), [archive, id]);
  const [failed, setFailed] = useState(false);
  const file = detail.data;

  const onError = () => {
    setFailed(true);
    opener
      .reportDisplayFailure(id)
      .then(notifyArchiveChanged)
      .catch(() => undefined); // the message below is shown either way
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: file?.displayName ?? '',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#000' },
        }}
      />
      {!file ? (
        detail.kind === 'loading' ? (
          <ActivityIndicator color="#fff" accessibilityLabel="Loading image" />
        ) : (
          <Message text="This entry is no longer in the archive." />
        )
      ) : failed ? (
        <Message text="This image couldn’t be displayed, so it has been marked unreadable. Its details are still in the archive." />
      ) : (
        <Image
          source={{ uri: archive.fileUri(file) }}
          style={styles.image}
          contentFit="contain"
          onError={onError}
          accessibilityLabel={file.displayName}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

function Message({ text }: { text: string }) {
  return (
    <View style={styles.message}>
      <Ionicons name="image-outline" size={40} color="#aaa" />
      <Text style={[type.body, styles.messageText]}>{text}</Text>
      <Button label="Back" variant="secondary" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  message: { alignItems: 'center', gap: spacing.lg, padding: spacing.xl },
  messageText: { color: '#eee', textAlign: 'center' },
});
