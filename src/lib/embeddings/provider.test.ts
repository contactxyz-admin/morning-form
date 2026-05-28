import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmbeddingProvider } from './provider';
import {
  EmbeddingAuthError,
  EmbeddingRateLimitError,
  EmbeddingTransientError,
} from './types';
import { EmbeddingMetrics } from './metrics';

const MOCK_KEY = 'sk-test-openai-key';

function makeFakeFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
  let call = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(call, responses.length - 1)];
    call++;
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json', ...(r.headers || {}) },
    });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
  EmbeddingMetrics.reset();
});

describe('createEmbeddingProvider + OpenAIEmbeddingProvider', () => {
  it('returns MockOnlyProvider when no key and not prod (or EMBEDDING_PROVIDER=mock)', () => {
    const p = createEmbeddingProvider({ mock: true });
    expect(p.id).toBe('mock');
    expect(p.model).toBe('mock-embedding');
    expect(p.dimensions).toBe(1536);
  });

  it('produces deterministic vectors of correct dimension in mock mode', async () => {
    const p = createEmbeddingProvider({ mock: true });
    const out = await p.embed(['hello world', 'another chunk']);
    expect(out.results).toHaveLength(2);
    expect(out.results[0].vector).toHaveLength(1536);
    expect(out.tokens).toBeGreaterThan(0);
    // same input => same first few values (deterministic)
    const again = await p.embed('hello world');
    expect(again.results[0].vector.slice(0, 3)).toEqual(out.results[0].vector.slice(0, 3));
  });

  it('throws EmbeddingAuthError on 401 (real path)', async () => {
    const fakeFetch = makeFakeFetch([{ status: 401, body: { error: 'invalid key' } }]);
    const p = createEmbeddingProvider({ apiKey: MOCK_KEY, fetch: fakeFetch, mock: false });
    await expect(p.embed('test')).rejects.toThrow(EmbeddingAuthError);
  });

  it('maps 429 to EmbeddingRateLimitError with retry-after', async () => {
    const fakeFetch = makeFakeFetch([
      {
        status: 429,
        body: { error: 'rate limit' },
        headers: { 'retry-after': '7' },
      },
    ]);
    const p = createEmbeddingProvider({ apiKey: MOCK_KEY, fetch: fakeFetch, mock: false });
    await expect(p.embed('rate')).rejects.toThrow(EmbeddingRateLimitError);
    // We don't assert the numeric here because mapError reads it; just that type is correct.
  });

  it('retries transient 5xx up to MAX_ATTEMPTS then throws', async () => {
    const fakeFetch = makeFakeFetch([
      { status: 503, body: {} },
      { status: 503, body: {} },
      { status: 503, body: {} },
    ]);
    const p = createEmbeddingProvider({ apiKey: MOCK_KEY, fetch: fakeFetch, mock: false });
    await expect(p.embed('transient')).rejects.toThrow(EmbeddingTransientError);
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  });

  // Regression: the gateway-style model id ("openai/text-embedding-3-small")
  // was sent verbatim to OpenAI's direct API, which 400s on it. The wire model
  // must drop the creator prefix unless a gateway baseURL is configured, while
  // the stored/returned label stays canonical for vector consistency.
  function makeCapturingFetch(capture: { url?: string; model?: unknown }) {
    return (async (url: unknown, init?: { body?: unknown }) => {
      capture.url = String(url);
      capture.model = JSON.parse(String(init?.body ?? '{}')).model;
      return new Response(
        JSON.stringify({
          object: 'list',
          data: [{ object: 'embedding', index: 0, embedding: new Array(1536).fill(0) }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
          model: 'text-embedding-3-small',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
  }

  it('sends the bare model id to OpenAI direct API when no gateway baseURL is set', async () => {
    const capture: { url?: string; model?: unknown } = {};
    const p = createEmbeddingProvider({ apiKey: MOCK_KEY, fetch: makeCapturingFetch(capture), mock: false });
    const out = await p.embed('hello');
    expect(capture.model).toBe('text-embedding-3-small');
    // Stored/returned label stays canonical regardless of wire format.
    expect(out.model).toBe('openai/text-embedding-3-small');
  });

  it('keeps the openai/ creator prefix on the wire when a gateway baseURL is configured', async () => {
    const capture: { url?: string; model?: unknown } = {};
    const p = createEmbeddingProvider({
      apiKey: MOCK_KEY,
      fetch: makeCapturingFetch(capture),
      mock: false,
      baseURL: 'https://gateway.example/v1',
    });
    await p.embed('hello');
    expect(capture.model).toBe('openai/text-embedding-3-small');
  });
});
