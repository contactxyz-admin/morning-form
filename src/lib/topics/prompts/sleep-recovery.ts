/**
 * Sleep & recovery topic prompt — scaffold only. U10 replaces this with a
 * full prompt that integrates wearable-derived nodes (HRV, RHR, sleep
 * stages). The scaffold exists so the registry compiles today and U8's
 * test suite can exercise "multi-topic registry" paths without blocking
 * on U10 content.
 */
import type { BuildPromptArgs, TopicPromptModule } from '../types';

export const SLEEP_RECOVERY_TOPIC_KEY = 'sleep-recovery';

const SYSTEM_PROMPT = `[Sleep & recovery topic — U10 will replace this placeholder.]

Apply the same three-tier contract and linter rules as the iron page:
no drug names, no doses, no clinical directives, no diagnoses, every
section cited from the supplied subgraph.`;

function buildUserPrompt({ subgraph }: BuildPromptArgs): string {
  return [
    '<subgraph>',
    `nodes=${subgraph.nodes.length} edges=${subgraph.edges.length}`,
    '</subgraph>',
    '',
    'Sleep & recovery prompt is a placeholder — flesh out in U10.',
  ].join('\n');
}

export const SLEEP_RECOVERY_PROMPT: TopicPromptModule = {
  topicKey: SLEEP_RECOVERY_TOPIC_KEY,
  systemPrompt: SYSTEM_PROMPT,
  buildUserPrompt,
};
