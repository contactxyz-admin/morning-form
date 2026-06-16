/**
 * Derive a node's evidence grade from the sources that ground it (plan
 * 2026-06-16-002 R9) — so a validated lab doesn't render with the same
 * authority as a self-reported symptom or an inferred link. Pure; demo-only.
 */

import type { EvidenceGrade } from '@/types/graph';
import type { DemoSource } from '../../../prisma/fixtures/demo-navigable-record';

/** Map a source document kind to its evidence grade. */
export function sourceKindToGrade(kind: DemoSource['kind']): EvidenceGrade {
  switch (kind) {
    case 'lab_pdf':
      return 'lab';
    case 'gp_record':
      return 'clinician';
    case 'wearable_window':
      return 'device';
    case 'intake_text':
    case 'checkin':
      return 'self_reported';
  }
}

// Strongest → weakest. A node's grade is its STRONGEST supporting source.
const GRADE_RANK: Record<EvidenceGrade, number> = {
  lab: 4,
  clinician: 3,
  device: 2,
  self_reported: 1,
  inferred: 0,
};

/**
 * The node's evidence grade = the strongest of its supporting source kinds.
 * No grounding sources → `inferred` (e.g. a symptom linked only by association).
 */
export function evidenceGrade(kinds: readonly DemoSource['kind'][]): EvidenceGrade {
  if (kinds.length === 0) return 'inferred';
  return kinds
    .map(sourceKindToGrade)
    .reduce((best, g) => (GRADE_RANK[g] > GRADE_RANK[best] ? g : best), 'inferred' as EvidenceGrade);
}
