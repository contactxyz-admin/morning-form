/**
 * `chat-stream` SSE parser tests.
 *
 * The hook is thin React wiring; the parser is where the bugs hide —
 * partial frames across chunks, multiple data lines per frame, malformed
 * JSON, end-of-stream flushing. These tests pin that behaviour so the
 * UI can rely on a stable event stream.
 */
import { describe, expect, it } from 'vitest';
import { readChatStream, takeCompleteFrames } from './chat-stream';

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function collect<T>(gen: AsyncGenerator<T, void, void>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe('takeCompleteFrames', () => {
  it('parses a single complete frame', () => {
    const { events, remaining } = takeCompleteFrames(
      frame('routed', { topicKey: 'iron', confidence: 0.9, reasoning: 'r' }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('routed');
    expect(remaining).toBe('');
  });

  it('parses multiple complete frames in one buffer', () => {
    const buf =
      frame('routed', { topicKey: 'iron', confidence: 0.9, reasoning: 'r' }) +
      frame('token', { text: 'hello' }) +
      frame('token', { text: ' world' });
    const { events, remaining } = takeCompleteFrames(buf);
    expect(events.map((e) => e.event)).toEqual(['routed', 'token', 'token']);
    expect(remaining).toBe('');
  });

  it('leaves an incomplete trailing frame in `remaining`', () => {
    const full = frame('token', { text: 'a' });
    const partial = 'event: token\ndata: {"text":'; // no \n\n yet
    const { events, remaining } = takeCompleteFrames(full + partial);
    expect(events).toHaveLength(1);
    expect(remaining).toBe(partial);
  });

  it('joins multi-line data payloads per SSE spec', () => {
    const raw = 'event: token\ndata: {"text":\ndata: "hi"}\n\n';
    const { events } = takeCompleteFrames(raw);
    expect(events).toHaveLength(1);
    expect((events[0].data as { text: string }).text).toBe('hi');
  });

  it('skips a frame with malformed JSON rather than throwing', () => {
    const buf =
      'event: token\ndata: {not-json\n\n' +
      frame('done', { classification: 'clinical-safe', output: 'ok', citations: [], topicKey: 'iron', assistantMessageId: 'x' });
    const { events } = takeCompleteFrames(buf);
    expect(events.map((e) => e.event)).toEqual(['done']);
  });

  it('skips a frame missing the event: line', () => {
    const buf =
      'data: {"text":"orphan"}\n\n' +
      frame('token', { text: 'real' });
    const { events } = takeCompleteFrames(buf);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('token');
  });
});

describe('readChatStream', () => {
  it('yields all events in order for a happy-path routed → token* → done stream', async () => {
    const res = responseFromChunks([
      frame('routed', { topicKey: 'iron', confidence: 0.9, reasoning: 'ferritin' }),
      frame('token', { text: 'Your ' }),
      frame('token', { text: 'ferritin' }),
      frame('done', {
        classification: 'clinical-safe',
        output: 'Your ferritin',
        citations: [],
        topicKey: 'iron',
        assistantMessageId: 'm1',
      }),
    ]);
    const events = await collect(readChatStream(res));
    expect(events.map((e) => e.event)).toEqual([
      'routed',
      'token',
      'token',
      'done',
    ]);
  });

  it('reassembles a frame split across chunk boundaries', async () => {
    const full = frame('token', { text: 'hello' });
    // Cut the single frame in half so the first chunk ends mid-JSON.
    const mid = Math.floor(full.length / 2);
    const res = responseFromChunks([full.slice(0, mid), full.slice(mid)]);
    const events = await collect(readChatStream(res));
    expect(events).toHaveLength(1);
    expect((events[0].data as { text: string }).text).toBe('hello');
  });

  it('surfaces `error` events alongside other events in order', async () => {
    const res = responseFromChunks([
      frame('routed', { topicKey: 'iron', confidence: 0.9, reasoning: 'r' }),
      frame('error', { message: 'upstream timeout' }),
    ]);
    const events = await collect(readChatStream(res));
    expect(events.map((e) => e.event)).toEqual(['routed', 'error']);
    expect((events[1].data as { message: string }).message).toBe('upstream timeout');
  });

  it('yields nothing for a response with no body', async () => {
    const res = new Response(null, { status: 204 });
    const events = await collect(readChatStream(res));
    expect(events).toEqual([]);
  });
});
