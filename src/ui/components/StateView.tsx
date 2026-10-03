import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type, useTheme } from '../theme/theme';
import { Button } from './Button';

type Tone = 'neutral' | 'accent' | 'danger';

/** One consistent layout for empty, no-results and error states. */
export function StateView({
  icon,
  title,
  body,
  tone = 'neutral',
  action,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body?: string;
  tone?: Tone;
  action?: { label: string; onPress: () => void; icon?: ComponentProps<typeof Ionicons>['name'] };
}) {
  const { colors } = useTheme();
  const palette = {
    neutral: { fg: colors.textMuted, bg: colors.surfaceAlt },
    accent: { fg: colors.accent, bg: colors.accentSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
  }[tone];

  return (
    <View style={styles.container} accessible={!action} accessibilityLabel={!action ? [title, body].filter(Boolean).join('. ') : undefined}>
      <View style={[styles.icon, { backgroundColor: palette.bg }]}>
        <Ionicons name={icon} size={30} color={palette.fg} />
      </View>
      <Text style={[type.heading, styles.center, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={[type.body, styles.center, { color: colors.textMuted }]}>{body}</Text> : null}
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} icon={action.icon} variant="secondary" onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  icon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  center: { textAlign: 'center' },
  action: { marginTop: spacing.sm, minWidth: 180 },
});
