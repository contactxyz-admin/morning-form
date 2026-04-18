/**
 * Clinical safety policy types — see docs/plans/2026-04-18-001-feat-clinical-scribes-in-content-plan.md (U2, D2).
 *
 * These types describe the per-topic scope-of-practice document that every
 * scribe output is measured against. A specialist-GP scribe for a topic is
 * bounded by (1) a fixed set of allowed judgment kinds, (2) a list of
 * forbidden phrase patterns (drugs, dose strings, imperative treatment
 * verbs), and (3) a minimum citation density per section. Anything outside
 * the allowed set is routed to GP prep or a clinician handoff rather than
 * answered.
 */

export const JUDGMENT_KINDS = [
  'reference-range-comparison',
  'pattern-vs-own-history',
  'citation-surfacing',
  'definition-lookup',
] as const;
export type JudgmentKind = (typeof JUDGMENT_KINDS)[number];

export type SafetyClassification =
  | 'clinical-safe'
  | 'out-of-scope-routed'
  | 'rejected';

export type OutOfScopeRoute = 'discussWithClinician' | 'gpPrep';

export interface SafetyPolicy {
  topicKey: string;
  allowedJudgmentKinds: readonly JudgmentKind[];
  /** Phrase-level tripwires — drug names, dose strings, imperative verbs. */
  forbiddenPhrasePatterns: readonly RegExp[];
  /**
   * Minimum citations per paragraph per section. Example: `0.5` means at
   * least one citation for every two paragraphs in a section.
   */
  minCitationDensityPerSection: number;
  outOfScopeRoute: OutOfScopeRoute;
}

export interface PolicySection {
  heading: string;
  paragraphCount: number;
  citationCount: number;
}

export interface PolicyCandidate {
  /**
   * The kind of judgment the scribe claims to be making. `null` is treated as
   * out-of-scope — the scribe must self-classify before enforce() can run.
   */
  judgmentKind: JudgmentKind | null;
  /** Full output text — scanned for forbidden phrase patterns. */
  output: string;
  sections: readonly PolicySection[];
}

export type PolicyViolationKind =
  | 'judgment-kind-not-allowed'
  | 'unknown-judgment-kind'
  | 'forbidden-phrase'
  | 'insufficient-citation-density';

export interface PolicyViolation {
  kind: PolicyViolationKind;
  detail: string;
  sectionHeading?: string;
  match?: string;
}

export type EnforceResult =
  | { ok: true; classification: 'clinical-safe'; violations: readonly [] }
  | {
      ok: false;
      classification: 'out-of-scope-routed' | 'rejected';
      violations: readonly PolicyViolation[];
    };
