---
title: "feat: Manim-grade physics & UX for the demo graph time scrubber"
type: feat
status: active
date: 2026-06-16
origin: docs/plans/2026-06-15-001-feat-demo-graph-time-scrubber-plan.md
---

# feat: Manim-grade physics & UX for the demo graph time scrubber

## Overview

The `/demo/record` time scrubber works (PR #170) but is *mechanical*: a plain native range slider, and crossing a date stop **hard-cuts** node/edge opacity (instant `style.opacity` set). Nodes pop in and out; the bar itself is unstyled. This plan makes the scrubber feel **animated** — in the [Manim](https://www.manim.community/) sense: time transitions are *eased interpolations* between states (not cuts), newly-revealed nodes **grow in** with a spring-ish scale, same-date births **stagger** (Manim's `lag_ratio`), and the control gains a real timeline UX — dated tick marks, a prominent "as of" readout, and a **play** button that animates *through* time (Manim is fundamentally about *playing* an animation).

Two threads, named by the request:
- **Physics** — how the graph moves as time changes: eased opacity + grow-in scale + staggered reveal, driven by rate functions, honoring the existing determinism/reduced-motion contracts.
- **UX** — how the bar feels: dated ticks + labels, current-date readout, play/pause auto-advance, keyboard control.

## Problem Frame

The scrubber's dimming lives in `graph-canvas.tsx`'s dim effect: it computes a target opacity per node (`asOfVisibility` / `changeVisibleAsOf` from `src/lib/graph/as-of.ts`) and writes `style.opacity` **synchronously** — a hard cut on every scrub. Deliberately instant in the first cut for reduced-motion safety and shortest diff. The result reads as "toggling layers," not "watching a record build."

Manim's model — which the repo is already most of the way to — is: a **rate function** maps normalized time `t∈[0,1]` to an eased `alpha`, and `alpha` **interpolates** start→end state. The repo already ships `smooth()` (a clamped smoothstep — Manim's `smooth`) in `src/lib/graph/motion.ts`, `pulseScale()`, and the imperative `animate(0,1,{ease,onUpdate})` driver (framer-motion) used for the graph entrance and the change-pulse. So this is **extending an established in-repo animation pattern to the scrub transition**, not new machinery.

Hard constraints carried from prior plans: the converged D3 layout **never moves** (determinism contract, `2026-06-08-001`); motion is **scale/opacity only on child elements**, cancellable, torn down with existing handles, and **reduced-motion → static** (`2026-06-08-001`, `2026-06-10-003`). And **prod parity** (`2026-06-15-001` R5): when `asOfEpoch` is `null` (the authed `/graph`), the scrubber is absent and render is byte-for-byte today's — so all new motion must no-op on the null path.

## Requirements Trace

- **R1** — Crossing a date stop **eases** node + edge opacity from current→target (rate function `smooth`), instead of a hard cut. Forward (reveal) and backward (hide) both animate.
- **R2** — A node revealed by the scrub **grows in**: an eased scale (≈0.8→1, slight overshoot) on the dot, concurrent with its fade. Physics, not a pop. **Scale is applied without disturbing the node's converged position** (never overwrite the group's `translate`).
- **R3** — Nodes that share a birth date **stagger** their reveal (Manim `lag_ratio`) so a cluster grows organically rather than all-at-once.
- **R4** — The control reads as a timeline: **dated tick marks** at each stop, a **prominent current "as of" date**, and start/end date labels. The native `<input type=range>` remains the accessible, drag-handling backbone.
- **R5** — A **play/pause** control auto-advances `asOf` through the stops with eased motion (the "watch it build" reel); keyboard: arrows step stops, space toggles play.
- **R6** — All motion is **reduced-motion-safe** (`prefers-reduced-motion` → instant, today's behavior) and **prod-parity-safe** (`asOfEpoch == null` → no animation, byte-for-byte today's render). The determinism contract holds: converged positions are byte-identical across any scrub/animation.

