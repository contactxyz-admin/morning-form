/**
 * Intake session store. The three intake tabs (upload / history / essentials)
 * all write here so a user can complete them in any order and re-enter the
 * page without losing state.
 *
 * Persistence note: documents hold raw `File` references which are not
 * JSON-serialisable, so the store is intentionally NOT persisted to
 * localStorage. Page reloads drop the staged documents — a deliberate
 * trade-off for v1, surfaced to the user as a "stays until you finish" hint.
 */

'use client';

import { create } from 'zustand';
import {
  EMPTY_ESSENTIALS,
  type EssentialsForm,
  type StagedDocument,
} from './types';

interface IntakeStore {
  documents: StagedDocument[];
  historyText: string;
  essentials: EssentialsForm;

  addDocuments: (files: File[]) => void;
  removeDocument: (id: string) => void;
  setHistoryText: (text: string) => void;
  setEssentialsField: <K extends keyof EssentialsForm>(field: K, value: EssentialsForm[K]) => void;
  reset: () => void;

  /** True when essentials has the minimum required content to Finish. */
  isEssentialsComplete: () => boolean;
  /** True when at least one tab has any input. */
  hasAnyInput: () => boolean;
}

const initialState: Pick<IntakeStore, 'documents' | 'historyText' | 'essentials'> = {
  documents: [],
  historyText: '',
  essentials: EMPTY_ESSENTIALS,
};

function trim(s: string): string {
  return s.trim();
}

export const useIntakeStore = create<IntakeStore>((set, get) => ({
  ...initialState,

  addDocuments: (files) => {
    const staged: StagedDocument[] = files.map((file) => ({
      id: `${file.name}-${file.lastModified}-${file.size}`,
      file,
      name: file.name,
      sizeBytes: file.size,
      addedAt: Date.now(),
    }));
    set((s) => {
      const existingIds = new Set(s.documents.map((d) => d.id));
      const fresh = staged.filter((d) => !existingIds.has(d.id));
      return { documents: [...s.documents, ...fresh] };
    });
  },

  removeDocument: (id) =>
    set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),

  setHistoryText: (text) => set({ historyText: text }),

  setEssentialsField: (field, value) =>
    set((s) => ({ essentials: { ...s.essentials, [field]: value } })),

  reset: () => set(initialState),

  isEssentialsComplete: () => {
    const e = get().essentials;
    // Minimum bar: goals + at least one of {meds, diagnoses, allergies}. A
    // healthy person with no diagnoses/meds is valid; "no allergies" is also
    // valid input — caller types "none". Goals is the one universal field.
    if (trim(e.goals).length === 0) return false;
    return [e.currentMedications, e.currentDiagnoses, e.allergies].some(
      (v) => trim(v).length > 0,
    );
  },

  hasAnyInput: () => {
    const s = get();
    if (s.documents.length > 0) return true;
    if (trim(s.historyText).length > 0) return true;
    const e = s.essentials;
    return [e.currentMedications, e.currentDiagnoses, e.allergies, e.goals].some(
      (v) => trim(v).length > 0,
    );
  },
}));
