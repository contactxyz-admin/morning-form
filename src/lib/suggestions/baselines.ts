export type BaselineInputPoint = {
  metric: string;
  value: number;
  timestamp: string | Date;
};

export type Baseline = {
  median7: number | null;
  median30: number | null;
  std30: number | null;
};

export type Baselines = Record<string, Baseline>;

function utcDayKey(ts: string | Date): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Collapse points to one-per-(metric, UTC day) keeping the latest reading,
 * then return the most-recent N daily values per metric.
 */
function dailySeriesByMetric(points: BaselineInputPoint[]): Map<string, { day: string; value: number }[]> {
  const byMetric = new Map<string, Map<string, { value: number; ts: number }>>();
  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    const day = utcDayKey(p.timestamp);
    const ts = new Date(p.timestamp).getTime();
    let perDay = byMetric.get(p.metric);
    if (!perDay) {
      perDay = new Map();
      byMetric.set(p.metric, perDay);
    }
    const existing = perDay.get(day);
    if (!existing || ts >= existing.ts) {
      perDay.set(day, { value: p.value, ts });
    }
  }
  const out = new Map<string, { day: string; value: number }[]>();
  byMetric.forEach((perDay, metric) => {
    const series = Array.from(perDay.entries())
      .map(([day, { value }]) => ({ day, value }))
      .sort((a, b) => (a.day < b.day ? 1 : -1)); // most recent first
    out.set(metric, series);
  });
  return out;
}

export function computeBaselines(points: BaselineInputPoint[]): Baselines {
  const series = dailySeriesByMetric(points);
  const baselines: Baselines = {};
  series.forEach((days: { day: string; value: number }[], metric: string) => {
    const last7 = days.slice(0, 7).map((d) => d.value);
    const last30 = days.slice(0, 30).map((d) => d.value);
    baselines[metric] = {
      median7: last7.length >= 7 ? median(last7) : null,
      median30: last30.length >= 30 ? median(last30) : null,
      std30: last30.length >= 30 ? stddev(last30) : null,
    };
  });
  return baselines;
}
