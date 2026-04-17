/**
 * Shareable-view tokens (U20 / DPP).
 *
 * Model: opaque raw tokens + HMAC-SHA256(tokenHash) stored in SharedView.
 * Same shape as Session cookies — secret rotation invalidates every live
 * share, and the DB is the source of truth for revocation and expiry.
 *
 * Token grammar:
 *   raw = base64url(24 random bytes)          // 32 chars, URL-safe
 *   hash = HMAC-SHA256(SESSION_SECRET, "share:" + raw)
 *
 * HMAC (not plain sha256) because a `createHash().update(secret).update(raw)`
 * construction is vulnerable to length-extension: an attacker who learns a
 * single (raw, hash) pair could forge new valid hashes for extended inputs
 * without knowing the secret. HMAC structurally closes that door. The
 * "share:" domain-separation prefix keeps share hashes from ever colliding
 * with session, magic-link, or IP-bucket hashes even though they share the
 * same HMAC key.
 *
 * Scope describes what the viewer sees:
 *   { kind: "topic", topicKey: string }
 *   { kind: "node",  nodeId:   string }
 *
 * Redactions let the sharer withhold specific nodes from the rendered view
 * without revoking the whole share. The redacted nodes are filtered from
 * both the compiled topic content and the subgraph served to /share.
 */

import { createHmac, randomBytes } from 'node:crypto';
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
  return createHmac('sha256', getSessionSecret()).update('share:').update(raw).digest('hex');
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

  const scope = parseScope(row.scope);
  if (!scope) return null;

  return {
    id: row.id,
    userId: row.userId,
    scope,
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
  // Rows with unparseable scope JSON are filtered out rather than throwing —
  // a single corrupt row would otherwise 500 /api/share/list and block the
  // owner from revoking any share via the UI. The row still exists in the
  // DB and can be revoked directly via its id.
  const resolved: ResolvedShare[] = [];
  for (const row of rows) {
    const scope = parseScope(row.scope);
    if (!scope) {
      console.warn('[share] skipping row with unparseable scope', { id: row.id });
      continue;
    }
    resolved.push({
      id: row.id,
      userId: row.userId,
      scope,
      redactions: parseRedactions(row.redactions),
      label: row.label,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      viewCount: row.viewCount,
      createdAt: row.createdAt,
    });
  }
  return resolved;
}

function parseScope(raw: string): ShareScope | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (obj.kind === 'topic' && typeof obj.topicKey === 'string' && obj.topicKey.length > 0) {
        return { kind: 'topic', topicKey: obj.topicKey };
      }
      if (obj.kind === 'node' && typeof obj.nodeId === 'string' && obj.nodeId.length > 0) {
        return { kind: 'node', nodeId: obj.nodeId };
      }
    }
  } catch {
    /* fall-through */
  }
  return null;
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
