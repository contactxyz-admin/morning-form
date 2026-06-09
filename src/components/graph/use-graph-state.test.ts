/**
 * Unit tests for the node-env-testable pure pieces of useGraphState
 * (Plan 2026-06-08-001 R5). The hook itself needs a DOM/SVG; here we only
 * exercise the extracted `computeMotionAllowed` decision, which must be
 * safe in node/SSR and honour prefers-reduced-motion.
 */
import { describe, expect, it } from 'vitest';
import * as d3 from 'd3';
import { computeMotionAllowed } from './use-graph-state';

describe('computeMotionAllowed', () => {
  it('returns false when window is undefined (SSR / node)', () => {
    expect(computeMotionAllowed(undefined)).toBe(false);
  });

  it('returns false when matchMedia is absent on window', () => {
    const win = {} as unknown as Window;
    expect(computeMotionAllowed(win)).toBe(false);
  });

  it('returns false when the user prefers reduced motion', () => {
    const win = {
      matchMedia: (q: string) => ({
        matches: q.includes('reduce'),
      }),
    } as unknown as Window;
    expect(computeMotionAllowed(win)).toBe(false);
  });

  it('returns true when motion is allowed (no reduce preference)', () => {
    const win = {
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;
    expect(computeMotionAllowed(win)).toBe(true);
  });

  it('does not throw when called with the default (real or absent window)', () => {
    expect(() => computeMotionAllowed()).not.toThrow();
  });
});

// ── Spring-drag physics (Plan 2026-06-08-001 Unit 3) ──
//
// The drag GESTURE (d3.drag, cursor, click-vs-drag) needs a DOM and is
// browser-audit-only. But the PHYSICS that drag re-energizes — a real
// d3.forceSimulation — is pure JS and runs headless in vitest's node env.
// This locks the load-bearing guarantees: dragstart re-energizes the sim,
// a linked neighbour springs along, and the sim settles to rest on
// alphaTarget(0). Mirrors the dragstart/drag/dragend wiring in
// use-graph-state.ts WITHOUT the SVG/d3.drag layer.

interface DragSimNode extends d3.SimulationNodeDatum {
  id: string;
}
interface DragSimLink extends d3.SimulationLinkDatum<DragSimNode> {
  source: DragSimNode;
  target: DragSimNode;
}

describe('spring drag — headless d3 sim physics', () => {
  function buildSim() {
    const a: DragSimNode = { id: 'a', x: 100, y: 100 };
    const b: DragSimNode = { id: 'b', x: 160, y: 100 };
    const nodes: DragSimNode[] = [a, b];
    const links: DragSimLink[] = [{ source: a, target: b }];

    const sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink<DragSimNode, DragSimLink>(links)
          .id((d) => d.id)
          .distance(70)
          .strength(0.6),
      )
      .force('charge', d3.forceManyBody<DragSimNode>().strength(-260))
      .stop();

    return { sim, a, b };
  }

  it('re-energizes the sim and springs the linked neighbour on a pinned drag', () => {
    const { sim, a, b } = buildSim();

    // A fresh sim starts at alpha=1; settle it to rest first so the
    // "resting" baseline is meaningful (not the un-run starting energy).
    while (sim.alpha() >= 0.001) sim.tick();
    const restingAlpha = sim.alpha();

    const bStart = { x: b.x as number, y: b.y as number };

    // dragstart: re-energize + pin node A far from its rest position.
    sim.alphaTarget(0.3).restart();
    a.fx = 400;
    a.fy = 400;

    // Run several ticks (drive the sim manually — no rAF in node).
    for (let i = 0; i < 20; i++) sim.tick();

    // (a) re-energized: alpha rose above its resting value.
    expect(sim.alpha()).toBeGreaterThan(restingAlpha);

    // (b) spring coupling: the linked neighbour B moved.
    const bMoved =
      Math.abs((b.x as number) - bStart.x) > 1e-6 ||
      Math.abs((b.y as number) - bStart.y) > 1e-6;
    expect(bMoved).toBe(true);
  });

  it('settles below alphaMin once alphaTarget returns to 0 (dragend cools to rest)', () => {
    const { sim, a } = buildSim();
    const ALPHA_MIN = 0.001; // d3-force default alphaMin.

    sim.alphaTarget(0.3).restart();
    a.fx = 400;
    a.fy = 400;
    for (let i = 0; i < 20; i++) sim.tick();

    // dragend: cool to rest. RETAIN fx/fy (session pin — no spring-back).
    sim.alphaTarget(0);

    // Tick until cooled (bounded so a stuck sim fails loudly, not hangs).
    let guard = 0;
    while (sim.alpha() >= ALPHA_MIN && guard < 10_000) {
      sim.tick();
      guard++;
    }

    expect(sim.alpha()).toBeLessThan(ALPHA_MIN);
    // Pin retained through settle.
    expect(a.fx).toBe(400);
    expect(a.fy).toBe(400);
  });
});
