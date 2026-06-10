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
import { env } from '@/lib/env';
import { parseJsonField } from '@/lib/graph/queries';
import { wearableMetricNamesFor } from './metric-aliases';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Gate for the longitudinal READ behaviours added by plan 2026-06-10-002
 * (observation-instance series + the lab↔wearable metric alias join).
 * Instance WRITES are deliberately unconditional (gating them would create a
 * backfill gap), but with the flag off every read surface must stay
 * byte-for-byte pre-longitudinal (plan R8) — so the reader ignores instances
 * and skips alias expansion until the flip. `process.env` first is the
 * repo's test seam (matches ASK_DEEP_ENABLED in chat/turn.ts).
 */
function longitudinalReadsEnabled(): boolean {
  return (process.env.LONGITUDINAL_GRAPH_ENABLED ?? env.LONGITUDINAL_GRAPH_ENABLED) === 'true';
}

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

  const merged = reconcileUnits([...biomarkerPoints, ...wearablePoints]);
  if (!merged.length) return [];

  // Sort by date ascending, dedupe same-day, take most-recent.
  merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const deduped = dedupeSameDay(merged);
  const capped = deduped.slice(-maxPoints).reverse(); // newest first
  return capped;
}

/**
 * Resolve the "before" marker value for an outcome snapshot: the value the
 * user actually committed against, i.e. the most-recent dated point AT OR BEFORE
 * the Action's `acceptedAt` timestamp.
 *
 * Why not trajectory-oldest: `buildMarkerTrajectory` caps to the most-recent
 * ~24 points, so its oldest entry is "oldest-of-recent-window", not the value
 * present when the user accepted the action. Because the ActionOutcome snapshot
 * is frozen and terminal, the before-value must be right on first write — so we
 * select against the FULL series (uncapped) bounded by acceptedAt rather than
 * the windowed trajectory.
 *
 * Returns null when `acceptedAt` is null or no dated value exists at/before it
 * (the legitimate 1-point / no-before case — the caller leaves beforeValue null).
 */
