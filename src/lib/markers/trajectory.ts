/**
 * Unified marker trajectory reader (Plan 2026-06-06-002 Phase B U3).
 *
 * Merges biomarker GraphNode values (one dated value per node) with
 * wearable HealthDataPoint rows into a single ordered SeriesPoint[]
 * for charting. Reuses the Phase-A SeriesPoint shape from
 * `recognize-pattern-in-history.ts`.
 *
 * Field precedence for biomarker nodes: value = `value ?? latestValue`;
 * date = `collectionDate ?? observedAt`. Nodes where both dates are null
 * are skipped.
 *
 * Output: merged, date-ordered, most-recent-first, capped ~24, same-day
 * deduped by (metric, date).
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import type { SeriesPoint } from '@/lib/scribe/tools/recognize-pattern-in-history';

type Db = PrismaClient | Prisma.TransactionClient;

export const MAX_TRAJECTORY_POINTS = 24;

export interface TrajectoryOptions {
  maxPoints?: number;
}

/**
 * Resolve the canonical key for a marker name by searching all archetype
 * content for a match. Returns the matched marker name (normalized) or
 * null when the marker isn't registered.
 */
export function resolveCanonicalMarkerKey(markerName: string): string | null {
  const { resolvePrioritiesContent } = require('@/lib/priority-marker-engine');
  const archetypes = [
    'sustained-activator', 'fragmented-sleeper', 'sympathetic-dominant',
    'flat-liner', 'over-stimulated', 'well-regulated',
  ];
  for (const key of archetypes) {
    const c = resolvePrioritiesContent(key);
    if (!c) continue;
    const m = c.markers.find(
      (m: { markerName: string }) =>
        m.markerName.toLowerCase() === markerName.toLowerCase(),
    );
    if (m) return m.markerName;
  }
  return null;
}

/**
 * Build the unified trajectory for a canonical marker name.
 * Returns the merged, date-ordered series (newest first), capped.
 */
export async function buildMarkerTrajectory(
  db: Db,
  userId: string,
  markerName: string,
  opts: TrajectoryOptions = {},
): Promise<SeriesPoint[]> {
  const maxPoints = opts.maxPoints ?? MAX_TRAJECTORY_POINTS;

  const [biomarkerPoints, wearablePoints] = await Promise.all([
    loadBiomarkerSeries(db, userId, markerName),
    loadWearableSeries(db, userId, markerName),
  ]);

  const merged = [...biomarkerPoints, ...wearablePoints];
  if (!merged.length) return [];

  // Sort by date ascending, dedupe same-day, take most-recent.
  merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const deduped = dedupeSameDay(merged);
  const capped = deduped.slice(-maxPoints).reverse(); // newest first
  return capped;
}

// ---------------------------------------------------------------------------
// Section loaders
// ---------------------------------------------------------------------------

async function loadBiomarkerSeries(
  db: Db,
  userId: string,
  markerName: string,
): Promise<SeriesPoint[]> {
  const nodes = await db.graphNode.findMany({
    where: { userId, type: 'biomarker' },
    select: { displayName: true, attributes: true },
  });

  const points: SeriesPoint[] = [];
  for (const node of nodes) {
    if (node.displayName.toLowerCase() !== markerName.toLowerCase()) continue;
    let attrs: Record<string, unknown> | null = null;
    try {
      attrs = node.attributes ? JSON.parse(node.attributes) : null;
    } catch { continue; }
    if (!attrs) continue;

    const value = typeof attrs.latestValue === 'number' ? attrs.latestValue
                : typeof attrs.value === 'number' ? attrs.value
                : null;
    if (value === null) continue;
    const unit = typeof attrs.unit === 'string' ? attrs.unit : '';
    const dateStr = typeof attrs.collectionDate === 'string' ? attrs.collectionDate
                  : typeof attrs.observedAt === 'string' ? attrs.observedAt
                  : null;
    if (!dateStr) continue; // skip nodes without a date

    points.push({
      metric: node.displayName,
      value,
      unit,
      timestamp: new Date(dateStr).toISOString(),
    });
  }
  return points;
}

async function loadWearableSeries(
  db: Db,
  userId: string,
  markerName: string,
): Promise<SeriesPoint[]> {
  const rows = await db.healthDataPoint.findMany({
    where: { userId, metric: { equals: markerName, mode: 'insensitive' } },
    orderBy: { timestamp: 'asc' },
    select: { metric: true, value: true, unit: true, timestamp: true },
  });

  return rows.map((r) => ({
    metric: r.metric,
    value: r.value,
    unit: r.unit,
    timestamp: r.timestamp.toISOString(),
  }));
}

function dedupeSameDay(points: SeriesPoint[]): SeriesPoint[] {
  const seen = new Set<string>();
  return points.filter((p) => {
    const day = p.timestamp.slice(0, 10); // YYYY-MM-DD
    const key = `${p.metric}:${day}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
