/**
 * Company Ops Board — env-backed config (build brief 2026-07-04).
 *
 * Single place that parses the COMPANY_OPS_* env vars. Everything here reads
 * from `env` (never bare `process.env`), and every JSON parse fails closed
 * to an empty list rather than throwing — a malformed env var should degrade
 * to "nobody is staff / no members configured", never crash the request.
 */
import { env } from '@/lib/env';

export interface OpsMember {
  email: string;
  name: string;
  slackId?: string;
}

export interface OpsMcpToken {
  email: string;
  token: string;
}

export function isCompanyOpsEnabled(): boolean {
  return env.COMPANY_OPS_ENABLED === 'true';
}

export function staffAllowlist(): string[] {
  return env.COMPANY_OPS_ALLOWLIST.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isStaff(email: string | null | undefined): boolean {
  if (!email) return false;
  return staffAllowlist().includes(email.toLowerCase());
}

export function members(): OpsMember[] {
  try {
    const parsed = JSON.parse(env.COMPANY_OPS_MEMBERS || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function memberByEmail(email: string): OpsMember | undefined {
  const target = email.toLowerCase();
  return members().find((m) => m.email.toLowerCase() === target);
}

export function mcpTokens(): OpsMcpToken[] {
  try {
    const parsed = JSON.parse(env.COMPANY_OPS_MCP_TOKENS || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Resolves a raw bearer token to the founder email it belongs to, or null. */
export function founderEmailForToken(token: string): string | null {
  const match = mcpTokens().find((t) => t.token === token);
  return match ? match.email : null;
}
