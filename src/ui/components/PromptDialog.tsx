import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '../../domain/errors';
import { radius, spacing, type, useTheme, TOUCH_TARGET } from '../theme/theme';
import { Button } from './Button';

/**
 * Cross-platform text prompt (Alert.prompt is iOS-only). `onSubmit` may throw
 * a ValidationError; its message is shown inline and the dialog stays open.
 */
export function PromptDialog({
  visible,
  title,
  initialValue = '',
  placeholder,
  submitLabel = 'Save',
  maxLength,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  maxLength?: number;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setError(null);
    }
  }, [visible, initialValue]);

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(value);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
      >
        <View style={[styles.card, { backgroundColor: colors.background }]} accessibilityViewIsModal>
          <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
            {title}
          </Text>
          <TextInput
            value={value}
            onChangeText={(text) => {
              setValue(text);
              setError(null);
            }}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            maxLength={maxLength}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel={title}
            style={[
              type.body,
              styles.input,
              { color: colors.text, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border },
            ]}
          />
          {error ? (
            <Text style={[type.caption, { color: colors.danger }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label="Cancel" variant="secondary" onPress={onClose} />
            </View>
            <View style={styles.action}>
              <Button label={submitLabel} onPress={submit} busy={busy} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  card: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  input: { minHeight: TOUCH_TARGET, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  action: { flex: 1 },
});
