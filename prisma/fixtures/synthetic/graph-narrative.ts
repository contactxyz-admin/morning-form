/**
 * Hand-curated graph narrative for the metabolic-syndrome persona.
 *
 * Pairs with the data series in `metabolic-persona.ts`. Source-chunk dates
 * line up with the persona timeline so citations don't contradict the
 * underlying numbers (e.g., "Q4 2025 lab" chunks reference values that the
 * generator actually produces around that timestamp).
 *
 * Coverage spans three core specialties so the general scribe can route
 * realistic referrals:
 *   - cardiometabolic: HbA1c, glucose, lipids, BP, weight
 *   - sleep-recovery:  sleep efficiency, total sleep, HRV
 *   - hormonal-endocrine: free testosterone (low-normal), TSH (rule-out)
 *
 * Plus low-ferritin → fatigue surface (iron specialty), so the chat surface
 * has a chance to chain general → cardiometabolic → iron.
 */

import type { DemoEdge, DemoNode, DemoRecordFixture, DemoSource } from '../demo-navigable-record';

const SOURCES: DemoSource[] = [
  // ── Source 1: baseline labs (start of window) ───────────────────────────
  {
    sourceKey: 'syn-lab-2024-04',
    kind: 'lab_pdf',
    capturedAt: '2024-04-20T09:00:00.000Z',
    sourceRef: 'demo://synthetic/metabolic/labs-2024-04.pdf',
    label: 'Annual labs — Apr 2024',
    chunks: [
      {
        chunkKey: 'syn-2024-04-hba1c',
        index: 0,
        text: 'HbA1c: 5.9% (reference <5.7). Borderline — falls in the prediabetes band per ADA criteria.',
        offsetStart: 0,
        offsetEnd: 100,
        pageNumber: 1,
      },
      {
        chunkKey: 'syn-2024-04-fasting-glucose',
        index: 1,
        text: 'Fasting glucose: 5.7 mmol/L (reference 3.9–5.5). Slightly above the upper limit — consistent with impaired fasting glucose.',
        offsetStart: 101,
        offsetEnd: 230,
        pageNumber: 1,
      },
      {
        chunkKey: 'syn-2024-04-lipids',
        index: 2,
        text: 'Total cholesterol 5.6, LDL 3.6, HDL 1.05, triglycerides 2.1 (mmol/L). LDL above NICE primary-prevention target; HDL low; TG borderline. Atherogenic pattern.',
        offsetStart: 231,
        offsetEnd: 400,
        pageNumber: 1,
      },
      {
        chunkKey: 'syn-2024-04-ferritin',
        index: 3,
        text: 'Ferritin 42 ng/mL (reference 30–400). Low-normal in a male; transferrin saturation 22%.',
        offsetStart: 401,
        offsetEnd: 500,
        pageNumber: 1,
      },
      {
        chunkKey: 'syn-2024-04-thyroid',
        index: 4,
        text: 'TSH 2.4 mIU/L (reference 0.4–4.5). Within range — rules out overt thyroid contribution to fatigue.',
        offsetStart: 501,
        offsetEnd: 620,
        pageNumber: 1,
      },
      {
        chunkKey: 'syn-2024-04-testosterone',
        index: 5,
        text: 'Free testosterone 9.5 pg/mL (reference 9.3–26.5). Borderline at the lower bound for adult males.',
        offsetStart: 621,
        offsetEnd: 740,
        pageNumber: 1,
      },
    ],
  },

  // ── Source 2: GP encounter pre-intervention ─────────────────────────────
  {
    sourceKey: 'syn-gp-2024-05',
    kind: 'gp_record',
    capturedAt: '2024-05-12T10:30:00.000Z',
    sourceRef: 'demo://synthetic/metabolic/gp-encounter-2024-05.txt',
    label: 'GP encounter — May 2024',
    chunks: [
      {
        chunkKey: 'syn-2024-05-summary',
        index: 0,
        text: 'Patient: 38yo male. PMH unremarkable. Reports 6kg weight gain over 18 months, persistent low-energy afternoons, broken sleep. BP in clinic 138/86 — stage-1 hypertensive range on current ACC/AHA guidance. BMI 27.4.',
        offsetStart: 0,
        offsetEnd: 250,
        pageNumber: 1,
      },
      {
        chunkKey: 'syn-2024-05-plan',
        index: 1,
        text: 'Plan: lifestyle counseling first. Mediterranean-leaning diet, 150 minutes moderate exercise weekly, alcohol audit. Recheck labs in 6 months. No pharmacotherapy at this stage.',
        offsetStart: 251,
        offsetEnd: 430,
        pageNumber: 1,
      },
    ],
  },

  // ── Source 3: wearable 90-day window pre-inflection ─────────────────────
  {
    sourceKey: 'syn-wearable-2025-q2',
    kind: 'wearable_window',
    capturedAt: '2025-05-30T00:00:00.000Z',
    sourceRef: 'demo://synthetic/metabolic/wearable-2025-q2.json',
    label: 'Wearable summary — Q2 2025',
    chunks: [
      {
        chunkKey: 'syn-2025-q2-sleep',
        index: 0,
        text: '90-day rolling sleep efficiency: 80.1% (target ≥85%). Total sleep median 6h 35m; <7h on 71% of nights. Wake events average 2.3/night — bumpy continuity.',
        offsetStart: 0,
        offsetEnd: 200,
        pageNumber: null,
      },
      {
        chunkKey: 'syn-2025-q2-hrv',
        index: 1,
        text: '90-day HRV median 36 ms; trend slightly negative (-0.3 ms/month). Recovery scores yellow on 58% of mornings.',
        offsetStart: 201,
        offsetEnd: 320,
        pageNumber: null,
      },
    ],
  },

  // ── Source 4: intervention narrative (inflection point) ─────────────────
  {
    sourceKey: 'syn-intake-2025-08',
    kind: 'intake_text',
    capturedAt: '2025-08-15T18:00:00.000Z',
    sourceRef: 'demo://synthetic/metabolic/intake-2025-08.txt',
    label: 'Intake — Aug 2025 (intervention start)',
    chunks: [
      {
        chunkKey: 'syn-2025-08-intervention',
        index: 0,
        text: 'Started a coached resistance-training programme (3×/week) and tightened diet to a Mediterranean pattern. Pulled caffeine cutoff back to 14:00. Added daily step target of 8000.',
        offsetStart: 0,
        offsetEnd: 220,
        pageNumber: null,
      },
      {
        chunkKey: 'syn-2025-08-goals',
        index: 1,
        text: 'Self-reported goals: drop 5–7 kg, get HbA1c under 5.7, sleep efficiency above 85%, energy back to baseline of about 12 months ago.',
        offsetStart: 221,
        offsetEnd: 380,
        pageNumber: null,
      },
    ],
  },

  // ── Source 5: post-intervention labs ────────────────────────────────────
  {
    sourceKey: 'syn-lab-2026-02',
    kind: 'lab_pdf',
    capturedAt: '2026-02-10T09:00:00.000Z',
    sourceRef: 'demo://synthetic/metabolic/labs-2026-02.pdf',
    label: 'Recheck labs — Feb 2026',
    chunks: [
      {
        chunkKey: 'syn-2026-02-hba1c',
        index: 0,
        text: 'HbA1c: 5.7% (reference <5.7). Down from 6.1 at the 2025-Q3 recheck — out of the prediabetes band.',
        offsetStart: 0,
        offsetEnd: 110,
        pageNumber: 1,
      },
      {
        chunkKey: 'syn-2026-02-lipids',
        index: 1,
        text: 'Total cholesterol 4.9, LDL 2.9, HDL 1.25, triglycerides 1.4 (mmol/L). Meaningful improvement across the lipid panel.',
        offsetStart: 111,
        offsetEnd: 240,
        pageNumber: 1,
      },
      {
        chunkKey: 'syn-2026-02-ferritin',
        index: 2,
        text: 'Ferritin 68 ng/mL (reference 30–400). Recovered from the low-normal of the previous year.',
        offsetStart: 241,
        offsetEnd: 350,
        pageNumber: 1,
      },
      {
        chunkKey: 'syn-2026-02-testosterone',
        index: 3,
        text: 'Free testosterone 11.8 pg/mL. Up from 9.5 — within the comfortable mid-range now. Likely a downstream effect of weight loss + sleep + training.',
        offsetStart: 351,
        offsetEnd: 510,
        pageNumber: 1,
      },
    ],
  },

  // ── Source 6: post-intervention wearable summary ────────────────────────
  {
    sourceKey: 'syn-wearable-2026-q1',
    kind: 'wearable_window',
    capturedAt: '2026-04-10T00:00:00.000Z',
    sourceRef: 'demo://synthetic/metabolic/wearable-2026-q1.json',
    label: 'Wearable summary — recent 90 days',
    chunks: [
      {
        chunkKey: 'syn-2026-q1-sleep',
        index: 0,
        text: '90-day sleep efficiency 86.4%. Total sleep median 7h 10m; <7h on 36% of nights — roughly halved versus the pre-intervention window.',
        offsetStart: 0,
        offsetEnd: 200,
        pageNumber: null,
      },
      {
        chunkKey: 'syn-2026-q1-hrv',
        index: 1,
        text: '90-day HRV median 47 ms; trend +0.4 ms/month. Recovery scores green on 62% of mornings.',
        offsetStart: 201,
        offsetEnd: 320,
        pageNumber: null,
      },
    ],
  },
];

