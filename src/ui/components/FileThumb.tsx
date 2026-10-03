import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ArchiveFile } from '../../domain/types';
import { CATEGORY_ICON } from '../format';
import { useServices } from '../ServicesProvider';
import { radius, useTheme } from '../theme/theme';

/**
 * Image thumbnail for available images, type icon otherwise. If the image
 * fails to decode (corrupt or removed since the last check) we fall back to
 * the icon instead of showing a broken image.
 */
export function FileThumb({ file, size = 44 }: { file: ArchiveFile; size?: number }) {
  const { colors } = useTheme();
  const { archive } = useServices();
  const [failed, setFailed] = useState(false);
  const showImage = file.category === 'image' && file.status === 'available' && !failed;
  const box = { width: size, height: size, borderRadius: size > 60 ? radius.md : radius.sm };

  return (
    <View style={[styles.box, box, { backgroundColor: colors.accentSoft }]}>
      {showImage ? (
        <Image
          source={{ uri: archive.fileUri(file) }}
          style={box}
          contentFit="cover"
          transition={120}
          recyclingKey={file.id}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name={CATEGORY_ICON[file.category]} size={Math.round(size / 2)} color={colors.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
