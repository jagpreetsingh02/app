import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useImportStore, type ImportItemView } from '../../state/importStore';
import { STEP_LABEL, formatBytes, stepProgress } from '../format';
import { useServices } from '../ServicesProvider';
import { radius, spacing, type, useTheme, TOUCH_TARGET, type Palette } from '../theme/theme';

/**
 * Bottom sheet showing live per-file progress, a cancel button while running,
 * and the final summary (imported / duplicates / failed with reasons).
 */
export function ImportSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { importer } = useServices();
  const { phase, items, summary, fatalError, cancelRequested, cancel, dismiss, keepDuplicate } = useImportStore();

  if (phase === 'idle') return null;
  const running = phase === 'running';

  const title = running
    ? cancelRequested
      ? 'Cancelling…'
      : `Importing ${items.length} ${items.length === 1 ? 'file' : 'files'}`
    : fatalError
      ? 'Import interrupted'
      : summary?.wasCancelled
        ? 'Import cancelled'
        : 'Import complete';

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      // Android back button: only closes once the import has finished.
      onRequestClose={() => !running && dismiss(importer)}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View
          style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + spacing.lg }]}
          accessibilityViewIsModal
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header" accessibilityLiveRegion="polite">
            {title}
          </Text>

          {summary && !running ? <SummaryChips colors={colors} summary={summary} /> : null}
          {fatalError ? (
            <Text style={[type.body, styles.fatal, { color: colors.danger, backgroundColor: colors.dangerSoft }]}>
              {fatalError}
            </Text>
          ) : null}

          <FlatList
            style={styles.list}
            data={items}
            keyExtractor={(item) => String(item.index)}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <ImportItemRow
                item={item}
                colors={colors}
                canKeep={!running}
                onKeep={() => keepDuplicate(importer, item.index)}
              />
            )}
          />

          {running ? (
            <Pressable
              onPress={cancel}
              disabled={cancelRequested}
              accessibilityRole="button"
              accessibilityState={{ disabled: cancelRequested }}
              style={[styles.button, { borderColor: colors.border, opacity: cancelRequested ? 0.5 : 1 }]}
            >
              <Text style={[type.bodyStrong, { color: colors.danger }]}>
                {cancelRequested ? 'Stopping after current step…' : 'Cancel import'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => dismiss(importer)}
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: colors.accent, borderColor: colors.accent }]}
            >
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Done</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SummaryChips({ colors, summary }: { colors: Palette; summary: NonNullable<ReturnType<typeof useImportStore.getState>['summary']> }) {
  const chips = [
    { label: 'imported', value: summary.imported, fg: colors.success, bg: colors.successSoft },
    { label: 'duplicates', value: summary.duplicates, fg: colors.warning, bg: colors.warningSoft },
    { label: 'failed', value: summary.failed, fg: colors.danger, bg: colors.dangerSoft },
    { label: 'cancelled', value: summary.cancelled, fg: colors.textMuted, bg: colors.surfaceAlt },
  ].filter((c) => c.value > 0 || c.label === 'imported');

  return (
    <View style={styles.chips}>
      {chips.map((chip) => (
        <View key={chip.label} style={[styles.chip, { backgroundColor: chip.bg }]}>
          <Text style={[type.label, { color: chip.fg }]}>
            {chip.value} {chip.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ImportItemRow({
  item,
  colors,
  canKeep,
  onKeep,
}: {
  item: ImportItemView;
  colors: Palette;
  canKeep: boolean;
  onKeep: () => void;
}) {
  const { outcome } = item;
  let icon: { name: ComponentProps<typeof Ionicons>['name']; color: string } | null = null;
  let detail = STEP_LABEL[item.step];
  let detailColor = colors.textMuted;

  if (outcome?.kind === 'imported') {
    icon = { name: 'checkmark-circle', color: colors.success };
    detail = `Imported · ${formatBytes(outcome.file.sizeBytes)}`;
  } else if (outcome?.kind === 'duplicate') {
    icon = { name: 'copy-outline', color: colors.warning };
    detail = `Duplicate of “${outcome.existing.displayName}” — not imported`;
    detailColor = colors.warning;
  } else if (outcome?.kind === 'failed') {
    icon = { name: 'alert-circle', color: colors.danger };
    detail = outcome.reason;
    detailColor = colors.danger;
  } else if (outcome?.kind === 'cancelled') {
    icon = { name: 'remove-circle-outline', color: colors.textMuted };
    detail = 'Cancelled — nothing was saved';
  }

  return (
    <View
      style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`${item.name}: ${detail}`}
    >
      <View style={styles.itemHeader}>
        <Text style={[type.bodyStrong, styles.itemName, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        {icon ? <Ionicons name={icon.name} size={20} color={icon.color} /> : null}
      </View>
      {!outcome ? (
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.fill, { backgroundColor: colors.accent, width: `${Math.max(4, stepProgress(item.step) * 100)}%` }]} />
        </View>
      ) : null}
      <Text style={[type.caption, { color: detailColor }]}>{detail}</Text>
      {outcome?.kind === 'duplicate' && canKeep ? (
        <Pressable onPress={onKeep} accessibilityRole="button" hitSlop={8} style={styles.keep}>
          <Text style={[type.label, { color: colors.accent }]}>Keep anyway</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  fatal: { padding: spacing.md, borderRadius: radius.md },
  list: { flexGrow: 0 },
  item: { padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, gap: spacing.xs },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemName: { flex: 1 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  keep: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  button: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
