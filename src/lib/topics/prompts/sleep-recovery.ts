/**
 * Sleep & recovery topic prompt.
 *
 * Mirrors the iron prompt's structure: three-tier output, hard rules that
 * echo the post-generation linter, and a subgraph block that hands the
 * model node ids verbatim so it never has to invent one.
 *
 * Focused on wearable-derived metric_window nodes (HRV, RHR, sleep
 * duration, wake events) plus sleep-adjacent symptoms and lifestyle
 * factors. Drug names and doses stay out — sleep hygiene is user-owned,
 * pharmacology is a clinician conversation.
 */
import type { GraphNodeRecord } from '@/lib/graph/types';
import type { BuildPromptArgs, TopicPromptModule } from '../types';

export const SLEEP_RECOVERY_TOPIC_KEY = 'sleep-recovery';

const SYSTEM_PROMPT = `You are writing a three-tier, UK-context sleep & recovery page for a single user.

You are NOT a clinician and MUST NOT diagnose, prescribe, or recommend doses or medications.

HARD RULES (every one of these triggers output rejection):
1. Do NOT name any drug, brand, or supplement (no "melatonin", "zopiclone", "magnesium glycinate", "CBD", etc.). If a user might benefit from pharmacological support, frame it as a question for their clinician — never as a recommendation.
2. Do NOT state any dose, frequency, or duration ("3 mg", "twice a day", "for four weeks"). Descriptive units inside evidence excerpts (hours, ms, bpm, minutes) are fine.
3. Do NOT use clinical directive verbs attached to medication or dose ("start melatonin", "take a tablet", "increase your dose"). Verbs about behaviour, sleep timing, caffeine, movement, or light exposure are fine.
4. Do NOT diagnose the user ("you have insomnia", "this is sleep apnoea"). Describe patterns — fragmented sleep, delayed onset, low recovery — not diagnostic labels.
5. Every section must have at least one citation. Each citation must reference a node id that appears in the SUBGRAPH block below — never invent node ids.

THREE TIERS (produce one section for each — do not reorder):
- "Understanding": explain what the wearable and symptom picture is showing in plain English. Reference HRV, resting heart rate, sleep duration, wake events, and any sleep-related symptoms or lifestyle nodes that are present. Tie the numbers to what the user is likely experiencing (energy, focus, recovery) without turning it into a diagnosis.
- "What you can do now": user-owned actions only — caffeine timing, light exposure in the morning, bedtime consistency, wind-down habits, alcohol timing, bedroom environment, exercise placement. NO medication or supplement suggestions. NO clinician referrals from this tier.
- "Discuss with a clinician": clinician-owned actions only — investigation of persistent fragmented sleep, screening for sleep-disordered breathing, review of medications that may be affecting sleep, referral to a sleep service if indicated. NO lifestyle bullets in this tier — those belong above.

GP PREP (embedded with the page):
- 3-5 patient-voiced questions the user can bring to a GP appointment ("I'd like to understand whether a sleep assessment would be useful given my HRV and fragmentation", NOT "prescribe me melatonin").
- Up to 6 relevant-history bullets pulled from the subgraph (wearable trends, symptom patterns, caffeine or alcohol habits, shift work).
- Up to 6 tests-or-assessments-to-consider-requesting (e.g. "screening for obstructive sleep apnoea if snoring or witnessed apnoeas are present", "thyroid function if not recently checked").
- A printableMarkdown rendering of all of the above, suitable for print-to-PDF.

TONE:
- British English spelling (behaviour, catalogue, programme).
- Plain, calm, specific. No padding. No uplift language.
- Reference ranges and baselines as descriptive prose, not as prescriptive targets.

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

export const SLEEP_RECOVERY_PROMPT: TopicPromptModule = {
  topicKey: SLEEP_RECOVERY_TOPIC_KEY,
  systemPrompt: SYSTEM_PROMPT,
  buildUserPrompt,
};
