# Clinical Reviewer Outreach + Content-Review Package

Created: 2026-06-06 · Status: ready to send · Owner: Reuben

Purpose: engage a **UK GP (GMC-registered)** and a **US PCP (board-certified internal/family medicine)** as ongoing medical advisors to clinically review MorningForm's consumer-facing health content. This is the founder-owned launch gate for the priorities reveal, Ask-deep investigations, and the get-tested content. See `docs/plans/2026-06-05-clinical-review-go-live-plan.md` for the full engagement plan.

---

## Outreach blurb (paste into Doctorpreneurs / LinkedIn / Physician Side Gigs / warm intros)

> **Medical advisor (UK GP / US PCP) — health-tech content review, part-time/advisory**
>
> MorningForm is an early-stage health-intelligence product: we help people understand their own blood markers and wearable data in plain language, and decide what's worth measuring next. We're explicitly *descriptive, not prescriptive* — we translate and educate, we don't diagnose or prescribe.
>
> We're looking for a GMC-registered GP (UK) and a board-certified PCP (US) to review our consumer-facing marker content for clinical sensibility against standard UK/US panel norms, and to be named as our medical reviewers ("Medically reviewed by Dr X"). Ongoing advisory relationship — a per-review fee plus a small equity grant. Light, asynchronous, a few hours up front then occasional re-reviews as content changes.
>
> If you do portfolio/advisory work and want to shape how a generation actually understands their biology, reply with a line about your background.

**Screening bar:** currently licensed (GMC / US board); has reviewed consumer health content or done advisory work before; comfortable being named; responds in days not weeks.

**Terms to offer** (researched ranges): per-review fee £750–£1,500 (UK) / $1,000–$2,500 (US) + ongoing-advisor equity 0.1–0.25%, 24-month vest, 6-month cliff. Lightweight advisor agreement (scope = content review, non-clinical, no doctor–patient relationship; attribution consent; company indemnifies the advisory role; confidentiality). UK advisor confirms position with their defence org (e.g. MDDUS) — advisory content work is non-clinical.

---

## What the reviewers receive (the content-review package)

Send the day terms are agreed. Ask for notes within **5 working days**.

1. **One-page brief**: product context, the *descriptive-not-prescriptive* (Path A) posture, what sign-off means (named attribution + dated approval).
2. **Priority-marker content** — the 6 archetypes' markers + rationale, exported readable from `content/priority-markers/*.ts`. Reviewer marks each: clinically sensible against UK (GP) / US (PCP) panel norms? `panelAvailability` field already distinguishes markets.
3. **Test-mechanics content** — `content/test-routes/` + the `sampleType`/`fastingRequired` fields across the markers. **Specific items flagged `ADVISOR-REVIEW` in the content need their eyes** — timing-sensitive markers (AM cortisol timing, morning-sample testosterone/TSH, acute-phase hs-CRP/ferritin caveats, ApoB fasting). These are the highest-yield review targets.
4. **Ask "investigations" presentation + safe action vocabulary** — how "why am I tired?" answers present ranked-by-yield investigations (no condition-likelihood, no diagnosis) and end in measure/discuss/track/behavior next steps. Reviewer confirms the register stays descriptive.

## On sign-off → go-live

Per-archetype `lastReviewedAt`/`reviewerKey` updated to the real reviewer in a PR (the attribution display built in PR #147 then renders "Medically reviewed by Dr X"). Documented sign-off is the hard gate before the real-domain switch.

## Sources
`docs/plans/2026-06-05-clinical-review-go-live-plan.md` (engagement plan, comp research) · `content/priority-markers/` · `content/test-routes/` · PR #147 (attribution display)
