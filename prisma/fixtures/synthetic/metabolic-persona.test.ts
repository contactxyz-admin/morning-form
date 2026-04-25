import { describe, expect, it } from 'vitest';
import {
  generatePersonaData,
  INFLECTION_QUARTER,
  METRICS,
  PERSONA_SEED,
  QUARTERS,
} from './metabolic-persona';
import { METABOLIC_PERSONA_GRAPH } from './graph-narrative';

describe('generatePersonaData', () => {
  it('is byte-identical when called twice with the same seed', () => {
    const a = generatePersonaData(PERSONA_SEED);
    const b = generatePersonaData(PERSONA_SEED);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces different output for a different seed', () => {
    const a = generatePersonaData(PERSONA_SEED);
    const b = generatePersonaData(PERSONA_SEED + 1);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('clamps every value into the metric-defined physical range', () => {
    const data = generatePersonaData(PERSONA_SEED);
    for (const point of data) {
      const spec = METRICS.find((m) => m.metric === point.metric);
      expect(spec).toBeDefined();
      if (!spec) continue;
      expect(point.value).toBeGreaterThanOrEqual(spec.series.min);
      expect(point.value).toBeLessThanOrEqual(spec.series.max);
    }
  });

  it('writes the expected sample count per cadence', () => {
    const data = generatePersonaData(PERSONA_SEED);
    const counts = new Map<string, number>();
    for (const p of data) counts.set(p.metric, (counts.get(p.metric) ?? 0) + 1);
    for (const spec of METRICS) {
      const expected =
        spec.cadence === 'daily' ? 720 : spec.cadence === 'weekly' ? 102 : QUARTERS;
      expect(counts.get(spec.metric)).toBe(expected);
    }
  });

  it('HbA1c trend reverses meaningfully after the inflection', () => {
    // HbA1c is quarterly. Eight points; inflection at quarter 4.67.
    // Pre-inflection trend should drift up; post-inflection should drift down.
    const data = generatePersonaData(PERSONA_SEED);
    const hba1c = data.filter((p) => p.metric === 'hba1c_percent');
    expect(hba1c.length).toBe(QUARTERS);

    const preIdx = Math.floor(INFLECTION_QUARTER);
    const preStart = hba1c[0].value;
    const preEnd = hba1c[preIdx].value;
    const postEnd = hba1c[hba1c.length - 1].value;

    const preDelta = preEnd - preStart;
    const postDelta = postEnd - preEnd;

    // Pre-intervention: drift up. Post-intervention: drift back down.
    // Allowing slack for noise on a short series.
    expect(preDelta).toBeGreaterThan(0);
    expect(postDelta).toBeLessThan(0);

    // The plan's sanity check: post-inflection trend at least as steep
    // (in opposite direction) as pre. We assert |postSlope| >= 0.5*|preSlope|.
    const preSlope = preDelta / preIdx;
    const postSlope = postDelta / (hba1c.length - 1 - preIdx);
    expect(Math.abs(postSlope)).toBeGreaterThanOrEqual(Math.abs(preSlope) * 0.5);
  });

  it('timestamps end at the persona END_DATE for every metric', () => {
    const data = generatePersonaData(PERSONA_SEED);
    const lastTimestamps = new Map<string, string>();
    for (const p of data) {
      const prev = lastTimestamps.get(p.metric);
      if (!prev || p.timestamp > prev) lastTimestamps.set(p.metric, p.timestamp);
    }
    // All "last" timestamps should be the persona END_DATE.
    const endDate = '2026-04-25T08:00:00.000Z';
    lastTimestamps.forEach((ts) => {
      expect(ts).toBe(endDate);
    });
  });
});

describe('METABOLIC_PERSONA_GRAPH', () => {
  it('contains 30+ nodes and 40+ edges', () => {
    expect(METABOLIC_PERSONA_GRAPH.nodes.length).toBeGreaterThanOrEqual(30);
    expect(METABOLIC_PERSONA_GRAPH.edges.length).toBeGreaterThanOrEqual(40);
  });

  it('every edge resolves both endpoints to nodes in the fixture', () => {
    const nodeKeys = new Set(METABOLIC_PERSONA_GRAPH.nodes.map((n) => n.nodeKey));
    for (const e of METABOLIC_PERSONA_GRAPH.edges) {
      expect(nodeKeys.has(e.fromNodeKey)).toBe(true);
      expect(nodeKeys.has(e.toNodeKey)).toBe(true);
    }
  });

  it('every chunk-bound edge resolves to a chunk in the same source', () => {
    const chunkOwner = new Map<string, string>(); // chunkKey -> sourceKey
    for (const s of METABOLIC_PERSONA_GRAPH.sources) {
      for (const c of s.chunks) chunkOwner.set(c.chunkKey, s.sourceKey);
    }
    for (const e of METABOLIC_PERSONA_GRAPH.edges) {
      if (!e.fromChunkKey) continue;
      expect(chunkOwner.has(e.fromChunkKey)).toBe(true);
      // If a fromSourceKey is provided too, they must agree.
      if (e.fromSourceKey) {
        expect(chunkOwner.get(e.fromChunkKey)).toBe(e.fromSourceKey);
      }
    }
  });

  it('covers the three core specialty surfaces', () => {
    const condKeys = new Set(
      METABOLIC_PERSONA_GRAPH.nodes
        .filter((n) => n.type === 'condition')
        .map((n) => n.canonicalKey),
    );
    // Cardiometabolic
    expect(condKeys.has('prediabetes')).toBe(true);
    expect(condKeys.has('mild-dyslipidaemia')).toBe(true);
    // Sleep-recovery
    expect(condKeys.has('impaired-sleep-continuity')).toBe(true);
    // Hormonal-endocrine
    expect(condKeys.has('low-normal-testosterone')).toBe(true);
  });
});
