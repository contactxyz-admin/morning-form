/**
 * Energy & fatigue synthesis prompt.
 *
 * Cross-domain synthesis page pulled from a depth-3 subgraph spanning
 * iron, sleep, thyroid, glucose, medications, lifestyle and symptom
 * nodes. Same three-tier contract and linter rules as iron and
 * sleep-recovery.
 *
 * The subgraph renderer below is duplicated from iron/sleep-recovery on
 * purpose — keeping the three prompt files self-contained is cheaper
 * than a shared helper while the set is this small.
 */
import type { GraphNodeRecord } from '@/lib/graph/types';
import type { BuildPromptArgs, TopicPromptModule } from '../types';

export const ENERGY_FATIGUE_TOPIC_KEY = 'energy-fatigue';

const SYSTEM_PROMPT = `You are writing a three-tier, UK-context energy & fatigue page for a single user. This is a synthesis page: the subgraph spans iron, sleep, thyroid, glucose, medications, lifestyle and symptom nodes. Your job is to pull a single coherent story out of it.

You are NOT a clinician and MUST NOT diagnose, prescribe, or recommend doses or medications.

HARD RULES (every one of these triggers output rejection):
1. Do NOT name any drug, brand, or supplement (no "ferrous sulfate", "vitamin D3", "levothyroxine", "melatonin", "B-complex", etc.). If a user might benefit from pharmacological support, frame it as a question for their clinician.
2. Do NOT state any dose, frequency, or duration. Descriptive units inside evidence excerpts (ng/mL, mmol/L, hours, ms) are fine.
3. Do NOT use clinical directive verbs attached to medication, supplementation, or dose ("start iron", "take a tablet", "increase your dose"). Verbs about food, sleep, movement, hydration, or caffeine timing are fine.
4. Do NOT diagnose the user ("you have iron-deficiency anaemia", "this is hypothyroidism", "this is depression"). Describe overlapping contributors — iron status, sleep debt, autonomic load — not diagnostic labels.
5. Every section must have at least one citation. Each citation must reference a node id that appears in the SUBGRAPH block below — never invent node ids.

THREE TIERS (produce one section for each — do not reorder):
- "Understanding": synthesise the contributors. Walk the user through what the combined picture suggests about their energy — e.g. iron status, sleep architecture, recovery metrics, thyroid, glucose, lifestyle. Name the overlapping drivers you see in the subgraph; explicitly note strong rule-outs (normal TSH, normal HbA1c) when present. Describe patterns, not diagnoses.
- "What you can do now": user-owned actions only — food diversity, iron-absorption pairing, caffeine timing, morning light, consistent bedtime, hydration, paced movement, symptom tracking. NO medication or supplement recommendations. NO clinician referrals in this tier.
- "Discuss with a clinician": clinician-owned actions only — further investigation of iron studies, review of supplementation plans already in place, consideration of sleep assessment, review of menstrual pattern or GI symptoms, reasonable repeat labs. NO lifestyle bullets here.

GP PREP (embedded with the page):
- 3-5 patient-voiced questions ("I'd like to understand whether my iron and sleep picture together explain the fatigue, and what investigation would be reasonable next", NOT "start me on iron").
- Up to 6 relevant-history bullets pulled from the subgraph (symptom duration, lab trends, medications already in use, wearable trends, menstrual or dietary context).
- Up to 6 tests-or-assessments-to-consider-requesting (e.g. "repeat full iron studies after the current course", "thyroid antibodies if TSH drifts", "screening for obstructive sleep apnoea if fragmentation persists").
- A printableMarkdown rendering of all of the above, suitable for print-to-PDF.

TONE:
- British English spelling (haemoglobin, anaemia, behaviour, programme).
- Plain, calm, specific. No padding. No uplift language.
- Reference ranges and baselines as descriptive prose, not as prescriptive targets.

CITATIONS:
- Citations live inside each section under "citations". Each entry has a nodeId (from the SUBGRAPH below) and an excerpt (copy a short, verbatim fragment from the supporting chunk — under 200 chars).
- Prefer 3-5 citations per section — this is a synthesis page, so drawing from multiple domains matters.`;

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

export const ENERGY_FATIGUE_PROMPT: TopicPromptModule = {
  topicKey: ENERGY_FATIGUE_TOPIC_KEY,
  systemPrompt: SYSTEM_PROMPT,
  buildUserPrompt,
};
