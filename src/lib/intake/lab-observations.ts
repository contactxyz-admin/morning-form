/**
 * Dated observation instances for lab biomarkers (longitudinal plan
 * 2026-06-10-002 U2).
 *
 * The biomarker concept node is upserted one-per-marker, so it can only
 * carry ONE value — a second panel's reading used to be discarded by the
 * first-write-wins merge. This module turns each extracted lab reading into
 * a dated `observation` instance node linked to its concept node via
 * INSTANCE_OF (the same concept+instance pattern as symptom/symptom_episode
 * and intervention/intervention_event), so marker history accumulates while
 * the concept node keeps tracking "current" via its rolling fields.
 *
 * Pure: callers append the returned nodes/edges to their
 * `IngestExtractionInput` — all persistence stays in `ingestExtraction`'s
 * transaction.
 */

import type { IngestExtractionInput } from '@/lib/graph/types';
import { slugify } from '@/lib/graph/canonical-keys';

export interface LabReadingForObservation {
  canonicalKey: string;
  displayName: string;
  value: number;
  unit: string;
  collectionDate?: string | null;
  supportingChunkIndices?: number[];
}

export interface LabObservationGraphInputs {
  nodes: IngestExtractionInput['nodes'];
  edges: IngestExtractionInput['edges'];
}

/**
 * Canonical key for one dated reading of one marker:
 * `obs_<marker>_<yyyy_mm_dd>`. Same-day re-measurements deliberately
 * collapse onto one key — consistent with the trajectory reader's same-day
 * dedupe. Returns null when the date is unparseable (an undated reading has
 * no place on a timeline; the concept node still captures it).
 */
export function observationKeyFor(markerCanonicalKey: string, dateInput: string): string | null {
  const slug = slugify(markerCanonicalKey);
  if (!slug) return null;
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString();
  return `obs_${slug}_${iso.slice(0, 4)}_${iso.slice(5, 7)}_${iso.slice(8, 10)}`;
}

/**
 * Build the observation instance nodes + INSTANCE_OF edges for a panel's
 * extracted readings. Readings without a resolvable date (own
 * `collectionDate`, falling back to the panel's `reportCollectionDate`) are
 * skipped — they still land on the concept node via the caller's biomarker
 * write.
 */
export function buildLabObservationGraphInputs(
  readings: LabReadingForObservation[],
  reportCollectionDate: string | null | undefined,
): LabObservationGraphInputs {
  const nodes: IngestExtractionInput['nodes'] = [];
  const edges: IngestExtractionInput['edges'] = [];

  for (const reading of readings) {
    const dateStr = reading.collectionDate ?? reportCollectionDate;
    if (!dateStr) continue;
    const key = observationKeyFor(reading.canonicalKey, dateStr);
    if (!key) continue;
    const measuredAt = new Date(dateStr).toISOString();

    nodes.push({
      type: 'observation',
      canonicalKey: key,
      displayName: `${reading.displayName} · ${formatReadingDate(measuredAt)}`,
      attributes: {
        value: reading.value,
        unit: reading.unit,
        measuredAt,
        context: 'clinic',
        source: 'lab_pdf',
      },
      // History points, not graph concepts: kept out of the importance
      // promotion track and filtered from the canvas payload (plan U6).
      promoted: false,
      supportingChunkIndices: reading.supportingChunkIndices,
    });
    edges.push({
      type: 'INSTANCE_OF',
      fromType: 'observation',
      fromCanonicalKey: key,
      toType: 'biomarker',
      toCanonicalKey: reading.canonicalKey,
    });
  }

  return { nodes, edges };
}

function formatReadingDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
