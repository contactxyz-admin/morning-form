/**
 * Unit tests for the scribe's Anthropic adapter. These pin the conversion
 * boundaries — message shape, tool schema, stop-reason mapping, error
 * mapping — without hitting the real API. End-to-end flow is already
 * covered by the explain route's integration tests which inject a fake
 * `ScribeLLMClient` via `setScribeLLMForTest`.
 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/env', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-api-key',
    NODE_ENV: 'test',
  },
}));

import {
  AnthropicScribeLLMClient,
  mapStopReason,
  toAnthropicMessage,
  toAnthropicTool,
} from './llm-anthropic';
import { LLMAuthError } from '@/lib/llm/errors';

describe('toAnthropicMessage', () => {
  it('converts a plain user message to a role=user string content', () => {
    expect(toAnthropicMessage({ role: 'user', content: 'Explain ferritin.' }))
      .toEqual({ role: 'user', content: 'Explain ferritin.' });
  });

  it('converts an assistant message with tool_use blocks', () => {
    const out = toAnthropicMessage({
      role: 'assistant',
      content: 'Let me check.',
      toolCalls: [
        { id: 'toolu_1', name: 'get_node_detail', input: { nodeId: 'n-1' } },
      ],
    });
    expect(out).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check.' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'get_node_detail',
          input: { nodeId: 'n-1' },
        },
      ],
    });
  });

  it('omits the text block when assistant content is empty but keeps tool_use', () => {
    const out = toAnthropicMessage({
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'toolu_2', name: 'route_to_gp_prep', input: {} }],
    });
    expect(out).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_2',
          name: 'route_to_gp_prep',
          input: {},
        },
      ],
    });
  });

  it('folds tool_result messages back to role=user with tool_result blocks', () => {
    const out = toAnthropicMessage({
      role: 'tool_result',
      content: '',
      toolResults: [
        { toolUseId: 'toolu_1', output: { nodes: [] } },
        { toolUseId: 'toolu_2', output: 'plain string result' },
        { toolUseId: 'toolu_3', output: { error: 'bad' }, isError: true },
      ],
    });
    expect(out).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: '{"nodes":[]}',
          is_error: false,
        },
        {
          type: 'tool_result',
          tool_use_id: 'toolu_2',
          content: 'plain string result',
          is_error: false,
        },
        {
          type: 'tool_result',
          tool_use_id: 'toolu_3',
          content: '{"error":"bad"}',
          is_error: true,
        },
      ],
    });
  });

  it('falls back to an empty text block when assistant has neither text nor tool_use', () => {
    // Shouldn't happen in practice (executor only pushes real turns) but the
    // guard keeps a bad upstream state from failing Anthropic's content-length
    // precondition with a confusing 400.
    const out = toAnthropicMessage({ role: 'assistant', content: '' });
    expect(out).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
    });
  });
});

describe('toAnthropicTool', () => {
  it('emits a JSON-schema input_schema without the $schema wrapper', () => {
    const parameters = z.object({
      nodeId: z.string(),
      limit: z.number().optional(),
    });
    const tool = toAnthropicTool({
      name: 'get_node_detail',
      description: 'Fetch a node by id',
      parameters,
    });
    expect(tool.name).toBe('get_node_detail');
    expect(tool.description).toBe('Fetch a node by id');
    const schema = tool.input_schema as Record<string, unknown>;
    expect(schema).not.toHaveProperty('$schema');
    expect(schema).toHaveProperty('type', 'object');
    expect(schema).toHaveProperty('properties');
    expect((schema.properties as Record<string, unknown>).nodeId).toBeDefined();
  });
});

describe('mapStopReason', () => {
  it('maps tool_use to tool_use', () => {
    expect(mapStopReason('tool_use')).toBe('tool_use');
  });

  it('maps end_turn to end_turn', () => {
    expect(mapStopReason('end_turn')).toBe('end_turn');
  });

  it.each(['max_tokens', 'stop_sequence', null, undefined, 'unknown-future'])(
    'maps %s to end_turn so the executor loop terminates cleanly',
    (reason) => {
      expect(mapStopReason(reason as string | null | undefined)).toBe(
        'end_turn',
      );
    },
  );
});

describe('AnthropicScribeLLMClient', () => {
  it('constructs successfully when an API key is provided', () => {
    expect(() =>
      new AnthropicScribeLLMClient({ apiKey: 'test-api-key' }),
    ).not.toThrow();
  });

  it('throws LLMAuthError when no API key is available', async () => {
    const originalModule = await import('@/lib/env');
    vi.spyOn(originalModule, 'env', 'get').mockReturnValue({
      ...originalModule.env,
      ANTHROPIC_API_KEY: '',
    } as typeof originalModule.env);
    try {
      expect(() => new AnthropicScribeLLMClient()).toThrow(LLMAuthError);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('runs one turn end-to-end against an injected fake fetch', async () => {
    // Canned Anthropic response: one text block + one tool_use block, stop
    // reason 'tool_use'. We inject a fake `fetch` so the SDK's HTTP call
    // returns this verbatim. That exercises the full conversion path
    // (params → response → ScribeLLMTurn) without hitting the network.
    const fakeFetch: typeof fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-4-6-20260101',
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 20 },
          content: [
            { type: 'text', text: 'Looking this up.' },
            {
              type: 'tool_use',
              id: 'toolu_abc',
              name: 'get_node_detail',
              input: { nodeId: 'n-1' },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    const client = new AnthropicScribeLLMClient({
      apiKey: 'test-api-key',
      fetch: fakeFetch,
    });
    const turn = await client.turn({
      system: 'You are the iron scribe.',
      messages: [{ role: 'user', content: 'Explain ferritin.' }],
      tools: [
        {
          name: 'get_node_detail',
          description: 'Fetch a node',
          parameters: z.object({ nodeId: z.string() }),
        },
      ],
      model: 'claude-opus-4-6',
      temperature: 0,
    });

    expect(turn.stopReason).toBe('tool_use');
    expect(turn.text).toBe('Looking this up.');
    expect(turn.toolCalls).toEqual([
      { id: 'toolu_abc', name: 'get_node_detail', input: { nodeId: 'n-1' } },
    ]);
    expect(turn.modelVersion).toBe('claude-opus-4-6-20260101');
    // Usage is read off response.usage and surfaced on the turn (Unit 1).
    expect(turn.inputTokens).toBe(10);
    expect(turn.outputTokens).toBe(20);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces truncated=true when the response stop_reason is max_tokens', async () => {
    const fakeFetch: typeof fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 'msg_2',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-4-6-20260101',
          stop_reason: 'max_tokens',
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 2048 },
          content: [{ type: 'text', text: 'A long answer cut off mid-' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const client = new AnthropicScribeLLMClient({
      apiKey: 'test-api-key',
      fetch: fakeFetch,
    });
    const turn = await client.turn({
      system: 'sys',
      messages: [{ role: 'user', content: 'q' }],
      tools: [],
      model: 'claude-opus-4-6',
      temperature: 0,
    });

    // max_tokens collapses to end_turn for the loop invariant, but the
    // truncated flag is preserved additively.
    expect(turn.stopReason).toBe('end_turn');
    expect(turn.truncated).toBe(true);
  });

  it('forwards the maxTokens override to the SDK request body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const fakeFetch: typeof fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? '{}');
      return new Response(
        JSON.stringify({
          id: 'msg_3',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-4-6-20260101',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: 'text', text: 'ok' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const client = new AnthropicScribeLLMClient({
      apiKey: 'test-api-key',
      fetch: fakeFetch,
    });
    await client.turn({
      system: 'sys',
      messages: [{ role: 'user', content: 'q' }],
      tools: [],
      model: 'claude-opus-4-6',
      temperature: 0,
      maxTokens: 4096,
    });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.max_tokens).toBe(4096);
  });
});
