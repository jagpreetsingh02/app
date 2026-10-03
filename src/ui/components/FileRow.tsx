import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ArchiveFileWithTags } from '../../domain/types';
import { CATEGORY_ICON, CATEGORY_LABEL, formatBytes, formatDate } from '../format';
import { radius, spacing, type, useTheme } from '../theme/theme';

export const FileRow = memo(function FileRow({
  file,
  onPress,
}: {
  file: ArchiveFileWithTags;
  onPress?: (file: ArchiveFileWithTags) => void;
}) {
  const { colors } = useTheme();
  const meta = `${CATEGORY_LABEL[file.category]} · ${formatBytes(file.sizeBytes)} · ${formatDate(file.importedAt)}`;

  return (
    <Pressable
      onPress={() => onPress?.(file)}
      accessibilityRole="button"
      accessibilityLabel={`${file.displayName}, ${meta}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={CATEGORY_ICON[file.category]} size={22} color={colors.accent} />
      </View>
      <View style={styles.body}>
        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {file.displayName}
        </Text>
        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
  },
  icon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
});
