/**
 * Scribe LLM client factory.
 *
 * Three-tier resolution, in order:
 *   1. `setScribeLLMForTest()` override — wins unconditionally so integration
 *      tests control exactly what the executor sees. Reset via the same setter.
 *   2. Production Anthropic adapter — constructed lazily when
 *      `ANTHROPIC_API_KEY` is present, then memoised for the process lifetime.
 *   3. Throw — in any non-test environment without an override and without a
 *      key. Catching this at the route layer surfaces as a 503 ("Scribe LLM
 *      client is not configured"), not a silent mock fallback.
 *
 * Tests mock `@/lib/scribe/llm` directly, so the memoised instance never
 * leaks between suites.
 */
import type { ScribeLLMClient } from './execute';
import { env } from '@/lib/env';
import { AnthropicScribeLLMClient } from './llm-anthropic';

let override: ScribeLLMClient | null = null;
let productionClient: ScribeLLMClient | null = null;

export function setScribeLLMForTest(client: ScribeLLMClient | null): void {
  override = client;
  // Reset the memoised production client too — a test that sets an override,
  // clears it, and then calls `getScribeLLMClient()` expects a fresh
  // resolution against the current env, not a stale instance.
  productionClient = null;
}

export function getScribeLLMClient(): ScribeLLMClient {
  if (override) return override;
  if (productionClient) return productionClient;
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      'scribe.llm: ANTHROPIC_API_KEY is not set. Set it in the deployment environment or inject a client via setScribeLLMForTest.',
    );
  }
  productionClient = new AnthropicScribeLLMClient();
  return productionClient;
}
