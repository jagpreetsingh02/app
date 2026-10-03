import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../domain/errors';
import type { ArchiveFileWithTags } from '../../domain/types';
import { useImportStore } from '../../state/importStore';
import { FileRow } from '../components/FileRow';
import { ImportSheet } from '../components/ImportSheet';
import { useServices } from '../ServicesProvider';
import { radius, spacing, type, useTheme, TOUCH_TARGET } from '../theme/theme';

export function ArchiveScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const services = useServices();
  const archiveVersion = useImportStore((s) => s.archiveVersion);
  const importing = useImportStore((s) => s.phase === 'running');
  const startImport = useImportStore((s) => s.start);

  const [files, setFiles] = useState<ArchiveFileWithTags[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFiles(await services.archive.listAll());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [services]);

  // Reload whenever an import (or later: rename/remove) changed the archive.
  useEffect(() => {
    void load();
  }, [load, archiveVersion]);

  const onImport = async () => {
    try {
      const sources = await services.pickFiles();
      if (sources && sources.length > 0) void startImport(services.importer, sources);
    } catch (err) {
      Alert.alert('Could not open the file picker', errorMessage(err));
    }
  };

  return (
    <View style={styles.container}>
      {files === null && !loadError ? (
        <ActivityIndicator style={styles.center} color={colors.accent} accessibilityLabel="Loading archive" />
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={[type.body, { color: colors.danger }]}>Could not load the archive: {loadError}</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(f) => f.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => <FileRow file={item} />}
          ListEmptyComponent={<EmptyState />}
        />
      )}

      <Pressable
        onPress={onImport}
        disabled={importing}
        accessibilityRole="button"
        accessibilityLabel="Import files"
        accessibilityState={{ disabled: importing }}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: insets.bottom + spacing.xl,
            backgroundColor: colors.accent,
            opacity: importing ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Ionicons name="add" size={24} color={colors.onAccent} />
        <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Import</Text>
      </Pressable>

      <ImportSheet />
    </View>
  );
}

function EmptyState() {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="archive-outline" size={32} color={colors.accent} />
      </View>
      <Text style={[type.heading, { color: colors.text }]}>Your archive is empty</Text>
      <Text style={[type.body, styles.emptyBody, { color: colors.textMuted }]}>
        Import images, PDFs and documents. The archive keeps its own private copy, so your original
        files are never changed or deleted.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  list: { padding: spacing.lg, flexGrow: 1 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    minHeight: 56,
    minWidth: TOUCH_TARGET,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  emptyBody: { textAlign: 'center' },
});
