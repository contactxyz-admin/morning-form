/**
 * GDPR Article 17 account erasure — ordered, auditable, retryable.
 *
 * Deletion is a deliberate ordered `$transaction`, not an `onDelete: Cascade`
 * migration, so health data erasure has explicit table coverage and per-domain
 * audit counts (plan Key Technical Decisions). Ordering inside the transaction:
 *
 *   1. grandchildren (PriorityMarker, PrioritiesAdjustment) — no userId/email of
 *      their own; they hang off Priorities and have NO onDelete, so they must be
 *      deleted before Priorities.
 *   2. the 13 no-cascade direct children (AssessmentResponse, StateProfile,
 *      Priorities, CheckIn, ChatMessage, HealthConnection, HealthDataPoint,
 *      Suggestion, UserPreferences, SourceDocument [cascades chunks +
 *      embeddings], GraphEdge, GraphNode, TopicPage). GraphEdge before GraphNode
 *      (edge FKs reference nodes).
 *   3. user.delete() — sweeps the cascade-annotated models (Session,
 *      MagicLinkToken, GraphNodeLayout, SharedView, Scribe + ScribeTool +
 *      ScribeTopicLink + ScribeAudit, MCPToken + MCPAuditEvent, ExportRequest,
 *      AccountDeletionToken). EmbeddingBackfillState.userId is SetNull → survives
 *      with userId=NULL (no residual PII).
 *   4. PII scrub on the no-User-FK tables (FunnelEvent.userId,
 *      LandingPageVisit.email, RawProviderPayload.userId) — null the fields, keep
 *      the rows so analytics continuity survives, plus a deleteMany of the
 *      plaintext email MagicLinkRateLimit buckets (subject = normalized email).
 *      MUST be inside the transaction: if it ran post-commit and failed, the
 *      email needed to find LandingPageVisit / rate-limit rows would already be
 *      gone with the User row.
 *   5. tombstone → status `completed` + completedAt + deletedCounts as the LAST
 *      statement, so erasure and its audit record commit atomically.
 *
 * Blob-first ordering: the tombstone is written `pending`, blobs are enumerated
 * and `del()`d BEFORE the DB transaction. Any blob failure throws before the
 * transaction (tombstone stays `pending`, retry-safe: `del()` no-ops on missing
 * blobs and the SourceDocument rows still exist on rollback). The transaction
 * gets an explicit generous timeout (~30s) because a seeded user's embedding
 * cascade blows Prisma's 5s default on Neon.
 *
 * Idempotency: a completed tombstone for this user's emailHash is a no-op
 * success — the confirm route handles double-clicks / raced retries.
 */

import { createHmac } from 'node:crypto';
import { del, list } from '@vercel/blob';
import type { PrismaClient } from '@prisma/client';
import { getSessionSecret } from '@/lib/env';
import { EMAIL_RATE_LIMIT_SUBJECT_KINDS } from '@/lib/auth/magic-link';

const TX_TIMEOUT_MS = 30_000;
const TX_MAX_WAIT_MS = 10_000;
const LIST_PAGE_LIMIT = 1000;

/**
 * Salted one-way hash of the deleted account's email — duplicate-request
 * detection only, never re-identification. Domain-separated under the same HMAC
 * key as session/magic-link hashes ("account-deletion-email:" prefix).
 */
export function hashDeletionEmail(email: string): string {
  return createHmac('sha256', getSessionSecret())
    .update('account-deletion-email:')
    .update(email.trim().toLowerCase())
    .digest('hex');
}

/**
 * Salted one-way hash of a raw deletion-confirmation token. Mirrors hashToken
 * in src/lib/auth/magic-link.ts but with the distinct "account-deletion:"
 * domain-separation prefix so deletion-token hashes never collide with
 * magic-link / session / share hashes under the same HMAC key. Lives here
 * (next to hashDeletionEmail) so both the request and confirm routes import a
 * single shared implementation.
 */
export function hashDeletionToken(raw: string): string {
  return createHmac('sha256', getSessionSecret()).update('account-deletion:').update(raw).digest('hex');
}

export interface EraseAccountOptions {
  /** Salted IP hash of the confirming request — abuse forensics on the tombstone. */
  ipHash?: string | null;
}

export type EraseResult =
  | { outcome: 'completed'; tombstoneId: string; deletedCounts: Record<string, number | 'cascade'> }
  | { outcome: 'noop'; tombstoneId: string };