## Scope Boundaries

- ❌ Not on the authed `/graph` — demo-only, exactly as the scrubber itself. The shared canvas/motion changes must no-op when `asOfEpoch` is null.
- ❌ No change to *which* nodes are present at a stop, the stop dates, or the `as-of.ts` visibility semantics — this plan animates the **transition between** states the existing helpers already define.
- ❌ No new animation dependency — reuse framer-motion `animate` (already a dep) and `motion.ts` primitives.
- ❌ No repositioning / re-layout / re-solve of the force graph. Opacity + scale only.
- ❌ No persistence of play state, no URL coupling of `asOf`.

### Deferred to Separate Tasks

- **Continuous free-drag with live interpolation** (drag the playhead and watch nodes fade *mid-transition* as `asOf` moves continuously between stops, with an eased snap-to-nearest-stop on release). The richest Manim "continuous alpha" model, but a materially larger interaction-controller change. Gated on this plan landing and the discrete-but-eased version validating the feel.
- **Fully custom playhead/track component** (replacing the native input rather than restyling it). Deferred unless the restyled native control proves insufficient in the visual audit.

## Context & Research

### Relevant Code and Patterns

- `src/lib/graph/motion.ts` — **already has** `smooth(t)` (clamped smoothstep = Manim `smooth`), `pulseScale(easedAlpha, peak)` (overshoot-to-peak-then-settle), `clamp`, `edgeOpacity`. New rate/interp/stagger primitives land here.
- `src/components/graph/use-graph-state.ts` — the `animate(0, 1, { duration, ease, onUpdate })` driver (framer-motion) used for the entrance (~line 596) and the one-shot change-pulse (~line 641), each torn down via refs (`animateRef`, `pulseAnimateRef`) on the existing cleanup paths. **The model to mirror** for the eased scrub transition. Also `computeMotionAllowed()` (reduced-motion/SSR gate) and the change-decoration child circles (`.graph-node-change-ring/-pulse/-badge`).
- `src/components/graph/graph-canvas.tsx` — the dim effect (composes hover/focus emphasis + as-of time-ghost, writes `style.opacity`). The eased transition hooks in here; the key design problem is easing the **time** opacity while keeping **hover** instant (see Key Decisions).
- `src/lib/graph/as-of.ts` — `asOfVisibility`, `changeVisibleAsOf`, `scrubberStops`. Unchanged semantics; the source of each node's target state.
- `src/components/demo/demo-graph-section.tsx` — owns `stops`, `stopIndex`/`activeIndex`, `asOfEpoch`, and renders the native slider + date labels. Home of the new control UX (ticks, readout, play/pause, keyboard).

### Institutional Learnings

- `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md` — canvas motion carries a **mandatory human visual-audit gate**; vitest is `node` (no DOM/rAF), so the *feel* (easing, stagger, grow-in) is browser-verified, not unit-tested. The public prod demo URL is reachable for a prod-build audit (per `reference_morning-form-deploy` memory).
- `docs/plans/2026-06-08-001-feat-graph-physics-motion-plan.md` — the determinism + transient-motion contracts: seed + solve → converged layout byte-identical; motion is scale/opacity only, never `cx/cy`/group-translate; one-shot, cancellable, torn down; reduced-motion → static.

### External References

