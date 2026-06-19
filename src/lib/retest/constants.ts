/**
 * Retest-loop tunables — single source of truth, CMO-adjustable in one place.
 *
 * These govern the "return leg" of the four-touchpoint loop: how long after a
 * completed draw the next retest is due, the nudge follow-up sequence, when a
 * return counts as nudge-caused, when an un-rebooked draw lapses, and how
 * same-visit panels collapse to one draw.
 *
 * See docs/plans/2026-06-17-001-feat-return-leg-retest-loop-plan.md.
 */

/** Days from a completed draw to the next scheduled retest (quarterly). */
export const RETEST_CADENCE_DAYS = 90;

/**
 * Nudge-sequence offsets, in days after a scheduled draw's `scheduledFor`, at
 * which the cron sends each successive nudge. The array length caps the number
 * of nudges; for a quarterly gap the follow-up cadence is the conversion lever,
 * so this is a deliberate sequence, not a single send.
 */
export const RETEST_NUDGE_OFFSETS_DAYS = [0, 7, 21] as const;

/**
 * A completed draw is attributed to the nudge only if it completes within this
 * many days of the most recent nudge; otherwise the return is `organic`/`ops`.
 * This is the heuristic that isolates *loop-caused* return for the headline
 * pilot metric — it mis-credits at the margin (a clinician-prompted draw that
 * happens to land just after a nudge) and is tuned with early pilot data.
 */
export const RETEST_NUDGE_ATTRIBUTION_WINDOW_DAYS = 30;

/**
 * After the final nudge offset, a still-un-rebooked scheduled draw lapses once
 * this additional grace window has passed. A lapsed draw counts as a non-return
 * (not a pending unknown) in the retention metric.
 */
export const RETEST_LAPSE_GRACE_DAYS = 14;

/**
 * Minimum days between two nudges to the same draw. After a cron outage several
 * offsets can come due at once; this preserves spacing so the member never gets
 * the whole sequence in a rapid burst.
 */
export const RETEST_NUDGE_MIN_GAP_DAYS = 7;

/**
 * Lab panels completing within this many days of an existing completed draw
 * attach to it — one clinic visit, possibly several PDFs, is one draw event,
 * not many. The mirror-fix to the multi-date-panel ambiguity.
 */
export const DRAW_DEDUP_WINDOW_DAYS = 14;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Add whole days to a date. Pure millisecond arithmetic — sufficient for the
 * whole-day cadence/offset scheduling here (sub-day DST drift is irrelevant at
 * a 90-day cadence) and avoids a date-lib dependency in this leaf module.
 */
export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/** When the next retest is due, given a draw's completion date. */
export function nextRetestDate(completedAt: Date): Date {
  return addDays(completedAt, RETEST_CADENCE_DAYS);
}
