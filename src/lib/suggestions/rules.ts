import type { Baselines } from './baselines';

export type EvidenceTier = 'strong' | 'moderate' | 'behavioral';

export type RuleMetric = {
  id: string;
  metric: string;
  value: number;
  timestamp: string | Date;
};

export type RuleProtocolItem = {
  compounds: string;
  timeSlot: string;
};

export type RuleResult = {
  kind: string;
  title: string;
  rationale: string;
  evidenceTier: EvidenceTier;
  triggeringMetricIds: string[];
};

export type RuleInput = {
  metrics: RuleMetric[];
  baselines: Baselines;
  protocol: RuleProtocolItem[];
};

export type Rule = {
  kind: string;
  evaluate: (input: RuleInput) => RuleResult | null;
};

export type { Baselines } from './baselines';

function utcDayKey(ts: string | Date): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function pointsForMetric(metrics: RuleMetric[], name: string): RuleMetric[] {
  return metrics
    .filter((m) => m.metric === name && Number.isFinite(m.value))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function latestPerDay(metrics: RuleMetric[], name: string): RuleMetric[] {
  const seen = new Map<string, RuleMetric>();
  for (const m of pointsForMetric(metrics, name)) {
    const day = utcDayKey(m.timestamp);
    if (!seen.has(day)) seen.set(day, m); // first wins (most recent due to sort)
  }
  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

function protocolHasCompound(protocol: RuleProtocolItem[], needle: string): boolean {
  const n = needle.toLowerCase();
  return protocol.some((p) => p.compounds.toLowerCase().includes(n));
}

const hrvDeloadRule: Rule = {
  kind: 'hrv_deload',
  evaluate: ({ metrics, baselines }) => {
    const baseline = baselines.hrv?.median7;
    if (baseline == null) return null;
    const recent = pointsForMetric(metrics, 'hrv')[0];
    if (!recent) return null;
    const dropPct = (baseline - recent.value) / baseline;
    if (dropPct < 0.15) return null;
    return {
      kind: 'hrv_deload',
      title: 'Add glycine 2g before bed and take it easier today',
      rationale: `Your HRV today is ${formatNum(recent.value)} ms — ${formatPct(dropPct)} below your 7-day median of ${formatNum(baseline)} ms. Glycine 2g 30 minutes before bed supports recovery.`,
      evidenceTier: 'strong',
      triggeringMetricIds: [recent.id],
    };
  },
};

const rhrElevatedRule: Rule = {
  kind: 'rhr_elevated',
  evaluate: ({ metrics, baselines }) => {
    const baseline = baselines.resting_hr?.median7;
    if (baseline == null) return null;
    const recent = pointsForMetric(metrics, 'resting_hr')[0];
    if (!recent) return null;
    const risePct = (recent.value - baseline) / baseline;
    if (risePct < 0.10) return null;
    return {
      kind: 'rhr_elevated',
      title: 'Hydrate and defer caffeine until 10am',
      rationale: `Your resting HR today is ${formatNum(recent.value)} bpm — ${formatPct(risePct)} above your 7-day median of ${formatNum(baseline)} bpm. Often a sign of under-recovery or under-hydration.`,
      evidenceTier: 'moderate',
      triggeringMetricIds: [recent.id],
    };
  },
};

const magnesiumPmRule: Rule = {
  kind: 'magnesium_pm',
  evaluate: ({ metrics, protocol }) => {
    if (protocolHasCompound(protocol, 'magnesium')) return null;
    const nights = latestPerDay(metrics, 'deep_sleep').slice(0, 3);
    if (nights.length < 3) return null;
    if (!nights.every((n) => n.value < 1)) return null;
    return {
      kind: 'magnesium_pm',
      title: 'Add magnesium glycinate 400mg, 30min before bed',
      rationale: `Your deep sleep has been under 1 hour for the last 3 nights (${nights.map((n) => formatNum(n.value) + 'h').join(', ')}). Magnesium glycinate 400mg before bed often improves deep sleep within a week.`,
      evidenceTier: 'strong',
      triggeringMetricIds: nights.map((n) => n.id),
    };
  },
};

const lowActivityRule: Rule = {
  kind: 'low_activity',
  evaluate: ({ metrics }) => {
    const days = latestPerDay(metrics, 'steps').slice(0, 2);
    if (days.length < 2) return null;
    if (!days.every((d) => d.value < 3000)) return null;
    return {
      kind: 'low_activity',
      title: 'Take a 20-minute walk before noon',
      rationale: `You've been under 3,000 steps for 2 days running (${days.map((d) => Math.round(d.value).toLocaleString()).join(', ')}). A short morning walk helps reset circadian and metabolic signals.`,
      evidenceTier: 'behavioral',
      triggeringMetricIds: days.map((d) => d.id),
    };
  },
};

const shortSleepRule: Rule = {
  kind: 'short_sleep',
  evaluate: ({ metrics }) => {
    const recent = latestPerDay(metrics, 'duration')[0];
    if (!recent) return null;
    if (recent.value >= 6) return null;
    return {
      kind: 'short_sleep',
      title: 'Skip morning stimulants today',
      rationale: `You slept ${formatNum(recent.value)} hours last night. Caffeine on short sleep tends to backfire — try delaying it or skipping it entirely today.`,
      evidenceTier: 'behavioral',
      triggeringMetricIds: [recent.id],
    };
  },
};

export const rules: Rule[] = [
  hrvDeloadRule,
  rhrElevatedRule,
  magnesiumPmRule,
  lowActivityRule,
  shortSleepRule,
];

export function evaluateRules(input: RuleInput): RuleResult[] {
  const out: RuleResult[] = [];
  for (const rule of rules) {
    try {
      const r = rule.evaluate(input);
      if (r) out.push(r);
    } catch (err) {
      console.error(`[suggestions] rule ${rule.kind} threw:`, err);
    }
  }
  return out;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatPct(frac: number): string {
  return `${Math.round(frac * 100)}%`;
}
