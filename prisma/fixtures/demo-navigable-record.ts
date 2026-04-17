/**
 * Fixture for the `/r/demo-navigable-record` seed.
 *
 * A tiny self-contained health record telling an iron-deficiency
 * narrative: a lab result flags low ferritin and borderline
 * haemoglobin, a GP note records the diagnosis, and a short patient
 * intake describes the symptoms that prompted the blood test.
 *
 * Why these specific nodes? They're the smallest graph that will:
 *   - promote **iron-status** to `full` on compile (ferritin biomarker
 *     matches the topic's canonical-key patterns)
 *   - leave **sleep-recovery** as a `stub` (no `metric_window` nodes
 *     and no biomarker matches its patterns)
 *   - likely promote **energy-fatigue** via ferritin + haemoglobin +
 *     depth-2 expansion into the condition/medication nodes
 *
 * Keep the prose short but clinically plausible — the LLM will cite
 * these excerpts verbatim in the compiled topic pages.
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
  kind: 'lab_pdf' | 'gp_record' | 'intake_text';
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
  type: 'SUPPORTS' | 'DIAGNOSES' | 'TREATS' | 'CORRELATES_WITH';
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
  version: '1',
  sources: [
    {
      sourceKey: 'lab-ferritin-2026-02',
      kind: 'lab_pdf',
      capturedAt: '2026-02-14T09:30:00.000Z',
      sourceRef: 'demo://labs/full-iron-panel-2026-02.pdf',
      label: 'Full iron panel — 14 Feb 2026',
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
      ],
    },
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
          text: 'Reviewed blood results. Impression: iron-deficiency anaemia, mild. Likely contributing to the fatigue and exertional breathlessness described.',
          offsetStart: 0,
          offsetEnd: 155,
          pageNumber: null,
        },
        {
          chunkKey: 'gp-note-plan',
          index: 1,
          text: 'Started ferrous fumarate 210 mg once daily with orange juice to aid absorption. Advised to take away from tea, coffee, and calcium. Recheck ferritin and haemoglobin in 8 weeks.',
          offsetStart: 156,
          offsetEnd: 340,
          pageNumber: null,
        },
      ],
    },
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
          text: "I've been flat for the last few months. Not depressed — just heavy. Morning starts are hardest, and any real exertion leaves me winded in a way that used to feel normal. My GP ran bloods and said my iron was low.",
          offsetStart: 0,
          offsetEnd: 225,
          pageNumber: null,
        },
      ],
    },
  ],
  nodes: [
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
      nodeKey: 'iron-deficiency-anaemia',
      type: 'condition',
      canonicalKey: 'iron_deficiency_anaemia',
      displayName: 'Iron-deficiency anaemia',
      attributes: { severity: 'mild' },
    },
    {
      nodeKey: 'ferrous-fumarate',
      type: 'medication',
      canonicalKey: 'ferrous_fumarate_210mg',
      displayName: 'Ferrous fumarate 210 mg',
      attributes: { dose: '210 mg', frequency: 'once daily', route: 'oral' },
    },
  ],
  edges: [
    // SUPPORTS edges — every node grounded to at least one chunk.
    { type: 'SUPPORTS', fromNodeKey: 'ferritin', toNodeKey: 'ferritin', fromChunkKey: 'lab-ferritin-value', fromSourceKey: 'lab-ferritin-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'haemoglobin', toNodeKey: 'haemoglobin', fromChunkKey: 'lab-haemoglobin-value', fromSourceKey: 'lab-ferritin-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'transferrin-saturation', toNodeKey: 'transferrin-saturation', fromChunkKey: 'lab-transferrin-value', fromSourceKey: 'lab-ferritin-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'iron-deficiency-anaemia', toNodeKey: 'iron-deficiency-anaemia', fromChunkKey: 'gp-note-diagnosis', fromSourceKey: 'gp-note-2026-02' },
    { type: 'SUPPORTS', fromNodeKey: 'ferrous-fumarate', toNodeKey: 'ferrous-fumarate', fromChunkKey: 'gp-note-plan', fromSourceKey: 'gp-note-2026-02' },
    // Non-SUPPORTS structural edges.
    { type: 'DIAGNOSES', fromNodeKey: 'iron-deficiency-anaemia', toNodeKey: 'ferritin' },
    { type: 'DIAGNOSES', fromNodeKey: 'iron-deficiency-anaemia', toNodeKey: 'haemoglobin' },
    { type: 'DIAGNOSES', fromNodeKey: 'iron-deficiency-anaemia', toNodeKey: 'transferrin-saturation' },
    { type: 'TREATS', fromNodeKey: 'ferrous-fumarate', toNodeKey: 'iron-deficiency-anaemia' },
  ],
};

/**
 * Canonical slug used by `/r/[slug]` to resolve this fixture.
 * Kept next to the fixture so changes move together.
 */
export const DEMO_NAVIGABLE_RECORD_SLUG = 'demo-navigable-record';
