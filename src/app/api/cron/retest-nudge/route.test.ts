import { afterEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the (hoisted) vi.mock factories can reference them.
const { envMock, runRetestNudgesMock } = vi.hoisted(() => ({
  envMock: {
    RETEST_LOOP_ENABLED: 'true',
    CRON_SECRET: 'x'.repeat(32),
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  } as Record<string, string>,
  runRetestNudgesMock: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/retest/nudge', () => ({
  runRetestNudges: (...args: unknown[]) => runRetestNudgesMock(...args),
}));
vi.mock('@/lib/retest/nudge-email', () => ({ sendRetestNudgeEmail: vi.fn() }));

import { GET } from './route';

const SECRET = 'x'.repeat(32);

function req(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/retest-nudge', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

afterEach(() => {
  runRetestNudgesMock.mockReset();
  envMock.RETEST_LOOP_ENABLED = 'true';
  envMock.CRON_SECRET = SECRET;
});

describe('GET /api/cron/retest-nudge', () => {
  it('404 when the flag is off (does not run the sweep)', async () => {
    envMock.RETEST_LOOP_ENABLED = '';
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(404);
    expect(runRetestNudgesMock).not.toHaveBeenCalled();
  });

  it('401 when the bearer is missing or wrong', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer nope'))).status).toBe(401);
    expect(runRetestNudgesMock).not.toHaveBeenCalled();
  });

  it('401 when CRON_SECRET is unset (fails closed, even with a Bearer header)', async () => {
    envMock.CRON_SECRET = '';
    const res = await GET(req('Bearer '));
    expect(res.status).toBe(401);
    expect(runRetestNudgesMock).not.toHaveBeenCalled();
  });

  it('200 + run summary when authed', async () => {
    runRetestNudgesMock.mockResolvedValue({
      considered: 2,
      sent: 1,
      lapsed: 1,
      skipped: 0,
      optedOut: 0,
      errors: 0,
    });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sent: 1, lapsed: 1, considered: 2 });
    expect(runRetestNudgesMock).toHaveBeenCalledTimes(1);
  });
});
