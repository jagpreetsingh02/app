import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../domain/errors';
import type { Tag } from '../../domain/types';
import { notifyArchiveChanged } from '../../state/archiveStore';
import { MAX_TAG_LENGTH, TagService } from '../../services/TagService';
import { useLoader } from '../hooks';
import { useServices } from '../ServicesProvider';
import { radius, spacing, type, useTheme, TOUCH_TARGET } from '../theme/theme';

/**
 * Edit a file's tags: type to filter, tap to toggle, or create a new tag from
 * what you typed. Each tap is saved immediately.
 */
export function TagPickerSheet({
  visible,
  fileId,
  assigned,
  onClose,
}: {
  visible: boolean;
  fileId: string;
  assigned: Tag[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { tags } = useServices();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const all = useLoader(() => tags.list(), [tags, revision, visible]);

  const assignedIds = new Set(assigned.map((t) => t.id));
  const name = TagService.normalizeName(text);
  const visibleTags = (all.data ?? []).filter((t) => t.name.toLowerCase().includes(name.toLowerCase()));
  const exactMatch = (all.data ?? []).some((t) => t.name.toLowerCase() === name.toLowerCase());

  const run = async (work: () => Promise<unknown>) => {
    try {
      setError(null);
      await work();
      setRevision((r) => r + 1);
      notifyArchiveChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggle = (tag: Tag) =>
    run(() => (assignedIds.has(tag.id) ? tags.unassign(fileId, tag.id) : tags.assign(fileId, tag.id)));

  const create = () =>
    run(async () => {
      await tags.addToFile(fileId, name);
      setText('');
    });

  const close = () => {
    setText('');
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
      >
        <Pressable style={styles.dismissArea} onPress={close} accessibilityLabel="Close tag editor" />
        <View
          style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + spacing.lg }]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <Text style={[type.heading, styles.title, { color: colors.text }]} accessibilityRole="header">
              Tags
            </Text>
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={[type.bodyStrong, { color: colors.accent }]}>Done</Text>
            </Pressable>
          </View>

          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError(null);
            }}
            placeholder="Find or create a tag"
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_TAG_LENGTH}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => name && !exactMatch && create()}
            accessibilityLabel="Find or create a tag"
            style={[type.body, styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
          {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}

          <FlatList
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            data={visibleTags}
            keyExtractor={(t) => t.id}
            ListHeaderComponent={
              name && !exactMatch ? (
                <Pressable onPress={create} accessibilityRole="button" style={styles.row}>
                  <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
                  <Text style={[type.bodyStrong, styles.rowLabel, { color: colors.accent }]} numberOfLines={1}>
                    Create “{name}”
                  </Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              !name ? (
                <Text style={[type.body, styles.hint, { color: colors.textMuted }]}>
                  No tags yet. Type a name above to create one.
                </Text>
              ) : null
            }
            renderItem={({ item }) => {
              const on = assignedIds.has(item.id);
              return (
                <Pressable
                  onPress={() => toggle(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={on ? colors.accent : colors.textMuted}
                  />
                  <Text style={[type.body, styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[type.caption, { color: colors.textMuted }]}>{item.fileCount}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  dismissArea: { flex: 1 },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  input: { minHeight: TOUCH_TARGET, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TOUCH_TARGET, paddingHorizontal: spacing.xs, borderRadius: radius.sm },
  rowLabel: { flex: 1 },
  hint: { paddingVertical: spacing.lg, textAlign: 'center' },
});
