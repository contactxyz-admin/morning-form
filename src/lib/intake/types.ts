export type IntakeTab = 'upload' | 'history' | 'essentials';

/**
 * A document the user has staged for upload. The actual upload (multipart POST
 * to `/api/intake/documents`) happens on Finish; until then we keep `File`
 * references in the store so the user can review the staged set.
 */
export interface StagedDocument {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  addedAt: number;
}

export interface EssentialsForm {
  /** Free-text list (one per line); kept as a single string to avoid array-edit churn. */
  currentMedications: string;
  currentDiagnoses: string;
  allergies: string;
  goals: string;
}

export const EMPTY_ESSENTIALS: EssentialsForm = {
  currentMedications: '',
  currentDiagnoses: '',
  allergies: '',
  goals: '',
};

export interface IntakeSessionState {
  /** Zero or more staged documents (lab PDFs, GP exports, photos). */
  documents: StagedDocument[];
  /** Free-text "your story" — pasted GP record, narrative history, anything. */
  historyText: string;
  /** Structured fallback fields. Required for Finish. */
  essentials: EssentialsForm;
}
