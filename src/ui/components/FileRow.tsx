import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ArchiveFileWithTags } from '../../domain/types';
import { CATEGORY_LABEL, formatBytes, formatDate } from '../format';
import { radius, spacing, type, useTheme } from '../theme/theme';
import { TagPills } from './Chip';
import { FileThumb } from './FileThumb';
import { STATUS_LABEL, StatusBadge } from './StatusBadge';

export const FileRow = memo(function FileRow({
  file,
  onPress,
}: {
  file: ArchiveFileWithTags;
  onPress: (file: ArchiveFileWithTags) => void;
}) {
  const { colors } = useTheme();
  const meta = `${CATEGORY_LABEL[file.category]} · ${formatBytes(file.sizeBytes)} · ${formatDate(file.importedAt)}`;
  const flagged = file.status !== 'available';
  const tagNames = file.tags.map((t) => t.name);

  return (
    <Pressable
      onPress={() => onPress(file)}
      accessibilityRole="button"
      accessibilityLabel={[
        file.displayName,
        meta,
        flagged ? `Warning: ${STATUS_LABEL[file.status]}` : null,
        tagNames.length ? `Tags: ${tagNames.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint="Opens details"
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
          borderColor: flagged ? (file.status === 'missing' ? colors.danger : colors.warning) : colors.border,
          borderWidth: flagged ? 1 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <FileThumb file={file} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[type.bodyStrong, styles.name, { color: colors.text }]} numberOfLines={1}>
            {file.displayName}
          </Text>
          <StatusBadge status={file.status} />
        </View>
        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
          {meta}
        </Text>
        {tagNames.length > 0 ? <TagPills names={tagNames} /> : null}
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
    minHeight: 68,
  },
  body: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
});