/**
 * Enumerate every blob object owned by the user: SourceDocument.storagePath
 * values ∪ non-null ExportRequest.blobPath values (both read BEFORE the
 * transaction deletes those rows) ∪ a paginated Blob list() on the
 * `uploads/<userId>/` prefix (catches exports/ and anything written outside the
 * row-tracked paths). storagePath holds full blob URLs while list() returns
 * pathnames — del() accepts both, so we union the raw strings without comparing
 * namespaces.
 */
async function enumerateUserBlobs(prisma: PrismaClient, userId: string): Promise<string[]> {
  const [docs, exports] = await Promise.all([
    prisma.sourceDocument.findMany({
      where: { userId, storagePath: { not: null } },
      select: { storagePath: true },
    }),
    prisma.exportRequest.findMany({
      where: { userId, blobPath: { not: null } },
      select: { blobPath: true },
    }),
  ]);

  const targets = new Set<string>();
  for (const d of docs) if (d.storagePath) targets.add(d.storagePath);
  for (const e of exports) if (e.blobPath) targets.add(e.blobPath);

  // Paginated prefix sweep (>1000 objects safe).
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `uploads/${userId}/`, limit: LIST_PAGE_LIMIT, cursor });
    for (const blob of page.blobs) targets.add(blob.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return Array.from(targets);
}

/**
 * Irreversibly erase a user account. See module docstring for ordering and the
 * blob-first / single-transaction guarantees.
 *
 * Throws on any blob deletion failure — the tombstone stays `pending` and the
 * call is safely retryable (del() no-ops on already-deleted blobs).
 */
