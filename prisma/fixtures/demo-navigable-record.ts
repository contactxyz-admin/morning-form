/**
 * Fixture for the `/r/demo-navigable-record` seed.
 *
 * A lived-in health record telling a plausible mid-30s-female
 * presentation: iron-deficiency anaemia with concurrent vitamin D
 * deficiency, poor sleep quality and low HRV surfaced by a wearable,
 * and a GP course of action. The graph is deliberately multi-source
 * (two lab panels, two GP notes, a wearable 30-day summary, patient
 * intake) so every topic page has something to cite and the
 * `/record` index feels lived-in rather than stubbed.
 *
 * Why these specific nodes? They're sized to:
 *   - promote **iron-status** to `full` (ferritin + haemoglobin +
 *     transferrin-saturation match the iron registry patterns)
 *   - promote **sleep-recovery** to `full` (three `metric_window`
 *     nodes matching the sleep patterns: hrv, sleep_duration,
 *     wake_events — plus the poor-sleep-quality symptom)
 *   - promote **energy-fatigue** to `full` at depth 3 (ferritin +
 *     haemoglobin + tsh + hba1c + hrv_30d + sleep_duration_30d +
 *     fatigue symptom cover seven of the nine canonical patterns)
 *
 * Keep the prose clinically plausible — the LLM will cite these
 * excerpts verbatim in the compiled topic pages. Numbers are
 * realistic for the archetype: borderline-low Hb, clearly-low
 * ferritin, low 25(OH)D, low-normal B12, normal TSH/HbA1c
 * (rule-out evidence for energy-fatigue narrative).
 */

export interface DemoSourceChunk {
  /** Stable key used to build a deterministic chunk id for upsert. */
  chunkKey: string;
  index: number;
  text: string;
  offsetStart: number;
  offsetEnd: number;
  pageNumber: number | null;
}

export interface DemoSource {
  /** Stable key used to build a deterministic SourceDocument id. */
  sourceKey: string;
  kind: 'lab_pdf' | 'gp_record' | 'intake_text' | 'wearable_window' | 'checkin';
  /** ISO date. Kept static so re-seeding is a no-op. */
  capturedAt: string;
  sourceRef: string | null;
  /** Short filename or label shown in provenance UI. */
  label: string;
  chunks: DemoSourceChunk[];
}

export interface DemoNode {
  nodeKey: string;
  type: 'biomarker' | 'symptom' | 'condition' | 'medication' | 'intervention' | 'lifestyle' | 'metric_window' | 'mood' | 'energy';
  canonicalKey: string;
  displayName: string;
  attributes?: Record<string, unknown>;
}

export interface DemoEdge {
  /**
   * Constrained to the canonical `EDGE_TYPES` in `src/lib/graph/types.ts`.
   * Demo-only semantic types (DIAGNOSES, TREATS, CORRELATES_WITH) collapse
   * to ASSOCIATED_WITH — the graph model is intentionally narrow and
   * non-canonical strings are invisible to typed consumers.
   */
  type: 'SUPPORTS' | 'ASSOCIATED_WITH' | 'CAUSES' | 'CONTRADICTS' | 'TEMPORAL_SUCCEEDS';
  fromNodeKey: string;
  toNodeKey: string;
  /** When present, edge is grounded to this chunk. */
  fromChunkKey?: string;
  fromSourceKey?: string;
}

export interface DemoRecordFixture {
  /** Bumped by hand when the fixture changes; informs the seed-hash gate. */
  version: string;
  sources: DemoSource[];
  nodes: DemoNode[];
  edges: DemoEdge[];
}

