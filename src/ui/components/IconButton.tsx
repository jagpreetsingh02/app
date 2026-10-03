import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { radius, useTheme, TOUCH_TARGET } from '../theme/theme';

/**
 * Icon-only button with a 48dp touch target. `label` is required because an
 * icon alone means nothing to a screen reader.
 */
export function IconButton({
  icon,
  label,
  onPress,
  color,
  bordered = false,
  size = 22,
  hint,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  color?: string;
  bordered?: boolean;
  size?: number;
  hint?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.button,
        bordered && { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
    >
      <Ionicons name={icon} size={size} color={color ?? colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
