/**
 * ResultReview lifecycle: creation on lab ingest, the clinic queue reads,
 * and the clinician's decision write.
 *
 * The decision uses the conditional-updateMany CAS pattern from
 * src/app/api/actions/[id]/transition/route.ts — two clinicians deciding the
 * same review concurrently produce exactly one decision; the loser learns
 * the current status instead of silently double-writing the audit record.
 */
import type { Prisma, PrismaClient, ResultReview } from '@prisma/client';
import { buildPanelSummary, parsePanelSummary, type ExtractedMarkerInput } from './snapshot';

type Db = PrismaClient | Prisma.TransactionClient;

export interface CreateReviewInput {
  userId: string;
  sourceDocumentId: string;
  documentCapturedAt: Date;
  biomarkers: ExtractedMarkerInput[];
  labProvider: string | null;
  sourceRef: string | null;
}

/**
 * Create the pending review for a freshly ingested panel. Idempotent: the
 * @unique(sourceDocumentId) constraint plus a P2002-swallow means a retried
 * hook can never produce two reviews for one document. (The intake route's
 * contentHash dedup already returns before any hook on a re-upload, so this
 * is belt-and-braces.)
 */
export async function createReviewForDocument(
  db: Db,
  input: CreateReviewInput,
): Promise<{ created: boolean }> {
  const summary = buildPanelSummary({
    biomarkers: input.biomarkers,
    labProvider: input.labProvider,
    sourceRef: input.sourceRef,
  });
  try {
    await db.resultReview.create({
      data: {
        userId: input.userId,
        sourceDocumentId: input.sourceDocumentId,
        panelSummary: JSON.stringify(summary),
        documentCapturedAt: input.documentCapturedAt,
      },
    });
    return { created: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { created: false };
    throw err;
  }
}

/** The clinic queue: pending reviews, oldest first, with member identity. */
export async function listPendingReviews(db: Db) {
  return db.resultReview.findMany({
    // Orphaned pendings (document deleted outside erasure → SetNull) would
    // render a dead link; decided orphans remain as audit records but
    // pendings without a document are unreviewable — exclude them.
    where: { status: 'pending', sourceDocumentId: { not: null } },
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { email: true, name: true } },
      sourceDocument: { select: { sourceRef: true } },
    },
  });
}

export async function getReviewForClinician(db: Db, id: string) {
  return db.resultReview.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
      sourceDocument: { select: { sourceRef: true } },
    },
  });
}

export type DecideReviewInput =
  | { reviewId: string; clinicianEmail: string; clinicianUserId: string; action: 'approve' }
  | {
      reviewId: string;
      clinicianEmail: string;
      clinicianUserId: string;
      action: 'escalate';
      reason: string;
      markerKeys?: string[];
    };

export type DecideReviewResult =
  | { decided: true; review: ResultReview; escalatedMarkerKeys: string[] }
  | { decided: false; currentStatus: string | null };

/**
 * Decide a pending review. On escalate, markerKeys must be a subset of the
 * snapshot's joinKeys (unknown keys are rejected by the caller's 400, not
 * silently dropped — a clinician's escalation must never quietly shrink);
 * when omitted, defaults to the lab-flagged subset, falling back to ALL
 * panel markers if the lab flagged nothing.
 */
export async function decideReview(db: Db, input: DecideReviewInput): Promise<DecideReviewResult> {
  const existing = await db.resultReview.findUnique({ where: { id: input.reviewId } });
  if (!existing) return { decided: false, currentStatus: null };

  // Independence of the sign-off record: an allowlisted clinician who is
  // also a pilot member must never decide their own panel.
  if (existing.userId === input.clinicianUserId) {
    throw new SelfReviewError();
  }

  let escalatedMarkerKeys: string[] = [];
  if (input.action === 'escalate') {
    const summary = parsePanelSummary(existing.panelSummary);
    const panelKeys = new Set(summary?.markers.map((m) => m.joinKey) ?? []);
    if (input.markerKeys && input.markerKeys.length > 0) {
      const unknown = input.markerKeys.filter((k) => !panelKeys.has(k.toLowerCase()));
      if (unknown.length > 0) {
        throw new UnknownMarkerKeysError(unknown);
      }
      escalatedMarkerKeys = input.markerKeys.map((k) => k.toLowerCase());
    } else {
      const flagged = summary?.markers.filter((m) => m.flaggedOutOfRange).map((m) => m.joinKey) ?? [];
      escalatedMarkerKeys = flagged.length > 0 ? flagged : Array.from(panelKeys);
    }
    // An escalation must always name at least one marker: with an empty set
    // the member gets the "sign in to see which results are flagged" email
    // while no surface ever renders a flag. Reachable only via direct API on
    // a zero-marker or malformed-snapshot review (the UI disables the button
    // in both states) — refuse rather than record a pointless escalation.
    if (escalatedMarkerKeys.length === 0) {
      throw new EmptyEscalationError();
    }
  }

  const now = new Date();
  const cas = await db.resultReview.updateMany({
    where: { id: input.reviewId, status: 'pending' },
    data: {
      status: input.action === 'approve' ? 'approved' : 'escalated',
      clinicianEmail: input.clinicianEmail,
      decidedAt: now,
      escalationReason: input.action === 'escalate' ? input.reason : null,
      escalatedMarkerKeys:
        input.action === 'escalate' ? JSON.stringify(escalatedMarkerKeys) : null,
    },
  });

  if (cas.count === 0) {
    const current = await db.resultReview.findUnique({
      where: { id: input.reviewId },
      select: { status: true },
    });
    return { decided: false, currentStatus: current?.status ?? null };
  }

  const review = await db.resultReview.findUniqueOrThrow({ where: { id: input.reviewId } });
  return { decided: true, review, escalatedMarkerKeys };
}

export class UnknownMarkerKeysError extends Error {
  constructor(public readonly keys: string[]) {
    super(`markerKeys not present in this panel: ${keys.join(', ')}`);
    this.name = 'UnknownMarkerKeysError';
  }
}

export class SelfReviewError extends Error {
  constructor() {
    super('You cannot decide a review of your own results — another clinician must sign this off.');
    this.name = 'SelfReviewError';
  }
}

export class EmptyEscalationError extends Error {
  constructor() {
    super(
      'This panel has no markers to escalate (empty or unreadable snapshot) — contact the member directly instead.',
    );
    this.name = 'EmptyEscalationError';
  }
}

/**
 * Reconciliation signal for the /clinic banner: recent lab documents with no
 * review row. The creation hook is post-commit non-fatal (an upload must
 * never fail because review bookkeeping failed), so a dropped hook is
 * possible — this makes it visible to the people who care. Aggregate count
 * only, no member data.
 */
export async function countRecentDocsWithoutReview(db: Db, since: Date): Promise<number> {
  return db.sourceDocument.count({
    where: {
      kind: { in: ['lab_pdf', 'lab_csv'] },
      createdAt: { gte: since },
      review: null,
    },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}
