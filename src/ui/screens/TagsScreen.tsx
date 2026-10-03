import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../domain/errors';
import type { TagWithCount } from '../../domain/types';
import { MAX_TAG_LENGTH } from '../../services/TagService';
import { notifyArchiveChanged, useArchiveVersion } from '../../state/archiveStore';
import { useFilterStore } from '../../state/filterStore';
import { Button } from '../components/Button';
import { useLoader } from '../hooks';
import { useServices } from '../ServicesProvider';
import { radius, spacing, type, useTheme, TOUCH_TARGET } from '../theme/theme';

export function TagsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { tags } = useServices();
  const version = useArchiveVersion((s) => s.version);
  const list = useLoader(() => tags.list(), [tags, version]);
  const setTagFilter = useFilterStore((s) => s.setTag);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      await tags.create(name);
      setName('');
      setError(null);
      notifyArchiveChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = (tag: TagWithCount) => {
    const usage =
      tag.fileCount === 0
        ? 'It is not used by any file.'
        : `It will be removed from ${tag.fileCount} ${tag.fileCount === 1 ? 'file' : 'files'}.`;
    Alert.alert(`Delete tag “${tag.name}”?`, `${usage} The files themselves stay in the archive.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete tag',
        style: 'destructive',
        onPress: async () => {
          try {
            await tags.delete(tag.id);
            if (useFilterStore.getState().tag?.id === tag.id) setTagFilter(null);
            notifyArchiveChanged();
          } catch (err) {
            Alert.alert('Could not delete the tag', errorMessage(err));
          }
        },
      },
    ]);
  };

  const showFiles = (tag: TagWithCount) => {
    setTagFilter({ id: tag.id, name: tag.name, createdAt: tag.createdAt });
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.createRow}>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="New tag name"
          placeholderTextColor={colors.textMuted}
          maxLength={MAX_TAG_LENGTH}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={create}
          accessibilityLabel="New tag name"
          style={[type.body, styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border }]}
        />
        <Button label="Create" onPress={create} busy={creating} disabled={!name.trim()} />
      </View>
      {error ? (
        <Text style={[type.caption, styles.error, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <FlatList
        data={list.data ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          list.kind === 'loading' ? null : (
            <View style={styles.empty}>
              <Ionicons name="pricetags-outline" size={32} color={colors.textMuted} />
              <Text style={[type.heading, { color: colors.text }]}>No tags yet</Text>
              <Text style={[type.body, styles.emptyBody, { color: colors.textMuted }]}>
                Create tags here or from a file’s detail screen, then search or filter by them.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              onPress={() => showFiles(item)}
              style={styles.rowMain}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, used by ${item.fileCount} ${item.fileCount === 1 ? 'file' : 'files'}`}
              accessibilityHint="Shows these files in the archive"
            >
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                #{item.name}
              </Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                {item.fileCount} {item.fileCount === 1 ? 'file' : 'files'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => confirmDelete(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Delete tag ${item.name}`}
              style={styles.delete}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  createRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  input: { flex: 1, minHeight: TOUCH_TARGET, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  error: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  list: { padding: spacing.lg, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.lg,
  },
  rowMain: { flex: 1, minHeight: 60, justifyContent: 'center', gap: 2 },
  delete: { width: TOUCH_TARGET + 8, height: 60, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyBody: { textAlign: 'center' },
});
