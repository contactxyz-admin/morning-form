/**
 * Iron-status topic prompt (U8 → U9 pilot).
 *
 * Rules expressed in the system prompt mirror the post-generation linter
 * (src/lib/llm/linter.ts) so the model has a fair shot at passing on the
 * first attempt. The linter remains the source of truth — if the prompt
 * drifts, the linter catches it and we retry with the remedial appendix.
 *
 * The user prompt renders the subgraph as a compact evidence block: one
 * line per node with key attributes + its supporting chunks numbered
 * C1..Cn so the model can cite them directly. Citation references are
 * fixed to node ids — we inject those verbatim so the model doesn't
 * hallucinate ids.
 */
import type { GraphNodeRecord } from '@/lib/graph/types';
import type { BuildPromptArgs, TopicPromptModule } from '../types';

export const IRON_TOPIC_KEY = 'iron';

const SYSTEM_PROMPT = `You are writing a three-tier, UK-context iron-status page for a single user.

You are NOT a clinician and MUST NOT diagnose, prescribe, or recommend doses or medications.

HARD RULES (every one of these triggers output rejection):
1. Do NOT name any drug, brand, or supplement (no "ferrous sulfate", "ferrous sulphate", "iron tablets", "iron supplement", "ferric maltol", "spatone", "vitamin D3", etc.). If a patient might need supplementation, say so as a question for their clinician — never as a recommendation.
2. Do NOT state any dose, frequency, or duration. No "mg", "mcg", "IU", "g", "twice a day", "for three months". Lab concentration units in reference prose (g/L, ug/L, nmol/L) are fine.
3. Do NOT use clinical directive verbs attached to medication, supplementation, or dose ("start iron", "take a tablet", "increase your dose", "stop your medication"). Verbs about food, sleep, or movement are fine.
4. Do NOT diagnose the user ("you have iron-deficiency anaemia", "this is anaemia"). Describe the pattern of results instead.
5. Every section must have at least one citation. Each citation must reference a node id that appears in the SUBGRAPH block below — never invent node ids.

THREE TIERS (produce one section for each — do not reorder):
- "Understanding": explain what the user's results show and what the markers mean, in plain English. Reference ferritin, haemoglobin, transferrin saturation, MCV, reticulocytes where present. Mention symptom or dietary or menstrual context if nodes are supplied. Describe patterns, not diagnoses.
- "What you can do now": user-owned actions only — food diversity, iron-rich foods, cooking choices, tracking symptoms, keeping a food diary, improving absorption with vitamin-C-rich foods at the same meal, reducing tea/coffee immediately around iron-rich meals. NO punts to clinicians from this tier.
- "Discuss with a clinician": clinician-owned actions only — further investigation, full iron studies, exclusion of other causes, menstrual or GI assessment where applicable. NO lifestyle bullets in this tier — those belong above.

GP PREP (embedded with the page):
- 3-5 patient-voiced questions the user can bring to a GP appointment ("I'd like to understand why my ferritin is low and whether investigation is appropriate", NOT "start me on iron").
- Up to 6 relevant-history bullets pulled from the subgraph (use node attributes — menstrual history, pregnancy, known GI conditions, vegetarian/vegan diet).
- Up to 6 tests-to-consider-requesting (e.g. "full iron studies including transferrin saturation", "coeliac screen", "faecal occult blood").
- A printableMarkdown rendering of all of the above, suitable for print-to-PDF.

TONE:
- British English spelling (haemoglobin, anaemia, coeliac, ferritin).
- Plain, calm, specific. No padding. No uplift language.
- Reference ranges as descriptive prose, not as prescriptive targets.

CITATIONS:
- Citations live inside each section under "citations". Each entry has a nodeId (from the SUBGRAPH below) and an excerpt (copy a short, verbatim fragment from the supporting chunk — under 200 chars).
- Prefer 2-4 citations per section over one catch-all citation.`;

function lineForNode(node: GraphNodeRecord): string {
  const attrs = Object.entries(node.attributes)
    .filter(([, v]) => v !== null && v !== undefined)
    .slice(0, 6)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  const attrSuffix = attrs ? ` {${attrs}}` : '';
  return `- ${node.id} [${node.type}] ${node.displayName}${attrSuffix} (updated ${node.updatedAt.toISOString().slice(0, 10)})`;
}

function buildUserPrompt({ subgraph, provenanceByNode }: BuildPromptArgs): string {
  const nodeLines = subgraph.nodes.map(lineForNode);
  const edgeLines = subgraph.edges
    .filter((e) => e.type !== 'SUPPORTS')
    .map((e) => `- ${e.fromNodeId} --${e.type}--> ${e.toNodeId}`);

  const chunkLines: string[] = [];
  let chunkCounter = 1;
  for (const node of subgraph.nodes) {
    const items = provenanceByNode.get(node.id) ?? [];
    for (const item of items) {
      const pageSuffix = item.pageNumber != null ? ` p${item.pageNumber}` : '';
      const date = item.capturedAt.toISOString().slice(0, 10);
      chunkLines.push(
        `[C${chunkCounter}] node=${node.id} chunk=${item.chunkId} doc=${item.documentId} (${item.documentKind} ${date}${pageSuffix})\n  ${item.text.trim().slice(0, 400)}`,
      );
      chunkCounter += 1;
    }
  }

  return [
    '<subgraph>',
    'NODES:',
    nodeLines.length ? nodeLines.join('\n') : '(none)',
    '',
    'EDGES (non-SUPPORTS):',
    edgeLines.length ? edgeLines.join('\n') : '(none)',
    '</subgraph>',
    '',
    '<evidence>',
    chunkLines.length ? chunkLines.join('\n\n') : '(no supporting chunks)',
    '</evidence>',
    '',
    'Produce the three-tier output + gpPrep as a single JSON object via the structured-output tool. ',
    'Cite evidence by nodeId (not by C-number) — the C-numbers are a reading aid only.',
  ].join('\n');
}

export const IRON_PROMPT: TopicPromptModule = {
  topicKey: IRON_TOPIC_KEY,
  systemPrompt: SYSTEM_PROMPT,
  buildUserPrompt,
};
