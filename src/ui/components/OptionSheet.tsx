import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing, type, useTheme, TOUCH_TARGET } from '../theme/theme';

/** Bottom sheet with a single-choice list (used for sorting). */
export function OptionSheet<T>({
  visible,
  title,
  options,
  selected,
  getLabel,
  isSame,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: T[];
  selected: T;
  getLabel: (option: T) => string;
  isSame: (a: T, b: T) => boolean;
  onSelect: (option: T) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close">
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + spacing.lg }]}
          accessibilityViewIsModal
        >
          <Text style={[type.heading, styles.title, { color: colors.text }]} accessibilityRole="header">
            {title}
          </Text>
          {options.map((option) => {
            const active = isSame(option, selected);
            return (
              <Pressable
                key={getLabel(option)}
                onPress={() => {
                  onSelect(option);
                  onClose();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <Text style={[active ? type.bodyStrong : type.body, styles.label, { color: active ? colors.accent : colors.text }]}>
                  {getLabel(option)}
                </Text>
                {active ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.lg },
  title: { paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  option: {
    minHeight: TOUCH_TARGET + 4,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: { flex: 1 },
});
