/**
 * External MCP server bearer tokens.
 *
 * Model: opaque raw tokens + HMAC-SHA256(tokenHash) stored in MCPToken.
 * Mirrors the SharedView pattern at src/lib/share/tokens.ts — the security
 * shape is identical, the difference is lifecycle (MCP tokens are long-lived
 * programmatic credentials that operate on the whole graph; share-view
 * tokens are short-lived one-off reads of a single topic) and a different
 * domain-separation prefix.
 *
 * Token grammar:
 *   raw  = base64url(32 random bytes)              // 43 chars, URL-safe
 *   hash = HMAC-SHA256(SESSION_SECRET, "mcp:" + raw)
 *
 * HMAC (not plain sha256) closes length-extension attacks. The "mcp:"
 * domain-separation prefix keeps MCP hashes from colliding with session,
 * share, or magic-link hashes even though they share the same HMAC key.
 *
 * Tokens never appear in any log line, response body (beyond the
 * one-and-only issuance moment), or URL. Only the hash is persisted.
 */

import { createHmac, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getSessionSecret } from '@/lib/env';

export function hashMcpToken(raw: string): string {
  return createHmac('sha256', getSessionSecret()).update('mcp:').update(raw).digest('hex');
}

export function generateRawMcpToken(): string {
  // 32 bytes -> 43 base64url chars. Higher entropy than share tokens (24B)
  // because MCP tokens are long-lived bearer credentials; a one-month-old
  // token gets more guess attempts than a one-day share link.
  return randomBytes(32).toString('base64url');
}

export interface CreateMcpTokenInput {
  userId: string;
  label: string;
  expiresAt?: Date | null;
}

export interface CreateMcpTokenResult {
  id: string;
  rawToken: string;
  label: string;
  expiresAt: Date | null;
}

/**
 * Mint a new bearer token for `userId`. Returns the raw token exactly once
 * — the caller must surface it to the user immediately because only the
 * hash is persisted.
 */
export async function createMcpToken(
  db: PrismaClient,
  input: CreateMcpTokenInput,
): Promise<CreateMcpTokenResult> {
  const rawToken = generateRawMcpToken();
  const tokenHash = hashMcpToken(rawToken);
  const expiresAt = input.expiresAt ?? null;

  const created = await db.mCPToken.create({
    data: {
      userId: input.userId,
      tokenHash,
      label: input.label,
      expiresAt,
    },
  });

  return { id: created.id, rawToken, label: created.label, expiresAt };
}

export interface ResolvedMcpToken {
  id: string;
  userId: string;
  label: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  useCount: number;
  createdAt: Date;
}

/**
 * Resolve a presented raw bearer token to its MCPToken. Returns null if:
 *   - the token hash doesn't match any record
 *   - the record is revoked
 *   - the record's expiresAt has passed
 *
 * Caller decides whether to 401, log, or rate-limit.
 */
export async function findMcpTokenByRaw(
  db: PrismaClient,
  rawToken: string,
  now: Date = new Date(),
): Promise<ResolvedMcpToken | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashMcpToken(rawToken);
  const row = await db.mCPToken.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return null;

  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    useCount: row.useCount,
    createdAt: row.createdAt,
  };
}

/**
 * Atomically increment use-count + lastUsedAt for a resolved token. Called
 * after auth + rate-limit checks pass but before the tool actually runs;
 * keeps rate-limit accounting honest about attempted calls (whether or not
 * the underlying tool succeeded).
 */
export async function markMcpTokenUsed(
  db: PrismaClient,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  // `updateMany` rather than `update` so a cascade-deleted row in the
  // race window between auth resolution and this call returns
  // { count: 0 } instead of throwing P2025 → HTTP 500. Use-count tick is
  // best-effort accounting; losing it because the user simultaneously
  // deleted their account is acceptable, a 500 is not (review correctness-2).
  await db.mCPToken.updateMany({
    where: { id },
    data: {
      lastUsedAt: now,
      useCount: { increment: 1 },
    },
  });
}

/**
 * Atomically revoke a token owned by `userId`. Returns true on successful
 * revocation or idempotent re-revocation; false when the id doesn't exist
 * or belongs to another user.
 *
 * Same updateMany-then-fallback-read pattern as revokeShare — closes the
 * TOCTOU window two concurrent revokes (or revoke racing user-delete)
 * could otherwise hit.
 */
export async function revokeMcpToken(
  db: PrismaClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db.mCPToken.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 1) return true;
  const row = await db.mCPToken.findUnique({ where: { id } });
  if (row && row.userId === userId && row.revokedAt) return true;
  return false;
}

/**
 * List EVERY token for the user — including revoked and expired ones — so
 * the settings UI can render audit history. **Do not use for authz**: a
 * caller that wires this into a permission check would honor dead
 * credentials. For live-credential lookups, use `findMcpTokenByRaw` (which
 * filters revoked + expired).
 */
export async function listMcpTokensForUser(
  db: PrismaClient,
  userId: string,
): Promise<ResolvedMcpToken[]> {
  const rows = await db.mCPToken.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    label: row.label,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    useCount: row.useCount,
    createdAt: row.createdAt,
  }));
}
