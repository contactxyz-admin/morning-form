import { afterEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  OPS_EMAIL: '',
  NODE_ENV: 'test',
  RESEND_API_KEY: '',
  RESEND_FROM: 'onboarding@resend.dev',
};

vi.mock('@/lib/env', () => ({
  get env() {
    return envMock;
  },
}));

const sendEmailMock = vi.fn().mockResolvedValue({ sent: true });
vi.mock('@/lib/auth/email', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

import {
  buildMemberEscalationEmail,
  buildOpsEscalationNotice,
  sendOpsEscalationNotice,
} from './escalation-email';

afterEach(() => {
  sendEmailMock.mockClear();
  envMock.OPS_EMAIL = '';
});

describe('buildMemberEscalationEmail', () => {
  it('contains the sign-in link, greeting, and the not-a-diagnosis framing', () => {
    const { subject, text } = buildMemberEscalationEmail({ name: 'Jo' });
    expect(subject).toContain('GP conversation');
    expect(text).toContain('Hi Jo,');
    expect(text).toContain('http://localhost:3000/record?ref=clinician-escalation');
    expect(text).toContain('not a diagnosis');
  });

  it('never contains marker names, values, or alarm language', () => {
    const { subject, text } = buildMemberEscalationEmail({ name: null });
    const combined = `${subject}\n${text}`.toLowerCase();
    // Email is an unencrypted channel — no clinical specifics may appear,
    // and the calm-register rule bans alarm words outright.
    for (const banned of ['urgent', 'critical', 'immediately', 'emergency', 'ferritin', 'abnormal']) {
      expect(combined).not.toContain(banned);
    }
    expect(text).toContain('Hi,');
  });
});

describe('ops escalation notice', () => {
  it('is reference-only: review-id prefix, no member identity', () => {
    const { subject, text } = buildOpsEscalationNotice({ reviewId: 'abcdefgh12345678' });
    expect(subject).toContain('abcdefgh');
    expect(subject).not.toContain('12345678');
    expect(text).not.toMatch(/@(?!morning)/); // no email addresses in the body
  });

  it('skips (never throws) when OPS_EMAIL is unset in dev', async () => {
    await expect(sendOpsEscalationNotice({ reviewId: 'abc' })).resolves.toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('sends to OPS_EMAIL when configured', async () => {
    envMock.OPS_EMAIL = 'ops@morningform.com';
    await sendOpsEscalationNotice({ reviewId: 'abcdefgh' });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect((sendEmailMock.mock.calls[0][0] as { to: string }).to).toBe('ops@morningform.com');
  });
});
