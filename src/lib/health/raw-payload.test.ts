import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Prisma client so we can assert against it without touching SQLite.
const createMock = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    rawProviderPayload: {
      create: (args: unknown) => createMock(args),
    },
  },
}));

import { captureRawPayload } from './raw-payload';

beforeEach(() => {
  createMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('captureRawPayload', () => {
  it('is a no-op in test mode (does NOT touch Prisma)', async () => {
    expect(process.env.VITEST).toBeTruthy();
    await captureRawPayload({
      userId: 'u1',
      provider: 'whoop',
      source: 'pull',
      payload: { hello: 'world' },
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  describe('outside test mode', () => {
    beforeEach(() => {
      // Force the helper out of its test no-op branch so we can exercise the
      // production write path inside the test runner.
      vi.stubEnv('VITEST', '');
      vi.stubEnv('NODE_ENV', 'development');
    });

    it('writes one row with canonical JSON + matching sizeBytes', async () => {
      createMock.mockResolvedValueOnce({});
      const payload = { stage: 'recovery', score: 74 };
      const json = JSON.stringify(payload);

      await captureRawPayload({
        userId: 'u1',
        provider: 'whoop',
        source: 'pull',
        payload,
        traceId: 'trace-123',
      });

      expect(createMock).toHaveBeenCalledTimes(1);
      const arg = createMock.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(arg.data).toEqual({
        userId: 'u1',
        provider: 'whoop',
        source: 'pull',
        payload: json,
        sizeBytes: Buffer.byteLength(json, 'utf8'),
        traceId: 'trace-123',
      });
    });

    it('serializes null payloads instead of throwing', async () => {
      createMock.mockResolvedValueOnce({});
      await captureRawPayload({ userId: 'u1', provider: 'libre', source: 'pull', payload: null });
      const arg = createMock.mock.calls[0][0] as { data: { payload: string; sizeBytes: number } };
      expect(arg.data.payload).toBe('null');
      expect(arg.data.sizeBytes).toBe(4);
    });

    it('swallows DB errors so sync is never broken by a capture failure', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      createMock.mockRejectedValueOnce(new Error('db down'));

      await expect(
        captureRawPayload({ userId: 'u1', provider: 'whoop', source: 'pull', payload: {} }),
      ).resolves.toBeUndefined();

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
