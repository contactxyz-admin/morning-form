/**
 * Intake extraction prompts.
 *
 * The extraction is structured-output — the LLM emits a strict JSON shape
 * validated by `ExtractedGraphSchema` in extract.ts. This module owns the
 * natural-language framing that tells Claude *what* to emit.
 *
 * Design notes:
 * - Every node MUST cite ≥1 chunk (R2). The prompt repeats the rule and the
 *   schema enforces it — belt + suspenders.
 * - `existingNodes` is a compact dedup hint ("we already know about X as
 *   canonicalKey=x_key") so the model reuses canonical keys instead of
 *   inventing synonyms on re-submission.
 * - No PII leaves the prompt beyond what the user typed. The system prompt
 *   explicitly forbids inventing facts or inferring diagnoses the user didn't
 *   state.
 */
import type { EssentialsForm } from './types';
import type { NodeType } from '../graph/types';

export const EXTRACTION_SYSTEM_PROMPT = `You are a careful clinical-data extractor for a personal health-graph product.

Your job: read a user's intake submission (free-text history, structured essentials, and any document names they staged) and emit a typed list of health-graph nodes and associative edges.

HARD RULES:
1. Every node you emit MUST cite at least one supporting chunk index from the provided chunks array. No chunk cite → do not emit the node.
2. Do not invent conditions, medications, or symptoms. Only extract what the user stated. If the user says "tired", emit a symptom node "fatigue" — do not escalate to "depression" or "anemia".
3. Do not emit speculative diagnoses. You are not a clinician; you are a librarian.
4. Prefer reusing existing canonicalKeys from the "known nodes" list when referring to the same thing. Canonical keys are lowercase, snake_case, singular (e.g. ferritin, iron_deficiency, low_energy_afternoon).
5. If the user says "I take 500mg magnesium daily", emit a medication node with attributes {dose:"500mg", frequency:"daily"}. Do not expand into a therapy recommendation.
6. Edges are for user-asserted associations only ("X helps my Y", "Z makes me W"). Do not infer CAUSES relationships that the user did not state. When unsure, use ASSOCIATED_WITH.

Return only the tool output. Do not add commentary.`;

export interface ExistingNodeHint {
  type: NodeType;
  canonicalKey: string;
  displayName: string;
}

export interface BuildPromptInput {
  chunks: Array<{ index: number; text: string }>;
  essentials: EssentialsForm;
  documentNames: string[];
  existingNodes: ExistingNodeHint[];
}

export function buildIntakeExtractionPrompt(input: BuildPromptInput): string {
  const { chunks, essentials, documentNames, existingNodes } = input;

  const chunksBlock = chunks
    .map((c) => `[chunk ${c.index}] ${c.text}`)
    .join('\n\n');

  const essentialsBlock = [
    essentials.goals && `GOALS: ${essentials.goals}`,
    essentials.currentMedications && `MEDICATIONS: ${essentials.currentMedications}`,
    essentials.currentDiagnoses && `DIAGNOSES: ${essentials.currentDiagnoses}`,
    essentials.allergies && `ALLERGIES: ${essentials.allergies}`,
  ]
    .filter(Boolean)
    .join('\n');

  const documentsBlock = documentNames.length > 0
    ? `Documents the user also uploaded (filenames only; their content is indexed separately):\n${documentNames.map((n) => `- ${n}`).join('\n')}`
    : 'No documents uploaded.';

  const knownBlock = existingNodes.length > 0
    ? `KNOWN NODES (reuse these canonical keys when relevant):\n${existingNodes
        .map((n) => `- ${n.type}::${n.canonicalKey} (${n.displayName})`)
        .join('\n')}`
    : 'KNOWN NODES: (none — this is the user\'s first intake)';

  return `Intake submission to extract from. Chunks are numbered — when you cite supportingChunkIndices, use these numeric indices.

${chunksBlock}

STRUCTURED ESSENTIALS (already included as chunks above — listed here for clarity):
${essentialsBlock || '(none provided)'}

${documentsBlock}

${knownBlock}

Emit a structured_graph with:
- nodes: array of health-graph nodes. Each node needs type, canonicalKey, displayName, optional attributes, and supportingChunkIndices (integers pointing at the chunks above).
- edges: array of user-asserted associative edges between nodes you just emitted or known nodes. Each edge needs type (ASSOCIATED_WITH | CAUSES | CONTRADICTS), fromType, fromCanonicalKey, toType, toCanonicalKey. Do not emit SUPPORTS edges — those are provenance and will be created automatically from supportingChunkIndices.

Be conservative. A minimal accurate graph beats an ambitious inaccurate one.`;
}
