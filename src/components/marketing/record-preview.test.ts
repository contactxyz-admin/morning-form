import { describe, expect, it } from 'vitest';
import { PREVIEW_METRICS } from './record-preview-metrics';
import { getMetricSummary } from '@/lib/demo/persona-summary';
import { SOURCE_NAMES } from '@/lib/marketing/constants';
import { HEALTH_PROVIDERS } from '@/lib/health/providers';

/**
 * Landing-hero guardrails.
 *
 * The RecordPreview hardcodes four fixture metric keys chosen because
 * their first→last values read cleanly as improvement, and the page's
 * source strip hand-curates provider names. Neither has a type-level
 * link to its source of truth, so both degrade silently: a fixture
 * rename drops a hero row with no error; a provider rename leaves the
 * strip advertising a stale name. These tests make that drift loud.
 */

describe('RecordPreview metrics', () => {
  it('every PREVIEW_METRICS key resolves in the persona fixture', () => {
    for (const { metric } of PREVIEW_METRICS) {
      expect(getMetricSummary(metric), `metric "${metric}" missing from fixture`).not.toBeNull();
    }
  });

  it('every preview series reads improved — the hero pairs a positive chip with a positive stroke', () => {
    // If a fixture reseed flips one of these to 'worsened', the hero
    // would show a caution chip on the marketing page. That may be the
    // right call editorially, but it must be a decision, not a surprise:
    // swap the metric or consciously update this expectation.
    for (const { metric } of PREVIEW_METRICS) {
      const summary = getMetricSummary(metric);
      expect(summary?.direction, `metric "${metric}" no longer reads improved`).toBe('improved');
    }
  });

  it('renders at least two distinct sources so the multi-source story holds', () => {
    const sources = new Set(PREVIEW_METRICS.map((m) => m.source));
    expect(sources.size).toBeGreaterThanOrEqual(2);
  });
});

describe('landing source strip', () => {
  it('every device name matches a provider in the registry', () => {
    const providerNames = new Set(Object.values(HEALTH_PROVIDERS).map((p) => p.name));
    const deviceNames = SOURCE_NAMES.filter((n) => n !== 'Blood panels (PDF)');
    for (const name of deviceNames) {
      expect(providerNames.has(name), `"${name}" not found in HEALTH_PROVIDERS`).toBe(true);
    }
  });

  it('does not advertise providers without a working connection path', () => {
    const connectable = new Set(
      Object.values(HEALTH_PROVIDERS)
        .filter((p) => p.accessStatus === 'available' || p.accessStatus === 'native_required')
        .map((p) => p.name),
    );
    const deviceNames = SOURCE_NAMES.filter((n) => n !== 'Blood panels (PDF)');
    for (const name of deviceNames) {
      expect(connectable.has(name), `"${name}" is advertised but not connectable`).toBe(true);
    }
  });
});
