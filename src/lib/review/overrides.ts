/**
 * The member-facing escalation override set.
 *
 * A marker shows the 'escalation' flag tier when its MOST RECENT clinical
 * decision (by the reviewed panel's documentCapturedAt — clinical recency,
 * not decidedAt: a clinician deciding an old panel late must not outrank a
 * newer panel's decision) was an escalation. Every decided review "covers"
 * all joinKeys in its panel snapshot — an approval clears any earlier
 * escalation for the markers it re-tested; a newer PENDING review clears
 * nothing (no human has decided yet).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { parsePanelSummary } from './snapshot';

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadEscalatedMarkerKeys(db: Db, userId: string): Promise<Set<string>> {
  // Cheap escape hatch for the overwhelmingly common case: only escalated
  // rows can ever ADD a key to the result, so zero escalated rows means the
  // answer is provably empty — one indexed count instead of streaming every
  // decided review's full panelSummary blob on the two hottest member read
  // paths (/api/record and the source-detail route), a cost that otherwise
  // grows with every panel the member ever ingests.
  const escalatedCount = await db.resultReview.count({
    where: { userId, status: 'escalated' },
  });
  if (escalatedCount === 0) return new Set();

  const decided = await db.resultReview.findMany({
    where: { userId, status: { in: ['approved', 'escalated'] } },
    // createdAt tiebreak: two panels captured at the same instant would
    // otherwise fold in nondeterministic order, letting a marker's safety
    // flag flicker between requests when their decisions disagree.
    orderBy: [{ documentCapturedAt: 'asc' }, { createdAt: 'asc' }],
    select: { panelSummary: true, escalatedMarkerKeys: true, status: true, id: true },
  });

  // Fold in capturedAt order: later decisions overwrite earlier ones per key.
  const latest = new Map<string, 'clear' | 'escalated'>();
  for (const review of decided) {
    const summary = parsePanelSummary(review.panelSummary);
    if (summary) {
      for (const marker of summary.markers) latest.set(marker.joinKey, 'clear');
    } else {
      // A malformed snapshot must only drop the 'clear' pass, never the
      // escalation flags — escalatedMarkerKeys parse independently, and
      // failing open here would silently un-flag a member's escalated
      // markers (e.g. after a future snapshot-schema tightening invalidates
      // historical rows at read time).
      console.error(`[review] malformed panelSummary on review ${review.id} — clear pass skipped in override fold`);
    }
    if (review.status === 'escalated' && review.escalatedMarkerKeys) {
      const keys = safeParseKeys(review.escalatedMarkerKeys, review.id);
      for (const key of keys) latest.set(key, 'escalated');
    }
  }

  const escalated = new Set<string>();
  latest.forEach((state, key) => {
    if (state === 'escalated') escalated.add(key);
  });
  return escalated;
}

function safeParseKeys(raw: string, reviewId: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    console.error(`[review] malformed escalatedMarkerKeys on review ${reviewId} — escalation flags dropped`);
    return [];
  }
}
