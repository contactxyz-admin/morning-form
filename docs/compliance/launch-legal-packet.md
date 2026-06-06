# Launch Legal Packet — DPIA addenda, consent, disclosures

Created: 2026-06-06 · Status: draft, ready for privacy-lawyer review · Owner: Reuben + legal

Purpose: the consolidated legal/compliance gate for switching MorningForm to its real domain with the new features live. All three features are **built and currently testable behind flags on the throwaway `.vercel.app` domain with no real users**; this packet is what must clear before the real-domain switch. One review cycle covers all three. Supplements the existing `docs/compliance/dpia.md` and `docs/compliance/data-rights-implementation.md`.

---

## 1. Ask-deep — expanded LLM context (Phase A)

**What changed:** chat answers now reason over the user's *complete* context (state profile, archetype, priorities, recent check-ins, wearable trends, lab values) injected into each turn, not just the document being asked about.

**DPIA addendum needed:** the current DPIA scopes LLM disclosure to "the health content the user is actively asking about." This is a material expansion. Addendum must (a) enumerate the new data categories sent to the LLM sub-processor (Anthropic), (b) confirm the lawful basis (Art. 9(2)(a) explicit consent) still covers it, (c) update the sub-processor register entry.

**Consent-screen copy:** must name the expanded categories so existing consent covers the new processing — or a re-consent flow for any pre-existing users (currently none real). **Legal question to answer:** does the existing consent language suffice, or is re-consent required?

**Safety posture (for context, not legal action):** answers are descriptive — ranked-by-yield investigations, no condition-likelihood, no diagnosis, no intervention directives (enforced in code). Intervention-grade advice remains a separate, deliberately-gated future decision (Phase A.2), not in scope here.

## 2. Concierge booking — get-tested path (Phase C)

**What it does:** a user requests a blood test in-app; MorningForm ops buys a partner gift code/voucher; the user redeems it **under their own identity** directly with the lab.

**The load-bearing privacy fact (verify):** *no user-identifying data crosses to the lab* — ops buys a generic code; the user redeems directly; results stay in the user↔lab relationship. So **no DPA with the lab is required** on this mechanic. Legal confirms this analysis.

**What the partner DOES learn (characterize, don't wave away):** that MorningForm purchases codes, and — if codes are test-specific rather than denomination — which tests in aggregate. Prefer denomination codes where offered. Verify Ulta's "purchaser sees de-identified data only" claim in writing.

**Disclosures needed:**
- **Privacy page** must name the fulfilment partners as recipients (Medichecks/Thriva UK; Ulta/Quest-home-kit US) and the booking data category.
- **Article 13 at collection:** the booking form names the partner before submit (built).
- **US state law:** NY/NJ/RI hard-blocked in code; AZ/HI provider-dependent. **Assess Washington MHMDA-class consumer-health-data laws before enabling US booking** (health-intent + the request record may fall in scope).

**Data MorningForm retains:** the `BookingRequest` row — which test(s), market, status, timestamps. `markerNames` is nullified at terminal states (retention parity). No `usState` is persisted (validated then discarded). Booking rows join GDPR export + deletion.

## 3. Decisions / ActionOutcome — new health-data category (Phase B, planned)

**Heads-up for the same cycle** (Phase B is planned, not built — fold its disclosure in now so it's one review): the planned `ActionOutcome` model freezes a marker before/after snapshot ("this decision → ferritin 25→62"). That is special-category health data. When built, it joins the DPIA data-category inventory + GDPR guards (already specified in `docs/plans/2026-06-06-002-...`). No action needed until built, but flag it so legal sees the full trajectory.

## Open legal questions (the asks)

1. **[Ask-deep]** Does existing consent cover the expanded LLM context, or is re-consent required?
2. **[Concierge]** Confirm "no user-identifying data crosses to the lab under the gift-code mechanic → no DPA" — and the partner-side aggregate-knowledge characterization.
3. **[Concierge]** US state health-privacy assessment (WA MHMDA et al.) before any US booking.
4. **[Concierge]** Legal basis for `BookingRequest` processing — Art. 6(1)(b) performance-of-contract vs 6(1)(a) consent (determines whether the form needs a consent capture).
5. **[All]** Retention schedules: `BookingRequest`, `ActionOutcome`, the deletion-audit tombstone.

## On clearance → real-domain switch

When 1–5 are answered and the clinical sign-off (`clinical-review-outreach.md`) lands, the launch is the flag flips already in place (`PRIORITY_MARKERS_ENABLED`, `ASK_DEEP_ENABLED`, `CONCIERGE_BOOKING_ENABLED`) plus the consent/privacy-page copy deployed — then the real domain. Until then these run only on the throwaway domain for testing.

## Sources
`docs/compliance/dpia.md` · `docs/compliance/data-rights-implementation.md` · `docs/compliance/sub-processor-register.md` · plans `2026-06-05-001` (Ask-deep), `2026-06-06-001` (get-tested/concierge), `2026-06-06-002` (Phase B)
