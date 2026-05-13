#!/usr/bin/env tsx
/**
 * MCP audit-log CLI.
 *
 * Reads MCPAuditEvent rows from the configured database and renders a
 * compact daily / per-status breakdown. Use this to:
 *   - Monitor uptake: how many users are actually using MCP after the
 *     directory submissions land.
 *   - Detect abuse: 401 spikes (token-guessing) or 429 spikes
 *     (rate-limit hammering) call for action.
 *   - Spot top-called tools — informs the Phase 2.5 priority list
 *     (e.g. if every agent immediately calls list_graph_index and
 *     pagination starts mattering).
 *
 * Examples:
 *   pnpm mcp:audit
 *     # Last 14 days, all statuses, grouped by day.
 *
 *   pnpm mcp:audit --days 30 --status error
 *     # Last 30 days, errors only — surfacing tool-call failure patterns.
 *
 *   pnpm mcp:audit --tools
 *     # Per-tool call counts over the default window.
 *
 *   pnpm mcp:audit --users
 *     # Per-user activity — who is actually using the MCP server.
 */

import { PrismaClient } from '@prisma/client';

interface Args {
  days: number;
  status: string | null;
  groupBy: 'day' | 'tool' | 'user';
}

const VALID_STATUSES = ['success', 'error', 'rate_limited', 'unauthorized'] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

function parseArgs(argv: string[]): Args {
  const args: Args = { days: 14, status: null, groupBy: 'day' };
  let groupByExplicit = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') {
      const n = Number.parseInt(argv[++i] ?? '', 10);
      if (!Number.isFinite(n) || n < 1) throw new Error('--days must be a positive integer');
      args.days = n;
    } else if (a === '--status') {
      const v = argv[++i] ?? '';
      if (!VALID_STATUSES.includes(v as ValidStatus)) {
        throw new Error(
          `--status must be one of ${VALID_STATUSES.join('/')} (got "${v}"). Typos report "no rows" with exit 0, defeating the monitoring purpose.`,
        );
      }
      args.status = v;
    } else if (a === '--tools') {
      if (groupByExplicit) throw new Error('--tools and --users are mutually exclusive');
      args.groupBy = 'tool';
      groupByExplicit = true;
    } else if (a === '--users') {
      if (groupByExplicit) throw new Error('--tools and --users are mutually exclusive');
      args.groupBy = 'user';
      groupByExplicit = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}. See --help for usage.`);
    }
  }
  return args;
}

const HELP = `Usage: pnpm mcp:audit [options]

Options:
  --days N         Window size in days (default 14, must be >= 1)
  --status S       Filter to a single resultStatus
                   (success | error | rate_limited | unauthorized)
  --tools          Group by toolName instead of day
  --users          Group by userId instead of day
                   (--tools and --users are mutually exclusive)
  --help, -h       Show this help

Examples:
  pnpm mcp:audit
  pnpm mcp:audit --days 30 --status error
  pnpm mcp:audit --tools
  pnpm mcp:audit --users

