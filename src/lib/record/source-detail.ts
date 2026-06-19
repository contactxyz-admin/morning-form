/**
 * Pure presentation logic for the shared source-detail body (plan
 * 2026-06-17-002). DOM-free so it's unit-testable in vitest's `node` env — the
 * component render stays visual-audit-gated, but the trust-calibration mapping
 * and the clinical ordering are load-bearing and locked here.
 */

import type { FlagTier } from '@/types/graph';

/**
 * Source kind → trust calibration. A verified lab reads differently from a
 * clinician note, a wearable estimate, or a self-report — the clinician's first
 * question. Safe for EVERY `SourceDocumentKind` (unknown / unmapped → '' so the
 * cue is gracefully omitted), so the shared body never crashes the authed path
 * on a future kind, and never couples to the demo-only evidence-grade util.
 *
 * ponytail: this is a SECOND source-trust vocabulary alongside `EVIDENCE_LABELS`
 * in node-detail-sheet.tsx — that one is keyed by the derived `EvidenceGrade`
 * (demo-only), this one by the always-present `kind`. Keep the copy in step if
 * either changes.
 */
export function authorityLabel(kind: string): string {
  switch (kind) {
    case 'lab_pdf':
    case 'private_lab_panel':
    case 'longevity_panel':
    case 'pathology_report':
      return 'Verified lab result';
    case 'genetics_report':
    case 'microbiome_panel':
    case 'stool_panel':
      return 'Lab panel';
    case 'at_home_test_result':
      return 'At-home test';
    case 'gp_record':
    case 'gp_letter':
    case 'specialist_letter':
    case 'referral_letter':
    case 'discharge_summary':
      return 'Clinician record';
    case 'imaging_report':
      return 'Imaging report';
    case 'body_composition_scan':
    case 'dexa_scan':
      return 'Body scan';
    case 'wearable_window':
      return 'Wearable estimate';
    case 'intake_text':
    case 'checkin':
      return 'Self-reported';
    default:
      return '';
  }
}

// Attention-first ordering — the clinically-salient readings surface first.
// Never alarming, just ordered; markers with no flag sort last.
const FLAG_PRIORITY: Record<FlagTier, number> = {
  escalation: 0,
  clinician_discussion: 1,
  attention: 2,
};

/** Sort rank for a grounded marker's flag — lower = more salient, sorts first. */
export function flagRank(flag: FlagTier | undefined): number {
  return flag ? FLAG_PRIORITY[flag] : 3;
}

/**
 * Combined attention-first rank for a grounded marker (plan 2026-06-18-002).
 * Authored interpretation flags rank by tier (0-2); a source-only out-of-range
 * flag (the source's own, no authored interpretation) ranks just below them so a
 * lab-flagged value surfaces above unflagged readings WITHOUT being assigned a
 * MorningForm tier; unflagged readings sort last.
 */
export function groundedMarkerRank(flag: FlagTier | undefined, hasSourceFlag: boolean): number {
  if (flag) return FLAG_PRIORITY[flag];
  return hasSourceFlag ? 2.5 : 3;
}
