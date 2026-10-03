import { Alert, FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../domain/errors';
import { notifyArchiveChanged, useArchiveVersion } from '../../state/archiveStore';
import { useAvailabilityStore } from '../../state/availabilityStore';
import { useDebugStore } from '../../state/debugStore';
import { Button } from '../components/Button';
import { FileThumb } from '../components/FileThumb';
import { StatusBadge } from '../components/StatusBadge';
import { useLoader } from '../hooks';
import { useServices } from '../ServicesProvider';
import { radius, spacing, type, useTheme } from '../theme/theme';

/**
 * DEVELOPMENT ONLY. Loaded by app/debug.tsx through a __DEV__-guarded
 * require, so this module is not part of production bundles at all.
 */
export function DebugScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const services = useServices();
  const version = useArchiveVersion((s) => s.version);
  const entries = useLoader(() => services.search.search({}), [services, version]);
  const { crashNextImport, setCrashNextImport } = useDebugStore();

  const deletePhysical = (id: string, name: string) =>
    Alert.alert(
      'Simulate external deletion?',
      `Deletes the archive’s physical copy of “${name}” but keeps its record, as if another app removed it. Then runs an availability check.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete file',
          style: 'destructive',
          onPress: async () => {
            try {
              await services.debug?.simulateExternalDeletion(id);
              await services.availability.checkFile(id);
              notifyArchiveChanged();
            } catch (err) {
              Alert.alert('Failed', errorMessage(err));
            }
          },
        },
      ],
    );

  return (
    <FlatList
      data={entries.data ?? []}
      keyExtractor={(f) => f.id}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={[styles.card, { backgroundColor: colors.warningSoft }]}>
            <Text style={[type.bodyStrong, { color: colors.warning }]}>Development build only</Text>
            <Text style={[type.caption, { color: colors.text }]}>
              These tools exist to demonstrate failure handling. They are compiled out of production builds.
            </Text>
          </View>

          <View style={[styles.card, styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.flex}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>Crash during next import</Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                Stops the next import between moving the file into the archive and saving its record, with no
                cleanup. Restart the app afterwards: startup reconciliation deletes the orphaned file.
              </Text>
            </View>
            <Switch
              value={crashNextImport}
              onValueChange={setCrashNextImport}
              accessibilityLabel="Crash during next import"
            />
          </View>

          <Button
            label="Run availability scan now"
            icon="refresh"
            variant="secondary"
            onPress={() => useAvailabilityStore.getState().runScan(services.availability, 'manual')}
          />

          <Text style={[type.label, { color: colors.textMuted }]}>SIMULATE EXTERNAL DELETION</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[styles.card, styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <FileThumb file={item} />
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
              {item.displayName}
            </Text>
            <StatusBadge status={item.status} />
          </View>
          <Button
            label="Delete file"
            variant="danger"
            disabled={item.status === 'missing'}
            onPress={() => deletePhysical(item.id, item.displayName)}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  header: { gap: spacing.lg, marginBottom: spacing.md },
  card: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 4 },
});
