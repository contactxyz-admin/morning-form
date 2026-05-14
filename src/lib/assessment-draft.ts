/**
 * Assessment-page draft autosave.
 *
 * The assessment is the most expensive 10 minutes in the activation
 * funnel (34 questions, ~8-10 min, ~17 min total to first grounded
 * answer). Closing the tab on Q18 of 34 should not nuke the work.
 *
 * Wire:
 *   - On mount of /assessment, `loadDraft` rehydrates `responses` +
 *     `currentIndex` if a valid draft exists.
 *   - On every change to either of those, `saveDraft` persists.
 *   - On POST success in /processing, `clearDraft` wipes it so a
 *     future revisit to /assessment doesn't see stale answers.
 *
 * Invariants:
 *   - Version-tagged so a schema change (renamed question id, removed
 *     option) drops old drafts rather than rehydrate broken state.
 *   - TTL'd at 7 days because anything older is more "I forgot I ever
 *     started this" than "I'm a few hours in." 7 days is also short
 *     enough that PII liability stays modest.
 *   - currentIndex bounds-checked before rehydrate — a stored value
 *     past the end of `assessmentQuestions` would crash the renderer.
 */
import { assessmentQuestions } from '@/lib/assessment-questions';
import type { AssessmentResponses } from '@/types';

export const DRAFT_KEY = 'mf_assessment_draft';
export const DRAFT_VERSION = 'v1';
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface AssessmentDraft {
  version: typeof DRAFT_VERSION;
  responses: AssessmentResponses;
  currentIndex: number;
  savedAt: number;
}

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadDraft(
  storage: Storage | null = getStorage(),
  now: number = Date.now(),
  totalQuestions: number = assessmentQuestions.length,
): AssessmentDraft | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const draft = parsed as Partial<AssessmentDraft>;
  if (draft.version !== DRAFT_VERSION) return null;
  if (typeof draft.savedAt !== 'number') return null;
  if (now - draft.savedAt > DRAFT_MAX_AGE_MS) return null;
  if (typeof draft.currentIndex !== 'number') return null;
  if (draft.currentIndex < 0 || draft.currentIndex >= totalQuestions) return null;
  if (!draft.responses || typeof draft.responses !== 'object') return null;
  return {
    version: DRAFT_VERSION,
    responses: draft.responses as AssessmentResponses,
    currentIndex: draft.currentIndex,
    savedAt: draft.savedAt,
  };
}

export function saveDraft(
  responses: AssessmentResponses,
  currentIndex: number,
  storage: Storage | null = getStorage(),
  now: number = Date.now(),
): void {
  if (!storage) return;
  try {
    const draft: AssessmentDraft = {
      version: DRAFT_VERSION,
      responses,
      currentIndex,
      savedAt: now,
    };
    storage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota exceeded / private browsing — losing one save is OK */
  }
}

export function clearDraft(storage: Storage | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(DRAFT_KEY);
  } catch {
    /* see saveDraft */
  }
}