export async function eraseAccount(
  prisma: PrismaClient,
  userId: string,
  options: EraseAccountOptions = {},
): Promise<EraseResult> {
  // (a) Load user + write the pending tombstone (or resume an existing one).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, llmConsentAcceptedAt: true },
  });
  if (!user) {
    // No user row. If a completed tombstone already exists we can't recompute
    // its emailHash, so treat a missing user as already-erased only when the
    // caller has nothing left to do — surfaced as a noop with no tombstone id.
    throw new Error(`eraseAccount: user ${userId} not found`);
  }

  const emailHash = hashDeletionEmail(user.email);

  // Idempotency: a completed tombstone for this emailHash → no-op success.
  const existingCompleted = await prisma.accountDeletionTombstone.findFirst({
    where: { emailHash, status: 'completed' },
    select: { id: true },
  });
  if (existingCompleted) {
    return { outcome: 'noop', tombstoneId: existingCompleted.id };
  }

  const now = new Date();
  // Reuse a pending tombstone from a prior aborted attempt (blob failure) rather
  // than accumulating duplicates on retry; otherwise create one.
  const pending = await prisma.accountDeletionTombstone.findFirst({
    where: { emailHash, status: 'pending' },
    select: { id: true },
  });
  const tombstone = pending
    ? await prisma.accountDeletionTombstone.update({
        where: { id: pending.id },
        data: { ipHash: options.ipHash ?? null, confirmedAt: now, consentHeldAt: user.llmConsentAcceptedAt },
      })
    : await prisma.accountDeletionTombstone.create({
        data: {
          emailHash,
          ipHash: options.ipHash ?? null,
          consentHeldAt: user.llmConsentAcceptedAt,
          status: 'pending',
          requestedAt: now,
          confirmedAt: now,
        },
      });

  // (b) Enumerate blobs BEFORE the transaction deletes the rows that name them.
  const blobTargets = await enumerateUserBlobs(prisma, userId);

  // (c) del() all (batch). Any failure throws → tombstone stays pending,
  // retry-safe (del no-ops on missing).
  if (blobTargets.length > 0) {
    await del(blobTargets);
  }

  // (d) One ordered transaction with an explicit generous timeout.
  const deletedCounts: Record<string, number | 'cascade'> = {};
  await prisma.$transaction(
    async (tx) => {
      // grandchildren first — scoped via the user's Priorities id(s).
      const priorities = await tx.priorities.findMany({ where: { userId }, select: { id: true } });
      const prioritiesIds = priorities.map((p) => p.id);
      if (prioritiesIds.length > 0) {
        deletedCounts.priorityMarkers = (
          await tx.priorityMarker.deleteMany({ where: { prioritiesId: { in: prioritiesIds } } })
        ).count;
        deletedCounts.prioritiesAdjustments = (
          await tx.prioritiesAdjustment.deleteMany({ where: { prioritiesId: { in: prioritiesIds } } })
        ).count;
      } else {
        deletedCounts.priorityMarkers = 0;
        deletedCounts.prioritiesAdjustments = 0;
      }

      // the 13 no-cascade direct children. GraphEdge before GraphNode (edge FKs
      // reference nodes). SourceDocument delete cascades chunks + embeddings.
      deletedCounts.assessmentResponses = (await tx.assessmentResponse.deleteMany({ where: { userId } })).count;
      deletedCounts.stateProfiles = (await tx.stateProfile.deleteMany({ where: { userId } })).count;
      deletedCounts.priorities = (await tx.priorities.deleteMany({ where: { userId } })).count;
      deletedCounts.checkIns = (await tx.checkIn.deleteMany({ where: { userId } })).count;
      deletedCounts.chatMessages = (await tx.chatMessage.deleteMany({ where: { userId } })).count;
      deletedCounts.healthConnections = (await tx.healthConnection.deleteMany({ where: { userId } })).count;
      deletedCounts.healthDataPoints = (await tx.healthDataPoint.deleteMany({ where: { userId } })).count;
      deletedCounts.suggestions = (await tx.suggestion.deleteMany({ where: { userId } })).count;
      deletedCounts.userPreferences = (await tx.userPreferences.deleteMany({ where: { userId } })).count;
      deletedCounts.sourceDocuments = (await tx.sourceDocument.deleteMany({ where: { userId } })).count;
      deletedCounts.graphEdges = (await tx.graphEdge.deleteMany({ where: { userId } })).count;
      deletedCounts.graphNodes = (await tx.graphNode.deleteMany({ where: { userId } })).count;
      deletedCounts.topicPages = (await tx.topicPage.deleteMany({ where: { userId } })).count;
      deletedCounts.actions = (await tx.action.deleteMany({ where: { userId } })).count;

      // user.delete() sweeps the cascade-annotated models. Counts for those are
      // not individually recoverable here — record 'cascade'.
      await tx.user.delete({ where: { id: userId } });
      deletedCounts.sessions = 'cascade';
      deletedCounts.magicLinkTokens = 'cascade';
      deletedCounts.graphNodeLayouts = 'cascade';
      deletedCounts.sharedViews = 'cascade';
      deletedCounts.scribes = 'cascade';
      deletedCounts.mcpTokens = 'cascade';
      deletedCounts.exportRequests = 'cascade';
      deletedCounts.accountDeletionTokens = 'cascade';

      // PII scrub on the no-User-FK tables — null the PII fields, keep the rows
      // (analytics continuity). MUST be inside the transaction (see docstring).
      deletedCounts.funnelEventsScrubbed = (
        await tx.funnelEvent.updateMany({ where: { userId }, data: { userId: null } })
      ).count;
      deletedCounts.landingPageVisitsScrubbed = (
        await tx.landingPageVisit.updateMany({ where: { email: user.email }, data: { email: null } })
      ).count;
      // RawProviderPayload.userId is nullable — scrub to NULL (not '') so the
      // residue scan finds zero rows owning the deleted id and the row survives
      // for diagnostics with the PII link removed.
      deletedCounts.rawProviderPayloadsScrubbed = (
        await tx.rawProviderPayload.updateMany({ where: { userId }, data: { userId: null } })
      ).count;

      // MagicLinkRateLimit email buckets key `subject` on the user's normalized
      // plaintext email — delete them so no plaintext email survives erasure.
      // The ip-1h bucket keys on a salted IP hash and is left untouched.
      deletedCounts.magicLinkRateLimitsDeleted = (
        await tx.magicLinkRateLimit.deleteMany({
          where: {
            subject: user.email.trim().toLowerCase(),
            subjectKind: { in: [...EMAIL_RATE_LIMIT_SUBJECT_KINDS] },
          },
        })
      ).count;

      // tombstone flip to completed — the LAST statement so erasure + audit
      // commit atomically.
      await tx.accountDeletionTombstone.update({
        where: { id: tombstone.id },
        data: { status: 'completed', completedAt: new Date(), deletedCounts: JSON.stringify(deletedCounts) },
      });
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  );

  // (e) Belt-and-suspenders: an export that finished uploading *during* the
  // erasure (after the pre-transaction enumeration ran) would leave an orphan
  // blob under uploads/<userId>/. Do one final paginated prefix sweep and del()
  // any straggler. Failures here are logged but never fail the already-committed
  // erasure — the audit tombstone is already `completed`.
  try {
    const stragglers: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `uploads/${userId}/`, limit: LIST_PAGE_LIMIT, cursor });
      for (const blob of page.blobs) stragglers.push(blob.pathname);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (stragglers.length > 0) {
      await del(stragglers);
    }
  } catch (error) {
    console.error(`[account/delete] post-erasure blob sweep failed for user ${userId}:`, error);
  }

  return { outcome: 'completed', tombstoneId: tombstone.id, deletedCounts };
}
