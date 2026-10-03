import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../domain/errors';
import { FILE_CATEGORIES, FILE_STATUSES, type ArchiveFileWithTags, type FileCategory } from '../../domain/types';
import { useArchiveVersion } from '../../state/archiveStore';
import { useDebugStore } from '../../state/debugStore';
import { SORT_OPTIONS, hasActiveFilters, toArchiveQuery, useFilterStore } from '../../state/filterStore';
import { useImportStore } from '../../state/importStore';
import { Chip } from '../components/Chip';
import { FileRow } from '../components/FileRow';
import { IconButton } from '../components/IconButton';
import { ImportSheet } from '../components/ImportSheet';
import { OptionSheet } from '../components/OptionSheet';
import { STATUS_ICON, STATUS_LABEL } from '../components/StatusBadge';
import { StateView } from '../components/StateView';
import { CATEGORY_ICON } from '../format';
import { useDebounced, useLoader } from '../hooks';
import { useServices } from '../ServicesProvider';
import { radius, spacing, type, useTheme, TOUCH_TARGET } from '../theme/theme';

const CATEGORY_CHIP_LABEL: Record<FileCategory, string> = {
  image: 'Images',
  pdf: 'PDFs',
  document: 'Documents',
  other: 'Other',
};

export function ArchiveScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const services = useServices();
  const version = useArchiveVersion((s) => s.version);
  const importing = useImportStore((s) => s.phase === 'running');
  const startImport = useImportStore((s) => s.start);
  const filters = useFilterStore();
  const [sortOpen, setSortOpen] = useState(false);

  // Debounce typing so we query SQLite once the user pauses, not per keystroke.
  const debouncedText = useDebounced(filters.text, 250);
  const query = toArchiveQuery(filters, debouncedText);
  const result = useLoader(
    () => services.search.search(query),
    [services, version, debouncedText, filters.categories, filters.statuses, filters.tag, filters.sort],
  );
  const files = result.data;
  const filtered = hasActiveFilters(filters);

  const openFile = useCallback((file: ArchiveFileWithTags) => router.push(`/file/${file.id}`), []);

  const onImport = async () => {
    try {
      const sources = await services.pickFiles();
      if (sources && sources.length > 0) {
        const debug = useDebugStore.getState();
        const simulateCrash = __DEV__ && debug.crashNextImport;
        if (simulateCrash) debug.setCrashNextImport(false); // one shot
        void startImport(services.importer, sources, { simulateCrash });
      }
    } catch (err) {
      Alert.alert('Could not open the file picker', errorMessage(err));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={filters.text}
            onChangeText={filters.setText}
            placeholder="Search names and tags"
            placeholderTextColor={colors.textMuted}
            style={[type.body, styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search by file name or tag"
          />
          {filters.text ? (
            <IconButton icon="close-circle" size={18} color={colors.textMuted} label="Clear search" onPress={() => filters.setText('')} />
          ) : null}
        </View>
        <IconButton
          icon="swap-vertical"
          label={`Sort, currently ${filters.sort.label}`}
          hint="Changes the order of the list"
          bordered
          onPress={() => setSortOpen(true)}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipScroller}
      >
        {FILE_CATEGORIES.map((category) => (
          <Chip
            key={category}
            label={CATEGORY_CHIP_LABEL[category]}
            icon={CATEGORY_ICON[category]}
            selected={filters.categories.includes(category)}
            onPress={() => filters.toggleCategory(category)}
          />
        ))}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        {FILE_STATUSES.map((status) => (
          <Chip
            key={status}
            label={STATUS_LABEL[status]}
            icon={STATUS_ICON[status]}
            selected={filters.statuses.includes(status)}
            onPress={() => filters.toggleStatus(status)}
          />
        ))}
      </ScrollView>

      <View style={styles.summary}>
        <Text style={[type.caption, styles.summaryText, { color: colors.textMuted }]} accessibilityLiveRegion="polite">
          {files ? `${files.length} ${files.length === 1 ? 'file' : 'files'}` : ' '} · {filters.sort.label}
        </Text>
        {filters.tag ? <Chip label={`#${filters.tag.name}`} onRemove={() => filters.setTag(null)} /> : null}
        {filtered ? (
          <Pressable onPress={filters.clear} accessibilityRole="button" style={styles.textButton}>
            <Text style={[type.label, { color: colors.accent }]}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>

      {files === null && result.kind !== 'error' ? (
        <ActivityIndicator style={styles.center} color={colors.accent} accessibilityLabel="Loading archive" />
      ) : result.kind === 'error' && !files ? (
        <StateView
          icon="cloud-offline-outline"
          tone="danger"
          title="Couldn’t load the archive"
          body={result.message}
          action={{ label: 'Try again', icon: 'refresh', onPress: result.reload }}
        />
      ) : (
        <FlatList
          data={files ?? []}
          keyExtractor={(f) => f.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => <FileRow file={item} onPress={openFile} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={filtered ? <NoResults onClear={filters.clear} /> : <EmptyArchive />}
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

      <OptionSheet
        visible={sortOpen}
        title="Sort by"
        options={SORT_OPTIONS}
        selected={filters.sort}
        getLabel={(o) => o.label}
        isSame={(a, b) => a.field === b.field && a.direction === b.direction}
        onSelect={filters.setSort}
        onClose={() => setSortOpen(false)}
      />
      <ImportSheet />
    </View>
  );
}

function Separator() {
  return <View style={{ height: spacing.sm }} />;
}

function EmptyArchive() {
  return (
    <StateView
      icon="archive-outline"
      tone="accent"
      title="Your archive is empty"
      body="Tap Import to add images, PDFs and documents. The archive keeps its own private copy, so your original files are never changed or deleted."
    />
  );
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <StateView
      icon="search-outline"
      title="No matching files"
      body="Try a different name or tag, or remove some filters."
      action={{ label: 'Clear filters', onPress: onClear }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    paddingLeft: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  searchInput: { flex: 1, paddingVertical: spacing.sm },
  chipScroller: { flexGrow: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  divider: { width: 1, height: 24, marginHorizontal: spacing.xs },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 36,
  },
  summaryText: { flex: 1 },
  textButton: { minHeight: TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, flexGrow: 1 },
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
});
