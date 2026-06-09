/**
 * Motion primitives tests (Plan 2026-06-08-001 U1). Pure, DOM-free.
 */
import { describe, expect, it, vi } from 'vitest';
import { smooth, easeOutCubic, entranceFrame, clampToBounds } from './motion';

describe('smooth', () => {
  it('is 0 at t=0 and 1 at t=1', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
  });

  it('clamps outside [0,1]', () => {
    expect(smooth(-0.5)).toBe(0);
    expect(smooth(1.5)).toBe(1);
  });

  it('is monotonic non-decreasing', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const v = smooth(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('midpoint is strictly between 0 and 1', () => {
    const mid = smooth(0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('easeOutCubic', () => {
  it('is 0 at t=0 and 1 at t=1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('clamps outside [0,1]', () => {
    expect(easeOutCubic(-0.5)).toBe(0);
    expect(easeOutCubic(1.5)).toBe(1);
  });

  it('starts faster than linear (ease-out property)', () => {
    // At t=0.25, ease-out should be ahead of linear.
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
  });
});

describe('entranceFrame', () => {
  const start = [
    { id: 'a', x: 100, y: 200 },
    { id: 'b', x: 300, y: 400 },
  ];
  const target = [
    { id: 'a', x: 150, y: 250 },
    { id: 'b', x: 350, y: 350 },
  ];

  it('returns start at alpha=0', () => {
    const result = entranceFrame(start, target, 0);
    expect(result).toEqual(start);
  });

  it('returns target at alpha=1', () => {
    const result = entranceFrame(start, target, 1);
    expect(result).toEqual(target);
  });

  it('midpoint is strictly between per-node', () => {
    const result = entranceFrame(start, target, 0.5);
    expect(result[0].x).toBeGreaterThan(100);
    expect(result[0].x).toBeLessThan(150);
    expect(result[0].y).toBeGreaterThan(200);
    expect(result[0].y).toBeLessThan(250);
    expect(result[1].x).toBeGreaterThan(300);
    expect(result[1].x).toBeLessThan(350);
  });

  it('handles empty arrays', () => {
    expect(entranceFrame([], [], 0.5)).toEqual([]);
  });

  it('handles single node', () => {
    const s = [{ id: 'a', x: 0, y: 0 }];
    const t = [{ id: 'a', x: 10, y: 20 }];
    const result = entranceFrame(s, t, 0.5);
    expect(result[0].x).toBe(5);
    expect(result[0].y).toBe(10);
  });

  it('keeps nodes removed from target at their start position', () => {
    const s = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 1 }];
    const t = [{ id: 'a', x: 10, y: 10 }];
    const result = entranceFrame(s, t, 0.5);
    expect(result[1].x).toBe(1);
    expect(result[1].y).toBe(1);
  });

  it('clamps alpha outside [0,1]', () => {
    expect(entranceFrame(start, target, -0.5)).toEqual(start);
    expect(entranceFrame(start, target, 1.5)).toEqual(target);
  });
});

// ── clampToBounds (Plan 2026-06-08-001 Unit 3 — drag bounds) ──
describe('clampToBounds', () => {
  it('leaves a value within bounds unchanged', () => {
    expect(clampToBounds(100, 12, 960)).toBe(100);
  });

  it('clamps a value below the radius up to the radius', () => {
    expect(clampToBounds(5, 12, 960)).toBe(12);
    expect(clampToBounds(-50, 9, 600)).toBe(9);
  });

  it('clamps a value beyond max-radius down to max-radius', () => {
    expect(clampToBounds(955, 12, 960)).toBe(948);
    expect(clampToBounds(10_000, 7, 600)).toBe(593);
  });

  it('keeps the lower and upper edges exactly at radius / max-radius', () => {
    expect(clampToBounds(12, 12, 960)).toBe(12);
    expect(clampToBounds(948, 12, 960)).toBe(948);
  });

  it('collapses to the canvas midpoint when the node is larger than the canvas (degenerate)', () => {
    // radius > max - radius ⇒ valid interval inverts; return max/2.
    expect(clampToBounds(0, 60, 100)).toBe(50);
    expect(clampToBounds(1000, 60, 100)).toBe(50);
    expect(clampToBounds(50, 60, 100)).toBe(50);
  });
});

// ── R4: Determinism characterization ──
// The frozen layout for a given seed + data must be byte-identical after
// the motion wiring. This test runs the EXACT force-simulation pipeline
// from use-graph-state.ts and snapshots the converged positions.
//
// It locks ABSOLUTE values against a frozen reference (so a force-param or
// tick-count drift fails), asserts the RNG is constructed exactly once
// (single stream — the R4 invariant), and stays coupled to production by
// importing the real `radiusForTier`. It also includes the regression test
// that would have caught the P0 no-op: scatter (tick 0) !== settled (tick 80).

import * as d3 from 'd3';
import * as generators from '../../../prisma/fixtures/synthetic/generators';
import { radiusForTier } from '@/lib/graph/visual-encoding';
import type { ImportanceTier } from '@/types/graph';

// Local Pick<> fixtures — only the fields the simulation reads. Keeps the
// fixtures honest (real field names/types) without fabricating the full
// wire shape (userId, attributes, confidence, timestamps, …).
type SimNodeFixture = Pick<
  import('@/types/graph').GraphNodeWire,
  'id' | 'type' | 'tier' | 'score' | 'canonicalKey' | 'displayName'
>;
type SimEdgeFixture = Pick<
  import('@/types/graph').GraphEdgeWire,
  'id' | 'type' | 'fromNodeId' | 'toNodeId'
>;

describe('R4 determinism — seed→80-ticks→positions', () => {
  function node(id: string, tier: ImportanceTier = 1): SimNodeFixture {
    return {
      id,
      type: 'biomarker',
      canonicalKey: id,
      displayName: id.toUpperCase(),
      score: 1,
      tier,
    };
  }
  function edge(id: string, from: string, to: string): SimEdgeFixture {
    return { id, type: 'SUPPORTS', fromNodeId: from, toNodeId: to };
  }

  // Snapshot helper: run the pipeline and return {id, x, y}[].
  // `ticks` controls how far the sim is advanced (0 = scatter only).
  // Mirrors use-graph-state.ts: single makeRng stream feeds both the
  // initial scatter and `.randomSource`, real radiusForTier for collide.
  function solvePositions(
    nodes: SimNodeFixture[],
    edges: SimEdgeFixture[],
    seed: number,
    width = 960,
    height = 600,
    ticks = 80,
  ): { id: string; x: number; y: number }[] {
    const rng = generators.makeRng(seed);

    const simNodes = nodes.map((n) => ({
      ...n,
      x: width / 2 + (rng() - 0.5) * width * 0.5,
      y: height / 2 + (rng() - 0.5) * height * 0.5,
      vx: 0,
      vy: 0,
    }));

    const simEdges = edges
      .map((e) => {
        const source = simNodes.find((n) => n.id === e.fromNodeId);
        const target = simNodes.find((n) => n.id === e.toNodeId);
        if (!source || !target) return null;
        return { id: e.id, source, target, type: e.type };
      })
      .filter(Boolean) as { id: string; source: typeof simNodes[0]; target: typeof simNodes[0]; type: string }[];

    type SolveNode = (typeof simNodes)[number];
    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink(simEdges)
          .id((d) => (d as SolveNode).id)
          .distance(70)
          .strength(0.6),
      )
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.15))
      .force('collide', d3.forceCollide<SolveNode>().radius((d) => radiusForTier(d.tier) + 4))
      .randomSource(rng)
      .stop();

    for (let i = 0; i < ticks; i++) simulation.tick();

    return simNodes.map((n) => ({ id: n.id, x: Math.round(n.x * 1000) / 1000, y: Math.round(n.y * 1000) / 1000 }));
  }

  const FIXTURE_NODES = [node('a'), node('b'), node('c'), node('d', 2), node('e', 3)];
  const FIXTURE_EDGES = [
    edge('ab', 'a', 'b'),
    edge('bc', 'b', 'c'),
    edge('cd', 'c', 'd'),
    edge('de', 'd', 'e'),
  ];

  it('produces deterministic positions for a 5-node fixture', () => {
    const a = solvePositions(FIXTURE_NODES, FIXTURE_EDGES, 42);
    const b = solvePositions(FIXTURE_NODES, FIXTURE_EDGES, 42);

    // Same seed → byte-identical.
    expect(a).toEqual(b);

    // Different seed → different positions.
    const c = solvePositions(FIXTURE_NODES, FIXTURE_EDGES, 99);
    expect(a).not.toEqual(c);
  });

  it('matches the frozen reference layout (locks force params + tick count)', () => {
    // Absolute golden snapshot. Any drift in force strengths, distances,
    // collide radius, tick count, or RNG stream order will fail this.
    const FROZEN_42: { id: string; x: number; y: number }[] = [
      { id: 'a', x: 625.508, y: 245.124 },
      { id: 'b', x: 539.661, y: 251.127 },
      { id: 'c', x: 453.156, y: 269.147 },
      { id: 'd', x: 383.385, y: 321.958 },
      { id: 'e', x: 391.232, y: 406.868 },
    ];
    const actual = solvePositions(FIXTURE_NODES, FIXTURE_EDGES, 42);
    // Diagnostic on drift: print the actual so the reference is easy to refresh.
    if (JSON.stringify(actual) !== JSON.stringify(FROZEN_42)) {
      // eslint-disable-next-line no-console
      console.error('R4 frozen-layout drift; actual =', JSON.stringify(actual));
    }
    expect(actual).toEqual(FROZEN_42);
  });

  it('constructs the RNG exactly once per solve (single stream — R4 invariant)', () => {
    const spy = vi.spyOn(generators, 'makeRng');
    solvePositions(FIXTURE_NODES, FIXTURE_EDGES, 42);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('entrance actually displaces nodes: scatter (tick 0) !== settled (tick 80)', () => {
    // The P0 regression guard. If startPositions were snapshotted after the
    // ticks (the original no-op bug), scatter would equal settled and this
    // would fail.
    const scatter = solvePositions(FIXTURE_NODES, FIXTURE_EDGES, 42, 960, 600, 0);
    const settled = solvePositions(FIXTURE_NODES, FIXTURE_EDGES, 42, 960, 600, 80);
    expect(scatter).not.toEqual(settled);
    // And every individual node moved (not just one).
    for (let i = 0; i < scatter.length; i++) {
      const moved =
        scatter[i].x !== settled[i].x || scatter[i].y !== settled[i].y;
      expect(moved).toBe(true);
    }
  });

  it('produces deterministic positions for a single-node graph', () => {
    const r = solvePositions([node('x')], [], 7);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('x');
  });

  it('positions are within the canvas bounds (± some margin)', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => node(`n${i}`, ((i % 3) + 1) as ImportanceTier));
    const edges: SimEdgeFixture[] = [];
    for (let i = 1; i < nodes.length; i++) {
      edges.push(edge(`e${i}`, nodes[i - 1].id, nodes[i].id));
    }
    const r = solvePositions(nodes, edges, 1, 960, 600);
    for (const p of r) {
      expect(p.x).toBeGreaterThan(-200);
      expect(p.x).toBeLessThan(1160);
      expect(p.y).toBeGreaterThan(-200);
      expect(p.y).toBeLessThan(800);
    }
  });
});

// ── entranceFrame: ReadonlyMap target + purity ──
describe('entranceFrame — ReadonlyMap target', () => {
  it('accepts a prebuilt ReadonlyMap and lerps identically to the array form', () => {
    const start = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 10 },
    ];
    const targetArr = [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 20, y: 20 },
    ];
    const targetMap = new Map(targetArr.map((p) => [p.id, p]));
    expect(entranceFrame(start, targetMap, 0.5)).toEqual(
      entranceFrame(start, targetArr, 0.5),
    );
  });

  it('returns a copy (not the aliased input) for nodes absent from target', () => {
    const start = [{ id: 'a', x: 1, y: 2 }];
    const result = entranceFrame(start, new Map(), 0.5);
    expect(result[0]).toEqual({ id: 'a', x: 1, y: 2 });
    expect(result[0]).not.toBe(start[0]); // distinct object reference
  });
});
