import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

import type { FileCategory, ImportStep } from '../domain/types';

export { formatBytes } from '../domain/fileKinds';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const CATEGORY_LABEL: Record<FileCategory, string> = {
  image: 'Image',
  pdf: 'PDF',
  document: 'Document',
  other: 'Other',
};

export const CATEGORY_ICON: Record<FileCategory, IconName> = {
  image: 'image-outline',
  pdf: 'reader-outline',
  document: 'document-text-outline',
  other: 'document-outline',
};

export function formatDate(epochMs: number | null): string {
  if (epochMs == null) return 'Unknown';
  return new Date(epochMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const STEP_ORDER: ImportStep[] = [
  'queued',
  'validating',
  'copying',
  'verifying',
  'hashing',
  'checking-duplicates',
  'finalizing',
  'saving',
  'done',
];

export const STEP_LABEL: Record<ImportStep, string> = {
  queued: 'Waiting',
  validating: 'Checking source',
  copying: 'Copying',
  verifying: 'Verifying copy',
  hashing: 'Fingerprinting',
  'checking-duplicates': 'Checking for duplicates',
  finalizing: 'Moving into archive',
  saving: 'Saving record',
  done: 'Done',
};

export function stepProgress(step: ImportStep): number {
  return STEP_ORDER.indexOf(step) / (STEP_ORDER.length - 1);
}
