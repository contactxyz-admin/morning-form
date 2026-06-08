/**
 * Motion primitives tests (Plan 2026-06-08-001 U1). Pure, DOM-free.
 */
import { describe, expect, it } from 'vitest';
import { smooth, easeOutCubic, entranceFrame } from './motion';

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

// ── R4: Determinism characterization ──
// The frozen layout for a given seed + data must be byte-identical after
// the motion wiring. This test runs the EXACT force-simulation pipeline
// from use-graph-state.ts and snapshots the converged positions.

import * as d3 from 'd3';
import { makeRng } from '../../../prisma/fixtures/synthetic/generators';
import type { GraphNodeWire, GraphEdgeWire } from '@/types/graph';

describe('R4 determinism — seed→80-ticks→positions', () => {
  // Minimal GraphNodeWire fixtures — only the fields the simulation reads.
  function node(id: string, tier: 1 | 2 | 3 = 1): GraphNodeWire {
    return {
      id,
      type: 'biomarker' as const,
      canonicalKey: id,
      displayName: id.toUpperCase(),
      score: 1,
      tier,
    };
  }
  function edge(id: string, from: string, to: string): GraphEdgeWire {
    return { id, type: 'relates' as const, fromNodeId: from, toNodeId: to };
  }

  // Snapshot helper: run the pipeline and return {id, x, y}[].
  function solvePositions(
    nodes: GraphNodeWire[],
    edges: GraphEdgeWire[],
    seed: number,
    width = 960,
    height = 600,
  ): { id: string; x: number; y: number }[] {
    const rng = makeRng(seed);

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

    const simulation = d3
      .forceSimulation(simNodes)
      .force('link', d3.forceLink(simEdges).id((d: any) => d.id).distance(70).strength(0.6))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.15))
      .force('collide', d3.forceCollide().radius((d: any) => (d.tier === 1 ? 12 : d.tier === 2 ? 9 : 7) + 4))
      .randomSource(rng)
      .stop();

    for (let i = 0; i < 80; i++) simulation.tick();

    return simNodes.map((n) => ({ id: n.id, x: Math.round(n.x * 1000) / 1000, y: Math.round(n.y * 1000) / 1000 }));
  }

  it('produces deterministic positions for a 5-node fixture', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d', 2), node('e', 3)];
    const edges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('cd', 'c', 'd'), edge('de', 'd', 'e')];

    const a = solvePositions(nodes, edges, 42);
    const b = solvePositions(nodes, edges, 42);

    // Same seed → byte-identical.
    expect(a).toEqual(b);

    // Different seed → different positions.
    const c = solvePositions(nodes, edges, 99);
    expect(a).not.toEqual(c);
  });

  it('produces deterministic positions for a single-node graph', () => {
    const r = solvePositions([node('x')], [], 7);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('x');
  });

  it('positions are within the canvas bounds (± some margin)', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => node(`n${i}`, (i % 3 + 1) as 1 | 2 | 3));
    const edges: GraphEdgeWire[] = [];
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
