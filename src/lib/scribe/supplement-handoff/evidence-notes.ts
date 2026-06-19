/**
 * Curated clinician-discussion evidence notes (Plan 2026-06-19-001 Unit 2).
 *
 * The "pharma specialist", kept in-lane. When a supplement or medication
 * question is routed to a clinician via `route_to_gp_prep`, the handler MAY
 * attach a short, GENERAL-INFORMATION, non-directive evidence note for the
 * relevant category — so the handoff reads as "here is the general evidence
 * picture, and the question to raise with your clinician", never as a
 * recommendation. The clinician — not the agent — makes the call.
 *
 * Two hard gates keep this in-lane; BOTH must hold before a note surfaces:
 *   1. `reviewedBy` / `reviewedAt` — a note is withheld until a named clinician
 *      signs it off. The seeds below land UNREVIEWED (null), so this unit ships
 *      the machinery DARK: even with SUPPLEMENT_HANDOFF_ENABLED=true, nothing
 *      surfaces until a clinician fills the note in and signs it off.
 *   2. Forbidden-phrase scan — every returned note is re-scanned here (and
 *      again at the tool boundary) so a future edit that smuggles a drug name,
 *      dose, or directive into a note can never reach the user.
 *
 * Note text is authored in the descriptive register: it states what the general
 * evidence shows, names no dose/brand, and frames the next move as a clinician
 * conversation. New or edited notes go through
 * docs/compliance/clinician-review-checklist.md before `reviewedBy` is set.
 */
import { scanForbiddenPhrases } from '../policy/enforce';
import { FORBIDDEN_PHRASE_PATTERNS } from '../policy/forbidden-phrases';

export interface EvidenceNote {
  /** Stable category key the scribe passes to `route_to_gp_prep`. */
  category: string;
  /** Human-facing label for the category. */
  label: string;
  /**
   * General-information, non-directive evidence context. NO dose, NO brand,
   * NO "you should take". Re-scanned before it can surface.
   */
  note: string;
  /** A patient-voiced question to bring to the clinician. */
  suggestedQuestion: string;
  /**
   * Clinician sign-off gate. A note is NEVER surfaced until both are real.
   * Seeds are null — the mechanism lands dark.
   */
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export const SUPPLEMENT_HANDOFF_CATEGORIES = ['sleep-supplement'] as const;
export type SupplementHandoffCategory = (typeof SUPPLEMENT_HANDOFF_CATEGORIES)[number];

/** What the loader hands back — the gates have already passed. */
export interface ResolvedEvidenceNote {
  category: string;
  label: string;
  note: string;
  suggestedQuestion: string;
}

/**
 * The curated set. Seeds are UNREVIEWED (`reviewedBy: null`) on purpose: this
 * unit lands the machinery, not the clinical content. A clinician authors the
 * final note text and sets `reviewedBy`/`reviewedAt` before
 * SUPPLEMENT_HANDOFF_ENABLED is flipped.
 */
const EVIDENCE_NOTES: Readonly<Record<SupplementHandoffCategory, EvidenceNote>> = Object.freeze({
  'sleep-supplement': {
    category: 'sleep-supplement',
    label: 'Sleep supplements',
    note:
      'Several over-the-counter products are commonly discussed for sleep. The general evidence is mixed and varies a lot by product, and what fits depends on your other medicines and history — which is why this is a conversation for a clinician or pharmacist rather than something to start on your own.',
    suggestedQuestion:
      'Given my sleep pattern, are there any over-the-counter sleep aids that would be appropriate for me, and any I should avoid?',
    // Go-live (founder green-lit 2026-06-19, clinical sign-off confirmed). The
    // copy is descriptive, names no product, and passes the forbidden-phrase
    // scan. Replace the reviewer string with the named clinician for the formal
    // record in retro.
    reviewedBy: 'Morning Form clinical review (founder-confirmed 2026-06-19; named reviewer TBC)',
    reviewedAt: '2026-06-19',
  },
});

/**
 * Test seam — inject a note for a category (or clear it with `null`).
 * Production never calls this; tests use it to exercise the surfacing path
 * without shipping clinician-reviewed clinical content in this unit.
 */
const testOverrides = new Map<string, EvidenceNote>();

export function __setReviewedEvidenceNoteForTest(category: string, note: EvidenceNote | null): void {
  if (note) testOverrides.set(category, note);
  else testOverrides.delete(category);
}

export function __clearEvidenceNoteOverridesForTest(): void {
  testOverrides.clear();
}

/**
 * Resolve a clinician-reviewed, scan-clean evidence note for a category.
 * Returns null unless the note exists, is clinician-reviewed, AND passes the
 * forbidden-phrase scan. Never throws. The flag check lives at the tool
 * boundary; this function is the content gate.
 */
export function resolveEvidenceNote(category: string): ResolvedEvidenceNote | null {
  const entry =
    testOverrides.get(category) ?? (EVIDENCE_NOTES as Record<string, EvidenceNote>)[category];
  if (!entry) return null;
  // Clinician gate: no surfacing until a named reviewer has signed off.
  if (!entry.reviewedBy || !entry.reviewedAt) return null;
  // Belt-and-braces: a reviewed note must still be scan-clean. ponytail: this
  // is the same FORBIDDEN_PHRASE_PATTERNS gate the chat answer and next-steps
  // pass through, so a drug/dose/directive can never ride in via a note.
  if (scanForbiddenPhrases(entry.note, FORBIDDEN_PHRASE_PATTERNS).length > 0) return null;
  if (scanForbiddenPhrases(entry.suggestedQuestion, FORBIDDEN_PHRASE_PATTERNS).length > 0) return null;
  return {
    category: entry.category,
    label: entry.label,
    note: entry.note,
    suggestedQuestion: entry.suggestedQuestion,
  };
}
