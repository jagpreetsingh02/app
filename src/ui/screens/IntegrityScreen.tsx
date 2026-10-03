import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ArchiveFileWithTags } from '../../domain/types';
import { useArchiveVersion } from '../../state/archiveStore';
import { useAvailabilityStore } from '../../state/availabilityStore';
import { Button } from '../components/Button';
import { FileRow } from '../components/FileRow';
import { useLoader } from '../hooks';
import { useServices } from '../ServicesProvider';
import { radius, spacing, type, useTheme } from '../theme/theme';

/**
 * Integrity scanner: checks every archived file and lists the ones that are
 * missing or unreadable. The list comes straight from the database, so it
 * stays correct after a re-link or removal without rescanning.
 */
export function IntegrityScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { availability, search } = useServices();
  const version = useArchiveVersion((s) => s.version);
  const { scanning, progress, lastReport, lastFinishedAt, error, runScan } = useAvailabilityStore();
  const problems = useLoader(
    () => search.search({ statuses: ['missing', 'unreadable'], sort: { field: 'displayName', direction: 'asc' } }),
    [search, version],
  );

  const openFile = useCallback((file: ArchiveFileWithTags) => router.push(`/file/${file.id}`), []);
  const fraction = progress && progress.total > 0 ? progress.checked / progress.total : 0;

  const header = (
    <View style={styles.header}>
      <Text style={[type.body, { color: colors.textMuted }]}>
        Checks that every archived file still exists, can be read, and has the size recorded at import.
        Nothing is deleted: problem entries keep their details.
      </Text>

      <Button
        label={scanning ? 'Scanning…' : 'Scan archive'}
        icon="shield-checkmark-outline"
        onPress={() => runScan(availability, 'manual')}
        busy={scanning}
      />

      {scanning ? (
        <View style={styles.progressBlock} accessible accessibilityLabel={`Checked ${progress?.checked ?? 0} of ${progress?.total ?? 0} files`}>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.fill, { backgroundColor: colors.accent, width: `${Math.max(3, fraction * 100)}%` }]} />
          </View>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            Checked {progress?.checked ?? 0} of {progress?.total ?? '…'} files
          </Text>
        </View>
      ) : null}

      {error ? <Text style={[type.body, { color: colors.danger }]}>Scan failed: {error}</Text> : null}

      {lastReport && !scanning ? (
        <>
          <View style={styles.tiles}>
            <Tile label="Healthy" value={lastReport.available} fg={colors.success} bg={colors.successSoft} icon="checkmark-circle" />
            <Tile label="Missing" value={lastReport.missing} fg={colors.danger} bg={colors.dangerSoft} icon="alert-circle" />
            <Tile label="Unreadable" value={lastReport.unreadable} fg={colors.warning} bg={colors.warningSoft} icon="warning" />
          </View>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            {lastReport.checked} {lastReport.checked === 1 ? 'file' : 'files'} checked
            {lastFinishedAt ? ` · ${new Date(lastFinishedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
          </Text>
        </>
      ) : null}

      <Text style={[type.label, styles.sectionTitle, { color: colors.textMuted }]} accessibilityRole="header">
        NEEDS ATTENTION
      </Text>
    </View>
  );

  return (
    <FlatList
      data={problems.data ?? []}
      keyExtractor={(f) => f.id}
      ListHeaderComponent={header}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      renderItem={({ item }) => <FileRow file={item} onPress={openFile} />}
      ListEmptyComponent={
        problems.kind === 'loading' ? null : (
          <View style={[styles.healthy, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="checkmark-done-circle-outline" size={28} color={colors.success} />
            <Text style={[type.body, { color: colors.text, flex: 1 }]}>
              No missing or unreadable files{lastReport ? '.' : ' found so far. Run a scan to check every file now.'}
            </Text>
          </View>
        )
      }
    />
  );
}

function Tile({
  label,
  value,
  fg,
  bg,
  icon,
}: {
  label: string;
  value: number;
  fg: string;
  bg: string;
  icon: 'checkmark-circle' | 'alert-circle' | 'warning';
}) {
  return (
    <View style={[styles.tile, { backgroundColor: bg }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={[type.title, { color: fg }]}>{value}</Text>
      <Text style={[type.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.lg, marginBottom: spacing.md },
  progressBlock: { gap: spacing.xs },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  sectionTitle: { letterSpacing: 0.6, marginTop: spacing.sm },
  healthy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