const NODES: DemoNode[] = [
  // Conditions / risk states
  { nodeKey: 'cond-prediabetes', type: 'condition', canonicalKey: 'prediabetes', displayName: 'Prediabetes (HbA1c 5.7–6.4%)' },
  { nodeKey: 'cond-mild-dyslipidaemia', type: 'condition', canonicalKey: 'mild-dyslipidaemia', displayName: 'Mild dyslipidaemia' },
  { nodeKey: 'cond-stage1-htn', type: 'condition', canonicalKey: 'stage1-hypertension', displayName: 'Stage 1 hypertension (boundary)' },
  { nodeKey: 'cond-low-normal-test', type: 'condition', canonicalKey: 'low-normal-testosterone', displayName: 'Low-normal free testosterone' },
  { nodeKey: 'cond-low-normal-ferritin', type: 'condition', canonicalKey: 'low-normal-ferritin', displayName: 'Low-normal ferritin' },
  { nodeKey: 'cond-impaired-sleep', type: 'condition', canonicalKey: 'impaired-sleep-continuity', displayName: 'Impaired sleep continuity' },

  // Biomarkers
  { nodeKey: 'bm-hba1c', type: 'biomarker', canonicalKey: 'hba1c', displayName: 'HbA1c' },
  { nodeKey: 'bm-fasting-glucose', type: 'biomarker', canonicalKey: 'fasting-glucose', displayName: 'Fasting glucose' },
  { nodeKey: 'bm-total-chol', type: 'biomarker', canonicalKey: 'total-cholesterol', displayName: 'Total cholesterol' },
  { nodeKey: 'bm-ldl', type: 'biomarker', canonicalKey: 'ldl', displayName: 'LDL cholesterol' },
  { nodeKey: 'bm-hdl', type: 'biomarker', canonicalKey: 'hdl', displayName: 'HDL cholesterol' },
  { nodeKey: 'bm-tg', type: 'biomarker', canonicalKey: 'triglycerides', displayName: 'Triglycerides' },
  { nodeKey: 'bm-ferritin', type: 'biomarker', canonicalKey: 'ferritin', displayName: 'Ferritin' },
  { nodeKey: 'bm-tsh', type: 'biomarker', canonicalKey: 'tsh', displayName: 'TSH' },
  { nodeKey: 'bm-free-test', type: 'biomarker', canonicalKey: 'free-testosterone', displayName: 'Free testosterone' },
  { nodeKey: 'bm-hscrp', type: 'biomarker', canonicalKey: 'hscrp', displayName: 'hsCRP' },
  { nodeKey: 'bm-systolic-bp', type: 'biomarker', canonicalKey: 'systolic-bp', displayName: 'Systolic BP' },
  { nodeKey: 'bm-diastolic-bp', type: 'biomarker', canonicalKey: 'diastolic-bp', displayName: 'Diastolic BP' },
  { nodeKey: 'bm-weight', type: 'biomarker', canonicalKey: 'weight', displayName: 'Body weight' },
  { nodeKey: 'bm-bmi', type: 'biomarker', canonicalKey: 'bmi', displayName: 'BMI' },

  // Sleep / recovery metric windows
  { nodeKey: 'mw-sleep-eff-90', type: 'metric_window', canonicalKey: 'sleep-efficiency-90d', displayName: 'Sleep efficiency (90d)' },
  { nodeKey: 'mw-total-sleep-90', type: 'metric_window', canonicalKey: 'total-sleep-90d', displayName: 'Total sleep (90d)' },
  { nodeKey: 'mw-hrv-90', type: 'metric_window', canonicalKey: 'hrv-90d', displayName: 'HRV (90d)' },

  // Symptoms
  { nodeKey: 'sym-fatigue', type: 'symptom', canonicalKey: 'fatigue-afternoon', displayName: 'Afternoon fatigue' },
  { nodeKey: 'sym-broken-sleep', type: 'symptom', canonicalKey: 'broken-sleep', displayName: 'Broken sleep' },
  { nodeKey: 'sym-low-libido', type: 'symptom', canonicalKey: 'low-libido', displayName: 'Reduced libido' },

  // Interventions / lifestyle
  { nodeKey: 'int-resistance-training', type: 'intervention', canonicalKey: 'resistance-training-3wk', displayName: 'Resistance training (3×/week)' },
  { nodeKey: 'int-mediterranean-diet', type: 'intervention', canonicalKey: 'mediterranean-diet', displayName: 'Mediterranean-pattern diet' },
  { nodeKey: 'int-caffeine-cutoff', type: 'intervention', canonicalKey: 'caffeine-cutoff-14', displayName: 'Caffeine cutoff at 14:00' },
  { nodeKey: 'int-step-target', type: 'intervention', canonicalKey: 'daily-step-target-8000', displayName: 'Daily step target 8,000' },

  // Self-report
  { nodeKey: 'mood-week', type: 'mood', canonicalKey: 'mood-weekly', displayName: 'Mood (weekly self-report)' },
  { nodeKey: 'energy-week', type: 'energy', canonicalKey: 'energy-weekly', displayName: 'Energy (weekly self-report)' },
];

