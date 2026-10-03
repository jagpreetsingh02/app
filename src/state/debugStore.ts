import { create } from 'zustand';

/** DEVELOPMENT ONLY: one-shot flag consumed by the next import. */
export const useDebugStore = create<{ crashNextImport: boolean; setCrashNextImport(on: boolean): void }>((set) => ({
  crashNextImport: false,
  setCrashNextImport: (on) => set({ crashNextImport: on }),
}));
