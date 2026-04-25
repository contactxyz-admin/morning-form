import { describe, expect, it } from 'vitest';
import type { ActivationFunnelReport } from './activation-funnel-report';
import {
  formatCsv,
  formatSummary,
  InvalidCliArgsError,
  isHelpRequested,
  parseArgs as parseArgsRaw,
  toComputeArgs,
  type ParsedCliArgs,
} from './activation-funnel-format';

// Test wrapper: narrow ParseResult to ParsedCliArgs for tests that don't use --help.
function parseArgs(argv: string[], now?: Date): ParsedCliArgs {
  const result = parseArgsRaw(argv, now);
  if (isHelpRequested(result)) {
    throw new Error('parseArgs returned help; this test was not expecting --help');
  }
  return result;
}

describe('parseArgs', () => {
  const now = new Date('2026-04-21T00:00:00Z');

  it('applies defaults when no args are passed (until=now, since=now-30d, retention=7)', () => {
    const result = parseArgs([], now);
    expect(result.signupUntil.toISOString()).toBe(now.toISOString());
    expect(result.signupSince.toISOString()).toBe(
      new Date('2026-03-22T00:00:00Z').toISOString(),
    );
    expect(result.retentionWindowDays).toBe(7);
    expect(result.userIds).toBeUndefined();
  });

  it('parses --signup-since and --signup-until', () => {
    const result = parseArgs(
      ['--signup-since', '2026-03-01', '--signup-until', '2026-04-01'],
      now,
    );
    expect(result.signupSince.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(result.signupUntil.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('parses --user-ids and trims whitespace', () => {
    const result = parseArgs(['--user-ids', ' u1 , u2,u3 '], now);
    expect(result.userIds).toEqual(['u1', 'u2', 'u3']);
  });

  it('drops empty segments in --user-ids', () => {
    const result = parseArgs(['--user-ids', 'u1,,u2,'], now);
    expect(result.userIds).toEqual(['u1', 'u2']);
  });

  it('parses --retention-window-days', () => {
    const result = parseArgs(['--retention-window-days', '14'], now);
    expect(result.retentionWindowDays).toBe(14);
  });

  it('throws on unknown flag', () => {
    expect(() => parseArgs(['--nonsense', 'x'], now)).toThrow(InvalidCliArgsError);
  });

  it('throws on positional argument', () => {
    expect(() => parseArgs(['positional'], now)).toThrow(InvalidCliArgsError);
  });

  it('throws when a flag has no value', () => {
    expect(() => parseArgs(['--signup-since'], now)).toThrow(InvalidCliArgsError);
  });

  it('throws when a flag value is another flag', () => {
    expect(() =>
      parseArgs(['--signup-since', '--signup-until', '2026-04-01'], now),
    ).toThrow(InvalidCliArgsError);
  });

  it('throws on invalid date', () => {
    expect(() => parseArgs(['--signup-since', 'not-a-date'], now)).toThrow(
      InvalidCliArgsError,
    );
  });

  it('throws when --signup-since > --signup-until', () => {
    expect(() =>
      parseArgs(
        ['--signup-since', '2026-04-10', '--signup-until', '2026-04-01'],
        now,
      ),
    ).toThrow(InvalidCliArgsError);
  });

  it('throws on non-integer retention-window-days', () => {
    expect(() => parseArgs(['--retention-window-days', '0'], now)).toThrow(
      InvalidCliArgsError,
    );
    expect(() => parseArgs(['--retention-window-days', 'abc'], now)).toThrow(
      InvalidCliArgsError,
    );
    expect(() => parseArgs(['--retention-window-days', '1.5'], now)).toThrow(
      InvalidCliArgsError,
    );
  });
});

describe('toComputeArgs', () => {
  it('maps parsed CLI args 1:1 to computeActivationFunnel args', () => {
    const parsed = parseArgs(
      ['--signup-since', '2026-03-01', '--user-ids', 'a,b'],
      new Date('2026-04-01T00:00:00Z'),
    );
    const computeArgs = toComputeArgs(parsed);
    expect(computeArgs.signupSince.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(computeArgs.userIds).toEqual(['a', 'b']);
    expect(computeArgs.retentionWindowDays).toBe(7);
  });
});

function sampleReport(): ActivationFunnelReport {
  return {
    cohort: {
      size: 5,
      signupSince: new Date('2026-03-22T00:00:00Z'),
      signupUntil: new Date('2026-04-21T00:00:00Z'),
      userIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
      retentionWindowDays: 7,
    },
    stages: [
      {
        key: 'signup',
        label: 'Signup',
        count: 5,
        pctOfSignups: 100,
        pctOfPrevious: 100,
        medianDaysFromSignup: 0,
        p75DaysFromSignup: 0,
      },
      {
        key: 'essentials',
        label: 'Essentials complete',
        count: 4,
        pctOfSignups: 80,
        pctOfPrevious: 80,
        medianDaysFromSignup: 1,
        p75DaysFromSignup: 2,
      },
      {
        key: 'connected',
        label: 'Data source connected',
        count: 3,
        pctOfSignups: 60,
        pctOfPrevious: 75,
        medianDaysFromSignup: 1.5,
        p75DaysFromSignup: 2.5,
      },
      {
        key: 'first-chat',
        label: 'First chat message',
        count: 2,
        pctOfSignups: 40,
        pctOfPrevious: 66.7,
        medianDaysFromSignup: 2,
        p75DaysFromSignup: 3,
      },
      {
        key: 'grounded-answer',
        label: 'First grounded answer',
        count: 2,
        pctOfSignups: 40,
        pctOfPrevious: 100,
        medianDaysFromSignup: 2.5,
        p75DaysFromSignup: 3.5,
      },
      {
        key: 'retained-7d',
        label: 'Retained (activity ≥24h within 7 days)',
        count: 1,
        pctOfSignups: 20,
        pctOfPrevious: 50,
        medianDaysFromSignup: 4,
        p75DaysFromSignup: 4,
      },
    ],
  };
}

describe('formatCsv', () => {
  it('emits a header row + one row per stage', () => {
    const csv = formatCsv(sampleReport());
    const lines = csv.split('\n');
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe(
      'stage,label,count,pct_of_signups,pct_of_previous,median_days,p75_days',
    );
    expect(lines[1]).toBe('signup,Signup,5,100,100,0,0');
  });

  it('quotes label fields that contain commas', () => {
    const csv = formatCsv(sampleReport());
    // "Retained (activity ≥24h within 7 days)" has no comma → unquoted.
    // Force a label with a comma through the same function to exercise escape:
    const reportWithComma: ActivationFunnelReport = {
      ...sampleReport(),
      stages: [
        {
          key: 'signup',
          label: 'Signup, step 1',
          count: 1,
          pctOfSignups: 100,
          pctOfPrevious: 100,
          medianDaysFromSignup: 0,
          p75DaysFromSignup: 0,
        },
      ],
    };
    const out = formatCsv(reportWithComma);
    expect(out.split('\n')[1]).toBe('signup,"Signup, step 1",1,100,100,0,0');
    expect(csv).toContain('Retained (activity ≥24h within 7 days)');
  });

  it('renders null median/p75 as empty fields', () => {
    const report: ActivationFunnelReport = {
      ...sampleReport(),
      stages: [
        {
          key: 'essentials',
          label: 'Essentials complete',
          count: 0,
          pctOfSignups: 0,
          pctOfPrevious: 0,
          medianDaysFromSignup: null,
          p75DaysFromSignup: null,
        },
      ],
    };
    expect(formatCsv(report).split('\n')[1]).toBe(
      'essentials,Essentials complete,0,0,0,,',
    );
  });
});

describe('formatSummary', () => {
  it('writes a readable one-line-per-stage summary', () => {
    const summary = formatSummary(sampleReport());
    expect(summary).toContain('cohort: 5 users signing up 2026-03-22 → 2026-04-21');
    expect(summary).toContain('Signup: 5 (100% of signups, 100% of previous)');
    expect(summary).toContain(
      'Essentials complete: 4 (80% of signups, 80% of previous) (median 1d, p75 2d)',
    );
    expect(summary).toContain('retention window: 7d');
  });

  it('omits the timing suffix when median is null', () => {
    const report: ActivationFunnelReport = {
      ...sampleReport(),
      stages: [
        {
          key: 'essentials',
          label: 'Essentials complete',
          count: 0,
          pctOfSignups: 0,
          pctOfPrevious: 0,
          medianDaysFromSignup: null,
          p75DaysFromSignup: null,
        },
      ],
    };
    const summary = formatSummary(report);
    expect(summary).toContain('Essentials complete: 0 (0% of signups, 0% of previous)');
    expect(summary).not.toContain('median');
  });
});

describe('parseArgs --help', () => {
  it('returns help sentinel for --help', () => {
    expect(isHelpRequested(parseArgsRaw(['--help']))).toBe(true);
  });

  it('returns help sentinel for -h', () => {
    expect(isHelpRequested(parseArgsRaw(['-h']))).toBe(true);
  });

  it('returns help even when other flags are also present', () => {
    expect(
      isHelpRequested(parseArgsRaw(['--signup-since', '2026-04-01', '--help'])),
    ).toBe(true);
  });

  it('returns parsed args when --help is absent', () => {
    expect(isHelpRequested(parseArgsRaw([], new Date('2026-04-21T00:00:00Z')))).toBe(false);
  });
});

describe('formatCsv escape edge cases', () => {
  function reportWithLabel(label: string): ActivationFunnelReport {
    return {
      ...sampleReport(),
      stages: [
        {
          key: 'signup',
          label,
          count: 1,
          pctOfSignups: 100,
          pctOfPrevious: 100,
          medianDaysFromSignup: 0,
          p75DaysFromSignup: 0,
        },
      ],
    };
  }

  it('escapes embedded double quotes by doubling them and wraps the field', () => {
    const out = formatCsv(reportWithLabel('Has "quoted" text'));
    expect(out.split('\n')[1]).toBe('signup,"Has ""quoted"" text",1,100,100,0,0');
  });

  it('wraps fields containing newlines', () => {
    const out = formatCsv(reportWithLabel('line1\nline2'));
    // Don't split on '\n' — the embedded newline is part of the quoted field.
    expect(out).toContain('"line1\nline2"');
    expect(out.endsWith('signup,"line1\nline2",1,100,100,0,0')).toBe(true);
  });

  it('wraps fields containing both quote and comma', () => {
    const out = formatCsv(reportWithLabel('a,"b"'));
    expect(out.split('\n')[1]).toBe('signup,"a,""b""",1,100,100,0,0');
  });
});
