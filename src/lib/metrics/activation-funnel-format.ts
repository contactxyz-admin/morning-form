// CLI formatters and arg-parsing for the activation-funnel script. Kept as
// pure functions in src/ (not scripts/) so vitest's include pattern
// covers them for unit testing.

import { DEFAULT_RETENTION_WINDOW_DAYS } from './activation-funnel';
import type {
  ActivationFunnelReport,
  ComputeActivationFunnelArgs,
} from './activation-funnel-report';

export class InvalidCliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCliArgsError';
  }
}

export interface ParsedCliArgs {
  signupSince: Date;
  signupUntil: Date;
  userIds?: string[];
  retentionWindowDays: number;
}

export interface HelpRequested {
  help: true;
}

export type ParseResult = ParsedCliArgs | HelpRequested;

export function isHelpRequested(result: ParseResult): result is HelpRequested {
  return (result as HelpRequested).help === true;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const HELP_TEXT = `activation-funnel — compute the signup → retained funnel for a cohort.

Usage:
  npx tsx scripts/metrics/activation-funnel.ts [flags]

Flags:
  --signup-since <ISO8601>          Cohort signup window start (default: 30 days ago).
  --signup-until <ISO8601>          Cohort signup window end (default: now).
  --user-ids <id1,id2,...>          Explicit cohort. Filtered by signup window.
  --retention-window-days <int>     Retention window in days (default: 7).
  -h, --help                        Show this message and exit.

Output:
  CSV (stdout) with header:
    stage,label,count,pct_of_signups,pct_of_previous,median_days,p75_days
  Followed by a human-readable summary.

Examples:
  npx tsx scripts/metrics/activation-funnel.ts \\
    --signup-since 2026-03-22 --signup-until 2026-04-21
  npx tsx scripts/metrics/activation-funnel.ts \\
    --user-ids user_abc,user_def --retention-window-days 14
`;

/**
 * Parse argv tokens (excluding node + script path). `now` is injectable so
 * default-window computation is testable without freezing time globally.
 *
 * Supported flags:
 *   --signup-since <ISO8601 date>    (default: 30 days ago)
 *   --signup-until <ISO8601 date>    (default: now)
 *   --user-ids <comma-separated ids> (optional)
 *   --retention-window-days <int>    (default: 7)
 */
export function parseArgs(argv: string[], now: Date = new Date()): ParseResult {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }

  const raw = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) {
      throw new InvalidCliArgsError(`Unexpected positional argument: ${tok}`);
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new InvalidCliArgsError(`Missing value for ${tok}`);
    }
    raw.set(tok, next);
    i++;
  }

  const recognized = new Set([
    '--signup-since',
    '--signup-until',
    '--user-ids',
    '--retention-window-days',
  ]);
  raw.forEach((_value, flag) => {
    if (!recognized.has(flag)) {
      throw new InvalidCliArgsError(`Unknown flag: ${flag}`);
    }
  });

  const signupUntil = raw.has('--signup-until')
    ? parseDate('--signup-until', raw.get('--signup-until')!)
    : now;
  const signupSince = raw.has('--signup-since')
    ? parseDate('--signup-since', raw.get('--signup-since')!)
    : new Date(now.getTime() - 30 * DAY_MS);

  if (signupSince.getTime() > signupUntil.getTime()) {
    throw new InvalidCliArgsError(
      `--signup-since (${signupSince.toISOString()}) must be <= --signup-until (${signupUntil.toISOString()})`,
    );
  }

  const userIdsRaw = raw.get('--user-ids');
  const userIds = userIdsRaw
    ? userIdsRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : undefined;

  const windowRaw = raw.get('--retention-window-days');
  const retentionWindowDays = windowRaw
    ? parsePositiveInt('--retention-window-days', windowRaw)
    : DEFAULT_RETENTION_WINDOW_DAYS;

  return { signupSince, signupUntil, userIds, retentionWindowDays };
}

function parseDate(flag: string, raw: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new InvalidCliArgsError(`${flag}: invalid date "${raw}"`);
  }
  return d;
}

function parsePositiveInt(flag: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidCliArgsError(`${flag}: expected positive integer, got "${raw}"`);
  }
  return n;
}

export function toComputeArgs(parsed: ParsedCliArgs): ComputeActivationFunnelArgs {
  return {
    signupSince: parsed.signupSince,
    signupUntil: parsed.signupUntil,
    userIds: parsed.userIds,
    retentionWindowDays: parsed.retentionWindowDays,
  };
}

const CSV_HEADER =
  'stage,label,count,pct_of_signups,pct_of_previous,median_days,p75_days';

export function formatCsv(report: ActivationFunnelReport): string {
  const rows = report.stages.map((s) =>
    [
      csvField(s.key),
      csvField(s.label),
      s.count,
      s.pctOfSignups,
      s.pctOfPrevious,
      formatNullableNumber(s.medianDaysFromSignup),
      formatNullableNumber(s.p75DaysFromSignup),
    ].join(','),
  );
  return [CSV_HEADER, ...rows].join('\n');
}

function csvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatNullableNumber(n: number | null): string {
  return n === null ? '' : String(n);
}

export function formatSummary(report: ActivationFunnelReport): string {
  const { cohort, stages } = report;
  const sinceStr = cohort.signupSince.toISOString().slice(0, 10);
  const untilStr = cohort.signupUntil.toISOString().slice(0, 10);
  const head = `Activation funnel | cohort: ${cohort.size} users signing up ${sinceStr} → ${untilStr} | retention window: ${cohort.retentionWindowDays}d`;
  const stageLines = stages.map((s) => {
    const timing =
      s.medianDaysFromSignup === null
        ? ''
        : ` (median ${s.medianDaysFromSignup}d, p75 ${s.p75DaysFromSignup ?? '—'}d)`;
    return `  ${s.label}: ${s.count} (${s.pctOfSignups}% of signups, ${s.pctOfPrevious}% of previous)${timing}`;
  });
  return [head, ...stageLines].join('\n');
}
