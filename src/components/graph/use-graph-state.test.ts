/**
 * Unit tests for the node-env-testable pure pieces of useGraphState
 * (Plan 2026-06-08-001 R5). The hook itself needs a DOM/SVG; here we only
 * exercise the extracted `computeMotionAllowed` decision, which must be
 * safe in node/SSR and honour prefers-reduced-motion.
 */
import { describe, expect, it, vi } from 'vitest';
import * as d3 from 'd3';
import { changeGlyph, computeMotionAllowed } from './use-graph-state';

describe('changeGlyph', () => {
  it('maps directions to arrows and `new` (null) to plus', () => {
    expect(changeGlyph('up')).toBe('↑');
    expect(changeGlyph('down')).toBe('↓');
    expect(changeGlyph('flat')).toBe('→');
    expect(changeGlyph(null)).toBe('+');
  });
});

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
    // C is UNLINKED — only repulsion couples it to A, no link force.
    const c: DragSimNode = { id: 'c', x: 220, y: 100 };
    const nodes: DragSimNode[] = [a, b, c];
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

    return { sim, a, b, c };
  }

  it('re-energizes the sim and springs the linked neighbour on a pinned drag', () => {
    const { sim, a, b, c } = buildSim();

    // A fresh sim starts at alpha=1; settle it to rest first so the
    // "resting" baseline is meaningful (not the un-run starting energy).
    while (sim.alpha() >= 0.001) sim.tick();
    const restingAlpha = sim.alpha();

    const bStart = { x: b.x as number, y: b.y as number };
    const cStart = { x: c.x as number, y: c.y as number };

    // dragstart: re-energize + pin node A far from its rest position.
    sim.alphaTarget(0.3).restart();
    a.fx = 400;
    a.fy = 400;

    // Run several ticks (drive the sim manually — no rAF in node).
    for (let i = 0; i < 20; i++) sim.tick();

    // (a) re-energized: alpha rose above its resting value.
    expect(sim.alpha()).toBeGreaterThan(restingAlpha);

    // (b) spring coupling: the linked neighbour B moved.
    const bDist = Math.hypot((b.x as number) - bStart.x, (b.y as number) - bStart.y);
    expect(bDist).toBeGreaterThan(1e-6);

    // (c) selective coupling: the LINKED neighbour B moves substantially
    // more than the UNLINKED node C. C still drifts (repulsion as A moves),
    // so this is a RELATIVE assertion, not C === 0.
    const cDist = Math.hypot((c.x as number) - cStart.x, (c.y as number) - cStart.y);
    expect(bDist).toBeGreaterThan(cDist * 2);
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

  // ── R6: watchdog backstop — sim never ticks forever ──
  // Mirrors the alpha-guarded dragend watchdog in use-graph-state.ts. With
  // fake timers we run the sim hot, fire the watchdog logic, advance time,
  // and assert the sim is cooled below alphaMin.
  it('watchdog (alpha-guarded) stops a still-hot sim and it cools below alphaMin', () => {
    vi.useFakeTimers();
    try {
      const { sim, a } = buildSim();
      const ALPHA_MIN = sim.alphaMin();

      // Run hot (a re-energized drag) and leave it hot.
      sim.alphaTarget(0.3).restart();
      a.fx = 400;
      a.fy = 400;
      for (let i = 0; i < 5; i++) sim.tick();
      expect(sim.alpha()).toBeGreaterThan(ALPHA_MIN);

      // The watchdog callback logic (the alpha-guarded stop from production):
      // only intervene if still hot.
      let fired = false;
      setTimeout(() => {
        if (sim.alpha() > sim.alphaMin()) {
          sim.alphaTarget(0);
          sim.stop();
        }
        fired = true;
      }, 5_000);

      vi.advanceTimersByTime(5_000);
      expect(fired).toBe(true);

      // After the watchdog forced alphaTarget(0) + stop(), drive the manual
      // cool-down (the internal d3 timer is stopped; alphaTarget(0) makes it
      // decay) and assert it reaches rest.
      let guard = 0;
      while (sim.alpha() >= ALPHA_MIN && guard < 10_000) {
        sim.tick();
        guard++;
      }
      expect(sim.alpha()).toBeLessThan(ALPHA_MIN);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Teardown mid-drag: stop() while hot must not throw + cools to rest ──
  it('teardown mid-drag: stop() on a hot sim leaves it below alphaMin, no throw', () => {
    const { sim, a } = buildSim();
    const ALPHA_MIN = sim.alphaMin();

    sim.alphaTarget(0.3).restart();
    a.fx = 400;
    a.fy = 400;
    for (let i = 0; i < 5; i++) sim.tick();

    // Teardown: the internal timer is stopped. We also drop alphaTarget so
    // the sim can decay to rest (production does alphaTarget(0) on the
    // backstop/teardown paths).
    expect(() => {
      sim.alphaTarget(0);
      sim.stop();
    }).not.toThrow();

    let guard = 0;
    while (sim.alpha() >= ALPHA_MIN && guard < 10_000) {
      sim.tick();
      guard++;
    }
    expect(sim.alpha()).toBeLessThan(ALPHA_MIN);
  });
});
