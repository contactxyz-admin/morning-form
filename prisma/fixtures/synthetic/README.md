# Synthetic personas

Demo-only seed data. Statistically realistic but **not real** — every value
is generated from a seeded PRNG with parameters chosen against published
reference ranges (UpToDate, ADA, NICE) so trends are clinically plausible.

## Run

```bash
npm run demo:seed
```

The runner writes onto a single hard-coded user (`demo@morningform.com`),
gated by `getDemoUserForSeedOnly()`. Three guards keep synthetic data from
leaking into a real account:

1. The helper only resolves the demo email.
2. ESLint blocks `@/lib/demo-user` imports from `src/app/api/**`.
3. The runner asserts the resolved user's email at startup.

## What's in here

- `generators.ts` — Mulberry32 PRNG + Box-Muller gaussian + AR(1) walk + clamp.
- `metabolic-persona.ts` — 38yo male, mild metabolic syndrome, 24 months,
  inflection at month 14 (lifestyle intervention).
- `graph-narrative.ts` — hand-curated condition / biomarker / intervention
  graph that spans the three core specialty surfaces (cardiometabolic,
  sleep-recovery, hormonal-endocrine), with citation-resolvable source
  chunks aligned to the data timeline.

## Adding a new persona

1. Add a new `<name>-persona.ts` mirroring the structure of
   `metabolic-persona.ts` (METRICS array of `MetricSpec` + a
   `generatePersonaData(seed)`).
2. Add a `<name>-graph.ts` with the matching condition/biomarker graph.
3. Add a runner under `scripts/demo/seed-<name>-persona.ts` that imports
   both, gates on `getDemoUserForSeedOnly()`, and wipes-then-rewrites the
   user's HealthDataPoint, SourceDocument, and GraphNode rows.
4. Add an `npm run demo:seed:<name>` script.

## Why generate, not extract

Real patient data is HIPAA/GDPR-fraught. Generation gives us:

- Determinism — same seed → byte-identical output for snapshot tests.
- Clinical plausibility without disclosing anyone's record.
- Inflection points we can choose deliberately to demo "before-and-after"
  scenarios.

If a metric needs to look more realistic, tighten its `phi` (autocorrelation),
adjust `sigma`, or split a single trend into two with an inflection.
