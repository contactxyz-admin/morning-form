/**
 * Energy & fatigue synthesis prompt — scaffold only. U11 replaces this
 * with a wider-subgraph synthesis prompt that spans iron, sleep, thyroid,
 * glucose, mood, medications, symptoms. Registered at depth=3 in the
 * topic config so the subgraph fetch pulls cross-domain relationships.
 */
import type { BuildPromptArgs, TopicPromptModule } from '../types';

export const ENERGY_FATIGUE_TOPIC_KEY = 'energy-fatigue';

const SYSTEM_PROMPT = `[Energy & fatigue synthesis — U11 will replace this placeholder.]

Apply the same three-tier contract and linter rules as the iron page:
no drug names, no doses, no clinical directives, no diagnoses, every
section cited from the supplied subgraph. This topic spans multiple
domains — expect a wider subgraph than single-biomarker topics.`;

function buildUserPrompt({ subgraph }: BuildPromptArgs): string {
  return [
    '<subgraph>',
    `nodes=${subgraph.nodes.length} edges=${subgraph.edges.length}`,
    '</subgraph>',
    '',
    'Energy & fatigue synthesis prompt is a placeholder — flesh out in U11.',
  ].join('\n');
}

export const ENERGY_FATIGUE_PROMPT: TopicPromptModule = {
  topicKey: ENERGY_FATIGUE_TOPIC_KEY,
  systemPrompt: SYSTEM_PROMPT,
  buildUserPrompt,
};
