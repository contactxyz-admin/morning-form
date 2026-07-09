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
  const decided = await db.resultReview.findMany({
    where: { userId, status: { in: ['approved', 'escalated'] } },
    orderBy: { documentCapturedAt: 'asc' },
    select: { panelSummary: true, escalatedMarkerKeys: true, status: true, id: true },
  });

  // Fold in capturedAt order: later decisions overwrite earlier ones per key.
  const latest = new Map<string, 'clear' | 'escalated'>();
  for (const review of decided) {
    const summary = parsePanelSummary(review.panelSummary);
    if (!summary) {
      console.error(`[review] malformed panelSummary on review ${review.id} — skipped in override fold`);
      continue;
    }
    for (const marker of summary.markers) latest.set(marker.joinKey, 'clear');
    if (review.status === 'escalated' && review.escalatedMarkerKeys) {
      const keys = safeParseKeys(review.escalatedMarkerKeys);
      for (const key of keys) latest.set(key, 'escalated');
    }
  }

  const escalated = new Set<string>();
  latest.forEach((state, key) => {
    if (state === 'escalated') escalated.add(key);
  });
  return escalated;
}

function safeParseKeys(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}
