/**
 * Shareable-view tokens (U20 / DPP).
 *
 * Model: opaque raw tokens + salted sha256(tokenHash) stored in SharedView.
 * Same shape as Session cookies — secret rotation invalidates every live
 * share, and the DB is the source of truth for revocation and expiry.
 *
 * Token grammar:
 *   raw = base64url(24 random bytes)          // 32 chars, URL-safe
 *   hash = sha256(SESSION_SECRET + "share:" + raw)
 *
 * Scope describes what the viewer sees:
 *   { kind: "topic", topicKey: string }
 *   { kind: "node",  nodeId:   string }
 *
 * Redactions let the sharer withhold specific nodes from the rendered view
 * without revoking the whole share. The redacted nodes are filtered from
 * both the compiled topic content and the subgraph served to /share.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getSessionSecret } from '@/lib/env';

export type ShareScope =
  | { kind: 'topic'; topicKey: string }
  | { kind: 'node'; nodeId: string };

export interface ShareRedactions {
  /** Node ids that should be stripped from the rendered view entirely. */
  hideNodeIds?: string[];
}

export function hashShareToken(raw: string): string {
  return createHash('sha256').update(getSessionSecret()).update('share:').update(raw).digest('hex');
}

export function generateRawShareToken(): string {
  return randomBytes(24).toString('base64url');
}

export interface CreateShareInput {
  userId: string;
  scope: ShareScope;
  redactions?: ShareRedactions;
  label?: string;
  expiresAt?: Date | null;
}

export interface CreateShareResult {
  id: string;
  rawToken: string;
  expiresAt: Date | null;
}

export async function createShare(
  db: PrismaClient,
  input: CreateShareInput,
): Promise<CreateShareResult> {
  const rawToken = generateRawShareToken();
  const tokenHash = hashShareToken(rawToken);
  const expiresAt = input.expiresAt ?? null;

  const created = await db.sharedView.create({
    data: {
      userId: input.userId,
      tokenHash,
      scope: JSON.stringify(input.scope),
      redactions: input.redactions ? JSON.stringify(input.redactions) : null,
      label: input.label ?? null,
      expiresAt,
    },
  });

  return { id: created.id, rawToken, expiresAt };
}

export interface ResolvedShare {
  id: string;
  userId: string;
  scope: ShareScope;
  redactions: ShareRedactions;
  label: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  createdAt: Date;
}

/**
 * Resolve a presented raw token to its SharedView. Returns null if:
 *   - the token hash doesn't match any record
 *   - the record is revoked
 *   - the record's expiresAt has passed
 *
 * Caller decides whether to render, 404, or log.
 */
export async function resolveShare(
  db: PrismaClient,
  rawToken: string,
  now: Date = new Date(),
): Promise<ResolvedShare | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashShareToken(rawToken);
  const row = await db.sharedView.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return null;

  return {
    id: row.id,
    userId: row.userId,
    scope: parseScope(row.scope),
    redactions: parseRedactions(row.redactions),
    label: row.label,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    viewCount: row.viewCount,
    createdAt: row.createdAt,
  };
}

export async function markShareViewed(
  db: PrismaClient,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  await db.sharedView.update({
    where: { id },
    data: {
      lastViewedAt: now,
      viewCount: { increment: 1 },
    },
  });
}

export async function revokeShare(
  db: PrismaClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const row = await db.sharedView.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return false;
  if (row.revokedAt) return true;
  await db.sharedView.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  return true;
}

export async function listSharesForUser(
  db: PrismaClient,
  userId: string,
): Promise<ResolvedShare[]> {
  const rows = await db.sharedView.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row: any) => ({
    id: row.id,
    userId: row.userId,
    scope: parseScope(row.scope),
    redactions: parseRedactions(row.redactions),
    label: row.label,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    viewCount: row.viewCount,
    createdAt: row.createdAt,
  }));
}

function parseScope(raw: string): ShareScope {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'kind' in parsed) {
      return parsed as ShareScope;
    }
  } catch {
    /* fall-through */
  }
  throw new Error(`[share] unparseable scope: ${raw}`);
}

function parseRedactions(raw: string | null): ShareRedactions {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ShareRedactions;
    }
  } catch {
    /* fall-through */
  }
  return {};
}
