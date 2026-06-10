/**
 * Panel diff — "what changed since my last test" (longitudinal plan
 * 2026-06-10-002 U4).
 *
 * Compares a user's two most-recent lab panels (lab_pdf SourceDocuments) and
 * reports, per marker, the change between them. Instances join their panel
 * via the SUPPORTS edge written at ingest (`fromDocumentId`), and their
 * marker via INSTANCE_OF.
 *
 * Classification is strictly REFERENCE-RANGE-RELATIVE and descriptive — it
 * says whether a value moved toward or away from its reference interval, not
 * whether that is clinically good, and never names a condition or cause. In
 * the absence of a reference range it reports direction only. This keeps the
 * surface on the safe side of the May priority-markers pivot.
 */

import type { PrismaClient, Prisma } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export type ChangeDirection = 'up' | 'down' | 'flat';
export type ChangeClassification =
  | 'improved' // moved toward / further into the reference interval
  | 'worsened' // moved away from the reference interval
  | 'stable' // in range both times, or no net distance change
  | 'unclassified' // no reference range to judge against — direction only
  | 'new'; // measured in the latest panel only (no prior value)

export interface MarkerChange {
  marker: string;
  unit: string;
  beforeValue: number | null;
  beforeAt: string | null;
  afterValue: number;
  afterAt: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  direction: ChangeDirection | null; // null for `new`
  classification: ChangeClassification;
}

export interface PanelDiff {
  latestPanelAt: string;
  previousPanelAt: string | null;
  changes: MarkerChange[];
}

/** Distance from `x` to the `[low, high]` interval; 0 when inside it. */
function distanceToRange(x: number, low: number | null, high: number | null): number {
  if (low != null && x < low) return low - x;
  if (high != null && x > high) return x - high;
  return 0;
}

/**
 * Pure range-relative change classifier. `improved` = closer to the reference
 * interval; `worsened` = further from it; `stable` = no net distance change
 * (incl. in-range both times); `unclassified` = no usable range.
 */
export function classifyChange(
  before: number,
  after: number,
  low: number | null,
  high: number | null,
): { direction: ChangeDirection; classification: ChangeClassification } {
  const direction: ChangeDirection = after > before ? 'up' : after < before ? 'down' : 'flat';
  if (low == null && high == null) {
    return { direction, classification: 'unclassified' };
  }
  const dBefore = distanceToRange(before, low, high);
  const dAfter = distanceToRange(after, low, high);
  if (dAfter < dBefore) return { direction, classification: 'improved' };
  if (dAfter > dBefore) return { direction, classification: 'worsened' };
  return { direction, classification: 'stable' };
}

interface InstanceRow {
  marker: string;
  unit: string;
  value: number;
  measuredAt: string;
  referenceLow: number | null;
  referenceHigh: number | null;
}

/**
 * Build the diff between the user's two most-recent lab panels. Returns
 * `previousPanelAt: null` (and `new` rows) when only one panel exists.
 * Returns null when there are no lab panels at all.
 */
export async function diffLatestPanels(db: Db, userId: string): Promise<PanelDiff | null> {
  const docs = await db.sourceDocument.findMany({
    where: { userId, kind: 'lab_pdf' },
    orderBy: { capturedAt: 'desc' },
    take: 2,
    select: { id: true, capturedAt: true },
  });
  if (docs.length === 0) return null;

  const latestDoc = docs[0];
  const prevDoc = docs[1] ?? null;

  const latest = await loadPanelInstances(db, userId, latestDoc.id);
  const previous = prevDoc ? await loadPanelInstances(db, userId, prevDoc.id) : new Map();

  const changes: MarkerChange[] = [];
  for (const [marker, after] of latest) {
    const before = previous.get(marker);
    if (!before) {
      changes.push({
        marker,
        unit: after.unit,
        beforeValue: null,
        beforeAt: null,
        afterValue: after.value,
        afterAt: after.measuredAt,
        referenceLow: after.referenceLow,
        referenceHigh: after.referenceHigh,
        direction: null,
        classification: 'new',
      });
      continue;
    }
    const { direction, classification } = classifyChange(
      before.value,
      after.value,
      after.referenceLow,
      after.referenceHigh,
    );
    changes.push({
      marker,
      unit: after.unit,
      beforeValue: before.value,
      beforeAt: before.measuredAt,
      afterValue: after.value,
      afterAt: after.measuredAt,
      referenceLow: after.referenceLow,
      referenceHigh: after.referenceHigh,
      direction,
      classification,
    });
  }

  // Deterministic, readable order by marker name.
  changes.sort((a, b) => a.marker.localeCompare(b.marker));

  return {
    latestPanelAt: latestDoc.capturedAt.toISOString(),
    previousPanelAt: prevDoc ? prevDoc.capturedAt.toISOString() : null,
    changes,
  };
}

/**
 * Map of marker displayName → its reading in one panel. Joins observation
 * instances to the panel via SUPPORTS (`fromDocumentId`) and to their marker
 * concept via INSTANCE_OF, pulling the reference range off the concept.
 */
async function loadPanelInstances(
  db: Db,
  userId: string,
  documentId: string,
): Promise<Map<string, InstanceRow>> {
  // Observation instances supported by this document.
  const supports = await db.graphEdge.findMany({
    where: { userId, type: 'SUPPORTS', fromDocumentId: documentId },
    select: { fromNodeId: true },
  });
  const supportedIds = Array.from(new Set(supports.map((e) => e.fromNodeId)));
  if (supportedIds.length === 0) return new Map();

  const instances = await db.graphNode.findMany({
    where: { userId, id: { in: supportedIds }, type: 'observation' },
    select: { id: true, attributes: true },
  });
  if (instances.length === 0) return new Map();

  // Each instance → its marker concept via INSTANCE_OF.
  const instanceIds = instances.map((n) => n.id);
  const instanceOf = await db.graphEdge.findMany({
    where: { userId, type: 'INSTANCE_OF', fromNodeId: { in: instanceIds } },
    select: { fromNodeId: true, toNodeId: true },
  });
  const conceptByInstance = new Map(instanceOf.map((e) => [e.fromNodeId, e.toNodeId]));
  const conceptIds = Array.from(new Set(instanceOf.map((e) => e.toNodeId)));

  const concepts = await db.graphNode.findMany({
    where: { userId, id: { in: conceptIds }, type: 'biomarker' },
    select: { id: true, displayName: true, attributes: true },
  });
  const conceptById = new Map(concepts.map((c) => [c.id, c]));

  const out = new Map<string, InstanceRow>();
  for (const inst of instances) {
    const conceptId = conceptByInstance.get(inst.id);
    if (!conceptId) continue;
    const concept = conceptById.get(conceptId);
    if (!concept) continue;

    const attrs = safeParse(inst.attributes);
    const value = typeof attrs.value === 'number' ? attrs.value : null;
    const measuredAt = typeof attrs.measuredAt === 'string' ? attrs.measuredAt : null;
    if (value === null || !measuredAt) continue;

    const cAttrs = safeParse(concept.attributes);
    out.set(concept.displayName, {
      marker: concept.displayName,
      unit: typeof attrs.unit === 'string' ? attrs.unit : '',
      value,
      measuredAt,
      referenceLow: typeof cAttrs.referenceRangeLow === 'number' ? cAttrs.referenceRangeLow : null,
      referenceHigh: typeof cAttrs.referenceRangeHigh === 'number' ? cAttrs.referenceRangeHigh : null,
    });
  }
  return out;
}

function safeParse(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
