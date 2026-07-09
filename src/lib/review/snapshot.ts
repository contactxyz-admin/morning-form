/**
 * ResultReview.panelSummary — the creation-time snapshot of an ingested
 * panel's extracted markers. This is what the clinician actually saw at
 * sign-off, so the review row is a self-contained medico-legal record that
 * survives later graph rewrites (concept nodes merge across panels; "what
 * this document said" is not cleanly recoverable from GraphNode later).
 *
 * joinKey is computed with the SAME rule as the record map
 * (markerJoinKey(canonicalKey, registryKey)) so escalatedMarkerKeys match
 * wire nodes exactly at read time.
 */
import { z } from 'zod';
import { markerJoinKey } from '@/lib/markers/marker-key';
import { resolveBiomarker } from '@/lib/intake/biomarkers';

export const SnapshotMarkerSchema = z.object({
  displayName: z.string(),
  canonicalKey: z.string(),
  joinKey: z.string(),
  value: z.number(),
  unit: z.string().nullable(),
  referenceRangeLow: z.number().nullable(),
  referenceRangeHigh: z.number().nullable(),
  flaggedOutOfRange: z.boolean(),
  collectionDate: z.string().nullable(),
});

export const PanelSummarySchema = z.object({
  labProvider: z.string().nullable(),
  sourceRef: z.string().nullable(),
  markers: z.array(SnapshotMarkerSchema),
});

export type SnapshotMarker = z.infer<typeof SnapshotMarkerSchema>;
export type PanelSummary = z.infer<typeof PanelSummarySchema>;

/** The extraction-shaped input the intake route already holds (validBiomarkers). */
export interface ExtractedMarkerInput {
  canonicalKey: string;
  displayName: string;
  value: number;
  unit: string | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  flaggedOutOfRange: boolean;
  collectionDate?: string | null;
}

export function buildPanelSummary(input: {
  biomarkers: ExtractedMarkerInput[];
  labProvider: string | null;
  sourceRef: string | null;
}): PanelSummary {
  return PanelSummarySchema.parse({
    labProvider: input.labProvider,
    sourceRef: input.sourceRef,
    markers: input.biomarkers.map((b) => ({
      displayName: b.displayName,
      canonicalKey: b.canonicalKey,
      // Same joinKey rule as ingest writes to node attributes
      // (registryKey = resolveBiomarker(displayName)) and as the record map
      // reads — this is what makes the escalation override line up.
      joinKey: markerJoinKey(b.canonicalKey, resolveBiomarker(b.displayName)?.canonicalKey ?? null),
      value: b.value,
      unit: b.unit,
      referenceRangeLow: b.referenceRangeLow,
      referenceRangeHigh: b.referenceRangeHigh,
      flaggedOutOfRange: b.flaggedOutOfRange,
      collectionDate: b.collectionDate ?? null,
    })),
  });
}

/** Safe parse for read paths — malformed stored JSON degrades to null, never throws. */
export function parsePanelSummary(raw: string): PanelSummary | null {
  try {
    return PanelSummarySchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