Exit codes:
  0  Success (including "no rows in window" — informational)
  1  Argument error or DB error (message on stderr)
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000);

  const prisma = new PrismaClient();
  try {
    const where = {
      createdAt: { gte: since },
      ...(args.status ? { resultStatus: args.status } : {}),
    };

    const total = await prisma.mCPAuditEvent.count({ where });
    if (total === 0) {
      process.stdout.write(
        `No MCPAuditEvent rows in the last ${args.days} day(s)${args.status ? ` with resultStatus="${args.status}"` : ''}.\n`,
      );
      return;
    }

    process.stdout.write(`\nMCP audit window: last ${args.days} day(s) — ${total} call(s)\n`);
    if (args.status) process.stdout.write(`Filtered to resultStatus="${args.status}"\n`);
    process.stdout.write('\n');

    if (args.groupBy === 'day') {
      // Daily breakdown by status.
      const rows = await prisma.mCPAuditEvent.findMany({
        where,
        select: { createdAt: true, resultStatus: true, latencyMs: true },
      });
      const byDay = new Map<string, Map<string, { count: number; latencySum: number }>>();
      for (const r of rows) {
        const day = r.createdAt.toISOString().slice(0, 10);
        const inner = byDay.get(day) ?? new Map();
        const prev = inner.get(r.resultStatus) ?? { count: 0, latencySum: 0 };
        inner.set(r.resultStatus, {
          count: prev.count + 1,
          latencySum: prev.latencySum + r.latencyMs,
        });
        byDay.set(day, inner);
      }
      const days = Array.from(byDay.keys()).sort().reverse();
      process.stdout.write('Day         | success   | error     | rate_limited | other     | avg latency\n');
      process.stdout.write('------------+-----------+-----------+--------------+-----------+------------\n');
      for (const day of days) {
        const m = byDay.get(day)!;
        const succ = m.get('success')?.count ?? 0;
        const err = m.get('error')?.count ?? 0;
        const rl = m.get('rate_limited')?.count ?? 0;
        const totalDay = Array.from(m.values()).reduce((a, b) => a + b.count, 0);
        const other = totalDay - succ - err - rl;
        const latencySum = Array.from(m.values()).reduce((a, b) => a + b.latencySum, 0);
        const avgLat = totalDay > 0 ? Math.round(latencySum / totalDay) : 0;
        process.stdout.write(
          `${day}  | ${pad(succ, 9)} | ${pad(err, 9)} | ${pad(rl, 12)} | ${pad(other, 9)} | ${avgLat}ms\n`,
        );
      }
    } else if (args.groupBy === 'tool') {
      const rows = await prisma.mCPAuditEvent.findMany({
        where,
        select: { toolName: true, resultStatus: true },
      });
      const byTool = new Map<string, { total: number; success: number; error: number }>();
      for (const r of rows) {
        const prev = byTool.get(r.toolName) ?? { total: 0, success: 0, error: 0 };
        prev.total += 1;
        if (r.resultStatus === 'success') prev.success += 1;
        if (r.resultStatus === 'error') prev.error += 1;
        byTool.set(r.toolName, prev);
      }
      const sorted = Array.from(byTool.entries()).sort((a, b) => b[1].total - a[1].total);
      process.stdout.write('Tool                            | total | success | error\n');
      process.stdout.write('--------------------------------+-------+---------+-------\n');
      for (const [name, s] of sorted) {
        process.stdout.write(`${pad(name, 31, true)} | ${pad(s.total, 5)} | ${pad(s.success, 7)} | ${pad(s.error, 5)}\n`);
      }
    } else if (args.groupBy === 'user') {
      const rows = await prisma.mCPAuditEvent.findMany({
        where,
        select: { userId: true, resultStatus: true },
      });
      const byUser = new Map<string, { total: number; success: number; error: number }>();
      for (const r of rows) {
        const prev = byUser.get(r.userId) ?? { total: 0, success: 0, error: 0 };
        prev.total += 1;
        if (r.resultStatus === 'success') prev.success += 1;
        if (r.resultStatus === 'error') prev.error += 1;
        byUser.set(r.userId, prev);
      }
      const sorted = Array.from(byUser.entries()).sort((a, b) => b[1].total - a[1].total);
      process.stdout.write('User id                          | total | success | error\n');
      process.stdout.write('---------------------------------+-------+---------+-------\n');
      for (const [id, s] of sorted) {
        process.stdout.write(`${pad(id, 32, true)} | ${pad(s.total, 5)} | ${pad(s.success, 7)} | ${pad(s.error, 5)}\n`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

function pad(value: number | string, width: number, leftAlign = false): string {
  const s = String(value);
  if (s.length >= width) return s.slice(0, width);
  const padding = ' '.repeat(width - s.length);
  return leftAlign ? s + padding : padding + s;
}

main().catch((err) => {
  process.stderr.write(`[mcp:audit] ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