- [Manim](https://www.manim.community/) animation model: rate functions decouple timing from motion (`smooth` = smoothstep with zero-derivative endpoints; `rush_into`/`rush_from`, `there_and_back`, `back`/overshoot); `alpha = rate(t)` then **interpolate** start→end; **`lag_ratio`/`LaggedStart`** distribute a group animation across time for staggered/successive reveal; `run_time` sets explicit duration. These map directly: `smooth` for the fade tween, an overshoot for grow-in, `lag_ratio` for same-stop stagger, `run_time` for the per-step duration and the play-mode cadence.

## Key Technical Decisions

- **Ease the *time* opacity, keep *hover* instant — via one continuously-eased target, not a blanket CSS transition.** A CSS `transition: opacity` on the node groups would also lag the frequent hover-dim (feels mushy). Instead, on an `asOf` change, run a single cancellable `animate(0,1,{ease:smooth, duration})` (mirroring the entrance) whose `onUpdate(alpha)` re-derives **each node's composed target** (`time-ghost ∪ hover-emphasis`, the exact compose the dim effect does today) and lerps the *time* component by `alpha` while applying the *hover* component instantly. Hover changes mid-tween still read live because the target is recomputed each frame. Reduced-motion / `asOfEpoch == null` → skip the tween, set targets instantly (today's behavior). This is the crux; flag for visual tuning.
- **Grow-in scale on a child wrapper, never the group transform.** The node `<g>` holds `translate(x,y)` (position). A scale-in must not clobber it — apply scale to the dot/halo via a child `<g>`/transform-origin or by animating the circle `r`, exactly as the pulse animates a child circle's `r`/opacity (never `cx/cy`). Preserves R2 determinism.
- **`smooth` for fade, a gentle overshoot for grow-in.** Reuse `smooth()` for opacity. For the birth scale use a `back`/`easeOutBack`-style overshoot (a small new pure primitive, or reuse `pulseScale`'s peak-then-settle shape) so a revealed node lands with a touch of life — matching the repo's existing spring-entrance character without a real spring solver.
- **Stagger via a pure schedule, not N timers.** A `lag_ratio` helper maps `(index, count, lagRatio) → [localStart, localEnd]` sub-windows inside the global `[0,1]`; the single tween's `onUpdate(alpha)` reads each node's sub-window to get its local eased alpha (Manim `LaggedStart`). One animation loop, deterministic, cancellable — no array of `setTimeout`.
- **Play mode is a stepper over the existing discrete stops.** Auto-advance increments `activeIndex` on an interval sized to `run_time + dwell`; each step triggers the same eased transition as a manual scrub. Reuses the discrete-stop model (no continuous-drag needed for v1). Pause/stop at the last stop. Reduced-motion → play still advances but transitions are instant.
- **Native input stays the backbone.** Restyle the track + thumb and overlay dated ticks/labels; keep `<input type=range>` for free drag, keyboard, and the `aria-valuetext` already in place. Avoids a custom drag controller (deferred).
- **Test strategy fixed by the env.** vitest is `node`: unit-test the **pure** pieces — rate functions, lerp, the `lag_ratio` schedule, the compose-target function, the play-stepper state machine. The animation *feel* is the **visual-audit gate** (mandatory for canvas motion).

## Open Questions

### Resolved During Planning

- *Discrete-eased vs continuous-drag?* → Discrete stops with eased transitions for v1 (keeps the dated-stop semantics + native input); continuous free-drag deferred.
- *Where do rate functions live?* → `src/lib/graph/motion.ts` already hosts `smooth`/`pulseScale`; extend there.
- *How to ease time without lagging hover?* → single recomputed-target tween (Key Decisions), not a CSS transition.
- *Custom control vs native?* → restyled native input + overlay; custom playhead deferred.

### Deferred to Implementation

- **Exact `run_time`, dwell, overshoot peak, stagger `lag_ratio`, dim/ghost target** — tuned against the live canvas in the visual audit (feel, not spec). Starting points only in the plan.
- **Tick/label density at narrow widths** — whether to thin labels (e.g. show every Nth) at the demo's desktop width; decided visually.
- **Whether grow-in also applies to source-hub dots and edges, or nodes only** — decide in the audit (edges likely fade-only; growing edges may read as noise).

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

Manim's `alpha = rate(t)` → interpolate, applied to the scrub transition. One cancellable tween per scrub; targets recomputed each frame so hover stays live:

```
on asOf change (motion allowed, asOfEpoch != null):
  cancel any in-flight scrub tween
  capture per-node startOpacity / startScale (current rendered)
  animate(0, 1, { duration: run_time, ease: smooth }):
    onUpdate(globalAlpha):
      for each node:
        localAlpha = staggered(globalAlpha, node.index, node.count, lagRatio)  # Manim lag_ratio
        timeTarget = asOfVisibility(...) -> 1 | DIM      # existing as-of.ts
        op    = lerp(startOpacity, compose(timeTarget, hoverNow), smooth-applied via localAlpha)
        scale = node.justRevealed ? lerp(BIRTH_SCALE, 1, overshoot(localAlpha)) : 1
        write style.opacity = op   (group)
        write child-scale = scale  (dot wrapper / circle r — NEVER the group translate)
      edges: fade by endpoints' time state (no grow)
  onComplete: settle to exact targets; clear tween ref

reduced-motion OR asOfEpoch == null:
  set opacity/scale to targets instantly   # == today's behavior (prod parity)
```

Control UX (demo-graph-section), native input as backbone:

```
[ The record over time                              as of ▸ Aug 2025 ]
Apr2024  •      •          •            •                 •      Feb2026   ← dated ticks
[ ◀ ⏵/⏸ ▶ ]  ──────●───────────────────────────────────────────────────   ← restyled range input
```

## Implementation Units

- [ ] **Unit 1: Motion vocabulary — rate, interp, stagger primitives**

**Goal:** Add the few pure primitives the eased transition needs, alongside the existing `smooth`/`pulseScale`.

**Requirements:** R1, R2, R3

**Dependencies:** None

**Files:**
- Modify: `src/lib/graph/motion.ts` (add `lerp(a,b,alpha)`, an overshoot ease e.g. `easeOutBack(t)` or a documented reuse of `pulseScale`, and a `staggeredAlpha(globalAlpha, index, count, lagRatio)` Manim-`lag_ratio` schedule)
- Test: `src/lib/graph/motion.test.ts` (extend if present, else create)

**Approach:**
- `smooth()` already exists (Manim smoothstep) — do not duplicate; reuse for the fade.
- `staggeredAlpha`: maps the global `[0,1]` to a per-item sub-window `[i*lag/(…), …]` clamped+eased so item 0 starts immediately and the last finishes at 1; `lagRatio=0` → all simultaneous (identity).
- Overshoot: small `easeOutBack`-style (peaks just above 1, settles to 1) for grow-in landing, or document reusing `pulseScale`.

**Execution note:** Pure, deterministic — implement test-first.

**Patterns to follow:** `smooth`, `pulseScale`, `clamp` in `src/lib/graph/motion.ts` (same shape: pure, clamped, node-testable).

**Test scenarios:**
- Happy path: `lerp(0,10,0.5)===5`; `lerp(a,b,0)===a`; `lerp(a,b,1)===b`.
- Edge: `smooth(0)===0`, `smooth(1)===1`, `smooth(0.5)≈0.5`, monotonic non-decreasing across samples (already may be covered — extend if not).
- Happy path: `staggeredAlpha` with `lagRatio=0` returns the global alpha unchanged for every index; with `lagRatio>0`, index 0 reaches 1 before the last index does; all outputs clamped to `[0,1]`.
- Edge: `staggeredAlpha` with `count=1` returns global alpha (no stagger); `globalAlpha=1` → every item at 1 (all finished).
- Edge: overshoot ease exceeds 1 somewhere in the mid-range and returns exactly 1 at `t=1` (lands settled, no residual offset).

**Verification:** motion tests green; no behavioral change to existing consumers of `smooth`/`pulseScale`.

- [ ] **Unit 2: Eased scrub transition + grow-in (the physics core)**

**Goal:** Replace the hard opacity cut with a cancellable eased tween on `asOf` change: nodes/edges fade and revealed nodes grow in — composing with the instant hover-dim, reduced-motion- and prod-parity-safe.

**Requirements:** R1, R2, R6

**Dependencies:** Unit 1

**Files:**
- Modify: `src/components/graph/graph-canvas.tsx` (drive the time-opacity via a cancellable `animate`; compose target with hover each frame; grow-in scale on a child element)
- Possibly modify: `src/components/graph/use-graph-state.ts` (if the tween belongs next to the entrance/pulse drivers + their teardown refs — decide at impl which seam owns it)
- Test: `src/lib/graph/as-of.test.ts` and/or `src/lib/graph/motion.test.ts` for any extracted pure compose helper (e.g. `composeNodeOpacity(timeDimmed, hoverState)`)

**Approach:**
- On `asOfEpoch` change with motion allowed: capture current per-node opacity/scale, run one `animate(0,1,{ease:smooth, duration:RUN_TIME})`; `onUpdate(alpha)` lerps the **time** component toward target while applying the **hover** component instantly (target recomputed live each frame). Mirror the entrance/pulse driver + ref-teardown.
- Grow-in: a node newly `present` this transition scales a child wrapper/circle `r` from `BIRTH_SCALE`→1 via the overshoot ease — **never** the group `translate` (R2). Hiding nodes fade only (optionally shrink).
- Reduced-motion (`computeMotionAllowed()` false) **or** `asOfEpoch == null`: set targets instantly — byte-for-byte today's behavior (R6 prod parity).
- Edges: fade by endpoint time-state (no grow).
- Teardown: cancel the scrub tween on re-scrub, on `dataSignature` re-init, and on the existing cleanup paths (no perpetual ticking; honors the transient-motion contract).

**Execution note:** Extract the per-node opacity compose into a pure helper and test it first; the tween/DOM application is visual-audit-gated.

**Technical design:** *(directional — see the HLD pseudo-loop; not implementation spec.)*

**Patterns to follow:** the entrance `animate(0,1,{…onUpdate})` and the pulse animation in `use-graph-state.ts` (cancellable, ref-torn-down, child-element only); `computeMotionAllowed()` gate; the current compose logic in the `graph-canvas.tsx` dim effect.

**Test scenarios:**
- Happy path (pure compose): a node present-by-time + non-emphasized → full opacity; time-dimmed → DIM regardless of hover; hover-neighbour while present → 1; hover-non-neighbour while present → 0.2 (matches today's compose).
- Edge (pure): `asOfEpoch == null` → compose returns today's values (no time dimming) — parity.
- Edge (pure): a node both time-dimmed and hover-emphasized → time-ghost wins (DIM).
- Integration (visual-audit-gated, not vitest): scrubbing one stop eases opacity over ~RUN_TIME with no position shift; a revealed node grows in; reduced-motion → instant; `asOfEpoch` null path renders identically to today; re-scrubbing mid-tween cancels cleanly (no flicker/stuck node).

**Verification:** pure compose tests green; converged positions provably unchanged during/after a transition (characterization holds); reduced-motion + null-`asOfEpoch` paths instant; visual audit confirms the eased fade + grow-in feel.

- [ ] **Unit 3: Staggered same-stop reveal (Manim lag_ratio)**

**Goal:** Nodes sharing a birth date reveal in a slight cascade rather than simultaneously, for an organic "grow."

**Requirements:** R3, R6

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `src/components/graph/graph-canvas.tsx` (or the Unit 2 tween seam) — feed each transitioning node its `staggeredAlpha` sub-window
- Test: covered by `staggeredAlpha` unit tests (Unit 1); ordering logic if extracted gets a small pure test

**Approach:**
- Assign a stable per-transition order to the nodes changing state (e.g. by `tier` then id, or distance from centroid) so the cascade is deterministic and reads outward/inward intentionally.
- Pass `(index, count, lagRatio)` into the Unit 2 `onUpdate` so each node eases on its own sub-window. `lagRatio` small (subtle); reduced-motion → `lagRatio=0` (all-at-once instant).

**Execution note:** The ordering function is pure — test it; the cascade feel is visual-audit-gated.

**Patterns to follow:** Manim `LaggedStart`/`lag_ratio`; the `staggeredAlpha` primitive from Unit 1.

**Test scenarios:**
- Happy path: ordering function returns a stable, deterministic order for a fixed node set (same input → same order).
- Edge: a single node changing → no stagger (behaves as Unit 2).
- Integration (visual-audit-gated): a multi-node stop (e.g. the 2024 baseline cluster) cascades subtly rather than popping together.

**Verification:** ordering test green; audit shows a subtle, pleasing cascade; reduced-motion collapses it to instant.

- [ ] **Unit 4: Timeline control UX — ticks, readout, play/pause, keyboard**

**Goal:** Turn the plain slider into a timeline: dated tick marks, a prominent "as of" readout, a play/pause auto-advance, and keyboard control — native input kept as the accessible backbone.

**Requirements:** R4, R5, R6

**Dependencies:** None (UI-side; pairs with U2 for the eased steps but doesn't block on it)

**Files:**
- Modify: `src/components/demo/demo-graph-section.tsx` (restyle track/thumb; overlay dated ticks at each stop; prominent current-date; play/pause button + auto-advance; keyboard handlers)
- Possibly create: `src/lib/graph/scrubber.ts` + test (pure tick-position % along the track, and the play-stepper state transition) if logic is worth extracting
- Test: `src/lib/graph/scrubber.test.ts` (pure helpers) — or extend `as-of.test.ts`

**Approach:**
- Ticks: for each stop, a marker at `position% = (epoch - min) / (max - min)` along the track, with a compact `MMM yyyy` label (thinned if too dense). Pure position helper → unit-tested.
- Readout: current `as of <date>` shown prominently (larger than the end labels), reflecting `activeIndex`.
- Play/pause: a stepper that advances `activeIndex` on an interval (`RUN_TIME + DWELL`), stops at the last stop, resets/loops per audit choice; each advance triggers the U2 eased transition. Pure state-machine (`step(state) → nextIndex | done`) → unit-tested.
- Keyboard: arrows step `±1` stop (native range already does this; ensure it maps to `activeIndex`), space toggles play. `aria-valuetext` already present; keep play state announced.
- Reduced-motion: play still advances; transitions instant (R6).

**Execution note:** Extract tick-position + play-stepper as pure helpers and test first; the visual layout/restyle is audit-gated.

**Patterns to follow:** the existing slider + `formatStop` + caption styling in `demo-graph-section.tsx`; `scrubberStops`/`activeIndex` already derived there; design-system font/color tokens (`font-mono`, `text-text-tertiary`, etc.).

**Test scenarios:**
- Happy path: tick-position for the earliest stop → 0%, latest → 100%, a midpoint → its proportional %.
- Edge: two stops at the same instant collapse to one position (no divide-by-zero when `max===min` → single-stop guard returns 0%).
- Happy path: play-stepper from index 0 advances 0→1→…→last then reports `done`; pause holds the index; from `done`, play restarts at 0 (or per chosen loop policy).
- Edge: play on a single-stop timeline is a no-op/disabled.
- Integration (visual-audit-gated): ticks align under the thumb at each stop; play animates through the build; arrows/space work; reduced-motion advances instantly.

**Verification:** scrubber helper tests green; audit confirms ticks/readout/play feel like a timeline and the native input still drags/keyboards.

## System-Wide Impact

- **Interaction graph:** the eased tween shares the canvas DOM with the hover-dim effect and the entrance/pulse animations — all opacity/scale-on-child, all cancellable. The compose-each-frame design keeps hover live during a scrub. Play mode drives `activeIndex` (existing state) on a timer.
- **Error propagation:** pure client, fixture-driven; no network/DB. A cancelled/interrupted tween settles to targets (no stuck nodes).
- **State lifecycle risks:** the scrub tween, the entrance, and the pulse must not run conflicting writes — scope each to distinct properties/elements and tear the scrub tween down on re-scrub + `dataSignature` re-init + unmount (mirror existing ref teardown). Play timer cleared on pause/unmount/last-stop.
- **API surface parity:** none — no API, no wire-type change. `asOfEpoch` semantics unchanged.
- **Unchanged invariants:** the seeded converged layout (byte-identical positions), `as-of.ts` visibility semantics, stop dates, the authed `/graph` render (null `asOfEpoch` → instant, today's behavior), reduced-motion behavior, and the change-decoration render all stay as-is. This plan animates **transitions**, not states.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Easing the time-opacity also lags the frequent hover-dim → mushy hover | Single recomputed-target tween eases only the time component; hover applied instantly each frame (Key Decisions); tune in audit |
| Grow-in scale clobbers the node's converged position | Scale a child wrapper / circle `r`, never the group `translate` — exactly the pulse pattern; characterization that positions stay byte-identical (R2/R6) |
| Tween conflicts with the in-flight entrance/pulse or a re-init mid-scrub | Distinct properties/elements + cancel-and-settle on re-scrub and `dataSignature` re-init; mirror existing teardown refs |
| Perpetual ticking / battery drain (play mode, stuck tween) | One-shot per step, torn down; play timer cleared at last stop / pause / unmount; reduced-motion gets instant transitions |
| Over-animation makes the demo feel slow or gimmicky | Short `run_time`, subtle overshoot + `lagRatio`; all tunable in the mandatory visual audit; the audit can dial any of it to zero |
| Prod `/graph` drift | `asOfEpoch == null` short-circuits every new motion path to instant/today's render; covered by the existing parity posture |

## Documentation / Operational Notes

- No flag, schema, API, or rollout change. Demo-only; ships on merge to the live demo (`morning-form.vercel.app/demo/record`), where the **mandatory visual audit** is run on the prod build (public URL; preview deploys are auth-gated — see `reference_morning-form-deploy`).
- Candidate `docs/solutions/` note afterward: "scrub transitions = eased interpolation between as-of states (Manim model) on top of the existing entrance/pulse animation pattern" — the learnings researcher flagged this pattern as undocumented.

## Sources & References

- **Origin (shipped scrubber):** [docs/plans/2026-06-15-001-feat-demo-graph-time-scrubber-plan.md](docs/plans/2026-06-15-001-feat-demo-graph-time-scrubber-plan.md) (PR #170).
- Motion contracts: `docs/plans/2026-06-08-001-feat-graph-physics-motion-plan.md` (determinism, transient motion, reduced-motion).
- Temporal canvas lineage: `docs/plans/2026-06-10-003-feat-temporal-graph-canvas-plan.md`.
- External: [Manim](https://www.manim.community/) — rate functions, `lag_ratio`/`LaggedStart`, `run_time`, alpha-interpolation animation model.
- Learnings: `docs/solutions/best-practices/visual-audit-non-optional-ui-gate-2026-05-16.md`.
- Code: `src/lib/graph/motion.ts` (`smooth`, `pulseScale`), `src/components/graph/{graph-canvas,use-graph-state}.tsx`, `src/lib/graph/as-of.ts`, `src/components/demo/demo-graph-section.tsx`.

## Future Considerations

- **Continuous free-drag + live interpolation** (deferred above): drag the playhead and watch nodes fade mid-transition as `asOf` moves continuously; eased snap-to-nearest-stop on release. The fullest Manim "continuous alpha" model; biggest UX payoff, biggest interaction-controller cost.
- **Port the eased temporal motion to the authed `/graph`** if/when the real `LONGITUDINAL_GRAPH_ENABLED` scrubber ships there — the motion primitives are shared and prod-safe by construction.
