import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../domain/errors';
import type { ArchiveFileWithTags } from '../../domain/types';
import { MAX_NAME_LENGTH } from '../../services/ArchiveService';
import { notifyArchiveChanged, useArchiveVersion } from '../../state/archiveStore';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { FileThumb } from '../components/FileThumb';
import { PromptDialog } from '../components/PromptDialog';
import { STATUS_LABEL, StatusBadge } from '../components/StatusBadge';
import { TagPickerSheet } from '../components/TagPickerSheet';
import { CATEGORY_LABEL, formatBytes } from '../format';
import { useLoader } from '../hooks';
import { useServices } from '../ServicesProvider';
import { radius, spacing, type, useTheme } from '../theme/theme';

/** The exact wording of what removal does; also used in the README. */
export const REMOVE_EXPLANATION =
  'This deletes the entry and the archive’s private copy of the file from this app. ' +
  'Your original file on the device is not affected.';

export function FileDetailScreen({ id }: { id: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { archive, tags, opener, availability } = useServices();
  const version = useArchiveVersion((s) => s.version);
  const detail = useLoader(() => archive.getDetail(id), [archive, id, version]);
  const [renaming, setRenaming] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [checking, setChecking] = useState(false);

  if (detail.data === null) {
    if (detail.kind === 'loading') {
      return <ActivityIndicator style={styles.center} color={colors.accent} accessibilityLabel="Loading" />;
    }
    return (
      <View style={[styles.center, { gap: spacing.lg }]}>
        <Text style={[type.heading, { color: colors.text }]}>
          {detail.kind === 'error' ? 'Could not load this entry' : 'This entry is no longer in the archive'}
        </Text>
        {detail.kind === 'error' ? <Text style={[type.body, { color: colors.textMuted }]}>{detail.message}</Text> : null}
        <Button label="Back to archive" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const file: ArchiveFileWithTags = detail.data;

  const confirmRemove = () =>
    Alert.alert(`Remove “${file.displayName}” from the archive?`, REMOVE_EXPLANATION, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemoving(true);
          try {
            await archive.remove(file.id);
            router.back();
            notifyArchiveChanged();
          } catch (err) {
            setRemoving(false);
            Alert.alert('Could not remove the entry', errorMessage(err));
          }
        },
      },
    ]);

  const open = async () => {
    setOpening(true);
    try {
      const result = await opener.open(file.id);
      if (result.file.status !== file.status) notifyArchiveChanged();
      switch (result.kind) {
        case 'show-in-app':
          router.push(`/viewer/${file.id}`);
          break;
        case 'opened':
          break;
        case 'unavailable':
          Alert.alert('File not available', result.message);
          break;
        case 'no-viewer':
          Alert.alert('No app to open this file', result.message);
          break;
        case 'failed':
          Alert.alert('Could not open the file', result.message);
          break;
      }
    } catch (err) {
      Alert.alert('Could not open the file', errorMessage(err));
    } finally {
      setOpening(false);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const checked = await availability.checkFile(file.id);
      notifyArchiveChanged();
      if (checked && checked.result.status !== 'available' && checked.result.reason) {
        Alert.alert(STATUS_LABEL[checked.result.status], checked.result.reason);
      }
    } catch (err) {
      Alert.alert('Could not check the file', errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const removeTag = async (tagId: string) => {
    try {
      await tags.unassign(file.id, tagId);
      notifyArchiveChanged();
    } catch (err) {
      Alert.alert('Could not remove the tag', errorMessage(err));
    }
  };

  const hashLabel = file.contentHash.startsWith('sha256:') ? 'SHA-256' : 'Fingerprint (size + first/last 1 MB)';
  const hashValue = file.contentHash.slice(file.contentHash.indexOf(':') + 1);

  return (
    <>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.hero}>
          <FileThumb file={file} size={file.category === 'image' ? 160 : 88} />
          <Text style={[type.title, styles.name, { color: colors.text }]} accessibilityRole="header" selectable>
            {file.displayName}
          </Text>
          <StatusBadge status={file.status} />
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button
                label="Open"
                icon="open-outline"
                onPress={open}
                busy={opening}
                accessibilityHint={file.category === 'image' ? 'Shows the image' : 'Opens the file in another app'}
              />
            </View>
            <View style={styles.action}>
              <Button label="Rename" icon="pencil" variant="secondary" onPress={() => setRenaming(true)} />
            </View>
          </View>
        </View>

        {file.status !== 'available' ? (
          <View style={[styles.banner, { backgroundColor: file.status === 'missing' ? colors.dangerSoft : colors.warningSoft }]}>
            <Text style={[type.body, { color: file.status === 'missing' ? colors.danger : colors.warning }]}>
              {file.status === 'missing'
                ? 'The archive’s copy of this file is missing. Its details are kept so nothing is lost.'
                : 'The archive’s copy of this file could not be read. Its details are kept so nothing is lost.'}
            </Text>
          </View>
        ) : null}

        <Section title="Tags">
          <View style={styles.tagWrap}>
            {file.tags.map((tag) => (
              <Chip key={tag.id} label={`#${tag.name}`} onRemove={() => removeTag(tag.id)} />
            ))}
            <Chip label={file.tags.length ? 'Edit tags' : 'Add tags'} icon="pricetag-outline" onPress={() => setEditingTags(true)} />
          </View>
        </Section>

        <Section title="Details">
          <Field label="Type" value={`${CATEGORY_LABEL[file.category]} · ${file.mimeType}`} />
          <Field label="Size" value={`${formatBytes(file.sizeBytes)} (${file.sizeBytes.toLocaleString()} bytes)`} />
          <Field label="Imported" value={formatDateTime(file.importedAt)} />
          <Field
            label="Modified (from picker)"
            value={file.sourceModifiedAt ? formatDateTime(file.sourceModifiedAt) : 'Not provided by the device'}
          />
          <Field label="Last known modification" value={formatDateTime(file.lastKnownModifiedAt)} />
          <Field label="Availability" value={`${STATUS_LABEL[file.status]} · checked ${formatDateTime(file.statusCheckedAt)}`} />
          <Button label="Check now" icon="refresh" variant="secondary" onPress={checkNow} busy={checking} />
          <Field label="Original name" value={file.originalName} />
          <Field label="Stored at" value={file.storagePath} mono />
          <Field label={hashLabel} value={hashValue} mono last />
        </Section>

        <Section title="Remove">
          <Text style={[type.caption, { color: colors.textMuted }]}>{REMOVE_EXPLANATION}</Text>
          <Button label="Remove from archive" icon="trash-outline" variant="danger" onPress={confirmRemove} busy={removing} />
        </Section>
      </ScrollView>

      <PromptDialog
        visible={renaming}
        title="Rename"
        initialValue={file.displayName}
        maxLength={MAX_NAME_LENGTH}
        onSubmit={async (value) => {
          await archive.rename(file.id, value);
          notifyArchiveChanged();
        }}
        onClose={() => setRenaming(false)}
      />
      <TagPickerSheet visible={editingTags} fileId={file.id} assigned={file.tags} onClose={() => setEditingTags(false)} />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[type.label, styles.sectionTitle, { color: colors.textMuted }]} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

function Field({ label, value, mono = false, last = false }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.field, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={[type.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[mono ? styles.mono : type.body, { color: colors.text }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function formatDateTime(epochMs: number | null): string {
  if (epochMs == null) return 'Unknown';
  return new Date(epochMs).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: { padding: spacing.lg, gap: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch' },
  action: { flex: 1 },
  name: { textAlign: 'center' },
  banner: { padding: spacing.lg, borderRadius: radius.md },
  section: { gap: spacing.sm },
  sectionTitle: { letterSpacing: 0.6, paddingHorizontal: spacing.xs },
  card: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.md },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  field: { gap: 2, paddingBottom: spacing.md },
  mono: { fontFamily: 'monospace', fontSize: 13, lineHeight: 18 },
});
