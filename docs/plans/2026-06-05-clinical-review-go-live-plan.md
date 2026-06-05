# Clinical Review & Priorities Reveal Go-Live

Created: 2026-06-05

Owner: Reuben (sourcing/relationships) + Claude (prep, docs, engineering tail) · Target: **live within ~4 weeks (by 2026-07-03)**

## The goal

Engage a UK GP and a US PCP as **ongoing medical advisors**, have them review the 6 archetypes' priority-marker content (`content/priority-markers/`), document sign-off per the pivot plan's hard gate (R11 of `docs/plans/2026-05-10-001-feat-priority-markers-pivot-plan.md`), and flip `PRIORITY_MARKERS_ENABLED` in production. The advisor framing also makes the brand claim ("built with medical advisors") true.

## Week 1 — Source (parallel UK + US tracks)

**UK GP track** (channels ranked by fit):
1. [Doctorpreneurs](https://doctorpreneurs.com/opportunities-board-for-doctors-now-live/) — non-profit community matching doctors to healthtech advisory roles; post on the Opportunities board.
2. [Medic Footprints](https://medicfootprints.org/the-rise-of-the-uk-doctorpreneur/) + LinkedIn "portfolio GP" search — GPs already doing non-clinical portfolio work respond fast.
3. Warm network — investors/Joe's contacts; one intro beats cold outreach.

**US PCP track**:
1. [Physician Side Gigs](https://www.physiciansidegigs.com/physician-startup-advisor) community — physicians actively seeking advisory roles.
2. Doximity/LinkedIn — board-certified internal/family medicine with advisory or health-tech history.
3. Telehealth-network physicians (already comfortable with consumer health products).

**Screening bar** (both): currently licensed (GMC-registered / US board-certified); has reviewed consumer-facing content or done advisory work before; comfortable being *named* ("Medically reviewed by Dr X" — the [industry-standard attribution](https://www.medicalnewstoday.com/articles/medically-reviewed-content)); responsive in days not weeks.

**Claude prepares meanwhile**: outreach blurb + the **review package** — each archetype's markers + rationale exported from `content/priority-markers/` into reviewer-readable docs, a 1-page brief (product context, *descriptive-not-prescriptive* posture per the pivot plan's Path A), and a per-archetype sign-off form (name, credentials/registration number, date, attestation).

## Week 2 — Engage

- **Terms** (researched ranges): per-review fee **£750–£1,500 (UK) / $1,000–$2,500 (US)** — market is [$500–$4,000 per 2–4h consult](https://www.sermo.com/resources/pharmaceutical-advisory-board/) — **plus** ongoing-advisor equity **0.1–0.25%**, 24-month vest, 6-month cliff ([Carta pre-seed advisor median 0.24%](https://easyvc.ai/blog/is-an-advisory-board-paid-understanding-compensation-for-advisory-board-members/)). Cash makes the first review fast; equity makes the relationship durable.
- **Advisor agreement** (lightweight, lawyer-templated): scope (content review, non-clinical, no doctor–patient relationship), attribution consent, [indemnification clause](https://www.physiciansidegigs.com/physician-startup-advisor) (company covers the advisor for the advisory role), confidentiality. UK advisor confirms their position with their defence org (e.g. [MDDUS](https://www.mddus.com/)) — advisory content work is non-clinical, typically uncontroversial.
- Send the review package the day terms are agreed. Ask for notes within **5 working days**.

## Week 3 — Review & resolve

- Reviewers mark up per-archetype (UK GP against UK panel norms; US PCP against US norms — the content's `panelAvailability` field already distinguishes these).
- Claude triages notes with Reuben; edits land as a PR updating `content/priority-markers/*.ts`, setting each file's `lastReviewedAt` + `reviewerKey` to the real reviewer.
- **Hard gate held** (R11): both sign-offs documented in the PR before anything ships.
- **Contingency — reviewer flags the content as SaMD-adjacent**: fall back to the pivot plan's pre-agreed Option A (assessment routes straight to intake; no marker deliverable). Don't negotiate the regulatory line with a reviewer; the escape hatch already exists.

## Week 4 — Go live (the engineered tail)

Per Unit 8 of `docs/plans/2026-06-04-001-feat-first-session-completeness-plan.md`:
- `vercel env add PRIORITY_MARKERS_ENABLED --value true --yes` → verify via `vercel env ls` → redeploy.
- **Verify in prod for real**: complete an assessment on a throwaway account, see actual markers (not the interstitial), confirm the `priorities-to-intake-click` funnel counter still fires.
- Rollback = unset the flag (interstitial returns, zero data impact).
- Surface "Medically reviewed by Dr X, GP · Dr Y, MD" on the reveal — the attribution is the trust asset.

## Contingencies

| If... | Then... |
|---|---|
| No credible UK GP in 10 days | Drop to paid-per-review only (no equity) via a locum/portfolio-GP agency — slower relationship, faster sign-off |
| One side lands well before the other | Ship UK-only first (considered in the origin requirements doc); markets are already separated in content |
| Reviewer wants substantive rewrites | Budget one extra week; Claude drafts edits for re-review so reviewer time stays minimal |

## Sources

- Origin: `docs/brainstorms/2026-06-04-first-session-completeness-requirements.md` (R1–R3) + `docs/plans/2026-05-10-001-feat-priority-markers-pivot-plan.md` (U3, R11, Phase 3 gate)
- Engineering tail: `docs/plans/2026-06-04-001-feat-first-session-completeness-plan.md` Unit 8
- Comp/market research: [Sermo advisory rates](https://www.sermo.com/resources/pharmaceutical-advisory-board/), [Carta advisor equity data](https://easyvc.ai/blog/is-an-advisory-board-paid-understanding-compensation-for-advisory-board-members/), [Physician Side Gigs](https://www.physiciansidegigs.com/physician-startup-advisor), [Fenwick on physician advisor equity](https://www.fenwick.com/insights/publications/compensating-physician-advisors-with-equity-considerations-for-life-sciences-companies)
- Review-process norms: [Medical News Today on medically-reviewed content](https://www.medicalnewstoday.com/articles/medically-reviewed-content), [Healthgrades](https://resources.healthgrades.com/right-care/patient-advocate/medically-reviewed-content)
