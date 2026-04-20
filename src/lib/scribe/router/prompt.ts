/**
 * Router prompt assembly.
 *
 * The system prompt is generated from the registered topic policies +
 * their display names + one-line scope descriptions. Adding a new
 * policy to the scribe registry automatically widens the router on
 * next deploy; there's no router-side topic list to maintain.
 */

import { listTopicPolicyKeys } from '@/lib/scribe/policy/registry';
import { getTopicConfig } from '@/lib/topics/registry';
import type { RouteTurnInput } from './types';

/**
 * Short, one-line scope descriptions per topicKey. Kept here rather
 * than on TopicConfig because it's router-specific framing (how a
 * user naturally asks about the topic), not a property of the topic.
 * If a new topicKey lands in the registry without a description here,
 * `describeTopic` falls back to the displayName.
 */
const ROUTER_TOPIC_DESCRIPTIONS: Record<string, string> = {
  iron:
    'Iron status — ferritin, transferrin saturation, haemoglobin, anemia symptoms, iron supplements, iron-rich diet.',
  'sleep-recovery':
    'Sleep & recovery — sleep duration/quality, HRV, resting heart rate, recovery score, sleep onset, wake events, sleep hygiene.',
  'energy-fatigue':
    'Energy & fatigue — tiredness, low energy, post-exertional fatigue, brain fog, afternoon slumps, stamina, burnout.',
};

function describeTopic(topicKey: string): string {
  const config = getTopicConfig(topicKey);
  const description = ROUTER_TOPIC_DESCRIPTIONS[topicKey];
  const displayName = config?.displayName ?? topicKey;
  return description ?? displayName;
}

export function listRoutableTopicKeys(): string[] {
  return listTopicPolicyKeys();
}

export function buildRouterSystemPrompt(): string {
  const keys = listRoutableTopicKeys();
  const lines = keys.map((k) => `- ${k}: ${describeTopic(k)}`).join('\n');

  return `You are an intent router for a personal health-assistant chat. Your job is to pick the single best specialist topic for a user's question, or decide the question is out of scope.

ROUTABLE TOPICS (closed set — never emit a topicKey outside this list):
${lines}

DECISION RULES:
1. Pick exactly ONE topicKey from the list above when the question is clearly about that specialist's domain. Emit it verbatim.
2. If the question clearly spans two specialists (e.g. "is my sleep affecting my energy?"), pick the one most central to the user's framing. Use reasoning to note the overlap. Never emit two topicKeys.
3. Emit topicKey=null when the question is about a domain we don't cover yet (hormones, gut, cardiometabolic, mental health as a standalone concern, medications not in the above topics), or when the question is too vague to place.
4. Confidence:
   - 0.9+ when a canonical keyword for the topic is present ("ferritin", "HRV", "fatigue").
   - 0.7–0.9 when the framing is unambiguously in-domain but uses lay language ("knackered" → energy-fatigue, "I can't fall asleep" → sleep-recovery).
   - 0.5–0.7 when the question touches the domain but is partially out-of-scope.
   - <0.5 for no-clear-match; the caller will substitute null.
5. reasoning is one short line for the audit trail. NOT shown to the user. Do not hedge; state the signal you used.

HARD RULES:
- Never invent a topicKey. If none fit, return null.
- Never propose a new specialist domain.
- Do not answer the question. You are a router, not a scribe.

Return only the structured output. No commentary.`;
}

export function buildRouterUserPrompt(input: RouteTurnInput): string {
  const recent = input.recent ?? [];
  const history = recent.length
    ? recent
        .map(
          (m) =>
            `<prior_message role="${m.role}">${escapeFencedText(m.content)}</prior_message>`,
        )
        .join('\n')
    : '(no prior messages in this conversation)';

  return `Prior conversation (for context only — route based on the CURRENT utterance):
${history}

Current user utterance to route:
<current_utterance>${escapeFencedText(input.text)}</current_utterance>

Emit { topicKey, confidence, reasoning } for this utterance.`;
}

/**
 * Escape fenced-tag sequences so a hostile utterance cannot break out
 * of the `<current_utterance>` / `<prior_message>` wrappers and inject
 * instructions at the outer prompt level.
 */
function escapeFencedText(text: string): string {
  return text.replace(/<\/(current_utterance|prior_message)>/gi, '&lt;/$1&gt;');
}
