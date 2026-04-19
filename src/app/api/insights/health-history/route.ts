import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

// Maps UI field name to the underlying HealthDataPoint.metric string written
// by /api/health/sync. Mirrors HealthSyncService.aggregateToSummary so the
// history view and the /home summary stay consistent.
const METRICS = {
  hrv: 'hrv',
  recoveryScore: 'recovery_score',
  sleepDuration: 'duration',
  restingHR: 'resting_hr',
  steps: 'steps',
} as const;

type MetricKey = keyof typeof METRICS;

type HistoryDay = {
  date: string;
  hrv: number | null;
  recoveryScore: number | null;
  sleepDuration: number | null;
  restingHR: number | null;
  steps: number | null;
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildDateKeys(endInclusive: Date, days: number): string[] {
  const end = startOfUtcDay(endInclusive);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(isoDate(d));
  }
  return keys;
}

/**
 * GET /api/insights/health-history?days=7 — time-series per-day means for the
 * metrics the /insights page charts (HRV, recovery, sleep duration, resting
 * HR, steps). Days without data are padded with null values so the 7-day grid
 * stays intact on the client.
 *
 * Multiple samples on the same day (multiple providers or intra-day readings)
 * are collapsed to their mean. This is a product judgment, not a gold-standard
 * reduction — a single day with a stale reading + a fresh reading from
 * different devices is rarely reconcilable without user disambiguation.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysParam = url.searchParams.get('days');
  let days = 7;
  if (daysParam !== null) {
    const parsed = Number(daysParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 30) {
      return NextResponse.json(
        { error: "'days' must be an integer between 1 and 30." },
        { status: 400 },
      );
    }
    days = parsed;
  }

  const end = new Date();
  const start = startOfUtcDay(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  try {
    const rows = await prisma.healthDataPoint.findMany({
      where: {
        userId: user.id,
        timestamp: { gte: start },
        metric: { in: Object.values(METRICS) },
      },
      select: { metric: true, value: true, timestamp: true },
    });

    // Bucket values by (dateKey, metricKey) for mean aggregation.
    const buckets = new Map<string, { sum: number; count: number }>();
    for (const row of rows) {
      const dateKey = isoDate(startOfUtcDay(row.timestamp));
      const metricKey = (Object.keys(METRICS) as MetricKey[]).find(
        (key) => METRICS[key] === row.metric,
      );
      if (!metricKey) continue;
      const bucketKey = `${dateKey}|${metricKey}`;
      const bucket = buckets.get(bucketKey) ?? { sum: 0, count: 0 };
      bucket.sum += row.value;
      bucket.count += 1;
      buckets.set(bucketKey, bucket);
    }

    const dateKeys = buildDateKeys(end, days);
    const history: HistoryDay[] = dateKeys.map((date) => {
      const day: HistoryDay = {
        date,
        hrv: null,
        recoveryScore: null,
        sleepDuration: null,
        restingHR: null,
        steps: null,
      };
      (Object.keys(METRICS) as MetricKey[]).forEach((metricKey) => {
        const bucket = buckets.get(`${date}|${metricKey}`);
        if (bucket && bucket.count > 0) {
          day[metricKey] = bucket.sum / bucket.count;
        }
      });
      return day;
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error('[API] Health history error:', error);
    return NextResponse.json({ error: 'Failed to fetch health history' }, { status: 500 });
  }
}