export async function resolveBeforeValueAtAcceptance(
  db: Db,
  userId: string,
  markerName: string,
  acceptedAt: Date | null,
): Promise<{ value: number; timestamp: string } | null> {
  if (!acceptedAt) return null;
  const cutoffMs = acceptedAt.getTime();

  // Full (uncapped) unit-reconciled series, ascending.
  const [biomarkerPoints, wearablePoints] = await Promise.all([
    loadBiomarkerSeries(db, userId, markerName),
    loadWearableSeries(db, userId, markerName),
  ]);
  const merged = reconcileUnits([...biomarkerPoints, ...wearablePoints]);
  if (!merged.length) return null;
  merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Most-recent point whose date is at or before acceptedAt.
  let chosen: SeriesPoint | null = null;
  for (const p of merged) {
    if (new Date(p.timestamp).getTime() <= cutoffMs) chosen = p;
    else break; // ascending — once past the cutoff, stop.
  }
  if (!chosen) return null;
  return { value: chosen.value, timestamp: chosen.timestamp };
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
    select: { id: true, displayName: true, attributes: true },
  });

  const concepts = nodes.filter(
    (n) => n.displayName.toLowerCase() === markerName.toLowerCase(),
  );
  if (concepts.length === 0) return [];

  // Dated history lives on `observation` instances linked to the concept via
  // INSTANCE_OF (longitudinal plan 2026-06-10-002). The fallback is
  // PER-CONCEPT, not global: a concept WITH instances contributes its
  // instance points (its own `latestValue`/`collectionDate` pair would mix a
  // current value with the first-seen date), while a same-displayName concept
  // WITHOUT instances (legacy/pre-migration) still contributes its anchor
  // value — a global early-return would silently drop it.
  const instancesByConcept = longitudinalReadsEnabled()
    ? await loadObservationInstances(db, userId, concepts.map((n) => n.id), markerName)
    : new Map<string, SeriesPoint[]>();

  const points: SeriesPoint[] = [];
  for (const node of concepts) {
    const instancePoints = instancesByConcept.get(node.id);
    if (instancePoints && instancePoints.length > 0) {
      points.push(...instancePoints);
      continue;
    }

    const attrs = parseJsonField(node.attributes);
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

/**
 * Dated lab-reading instances for a marker, grouped by the concept node they
 * are INSTANCE_OF. Each carries its own value/unit/measuredAt, so this is the
 * real multi-point lab series.
 */
async function loadObservationInstances(
  db: Db,
  userId: string,
  conceptIds: string[],
  markerName: string,
): Promise<Map<string, SeriesPoint[]>> {
  const byConcept = new Map<string, SeriesPoint[]>();
  const edges = await db.graphEdge.findMany({
    where: { userId, type: 'INSTANCE_OF', toNodeId: { in: conceptIds } },
    select: { fromNodeId: true, toNodeId: true },
  });
  if (edges.length === 0) return byConcept;
  const conceptByInstance = new Map(edges.map((e) => [e.fromNodeId, e.toNodeId]));

  const instances = await db.graphNode.findMany({
    where: { userId, id: { in: edges.map((e) => e.fromNodeId) }, type: 'observation' },
    select: { id: true, attributes: true },
  });

  for (const inst of instances) {
    const attrs = parseJsonField(inst.attributes);
    const value = typeof attrs.value === 'number' ? attrs.value : null;
    const dateStr = typeof attrs.measuredAt === 'string' ? attrs.measuredAt : null;
    if (value === null || !dateStr) continue;
    const conceptId = conceptByInstance.get(inst.id);
    if (!conceptId) continue;
    const arr = byConcept.get(conceptId) ?? [];
    arr.push({
      metric: markerName,
      value,
      unit: typeof attrs.unit === 'string' ? attrs.unit : '',
      timestamp: new Date(dateStr).toISOString(),
    });
    byConcept.set(conceptId, arr);
  }
  return byConcept;
}

/**
 * Wearable HealthDataPoint categories that are NOT lab-equivalent scalar
 * measurements and must never co-plot with a lab marker on one axis. `recovery`
 * (and similar composite scores) are derived 0–100 indices, not the physical
 * quantity a lab marker measures — merging them with a lab value would put two
 * incompatible scales on the same axis. Excluded from the trajectory merge.
 */
const NON_LAB_EQUIVALENT_CATEGORIES = new Set(['recovery']);

async function loadWearableSeries(
  db: Db,
  userId: string,
  markerName: string,
): Promise<SeriesPoint[]> {
  // Match the marker name AND (flag-gated) its known wearable-metric aliases
  // (e.g. "Ferritin" ↔ `ferritin_ng_ml`), so the lab and wearable stores
  // actually merge (longitudinal plan 2026-06-10-002 U3). Aliases are
  // explicit, not fuzzy; unit conflicts are still dropped by reconcileUnits
  // downstream. Flag off → exact-name match only, the pre-longitudinal
  // behaviour.
  const metricNames = longitudinalReadsEnabled()
    ? wearableMetricNamesFor(markerName)
    : [markerName];
  const rows = await db.healthDataPoint.findMany({
    where: { userId, metric: { in: metricNames, mode: 'insensitive' } },
    orderBy: { timestamp: 'asc' },
    select: { metric: true, value: true, unit: true, timestamp: true, category: true },
  });

  return rows
    .filter((r) => !NON_LAB_EQUIVALENT_CATEGORIES.has(r.category.toLowerCase()))
    .map((r) => ({
      // Normalize aliased rows to the canonical marker name so unit
      // reconciliation and same-day dedupe key consistently against the lab
      // points (which carry the marker displayName).
      metric: markerName,
      value: r.value,
      unit: r.unit,
      timestamp: r.timestamp.toISOString(),
    }));
}

/**
 * Unit reconciliation across the merged lab + wearable series (P1 #4).
 *
 * The two stores join only on metric-name (case-insensitive); without this,
 * a same-name point with a mismatched non-empty unit would silently co-plot on
 * one axis with incompatible units. Rule: for each metric, the dominant unit is
 * the first non-empty unit encountered (lab points are listed first, so the lab
 * unit wins). Any point whose non-empty unit differs from the dominant unit is
 * DROPPED (not co-plotted). Empty-unit points (unit unknown) are kept — they
 * make no conflicting claim. Documented choice: drop-on-conflict over
 * convert-on-conflict, because there is no in-repo unit-conversion table and a
 * silent wrong-scale co-plot is worse than a missing point.
 */
export function reconcileUnits(points: SeriesPoint[]): SeriesPoint[] {
  const dominantUnit = new Map<string, string>();
  for (const p of points) {
    const key = p.metric.toLowerCase();
    if (p.unit && !dominantUnit.has(key)) dominantUnit.set(key, p.unit);
  }
  return points.filter((p) => {
    if (!p.unit) return true; // no unit claim → keep
    const dom = dominantUnit.get(p.metric.toLowerCase());
    return !dom || p.unit === dom;
  });
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