const EDGES: DemoEdge[] = [
  // Prediabetes signal
  { type: 'SUPPORTS', fromNodeKey: 'bm-hba1c', toNodeKey: 'cond-prediabetes', fromChunkKey: 'syn-2024-04-hba1c', fromSourceKey: 'syn-lab-2024-04' },
  { type: 'SUPPORTS', fromNodeKey: 'bm-fasting-glucose', toNodeKey: 'cond-prediabetes', fromChunkKey: 'syn-2024-04-fasting-glucose', fromSourceKey: 'syn-lab-2024-04' },

  // Lipid pattern
  { type: 'SUPPORTS', fromNodeKey: 'bm-total-chol', toNodeKey: 'cond-mild-dyslipidaemia', fromChunkKey: 'syn-2024-04-lipids', fromSourceKey: 'syn-lab-2024-04' },
  { type: 'SUPPORTS', fromNodeKey: 'bm-ldl', toNodeKey: 'cond-mild-dyslipidaemia', fromChunkKey: 'syn-2024-04-lipids', fromSourceKey: 'syn-lab-2024-04' },
  { type: 'SUPPORTS', fromNodeKey: 'bm-hdl', toNodeKey: 'cond-mild-dyslipidaemia', fromChunkKey: 'syn-2024-04-lipids', fromSourceKey: 'syn-lab-2024-04' },
  { type: 'SUPPORTS', fromNodeKey: 'bm-tg', toNodeKey: 'cond-mild-dyslipidaemia', fromChunkKey: 'syn-2024-04-lipids', fromSourceKey: 'syn-lab-2024-04' },

  // BP / hypertension
  { type: 'SUPPORTS', fromNodeKey: 'bm-systolic-bp', toNodeKey: 'cond-stage1-htn', fromChunkKey: 'syn-2024-05-summary', fromSourceKey: 'syn-gp-2024-05' },
  { type: 'SUPPORTS', fromNodeKey: 'bm-diastolic-bp', toNodeKey: 'cond-stage1-htn', fromChunkKey: 'syn-2024-05-summary', fromSourceKey: 'syn-gp-2024-05' },

  // Iron / fatigue
  { type: 'SUPPORTS', fromNodeKey: 'bm-ferritin', toNodeKey: 'cond-low-normal-ferritin', fromChunkKey: 'syn-2024-04-ferritin', fromSourceKey: 'syn-lab-2024-04' },
  { type: 'CAUSES', fromNodeKey: 'cond-low-normal-ferritin', toNodeKey: 'sym-fatigue' },

  // Hormonal
  { type: 'SUPPORTS', fromNodeKey: 'bm-free-test', toNodeKey: 'cond-low-normal-test', fromChunkKey: 'syn-2024-04-testosterone', fromSourceKey: 'syn-lab-2024-04' },
  { type: 'CONTRADICTS', fromNodeKey: 'bm-tsh', toNodeKey: 'cond-low-normal-test', fromChunkKey: 'syn-2024-04-thyroid', fromSourceKey: 'syn-lab-2024-04' },
  { type: 'CAUSES', fromNodeKey: 'cond-low-normal-test', toNodeKey: 'sym-low-libido' },
  { type: 'CAUSES', fromNodeKey: 'cond-low-normal-test', toNodeKey: 'sym-fatigue' },

  // Sleep cluster
  { type: 'SUPPORTS', fromNodeKey: 'mw-sleep-eff-90', toNodeKey: 'cond-impaired-sleep', fromChunkKey: 'syn-2025-q2-sleep', fromSourceKey: 'syn-wearable-2025-q2' },
  { type: 'SUPPORTS', fromNodeKey: 'mw-total-sleep-90', toNodeKey: 'cond-impaired-sleep', fromChunkKey: 'syn-2025-q2-sleep', fromSourceKey: 'syn-wearable-2025-q2' },
  { type: 'SUPPORTS', fromNodeKey: 'mw-hrv-90', toNodeKey: 'cond-impaired-sleep', fromChunkKey: 'syn-2025-q2-hrv', fromSourceKey: 'syn-wearable-2025-q2' },
  { type: 'CAUSES', fromNodeKey: 'cond-impaired-sleep', toNodeKey: 'sym-broken-sleep' },
  { type: 'CAUSES', fromNodeKey: 'cond-impaired-sleep', toNodeKey: 'sym-fatigue' },
  { type: 'ASSOCIATED_WITH', fromNodeKey: 'cond-impaired-sleep', toNodeKey: 'cond-low-normal-test' },

  // Cross-cluster: metabolic load → sleep + recovery
  { type: 'ASSOCIATED_WITH', fromNodeKey: 'cond-prediabetes', toNodeKey: 'cond-impaired-sleep' },
  { type: 'ASSOCIATED_WITH', fromNodeKey: 'cond-mild-dyslipidaemia', toNodeKey: 'cond-stage1-htn' },
  { type: 'ASSOCIATED_WITH', fromNodeKey: 'bm-weight', toNodeKey: 'cond-prediabetes' },
  { type: 'ASSOCIATED_WITH', fromNodeKey: 'bm-bmi', toNodeKey: 'cond-prediabetes' },

  // Self-report → fatigue
  { type: 'SUPPORTS', fromNodeKey: 'energy-week', toNodeKey: 'sym-fatigue' },
  { type: 'ASSOCIATED_WITH', fromNodeKey: 'mood-week', toNodeKey: 'sym-fatigue' },

  // Inflection: interventions land in Aug 2025
  { type: 'SUPPORTS', fromNodeKey: 'int-resistance-training', toNodeKey: 'bm-hba1c', fromChunkKey: 'syn-2025-08-intervention', fromSourceKey: 'syn-intake-2025-08' },
  { type: 'SUPPORTS', fromNodeKey: 'int-resistance-training', toNodeKey: 'bm-weight', fromChunkKey: 'syn-2025-08-intervention', fromSourceKey: 'syn-intake-2025-08' },
  { type: 'SUPPORTS', fromNodeKey: 'int-resistance-training', toNodeKey: 'bm-free-test', fromChunkKey: 'syn-2025-08-intervention', fromSourceKey: 'syn-intake-2025-08' },
  { type: 'SUPPORTS', fromNodeKey: 'int-mediterranean-diet', toNodeKey: 'bm-ldl', fromChunkKey: 'syn-2025-08-intervention', fromSourceKey: 'syn-intake-2025-08' },
  { type: 'SUPPORTS', fromNodeKey: 'int-mediterranean-diet', toNodeKey: 'bm-tg', fromChunkKey: 'syn-2025-08-intervention', fromSourceKey: 'syn-intake-2025-08' },
  { type: 'SUPPORTS', fromNodeKey: 'int-mediterranean-diet', toNodeKey: 'bm-hba1c', fromChunkKey: 'syn-2025-08-intervention', fromSourceKey: 'syn-intake-2025-08' },
  { type: 'SUPPORTS', fromNodeKey: 'int-caffeine-cutoff', toNodeKey: 'mw-sleep-eff-90', fromChunkKey: 'syn-2025-08-intervention', fromSourceKey: 'syn-intake-2025-08' },
  { type: 'SUPPORTS', fromNodeKey: 'int-step-target', toNodeKey: 'bm-systolic-bp' },
  { type: 'SUPPORTS', fromNodeKey: 'int-step-target', toNodeKey: 'bm-weight' },

  // Outcome chunks: Feb 2026 labs validate the trajectory
  { type: 'TEMPORAL_SUCCEEDS', fromNodeKey: 'bm-hba1c', toNodeKey: 'cond-prediabetes', fromChunkKey: 'syn-2026-02-hba1c', fromSourceKey: 'syn-lab-2026-02' },
  { type: 'TEMPORAL_SUCCEEDS', fromNodeKey: 'bm-ldl', toNodeKey: 'cond-mild-dyslipidaemia', fromChunkKey: 'syn-2026-02-lipids', fromSourceKey: 'syn-lab-2026-02' },
  { type: 'TEMPORAL_SUCCEEDS', fromNodeKey: 'bm-ferritin', toNodeKey: 'cond-low-normal-ferritin', fromChunkKey: 'syn-2026-02-ferritin', fromSourceKey: 'syn-lab-2026-02' },
  { type: 'TEMPORAL_SUCCEEDS', fromNodeKey: 'bm-free-test', toNodeKey: 'cond-low-normal-test', fromChunkKey: 'syn-2026-02-testosterone', fromSourceKey: 'syn-lab-2026-02' },
  { type: 'TEMPORAL_SUCCEEDS', fromNodeKey: 'mw-sleep-eff-90', toNodeKey: 'cond-impaired-sleep', fromChunkKey: 'syn-2026-q1-sleep', fromSourceKey: 'syn-wearable-2026-q1' },
  { type: 'TEMPORAL_SUCCEEDS', fromNodeKey: 'mw-hrv-90', toNodeKey: 'cond-impaired-sleep', fromChunkKey: 'syn-2026-q1-hrv', fromSourceKey: 'syn-wearable-2026-q1' },
];

export const METABOLIC_PERSONA_GRAPH: DemoRecordFixture = {
  version: '1',
  sources: SOURCES,
  nodes: NODES,
  edges: EDGES,
};
