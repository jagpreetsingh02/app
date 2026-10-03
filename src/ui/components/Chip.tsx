import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, type, useTheme } from '../theme/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Filter chip (toggleable) or removable tag chip. */
export function Chip({
  label,
  selected = false,
  icon,
  onPress,
  onRemove,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress?: () => void;
  onRemove?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const fg = selected ? colors.onAccent : colors.text;
  return (
    <Pressable
      onPress={onPress ?? onRemove}
      disabled={!onPress && !onRemove}
      accessibilityRole={onPress ? 'checkbox' : 'button'}
      accessibilityState={onPress ? { checked: selected } : undefined}
      accessibilityLabel={accessibilityLabel ?? (onRemove ? `Remove ${label}` : label)}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.accent : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Text style={[type.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? <Ionicons name="close" size={15} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

/** Small read-only tag pills for list rows. */
export function TagPills({ names, max = 3 }: { names: string[]; max?: number }) {
  const { colors } = useTheme();
  if (names.length === 0) return null;
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <View style={styles.pills}>
      {shown.map((name) => (
        <View key={name} style={[styles.pill, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
            #{name}
          </Text>
        </View>
      ))}
      {extra > 0 ? <Text style={[type.caption, { color: colors.textMuted }]}>+{extra}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 220,
  },
  pills: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, maxWidth: 140 },
});
