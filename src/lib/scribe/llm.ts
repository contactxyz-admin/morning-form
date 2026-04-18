/**
 * Scribe LLM client factory.
 *
 * U5 ships the route + SSE plumbing + UI around `execute()`. The production
 * Anthropic adapter for the multi-turn tool-use loop is a separate wiring
 * task (tracked in the U5 follow-up). This module exists so:
 *
 *   - The API route reaches its LLM dependency through one explicit seam
 *     (`getScribeLLMClient()`), rather than constructing a client inline.
 *   - Tests inject a fake via `setScribeLLMForTest()` and reset it cleanly.
 *   - When the production adapter lands, only this module changes — the
 *     route, the hook, and the UI do not.
 */
import type { ScribeLLMClient } from './execute';

let override: ScribeLLMClient | null = null;

export function setScribeLLMForTest(client: ScribeLLMClient | null): void {
  override = client;
}

export function getScribeLLMClient(): ScribeLLMClient {
  if (override) return override;
  throw new Error(
    'scribe.llm: production ScribeLLMClient not yet wired. Install the Anthropic scribe adapter or inject a client via setScribeLLMForTest.',
  );
}
