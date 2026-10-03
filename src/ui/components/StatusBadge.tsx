import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import type { FileStatus } from '../../domain/types';
import { radius, spacing, type, useTheme } from '../theme/theme';

export const STATUS_LABEL: Record<FileStatus, string> = {
  available: 'Available',
  missing: 'Missing',
  unreadable: 'Unreadable',
};

/** Warning badge; renders nothing for healthy entries. */
export function StatusBadge({ status }: { status: FileStatus }) {
  const { colors } = useTheme();
  if (status === 'available') return null;
  const tone =
    status === 'missing'
      ? { fg: colors.danger, bg: colors.dangerSoft, icon: 'alert-circle' as const }
      : { fg: colors.warning, bg: colors.warningSoft, icon: 'warning' as const };
  return (
    <View
      style={[styles.badge, { backgroundColor: tone.bg }]}
      accessible
      accessibilityLabel={`Warning: file ${STATUS_LABEL[status].toLowerCase()}`}
    >
      <Ionicons name={tone.icon} size={13} color={tone.fg} />
      <Text style={[type.caption, styles.text, { color: tone.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { fontWeight: '600' },
});
