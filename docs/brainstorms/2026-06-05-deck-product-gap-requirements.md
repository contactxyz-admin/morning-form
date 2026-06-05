---
date: 2026-06-05
topic: deck-product-gap
reviewed: 2026-06-05 (7-persona document review; major revisions applied)
---

# Deck–Product Gap: the Believable Loop

## Problem Frame

The investor deck promises "the missing intelligence layer for human biology" — specialist clinical reasoning over your complete health context, decisions that compound, markers that respond. The shipped product is a strong health-record spine (upload → record → ask → topics) but the deck is ahead of it. An advisor analysis (2026-06-05) ranked the gap; verification against the codebase found the gap is real but **narrower and different** than the analysis assumed:

- `/ask` exists with grounding, citations, history, and depth-1 specialist routing **architecture** (general scribe → cardiometabolic / sleep-recovery / hormonal-endocrine, audited) — though review found the referral tool's production LLM wiring is absent (test-only today). What Ask lacks: the user's profile, priorities, check-ins, and wearable trends are not auto-injected — it reasons over retrieved *documents*, not the user's *complete context* — and temporal reasoning only fires if a tool happens to be invoked.
- A daily Suggestion engine exists but is a disconnected digest (regenerated daily, no lifecycle); answers don't end in actions.
- Marker time-series data fully exists (lab values + wearable `HealthDataPoint`s; a scribe tool computes trends) but no UI charts it — and lab values from uploads land in the graph, not the wearable time-series, so the two stores must be unified for trajectories (planning item).
- Booking, investigations, and the decision timeline don't exist.

The target is the advisor's minimum believable loop: **upload blood test → ask → grounded answer → recommended actions → book test → track response.**

### The regulatory reconciliation (the analysis's blind spot)

Two of the advisor's 10/10 items as literally written would re-cross the line the May priority-markers pivot deliberately drew. "Increase iron intake" is an intervention directive — architecturally blocked by the forbidden-phrase enforcement. And review established that **ranked condition-hypotheses are a differential diagnosis regardless of vocabulary** — likelihood-ordering candidate conditions against the user's labs triggers SaMD classification by capability, not by word choice; qualitative labels instead of percentages do not change that. **Decisions: the loop ships in safe vocabulary, and investigations ship in a non-ranking form first** (see Key Decisions); the ranked form is pursued as a deliberate, legally-gated phase A.2.

## Requirements

### Phase A — Ask, deep (the intelligence layer)

**Context**

- R1. Every Ask answer reasons over the user's complete context: state profile + archetype, current priorities, recent check-ins, wearable trends, and lab history are available to the scribe on every turn — not only via optional tool invocation. Implementation notes for planning: the current `execute()` has no context-plumbing path (architectural decision required, not deferrable); the pattern-history tool's per-topic metric gate must be audited so cross-domain markers (e.g. ferritin for a fatigue question routed to sleep) aren't silently filtered; context economics (cost-per-turn for a data-rich user) is a product decision planning must cost before choosing always-inject vs hybrid.
- R2. Temporal questions get temporal answers: "what changed since January?" produces answers grounded in **dated values** (the actual series, not just first/last/average — the current tool output is too coarse and needs a bounded series payload), citing the underlying data.

**Answer shape**

- R3. Answers to "why" questions present **investigations worth pursuing** — 2–4 candidate avenues, each with (a) the user's own relevant data laid alongside it (values, dates, reference context), and (b) **the specific measurement that would distinguish it** from the others. **No likelihood ordering of conditions, no per-condition evidence-strength labels** — presentation order follows the same descriptive logic as the existing priority-markers content (measurement yield), not diagnostic probability. *Phase A.2 (separately gated):* the ranked version (ordered candidate explanations with evidence weighing) is pursued via a written posture-change memo + legal review + clinical advisor sign-off, accepting it may conclude UKCA territory. Implementation note: the safety layer's closed `JudgmentKind` enum has no kind covering this answer shape — new judgment kinds (with citation-density rules) are required and need clinical-advisor sign-off alongside the vocabulary (R4).
- R4. Every substantive answer ends with **Recommended next steps** drawn exclusively from the safe action vocabulary: *measure* (book/arrange a test — in-app booking is a form of measure, not a fifth verb), *discuss* (raise X with your GP/clinician), *track* (log/observe Y for N weeks), *behavior* (**sleep/training/routine only — dietary-quantity directives are excluded** and need new forbidden-phrase patterns, since review found "increase your iron intake" is not caught today). The vocabulary and the investigations presentation are reviewed by the clinical advisors — a **launch gate** for Phase A (build proceeds; same pattern as the priorities reveal).
- R5. Specialist routing works in production and is surfaced: wire the referral tool's production LLM client (review: currently test-only — every production referral would throw), and attribute referrals in answers ("our sleep specialist's view…"). Phase A also persists each recommended action as a minimal record at answer time (state: suggested) so Phase B's lifecycle has no backfill gap.

