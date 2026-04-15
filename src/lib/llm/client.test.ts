import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  LLMClient,
  clearMockHandlers,
  setMockHandlers,
} from './client';
import {
  LLMAuthError,
  LLMRateLimitError,
  LLMTransientError,
  LLMValidationError,
} from './errors';

const exampleSchema = z.object({
  topic: z.string(),
  score: z.number(),
});

function anthropicResponse(toolInput: unknown, init: ResponseInit = {}): Response {
  return new Response(
    JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-4-6',
      content: [
        {
          type: 'tool_use',
          id: 'tool_test',
          name: 'emit_structured_output',
          input: toolInput,
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    },
  );
}

function errorResponse(status: number, body = '{}', headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

afterEach(() => {
  clearMockHandlers();
  vi.restoreAllMocks();
});

describe('LLMClient.generate (real path)', () => {
  it('returns zod-parsed structured output on happy path and forces tool-use', async () => {
    let captured: { url: string; body: any } | null = null;
    const fakeFetch = vi.fn(async (url: any, init: any) => {
      captured = { url: String(url), body: JSON.parse(init.body as string) };
      return anthropicResponse({ topic: 'iron', score: 0.87 });
    }) as unknown as typeof fetch;

    const client = new LLMClient({ apiKey: 'sk-test', fetch: fakeFetch });
    const out = await client.generate({
      prompt: 'classify this',
      schema: exampleSchema,
      schemaDescription: 'classify the input',
    });

    expect(out).toEqual({ topic: 'iron', score: 0.87 });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(captured!.url).toContain('/v1/messages');
    expect(captured!.body.model).toBe('claude-opus-4-6');
    expect(captured!.body.tools).toHaveLength(1);
    expect(captured!.body.tools[0].name).toBe('emit_structured_output');
    expect(captured!.body.tool_choice).toEqual({
      type: 'tool',
      name: 'emit_structured_output',
    });
  });

  it('maps 401 to LLMAuthError without retry', async () => {
    const fakeFetch = vi.fn(async () => errorResponse(401, '{"error":"unauthorized"}'));
    const client = new LLMClient({ apiKey: 'sk-bad', fetch: fakeFetch as any });

    await expect(
      client.generate({ prompt: 'p', schema: exampleSchema }),
    ).rejects.toBeInstanceOf(LLMAuthError);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('maps 429 to LLMRateLimitError after retry exhaustion and carries retryAfterSeconds', async () => {
    // retry-after: 0 keeps the test fast; the path exercised is identical to
    // the production "honor server-supplied delay" branch.
    const fakeFetch = vi.fn(async () =>
      errorResponse(429, '{"error":"rate_limited"}', { 'retry-after': '0' }),
    );
    const client = new LLMClient({ apiKey: 'sk-test', fetch: fakeFetch as any });

    try {
      await client.generate({ prompt: 'p', schema: exampleSchema });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMRateLimitError);
      expect((err as LLMRateLimitError).retryAfterSeconds).toBe(0);
    }
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('retries 5xx and surfaces LLMTransientError after 3 attempts', async () => {
    const fakeFetch = vi.fn(async () => errorResponse(503, '{"error":"upstream"}'));
    const client = new LLMClient({ apiKey: 'sk-test', fetch: fakeFetch as any });

    await expect(
      client.generate({ prompt: 'p', schema: exampleSchema }),
    ).rejects.toBeInstanceOf(LLMTransientError);
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('eventually succeeds when a 5xx is followed by a 200', async () => {
    const responses = [errorResponse(503), errorResponse(503), anthropicResponse({ topic: 'sleep', score: 0.5 })];
    const fakeFetch = vi.fn(async () => responses.shift()!);
    const client = new LLMClient({ apiKey: 'sk-test', fetch: fakeFetch as any });

    const out = await client.generate({ prompt: 'p', schema: exampleSchema });
    expect(out.topic).toBe('sleep');
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('throws LLMValidationError with raw output on schema mismatch', async () => {
    const badInput = { topic: 'iron', score: 'not-a-number' };
    const fakeFetch = vi.fn(async () => anthropicResponse(badInput));
    const client = new LLMClient({ apiKey: 'sk-test', fetch: fakeFetch as any });

    try {
      await client.generate({ prompt: 'p', schema: exampleSchema });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMValidationError);
      expect((err as LLMValidationError).rawOutput).toEqual(badInput);
    }
  });

  it('throws LLMValidationError when no tool_use block is in response', async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-4-6',
            content: [{ type: 'text', text: 'no tool use here' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const client = new LLMClient({ apiKey: 'sk-test', fetch: fakeFetch as any });

    await expect(
      client.generate({ prompt: 'p', schema: exampleSchema }),
    ).rejects.toBeInstanceOf(LLMValidationError);
  });
});

describe('LLMClient.generate (mock mode)', () => {
  it('returns canned handler response without calling fetch and warns on construction', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fakeFetch = vi.fn();

    const client = new LLMClient({ mock: true, fetch: fakeFetch as any });
    setMockHandlers([
      { key: 'classify-this', handler: () => ({ topic: 'energy', score: 0.42 }) },
    ]);

    const out = await client.generate({ prompt: 'classify-this prompt', schema: exampleSchema });
    expect(out).toEqual({ topic: 'energy', score: 0.42 });
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('MOCK_LLM=true'),
    );
  });

  it('still validates mock handler output against the schema', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new LLMClient({ mock: true });
    setMockHandlers([{ key: 'k', handler: () => ({ topic: 'x', score: 'nope' }) }]);

    await expect(
      client.generate({ prompt: 'k prompt', schema: exampleSchema }),
    ).rejects.toBeInstanceOf(LLMValidationError);
  });

  it('throws LLMTransientError when no mock handler matches the prompt', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new LLMClient({ mock: true });
    setMockHandlers([]);

    await expect(
      client.generate({ prompt: 'nothing matches', schema: exampleSchema }),
    ).rejects.toBeInstanceOf(LLMTransientError);
  });
});