export const DEMO_NAVIGABLE_RECORD: DemoRecordFixture = {
  version: '3',
  sources: [
    // ── Source 1: focused iron panel (original) ──────────────────────────
    {
      sourceKey: 'lab-ferritin-2026-02',
      kind: 'lab_pdf',
      capturedAt: '2026-02-14T09:30:00.000Z',
      sourceRef: 'demo://labs/iron-panel-2026-02.pdf',
      label: 'Iron panel — 14 Feb 2026',
      chunks: [
        {
          chunkKey: 'lab-ferritin-value',
          index: 0,
          text: 'Ferritin: 18 ng/mL (reference range 30–150). Flagged LOW by the lab.',
          offsetStart: 0,
          offsetEnd: 86,
          pageNumber: 1,
        },
        {
          chunkKey: 'lab-haemoglobin-value',
          index: 1,
          text: 'Haemoglobin: 12.2 g/dL (reference range 12.0–15.5). Borderline low for adult female.',
          offsetStart: 87,
          offsetEnd: 180,
          pageNumber: 1,
        },
        {
          chunkKey: 'lab-transferrin-value',
          index: 2,
          text: 'Transferrin saturation: 14% (reference range 20–50). Consistent with iron-restricted erythropoiesis.',
          offsetStart: 181,
          offsetEnd: 292,
          pageNumber: 1,
        },
        {
          chunkKey: 'lab-mcv-value',
          index: 3,
          text: 'MCV: 81 fL (reference range 80–100). At the low end — a further drop would indicate microcytosis.',
          offsetStart: 293,
          offsetEnd: 397,
          pageNumber: 1,
        },
      ],
    },
    // ── Source 2: broader blood panel (new) ──────────────────────────────
    {
      sourceKey: 'lab-broad-panel-2026-02',
      kind: 'lab_pdf',
      capturedAt: '2026-02-14T09:30:00.000Z',
      sourceRef: 'demo://labs/broad-panel-2026-02.pdf',
      label: 'Broad blood panel — 14 Feb 2026',
      chunks: [
        {
          chunkKey: 'lab-vitamin-d-value',
          index: 0,
          text: '25-hydroxyvitamin D: 20 ng/mL (reference range 30–100). Flagged LOW; consistent with vitamin D deficiency.',
          offsetStart: 0,
          offsetEnd: 117,
          pageNumber: 1,
        },
        {
          chunkKey: 'lab-b12-value',
          index: 1,
          text: 'Vitamin B12: 220 pg/mL (reference range 200–900). In range but at the low end — worth monitoring.',
          offsetStart: 118,
          offsetEnd: 223,
          pageNumber: 1,
        },
        {
          chunkKey: 'lab-tsh-value',
          index: 2,
          text: 'TSH: 1.8 mIU/L (reference range 0.4–4.0). Normal — thyroid function is not driving the fatigue picture.',
          offsetStart: 224,
          offsetEnd: 334,
          pageNumber: 1,
        },
        {
          chunkKey: 'lab-hba1c-value',
          index: 3,
          text: 'HbA1c: 5.3% (reference range 4.0–5.6). Normal; no dysglycaemia contributing to fatigue.',
          offsetStart: 335,
          offsetEnd: 426,
          pageNumber: 1,
        },
      ],
    },
    // ── Source 3: first GP consult (original, expanded plan detail) ──────
    {
      sourceKey: 'gp-note-2026-02',
      kind: 'gp_record',
      capturedAt: '2026-02-20T14:00:00.000Z',
      sourceRef: 'demo://gp/consult-2026-02-20.txt',
      label: 'GP consultation — 20 Feb 2026',
      chunks: [
        {
          chunkKey: 'gp-note-diagnosis',
          index: 0,
          text: 'Reviewed blood results. Impression: iron-deficiency anaemia, mild. Likely contributing to the fatigue, exertional breathlessness, and poor concentration described at intake.',
          offsetStart: 0,
          offsetEnd: 184,
          pageNumber: null,
        },
        {
          chunkKey: 'gp-note-vitd',
          index: 1,
          text: 'Also noted 25(OH)D of 20 ng/mL — frank vitamin D deficiency. Will address at follow-up once iron supplementation is settled to avoid introducing two new variables at once.',
          offsetStart: 185,
          offsetEnd: 359,
          pageNumber: null,
        },
        {
          chunkKey: 'gp-note-plan',
          index: 2,
          text: 'Started ferrous fumarate 210 mg once daily with orange juice to aid absorption. Advised to take away from tea, coffee, and calcium. Recheck ferritin and haemoglobin in 8 weeks.',
          offsetStart: 360,
          offsetEnd: 540,
          pageNumber: null,
        },
      ],
    },
    // ── Source 4: GP follow-up (new) ─────────────────────────────────────
    {
      sourceKey: 'gp-followup-2026-03',
      kind: 'gp_record',
      capturedAt: '2026-03-20T14:30:00.000Z',
      sourceRef: 'demo://gp/followup-2026-03-20.txt',
      label: 'GP follow-up — 20 Mar 2026',
      chunks: [
        {
          chunkKey: 'gp-followup-tolerance',
          index: 0,
          text: 'Four weeks into ferrous fumarate. Tolerating well — mild constipation managed with hydration. Reports a subtle lift in morning energy over the past week.',
          offsetStart: 0,
          offsetEnd: 161,
          pageNumber: null,
        },
        {
          chunkKey: 'gp-followup-vitd-plan',
          index: 1,
          text: 'Now adding vitamin D3 2000 IU once daily with a fatty meal to address the 25(OH)D deficiency. Recheck 25(OH)D alongside ferritin at the 8-week mark.',
          offsetStart: 162,
          offsetEnd: 315,
          pageNumber: null,
        },
        {
          chunkKey: 'gp-followup-sleep',
          index: 2,
          text: 'Patient raised concern about fragmented sleep and low wearable HRV. Suggested caffeine cut-off by 2pm and a 30-minute morning daylight walk; we will revisit if sleep quality has not improved after the vitamin D level normalises.',
          offsetStart: 316,
          offsetEnd: 553,
          pageNumber: null,
        },
      ],
    },
    // ── Source 5: wearable 30-day summary (new) ──────────────────────────
    {
      sourceKey: 'wearable-30d-2026-03',
      kind: 'wearable_window',
      capturedAt: '2026-03-10T06:00:00.000Z',
      sourceRef: 'demo://wearable/summary-30d-2026-03-10.json',
      label: 'Wearable summary — 30-day window, Mar 2026',
      chunks: [
        {
          chunkKey: 'wearable-hrv',
          index: 0,
          text: 'HRV 30-day median: 38 ms (rolling baseline 52 ms). Twelve of the last thirty nights scored below baseline. Recovery score trending down from week 2 onwards.',
          offsetStart: 0,
          offsetEnd: 160,
          pageNumber: null,
        },
        {
          chunkKey: 'wearable-sleep-duration',
          index: 1,
          text: 'Sleep duration 30-day median: 6.2 hours (target 7.5–8.5). Only four nights exceeded 7 hours. Bedtimes drifted later across the window, consistent with late caffeine timing.',
          offsetStart: 161,
          offsetEnd: 340,
          pageNumber: null,
        },
        {
          chunkKey: 'wearable-wake-events',
          index: 2,
          text: 'Wake events 30-day median: 3 per night (baseline 1). Most wakes clustered 02:30–04:00. Fragmented architecture plausibly amplifying the daytime fatigue picture.',
          offsetStart: 341,
          offsetEnd: 503,
          pageNumber: null,
        },
        {
          chunkKey: 'wearable-rhr',
          index: 3,
          text: 'Resting heart rate 30-day median: 68 bpm (rolling baseline 62 bpm). Elevation consistent with a system running slightly hot overnight.',
          offsetStart: 504,
          offsetEnd: 643,
          pageNumber: null,
        },
      ],
    },
    // ── Source 6: expanded intake (replaces original) ────────────────────
    {
      sourceKey: 'intake-2026-02',
      kind: 'intake_text',
      capturedAt: '2026-02-14T08:00:00.000Z',
      sourceRef: null,
      label: 'Intake — what brought you in',
      chunks: [
        {
          chunkKey: 'intake-story',
          index: 0,
          text: "I've been flat for the last few months. Not depressed — just heavy. Morning starts are hardest, and any real exertion leaves me winded in a way that used to feel normal.",
          offsetStart: 0,
          offsetEnd: 182,
          pageNumber: null,
        },
        {
          chunkKey: 'intake-concentration',
          index: 1,
          text: "My focus has been shot too. I lose the thread mid-sentence in meetings and have to re-read paragraphs two or three times. It's not burnout exactly — more like the lights are dim.",
          offsetStart: 183,
          offsetEnd: 365,
          pageNumber: null,
        },
        {
          chunkKey: 'intake-sleep',
          index: 2,
          text: "Sleep feels shallow. I go down around 11pm but wake at 3am most nights and struggle to drop back under. I drink two coffees — usually one around 10am and another at 3pm.",
          offsetStart: 366,
          offsetEnd: 546,
          pageNumber: null,
        },
        {
          chunkKey: 'intake-cold',
          index: 3,
          text: "My hands and feet are cold all the time now, even indoors. My GP ran bloods and said my iron was low and my vitamin D was low too.",
          offsetStart: 547,
          offsetEnd: 682,
          pageNumber: null,
        },
      ],
    },
    // ── Source 7: symptom check-in (new) ─────────────────────────────────
    {
      sourceKey: 'checkin-2026-03-week2',
      kind: 'checkin',
      capturedAt: '2026-03-14T08:00:00.000Z',
      sourceRef: null,
      label: 'Symptom check-in — week 2 of iron therapy',
      chunks: [
        {
          chunkKey: 'checkin-energy',
          index: 0,
          text: 'Energy: 4/10 on average this week, creeping up from 3/10 the week before. Afternoon slump still present but less severe.',
          offsetStart: 0,
          offsetEnd: 121,
          pageNumber: null,
        },
        {
          chunkKey: 'checkin-concentration',
          index: 1,
          text: 'Concentration: still patchy. Better in the morning, worst between 3pm and 5pm. Reading comprehension has not returned to baseline yet.',
          offsetStart: 122,
          offsetEnd: 257,
          pageNumber: null,
        },
        {
          chunkKey: 'checkin-breathless',
          index: 2,
          text: 'Exertional breathlessness: slightly improved. Stairs at work no longer make me stop on the landing, but a gentle jog still leaves me winded sooner than expected.',
          offsetStart: 258,
          offsetEnd: 425,
          pageNumber: null,
        },
      ],
    },
  ],
  nodes: [
    // ── Biomarkers ───────────────────────────────────────────────────────
    {
      nodeKey: 'ferritin',
      type: 'biomarker',
      canonicalKey: 'ferritin',
      displayName: 'Ferritin',
      attributes: { value: 18, unit: 'ng/mL', reference: '30–150', status: 'low' },
    },
    {
      nodeKey: 'haemoglobin',
      type: 'biomarker',
      canonicalKey: 'haemoglobin',
      displayName: 'Haemoglobin',
      attributes: { value: 12.2, unit: 'g/dL', reference: '12.0–15.5', status: 'borderline_low' },
    },
    {
      nodeKey: 'transferrin-saturation',
      type: 'biomarker',
      canonicalKey: 'transferrin_saturation',
      displayName: 'Transferrin saturation',
      attributes: { value: 14, unit: '%', reference: '20–50', status: 'low' },
    },
    {
      nodeKey: 'mcv',
      type: 'biomarker',
      canonicalKey: 'mcv',
      displayName: 'Mean corpuscular volume',
      attributes: { value: 81, unit: 'fL', reference: '80–100', status: 'low_normal' },
    },
    {
      nodeKey: 'vitamin-d',
      type: 'biomarker',
      canonicalKey: 'vitamin_d_25_oh',
      displayName: '25-hydroxyvitamin D',
      attributes: { value: 20, unit: 'ng/mL', reference: '30–100', status: 'low' },
    },
    {
      nodeKey: 'vitamin-b12',
      type: 'biomarker',
      canonicalKey: 'vitamin_b12',
      displayName: 'Vitamin B12',
      attributes: { value: 220, unit: 'pg/mL', reference: '200–900', status: 'low_normal' },
    },
    {
      nodeKey: 'tsh',
      type: 'biomarker',
      canonicalKey: 'tsh',
      displayName: 'TSH',
      attributes: { value: 1.8, unit: 'mIU/L', reference: '0.4–4.0', status: 'normal' },
    },
    {
      nodeKey: 'hba1c',
      type: 'biomarker',
      canonicalKey: 'hba1c',
      displayName: 'HbA1c',
      attributes: { value: 5.3, unit: '%', reference: '4.0–5.6', status: 'normal' },
    },

    // ── Metric windows (wearable-derived) ────────────────────────────────
    {
      nodeKey: 'hrv-30d',
      type: 'metric_window',
      canonicalKey: 'hrv_30d_median',
      displayName: 'HRV — 30-day median',
      attributes: { value: 38, unit: 'ms', baseline: 52, status: 'below_baseline' },
    },
    {
      nodeKey: 'sleep-duration-30d',
      type: 'metric_window',
      canonicalKey: 'sleep_duration_30d_median',
      displayName: 'Sleep duration — 30-day median',
      attributes: { value: 6.2, unit: 'hours', target: '7.5–8.5', status: 'below_target' },
    },
    {
      nodeKey: 'wake-events-30d',
      type: 'metric_window',
      canonicalKey: 'wake_events_30d_median',
      displayName: 'Wake events — 30-day median',
      attributes: { value: 3, unit: 'per_night', baseline: 1, status: 'elevated' },
    },
    {
      nodeKey: 'rhr-30d',
      type: 'metric_window',
      canonicalKey: 'rhr_30d_median',
      displayName: 'Resting heart rate — 30-day median',
      attributes: { value: 68, unit: 'bpm', baseline: 62, status: 'elevated' },
    },

    // ── Conditions ───────────────────────────────────────────────────────
    {
      nodeKey: 'iron-deficiency-anaemia',
      type: 'condition',
      canonicalKey: 'iron_deficiency_anaemia',
      displayName: 'Iron-deficiency anaemia',
      attributes: { severity: 'mild' },
    },
    {
      nodeKey: 'vitamin-d-deficiency',
      type: 'condition',
      canonicalKey: 'vitamin_d_deficiency',
      displayName: 'Vitamin D deficiency',
      attributes: { severity: 'moderate' },
    },

    // ── Medications ──────────────────────────────────────────────────────
    {
      nodeKey: 'ferrous-fumarate',
      type: 'medication',
      canonicalKey: 'ferrous_fumarate_210mg',
      displayName: 'Ferrous fumarate 210 mg',
      attributes: { dose: '210 mg', frequency: 'once daily', route: 'oral', startedAt: '2026-02-20' },
    },
    {
      nodeKey: 'vitamin-d3',
      type: 'medication',
      canonicalKey: 'vitamin_d3_2000iu',
      displayName: 'Vitamin D3 2000 IU',
      attributes: { dose: '2000 IU', frequency: 'once daily', route: 'oral', startedAt: '2026-03-20' },
    },

    // ── Symptoms ─────────────────────────────────────────────────────────
    {
      nodeKey: 'fatigue',
      type: 'symptom',
      canonicalKey: 'fatigue',
      displayName: 'Fatigue',
      attributes: { onset: 'gradual', duration_months: 3, severity: 'moderate' },
    },
    {
      nodeKey: 'exertional-breathlessness',
      type: 'symptom',
      canonicalKey: 'exertional_breathlessness',
      displayName: 'Exertional breathlessness',
      attributes: { trigger: 'mild_exertion', severity: 'mild' },
    },
    {
      nodeKey: 'poor-concentration',
      type: 'symptom',
      canonicalKey: 'poor_concentration',
      displayName: 'Poor concentration',
      attributes: { pattern: 'afternoon_worst', severity: 'moderate' },
    },
    {
      nodeKey: 'cold-extremities',
      type: 'symptom',
      canonicalKey: 'cold_extremities',
      displayName: 'Cold hands and feet',
      attributes: { severity: 'mild' },
    },
    {
      nodeKey: 'poor-sleep-quality',
      type: 'symptom',
      canonicalKey: 'poor_sleep_quality',
      displayName: 'Fragmented sleep',
      attributes: { pattern: '3am_waking', severity: 'moderate' },
    },

    // ── Lifestyle ────────────────────────────────────────────────────────
    {
      nodeKey: 'late-caffeine',
      type: 'lifestyle',
      canonicalKey: 'caffeine_after_2pm',
      displayName: 'Caffeine after 2pm',
      attributes: { intake: '3pm coffee', frequency: 'daily' },
    },
  ],
  edges: [
    // ── SUPPORTS edges — every node grounded to at least one chunk ──────
    // Biomarkers
    { type: 'SUPPORTS', fromNodeKey: 'ferritin', toNodeKey: 'ferritin', fromChunkKey: 'lab-ferritin-value', fromSourceKey: 'lab-ferritin-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'haemoglobin', toNodeKey: 'haemoglobin', fromChunkKey: 'lab-haemoglobin-value', fromSourceKey: 'lab-ferritin-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'transferrin-saturation', toNodeKey: 'transferrin-saturation', fromChunkKey: 'lab-transferrin-value', fromSourceKey: 'lab-ferritin-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'mcv', toNodeKey: 'mcv', fromChunkKey: 'lab-mcv-value', fromSourceKey: 'lab-ferritin-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'vitamin-d', toNodeKey: 'vitamin-d', fromChunkKey: 'lab-vitamin-d-value', fromSourceKey: 'lab-broad-panel-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'vitamin-b12', toNodeKey: 'vitamin-b12', fromChunkKey: 'lab-b12-value', fromSourceKey: 'lab-broad-panel-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'tsh', toNodeKey: 'tsh', fromChunkKey: 'lab-tsh-value', fromSourceKey: 'lab-broad-panel-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'hba1c', toNodeKey: 'hba1c', fromChunkKey: 'lab-hba1c-value', fromSourceKey: 'lab-broad-panel-2026-02' },
    // Metric windows
    { type: 'SUPPORTS', fromNodeKey: 'hrv-30d', toNodeKey: 'hrv-30d', fromChunkKey: 'wearable-hrv', fromSourceKey: 'wearable-30d-2026-03' },
    { type: 'SUPPORTS', fromNodeKey: 'sleep-duration-30d', toNodeKey: 'sleep-duration-30d', fromChunkKey: 'wearable-sleep-duration', fromSourceKey: 'wearable-30d-2026-03' },
    { type: 'SUPPORTS', fromNodeKey: 'wake-events-30d', toNodeKey: 'wake-events-30d', fromChunkKey: 'wearable-wake-events', fromSourceKey: 'wearable-30d-2026-03' },
    { type: 'SUPPORTS', fromNodeKey: 'rhr-30d', toNodeKey: 'rhr-30d', fromChunkKey: 'wearable-rhr', fromSourceKey: 'wearable-30d-2026-03' },
    // Conditions
    { type: 'SUPPORTS', fromNodeKey: 'iron-deficiency-anaemia', toNodeKey: 'iron-deficiency-anaemia', fromChunkKey: 'gp-note-diagnosis', fromSourceKey: 'gp-note-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'vitamin-d-deficiency', toNodeKey: 'vitamin-d-deficiency', fromChunkKey: 'gp-note-vitd', fromSourceKey: 'gp-note-2026-02' },
    // Medications
    { type: 'SUPPORTS', fromNodeKey: 'ferrous-fumarate', toNodeKey: 'ferrous-fumarate', fromChunkKey: 'gp-note-plan', fromSourceKey: 'gp-note-2026-02' },
    // Tolerance / early-response context — attaches the follow-up chunk to
    // ferrous-fumarate so it surfaces in provenance at compile time.
    { type: 'SUPPORTS', fromNodeKey: 'ferrous-fumarate', toNodeKey: 'ferrous-fumarate', fromChunkKey: 'gp-followup-tolerance', fromSourceKey: 'gp-followup-2026-03' },
    { type: 'SUPPORTS', fromNodeKey: 'vitamin-d3', toNodeKey: 'vitamin-d3', fromChunkKey: 'gp-followup-vitd-plan', fromSourceKey: 'gp-followup-2026-03' },
    // Symptoms — cited in intake and check-in
    { type: 'SUPPORTS', fromNodeKey: 'fatigue', toNodeKey: 'fatigue', fromChunkKey: 'intake-story', fromSourceKey: 'intake-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'fatigue', toNodeKey: 'fatigue', fromChunkKey: 'checkin-energy', fromSourceKey: 'checkin-2026-03-week2' },
    { type: 'SUPPORTS', fromNodeKey: 'exertional-breathlessness', toNodeKey: 'exertional-breathlessness', fromChunkKey: 'intake-story', fromSourceKey: 'intake-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'exertional-breathlessness', toNodeKey: 'exertional-breathlessness', fromChunkKey: 'checkin-breathless', fromSourceKey: 'checkin-2026-03-week2' },
    { type: 'SUPPORTS', fromNodeKey: 'poor-concentration', toNodeKey: 'poor-concentration', fromChunkKey: 'intake-concentration', fromSourceKey: 'intake-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'poor-concentration', toNodeKey: 'poor-concentration', fromChunkKey: 'checkin-concentration', fromSourceKey: 'checkin-2026-03-week2' },
    { type: 'SUPPORTS', fromNodeKey: 'cold-extremities', toNodeKey: 'cold-extremities', fromChunkKey: 'intake-cold', fromSourceKey: 'intake-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'poor-sleep-quality', toNodeKey: 'poor-sleep-quality', fromChunkKey: 'intake-sleep', fromSourceKey: 'intake-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'poor-sleep-quality', toNodeKey: 'poor-sleep-quality', fromChunkKey: 'gp-followup-sleep', fromSourceKey: 'gp-followup-2026-03' },
    // Lifestyle
    { type: 'SUPPORTS', fromNodeKey: 'late-caffeine', toNodeKey: 'late-caffeine', fromChunkKey: 'intake-sleep', fromSourceKey: 'intake-2026-02' },

    // ── ASSOCIATED_WITH — condition ↔ biomarker evidence ───────────────
    //
    // The canonical graph model only supports SUPPORTS / ASSOCIATED_WITH /
    // CAUSES / CONTRADICTS / TEMPORAL_SUCCEEDS. We collapse richer demo
    // semantics (diagnosed-by, treated-by, correlated-with) to
    // ASSOCIATED_WITH so every row is visible to typed consumers.
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'iron-deficiency-anaemia', toNodeKey: 'ferritin' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'iron-deficiency-anaemia', toNodeKey: 'haemoglobin' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'iron-deficiency-anaemia', toNodeKey: 'transferrin-saturation' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'iron-deficiency-anaemia', toNodeKey: 'mcv' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'vitamin-d-deficiency', toNodeKey: 'vitamin-d' },

    // Medication ↔ condition
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'ferrous-fumarate', toNodeKey: 'iron-deficiency-anaemia' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'vitamin-d3', toNodeKey: 'vitamin-d-deficiency' },

    // Fatigue picture — symptom ↔ contributing findings
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'fatigue', toNodeKey: 'ferritin' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'fatigue', toNodeKey: 'haemoglobin' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'fatigue', toNodeKey: 'vitamin-d' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'fatigue', toNodeKey: 'vitamin-b12' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'fatigue', toNodeKey: 'hrv-30d' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'fatigue', toNodeKey: 'sleep-duration-30d' },
    // Rule-out wiring so the B12 narrative reaches the energy-fatigue subgraph.
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'vitamin-b12', toNodeKey: 'iron-deficiency-anaemia' },
    // Breathlessness & concentration & cold
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'exertional-breathlessness', toNodeKey: 'haemoglobin' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'poor-concentration', toNodeKey: 'iron-deficiency-anaemia' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'poor-concentration', toNodeKey: 'sleep-duration-30d' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'cold-extremities', toNodeKey: 'iron-deficiency-anaemia' },
    // Sleep picture
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'poor-sleep-quality', toNodeKey: 'wake-events-30d' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'poor-sleep-quality', toNodeKey: 'sleep-duration-30d' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'poor-sleep-quality', toNodeKey: 'hrv-30d' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'late-caffeine', toNodeKey: 'poor-sleep-quality' },
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'late-caffeine', toNodeKey: 'sleep-duration-30d' },
    // Autonomic
    { type: 'ASSOCIATED_WITH', fromNodeKey: 'rhr-30d', toNodeKey: 'hrv-30d' },
  ],
};

/**
 * Canonical slug used by `/r/[slug]` to resolve this fixture.
 * Kept next to the fixture so changes move together.
 */
export const DEMO_NAVIGABLE_RECORD_SLUG = 'demo-navigable-record';
