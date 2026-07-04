#!/usr/bin/env tsx
/**
 * One-off, local-only CompanyOpsTask bulk importer.
 *
 * Not wired into any build/deploy step. Run manually once, after standing up
 * the ops board, to carry over your current backlog (e.g. from the pilot-ops
 * gist's Workstream tab) without ever committing that content to the repo.
 *
 * Input file (never commit it) is a JSON array:
 *   [{ "phase": "0 · Decide", "title": "Secure venue", "detail": "...",
 *      "ownerEmail": "joe@contact.xyz", "status": "in_progress",
 *      "dueDate": "2026-07-13" }, ...]
 *
 * Only `title` is required. `status` must be one of not_started |
 * in_progress | blocked | done (defaults to not_started). Fold any
 * workstream/category label you want to keep into `title` yourself, e.g.
 * "Gym: Build the partnership deck" — there's no separate column for it.
 *
 * Usage:
 *   npx tsx scripts/ops/import-tasks.ts ./my-current-tasks.json
 *
 * Refuses to run against a non-localhost DATABASE_URL unless you pass
 * --i-know-what-im-doing — a safety rail against fat-fingering a bulk
 * insert into the shared prod/preview DB from a laptop.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { OPS_STATUS_VALUES } from '../../src/lib/ops/schema';
import { staffAllowlist } from '../../src/lib/ops/config';

const STATUS_VALUES = new Set<string>(OPS_STATUS_VALUES);

interface ImportRow {
  board?: string;
  phase?: string;
  title: string;
  detail?: string;
  ownerEmail?: string | null;
  status?: string;
  dueDate?: string | null;
  orderIndex?: number;
}

function parseArgs(argv: string[]): { filePath: string; force: boolean } {
  const force = argv.includes('--i-know-what-im-doing');
  const filePath = argv.find((a) => !a.startsWith('--'));
  if (!filePath) {
    console.error('Usage: npx tsx scripts/ops/import-tasks.ts <path-to-tasks.json> [--i-know-what-im-doing]');
    process.exit(1);
  }
  return { filePath, force };
}

function validateRow(row: unknown, index: number): ImportRow {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw new Error(`Row ${index}: not an object.`);
  }
  const r = row as Record<string, unknown>;
  if (typeof r.title !== 'string' || !r.title.trim()) {
    throw new Error(`Row ${index}: "title" is required and must be a non-empty string.`);
  }
  if (r.status !== undefined && !STATUS_VALUES.has(String(r.status))) {
    throw new Error(`Row ${index}: "status" must be one of ${Array.from(STATUS_VALUES).join(', ')}.`);
  }
  return {
    board: typeof r.board === 'string' ? r.board : undefined,
    phase: typeof r.phase === 'string' ? r.phase : undefined,
    title: r.title,
    detail: typeof r.detail === 'string' ? r.detail : undefined,
    // Lowercased to match the REST/MCP write paths (src/lib/ops/schema.ts) —
    // keeps ownerEmail comparisons (the notify idempotency check) consistent
    // regardless of which surface wrote the row.
    ownerEmail: typeof r.ownerEmail === 'string' ? r.ownerEmail.toLowerCase() : null,
    status: typeof r.status === 'string' ? r.status : undefined,
    dueDate: typeof r.dueDate === 'string' ? r.dueDate : null,
    orderIndex: typeof r.orderIndex === 'number' ? r.orderIndex : undefined,
  };
}

/**
 * Every REST/MCP write path validates ownerEmail against
 * COMPANY_OPS_ALLOWLIST before persisting; this bulk importer warns instead
 * of blocking (you're feeding it your own backlog file, and the allowlist
 * may not be finalized yet), but the inconsistency is worth flagging loudly.
 */
function warnOnUnknownOwners(rows: ImportRow[]): void {
  const allowlist = new Set(staffAllowlist());
  if (allowlist.size === 0) return; // not configured locally — nothing to check against
  const unknown = new Set(rows.map((r) => r.ownerEmail).filter((e): e is string => !!e && !allowlist.has(e)));
  if (unknown.size > 0) {
    console.warn(
      `[import-tasks] warning: these ownerEmail values are not in COMPANY_OPS_ALLOWLIST: ${Array.from(unknown).join(', ')}`,
    );
  }
}

async function main(): Promise<void> {
  const { filePath, force } = parseArgs(process.argv.slice(2));

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1') && !force) {
    console.error(
      '[import-tasks] DATABASE_URL does not look like a local database. ' +
        'Re-run with --i-know-what-im-doing if you really mean to bulk-insert into it.',
    );
    process.exit(1);
  }

  const raw = readFileSync(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Input file must be a JSON array of task objects.');
  }

  const rows = parsed.map((row, i) => validateRow(row, i));
  warnOnUnknownOwners(rows);

  const prisma = new PrismaClient();
  try {
    const created = await prisma.companyOpsTask.createMany({
      data: rows.map((row, i) => ({
        board: row.board ?? 'pilot',
        title: row.title,
        detail: row.detail ?? '',
        phase: row.phase ?? '',
        ownerEmail: row.ownerEmail ?? null,
        status: row.status ?? 'not_started',
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        orderIndex: row.orderIndex ?? i,
        createdBy: 'scripts/ops/import-tasks.ts',
      })),
    });
    console.log(`[import-tasks] created ${created.count} task(s) from ${filePath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[import-tasks] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