### Phase B — Decisions that compound (lifecycle + response)

**Action lifecycle**

- R6. Recommended actions persist with a lifecycle: suggested → accepted → completed → outcome measured; dismissed is recorded too. Planning decides **extend-vs-supersede** for the existing Suggestion model with eyes open: review established the current model has no lifecycle fields, a `(userId, date, kind)` unique key incompatible with lifecycles, and a daily delete-and-regenerate engine — "extend" is not the default it sounds like. The record must carry provenance (link to the producing answer) and an outcome link.
- R6a. **Data-protection coverage is an acceptance criterion, not an afterthought**: action/decision records are special-category health data (an accepted "book ferritin re-test" reveals an inferred concern) — they join the GDPR deletion cascade, the export archive, and the structural completeness guards that already enforce both; the DPIA data-category inventory is updated.
- R7. A **Decisions timeline** surface shows the user's actions across states, each linking back to the producing answer/investigation and forward to its outcome. **Private-only** — explicitly outside the SharedView sharing infrastructure in this scope. (IA placement, empty states, and state-transition affordances are design decisions planning must produce — flagged by review as currently unspecified.)

**Marker response**

- R8. **Marker response views**: any marker with ≥2 dated values renders a trajectory (ferritin 25 → 41 → 62 with dates), alongside related subjective trend (check-in energy) where relevant. Reachable from answers that cite the marker, from topic pages, and from completed actions. Planning specifies the 0-value and 1-value states (the common new-user cases) and unifies lab-graph values with the wearable time-series for charting.
- R9. Closing the loop is **manual-first**: the user marks a *measure* action outcome-measured after their re-test uploads (v1); automatic matching of an incoming upload to an open action is an enhancement, not a Phase B requirement (review: no ingest-event hook exists and lab values don't land where the trend tool reads — auto-close is real engineering, not a detail). "Sync" here means future lab-data ingestion, not wearable sync.

### Phase C — Concierge booking

- R10. Booking is a fully MorningForm-owned **concierge flow**: choose a curated panel (a named Panel content layer assembled from the priority-markers content and its per-marker `panelAvailability` — review: no Panel entity exists yet, it must be defined) → state preferred times/area → "we'll arrange it" → MorningForm ops books with a partner lab behind the scenes → confirmation and status live on the Decisions timeline. Premium, honest, zero partner-API dependency, viable at current scale — and it *is* the studio experience minus the building; partner APIs or studios slot in behind the same flow later.
- R11. The fulfilling partner is **disclosed at confirmation** (trust + consent requirement), but the relationship, recommendation, and experience are MorningForm's end-to-end.
- R12. *Measure* actions and investigation "what would distinguish this" prompts deep-link into the concierge flow with the relevant panel pre-selected.
- R13. No in-house payments in v1 (standing Stripe pause): payment is arranged partner-side or at draw; bringing it in-house is a later explicit decision.
- R14. **Phase C legal hard gate** (before any production booking): partner lab(s) added to `docs/compliance/sub-processor-register.md` with executed DPA, jurisdiction, and transfer mechanism; DPIA updated (new sub-processor trigger); the consent/privacy surfaces name the partner; a **data-minimisation spec** defines exactly what crosses to the partner (booking reference + panel code + identity needed for phlebotomy; never raw records or free-text); US state health-privacy laws (e.g. Washington MHMDA) assessed before any US booking.

## Success Criteria

- **The Nik test — demo path** (single session, seeded account including a re-test): upload → ask "why am I tired?" → answer grounded in *those* values presenting investigations with the user's own data and named distinguishing tests → accept a "book a ferritin re-test" action → reach the concierge booking flow → see a marker trajectory and an action marked outcome-measured. Checkable in one sitting.
- **The Nik test — live path**: the same loop on a real account across a real re-test cycle, verified once end-to-end before the loop is called shipped (our "verified in prod" standard).
- **R3 quality bar** (the differentiator, per review): investigations cite the *user's own* values, the distinguishing test is *specific* (named marker, not "see your GP"), and two users with different data get materially different investigations.
- Temporal questions return dated, trend-aware answers.
- Zero safety regressions: enforcement tests hold; no intervention directives, no condition-likelihood displays.
- Clinical advisors have approved the action vocabulary, the investigations presentation, and the new judgment kinds.

## Scope Boundaries

- **No diagnosis-grade output in Phase A**: no likelihood ordering of conditions, no per-condition confidence (numeric or labeled). The ranked version is exclusively phase A.2 behind the posture-change memo + legal review.
- **No posture change on interventions**: no supplement/dose/medication/dietary-quantity directives.
- **Not building** (per the advisor analysis, agreed): social, community, clinician marketplace, health scores, gamification.
- **No new specialist agents** (production wiring + attribution of the existing ones is in scope per R5).
- **No in-house payments** in v1 (R13). **No partner booking APIs** assumed in v1 (concierge model).
- Supplements/protocol commerce stays out — Supply remains a future phase.
- Decisions timeline is private-only; no sharing surface in this scope.

### Deferred to Separate Tasks

- Clinical review go-live (flag flip) — planned (`docs/plans/2026-06-05-clinical-review-go-live-plan.md`), in flight; the R4 vocabulary + R3 presentation + new judgment-kind reviews attach to that engagement.
- Wearables follow-through — existing direct-provider plan; improves R1's context richness but doesn't gate it.
- Phase A.2 (ranked investigations) — separate posture-change memo + legal/advisor workstream.

## Key Decisions

- **Safe vocabulary over posture change**: the believable loop works in measure/discuss/track/behavior terms; intervention advice would invalidate the May pivot, the in-flight clinical review, and the DPIA framing. Decision 2026-06-05.
- **Investigations without ranking first; ranked version legally gated**: review established likelihood-ranking conditions is SaMD-triggering capability regardless of wording. The safe form (avenues + the user's data + distinguishing tests) is still differentiated — it's personal, specific, and drives the loop — and the ranked form stays a deliberate option, not an accident. Decision 2026-06-05 (revised from the first draft after review).
- **Concierge booking**: fully owned flow with human fulfillment behind it — honest about the partner at confirmation, no fake venue UX (review: the "as-if-studios" slot picker collapses into a partner redirect without APIs that mostly don't exist). Rejected: bare affiliate links (cedes the experience); as-if-studios venue UX (dishonest at the slot step); white-label API + payments (breaks the Stripe pause, weeks of contracting). Decision 2026-06-05 (revised after review).
- **Sequenced phases, not independent**: A gates B gates C (B's timeline surfaces A's actions; C fulfills B's measure actions). Each phase *deploys* incrementally but the loop is only believable in order. Phase A's launch is hard-gated on the clinical-advisor reviews and the R1 legal gate below.
- **R1 legal gate is pre-build, not planning trivia**: the current DPIA scopes LLM disclosure to "the health content the user is actively asking about"; always-injecting profile + trends + history is a material expansion. Before R1 ships: DPIA addendum + written legal confirmation that existing consent language covers it (or a re-consent flow). Same hard-gate pattern as everything else in this product.
- **Reuse over rebuild — with corrections**: routing architecture, suggestion engine, trend computation, and `panelAvailability` exist; but review corrected three "already exists" claims (referral production wiring absent; Suggestion model can't simply "extend"; lab values live in the graph, not the charted time-series). The program is still mostly connection work, with those three named exceptions.

## Dependencies / Assumptions

- Clinical advisors (sourcing in flight per the clinical-review plan) review R3 presentation + R4 vocabulary + new judgment kinds. Build doesn't block; launch does. If sourcing slips, Phase A is build-complete but unlaunched — accepted, same as the priorities reveal.
- The first-session-completeness program (check-ins, GDPR rights, settings) **shipped and was verified in production 2026-06-05** — it's a foundation here (the GDPR completeness guards R6a relies on came from it), not a competing workstream.
- Partner-lab concierge feasibility per market (UK self-pay panels are commodity; US varies by state) — research item for Phase C planning, alongside R14's legal work.
- Fundraise/demo timeline may compress sequencing (e.g. C built against seeded data for a demo before B fully ships) — surface the date when known; the phases are ordered for product truth, and a known demo date is the one thing that would justify reordering.

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical][Blocking for Phase A planning] Context-injection architecture: always-inject summaries vs always-available tools vs hybrid; `execute()` plumbing; token/cost budget per turn (cost a data-rich user before choosing); staleness rules.
- [Affects R3][Technical] Investigations: computed per-turn in Phase A (no persistence — decided to keep Phase A stateless); Phase B revisits persistence alongside the action model if R7 linkage needs it.
- [Affects R6][Technical] Extend vs supersede the Suggestion model (unique-key and regeneration-engine constraints noted in R6).
- [Affects R8][Technical] Trajectory rendering home (topic page vs marker detail vs both) + unifying graph lab values with charted series; 0/1-value states.
- [Affects R7][Design] Decisions timeline IA placement (nav-weight surface), empty states, state-transition affordances; answer-format design for investigations + next steps (information density on mobile — flagged as the top AI-slop risk).
- [Affects R10][Needs research] Partner-lab shortlist per market for concierge fulfillment; what ops confirmation SLA is promised in-app.

## Next Steps

→ `/ce:plan` Phase A (Ask, deep) when ready — with the R1 legal gate and the judgment-kind/advisor dependencies stated above carried into the plan. Phases B and C plan separately on its foundations.
