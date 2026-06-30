/**
 * Wire types for the /api/graph response. Server-side types live in
 * src/lib/graph/types.ts and use Date; JSON round-trip stringifies those,
 * so the client types mirror the same shape with string timestamps.
 */

import type { EdgeType, NodeType } from '@/lib/graph/types';
import type { ImportanceTier } from '@/lib/graph/importance';
import type { ChangeClassification, ChangeDirection } from '@/lib/markers/classify-change';

export type { EdgeType, NodeType, ImportanceTier };

/**
 * "What changed since the last panel" for a biomarker node, attached by the
 * record route when LONGITUDINAL_GRAPH_ENABLED is on (plan 2026-06-10-003).
 * Range-relative + descriptive — no causal/diagnostic framing. Type-only
 * import of the classification unions keeps the vocabulary single-sourced in
 * panel-diff without a runtime dependency.
 */
export interface NodeChangeWire {
  direction: ChangeDirection | null; // null for `new` (no prior value)
  classification: ChangeClassification;
  beforeValue: number | null;
  beforeAt: string | null;
  afterValue: number;
  afterAt: string;
  unit: string;
}

export interface GraphNodeWire {
  id: string;
  userId: string;
  type: NodeType;
  canonicalKey: string;
  displayName: string;
  attributes: Record<string, unknown>;
  confidence: number;
  promoted: boolean;
  createdAt: string;
  updatedAt: string;
  tier: ImportanceTier;
  score: number;
  /**
   * Present only on biomarker nodes that moved vs the previous panel, and
   * only when the longitudinal read surface is enabled. Absent otherwise —
   * flag-off responses are byte-for-byte the pre-feature shape.
   */
  change?: NodeChangeWire;
  /**
   * ISO date of the node's earliest evidence. Populated only by the demo
   * adapter to drive the `/demo/record` time scrubber (plan 2026-06-15-001);
   * the authed record route never sets it, so flag-off responses stay
   * byte-for-byte the pre-feature shape. Absent → "always present".
   */
  firstSeenAt?: string;
  /**
   * Strength of the evidence grounding this node — so a validated lab doesn't
   * render with the same authority as a self-reported symptom or an inferred
   * link (plan 2026-06-16-002 R9). Populated only by the demo adapter (derived
   * from the node's strongest supporting source); the authed path never sets it.
   */
  evidenceGrade?: EvidenceGrade;
  /**
   * Consumer-facing clinical interpretation (the four CMO dimensions + flag),
   * derived by the interpretation engine from the node's change. Set by the
   * demo adapter (plan 2026-06-16-003) AND, since plan 2026-06-30-001 U8, by
   * the authed record route — but ONLY behind LONGITUDINAL_GRAPH_ENABLED for
   * CMO-authored markers that moved vs the previous panel. Flag-off authed
   * responses still never carry it (byte-for-byte the pre-feature shape).
   */
  interpretation?: NodeInterpretation;
  /**
   * The SOURCE's own out-of-range flag for a biomarker (plan 2026-06-18-002),
   * relayed faithfully — distinct from `interpretation`. Set by the demo adapter
   * (from the fixture's `flaggedOutOfRange`) and the authed source route (from
   * the concept node's attribute); the authed /api/graph map path never sets it,
   * matching the lean-map pattern of `change`/`interpretation`.
   */
  sourceFlag?: SourceAbnormality;
}

/**
 * The source's OWN out-of-range flag for a value (e.g. a lab's H/L marker),
 * relayed faithfully — NEVER a MorningForm clinical judgement (plan
 * 2026-06-18-002). This is the one honest exception to "no authored rule ⇒ no
 * judgement": when the source itself flags a value abnormal, we surface that,
 * source-attributed, so a clearly-abnormal value is never shown as silently
 * neutral. It is a separate signal from `change` (data availability) and
 * `interpretation` (reviewed, authored-only) — the signals are composed in the
 * view, never conflated onto one flag.
 */
export interface SourceAbnormality {
  /** Always true when present — the source marked this value out of range. */
  readonly flaggedOutOfRange: true;
  /**
   * Position vs the source's printed reference range when derivable from the
   * value + range ('above' / 'below'); 'out_of_range' when the direction isn't
   * known. Read from the source's own numbers, never inferred.
   */
  readonly position: 'above' | 'below' | 'out_of_range';
}

/**
 * Evidence strength, strongest → weakest: a validated lab panel outranks a
 * clinician record, a wearable estimate, a patient self-report, and an inferred
 * relationship (no grounding source). Demo-only (plan 2026-06-16-002 R9).
 */
export type EvidenceGrade = 'lab' | 'clinician' | 'device' | 'self_reported' | 'inferred';

/**
 * Three-tier flag taxonomy (CMO direction 2026-06-16) — kept visually distinct,
 * never blurred. Most of the product lives in `attention` + `clinician_discussion`;
 * `escalation` hides the user-facing interpretation and routes to clinician
 * handover (nothing diagnostic is shown as a conclusion).
 */
export type FlagTier = 'attention' | 'clinician_discussion' | 'escalation';

/**
 * Consumer-facing clinical interpretation of a marker's derived change — the
 * four dimensions the CMO specified (plan 2026-06-16-003), derived from a
 * CMO-authored matrix. Demo-only and additive; the authed path never sets it.
 * `whereItIsNow` = status · the trend ("what changed") is the node's `change`,
 * not duplicated here · `signalClarity` = how clear the signal is · `nextStep`
 * = what to do next (verbatim CMO copy).
 */
export interface NodeInterpretation {
  whereItIsNow: string;
  signalClarity: string;
  nextStep: string;
  flag: FlagTier;
  plainEnglish: string;
}

export interface GraphEdgeWire {
  id: string;
  userId: string;
  type: EdgeType;
  fromNodeId: string;
  toNodeId: string;
  fromChunkId: string | null;
  fromDocumentId: string | null;
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface GraphResponse {
  nodes: GraphNodeWire[];
  edges: GraphEdgeWire[];
  nodeTypeCounts: Partial<Record<NodeType, number>>;
  truncated: boolean;
  totalNodes: number;
}
