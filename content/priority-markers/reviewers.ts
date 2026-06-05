/**
 * Reviewer registry for the priority-markers reveal.
 *
 * Each content/priority-markers/{archetype}.ts carries a `reviewerKey`
 * (validated by src/lib/priority-markers-schema.ts). This module maps that
 * key to display info for the "Medically reviewed by …" attribution shown on
 * /reveal/priorities.
 *
 * CRITICAL — fail-safe attribution:
 *   - 'morning-form-editorial' is INTERNAL editorial review, NOT a medical
 *     review. Its entry is `null` so the UI never renders a clinical
 *     attribution for editorial-only content.
 *   - An unknown / unregistered key also resolves to null (see resolveReviewer
 *     below). We never render attribution we cannot vouch for.
 *
 * Week-3 hand-off: real clinicians (a UK GP + a US PCP) sign off, the content
 * files' `reviewerKey` flips from 'morning-form-editorial' to a clinical key,
 * and that clinical key gets a displayable entry here. The shape to fill in is
 * shown by the commented PLACEHOLDER below — it is intentionally NOT a live
 * registry entry, so no content file can accidentally reference it before the
 * names + registration numbers are real.
 */

/**
 * Displayable medical-reviewer attribution. `null` marks a key that exists but
 * must NOT produce a "Medically reviewed by" line (e.g. internal editorial).
 */
export interface ReviewerDisplay {
  /**
   * Full attribution body, reviewers joined as they should read in the UI,
   * e.g. 'Dr A Smith, GP (GMC 1234567) · Dr B Jones, MD'. The UI prefixes
   * this with 'Medically reviewed by '.
   */
  displayName: string;
  /** Short credential summary for contexts that show it separately. */
  credentials: string;
}

export const REVIEWERS: Record<string, ReviewerDisplay | null> = {
  // Internal editorial review — explicitly NON-displayable. Founder-only
  // placeholder used until clinical sign-off. Must never render as a medical
  // review.
  'morning-form-editorial': null,

  // ──────────────────────────────────────────────────────────────────────
  // PLACEHOLDER (week-3 clinical sign-off). NOT a live entry — leave commented
  // until the GMC/medical-board numbers are confirmed, then uncomment and flip
  // each content file's reviewerKey to match. Example shape:
  //
  // 'clinical-2026-07': {
  //   displayName: 'Dr [Name], GP (GMC [number]) · Dr [Name], MD',
  //   credentials: 'UK GP (GMC-registered) · US PCP (board-certified)',
  // },
  // ──────────────────────────────────────────────────────────────────────
};

/**
 * Resolved attribution ready for rendering, or `null` when nothing should be
 * shown.
 */
export interface ResolvedReviewer {
  /** Full line, e.g. 'Medically reviewed by Dr A, GP · Dr B, MD'. */
  line: string;
  /** Human-formatted review date, e.g. 'June 5, 2026'. */
  reviewedAt: string;
}

/**
 * Resolve an archetype's reviewer metadata into a renderable attribution.
 *
 * Returns `null` (render nothing) when:
 *   - the key is unregistered (fail-safe: never attribute review we can't
 *     vouch for),
 *   - the key maps to a non-displayable entry (e.g. internal editorial),
 *   - the lastReviewedAt date is missing or unparseable.
 *
 * Otherwise returns the prefixed line plus a formatted review date.
 */
export function resolveReviewer(
  reviewerKey: string,
  lastReviewedAt: string,
): ResolvedReviewer | null {
  const entry = REVIEWERS[reviewerKey];
  // `undefined` (unregistered) and `null` (non-displayable) both → no render.
  if (!entry) return null;

  const parsed = Date.parse(lastReviewedAt);
  if (Number.isNaN(parsed)) return null;

  const reviewedAt = new Date(parsed).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    line: `Medically reviewed by ${entry.displayName}`,
    reviewedAt,
  };
}
