import { create } from 'zustand';

import type { ArchiveQuery, FileCategory, FileStatus, SortDirection, SortField, Tag } from '../domain/types';

export interface SortOption {
  label: string;
  field: SortField;
  direction: SortDirection;
}

export const SORT_OPTIONS: SortOption[] = [
  { label: 'Newest first', field: 'importedAt', direction: 'desc' },
  { label: 'Oldest first', field: 'importedAt', direction: 'asc' },
  { label: 'Largest first', field: 'sizeBytes', direction: 'desc' },
  { label: 'Smallest first', field: 'sizeBytes', direction: 'asc' },
  { label: 'Name A–Z', field: 'displayName', direction: 'asc' },
  { label: 'Name Z–A', field: 'displayName', direction: 'desc' },
];

interface FilterState {
  text: string;
  categories: FileCategory[];
  statuses: FileStatus[];
  tag: Tag | null;
  sort: SortOption;
  setText(text: string): void;
  toggleCategory(category: FileCategory): void;
  toggleStatus(status: FileStatus): void;
  setTag(tag: Tag | null): void;
  setSort(sort: SortOption): void;
  clear(): void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** UI state for the Archive screen's search box, chips and sort menu. */
export const useFilterStore = create<FilterState>((set) => ({
  text: '',
  categories: [],
  statuses: [],
  tag: null,
  sort: SORT_OPTIONS[0],
  setText: (text) => set({ text }),
  toggleCategory: (category) => set((s) => ({ categories: toggle(s.categories, category) })),
  toggleStatus: (status) => set((s) => ({ statuses: toggle(s.statuses, status) })),
  setTag: (tag) => set({ tag }),
  setSort: (sort) => set({ sort }),
  clear: () => set({ text: '', categories: [], statuses: [], tag: null }),
}));

export function hasActiveFilters(s: Pick<FilterState, 'text' | 'categories' | 'statuses' | 'tag'>): boolean {
  return s.text.trim() !== '' || s.categories.length > 0 || s.statuses.length > 0 || s.tag !== null;
}

/** Builds the query sent to SearchService (`text` is the debounced value). */
export function toArchiveQuery(
  s: Pick<FilterState, 'categories' | 'statuses' | 'tag' | 'sort'>,
  text: string,
): ArchiveQuery {
  return {
    text,
    categories: s.categories,
    statuses: s.statuses,
    tagId: s.tag?.id,
    sort: { field: s.sort.field, direction: s.sort.direction },
  };
}
