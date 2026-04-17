/**
 * Resend client for magic-link email delivery.
 *
 * In production, requires RESEND_API_KEY (guarded by assertAuthEnv()) and
 * sends via the Resend EU endpoint for UK-GDPR data residency posture. In
 * dev/test, if RESEND_API_KEY is unset, the link is logged to stdout and
 * the send is treated as a success — this is what makes the dev sign-in
 * flow exercisable without external credentials.
 *
 * Patterns follow src/lib/health/libre.ts: typed errors + fetchWithRetry
 * with exponential backoff and jitter.
 */

import { env } from '@/lib/env';

const RESEND_URL = 'https://api.resend.com/emails';

export class ResendAuthError extends Error {
  constructor(message = 'resend api key invalid') {
    super(message);
    this.name = 'ResendAuthError';
  }
}
export class ResendRateLimitError extends Error {
  constructor(public retryAfterSeconds?: number) {
    super('resend rate limited');
    this.name = 'ResendRateLimitError';
  }
}
export class ResendTransientError extends Error {
  constructor(public status: number) {
    super(`resend transient error: ${status}`);
    this.name = 'ResendTransientError';
  }
}

export interface SendMagicLinkArgs {
  to: string;
  verifyUrl: string;
}

export interface SendMagicLinkResult {
  /** True when an actual HTTP call was made to Resend. False in dev-bypass mode. */
  sent: boolean;
}

export async function sendMagicLinkEmail({ to, verifyUrl }: SendMagicLinkArgs): Promise<SendMagicLinkResult> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'production') {
      throw new ResendAuthError('RESEND_API_KEY required in production');
    }
    // Dev/test bypass — emit the link so a human or test can follow it.
    console.log(`[auth] dev magic-link for ${to}: ${verifyUrl}`);
    return { sent: false };
  }

  const subject = 'Sign in to MorningForm';
  const text = [
    'Click the link below to sign in to MorningForm. The link expires in 15 minutes.',
    '',
    verifyUrl,
    '',
    "If you didn't request this, you can safely ignore this email.",
  ].join('\n');
  const html = `<p>Click the link below to sign in to MorningForm. The link expires in 15 minutes.</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>
<p style="color:#6b6b6b;font-size:13px">If you didn't request this, you can safely ignore this email.</p>`;

  const response = await fetchWithRetry(RESEND_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new ResendAuthError();
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ResendTransientError(response.status);
  }
  return { sent: true };
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const maxAttempts = 3;
  let lastResponse: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    lastResponse = response;
    if (response.status === 429) {
      if (attempt === maxAttempts) {
        const retryAfter = Number(response.headers.get('retry-after')) || undefined;
        throw new ResendRateLimitError(retryAfter);
      }
      await backoff(attempt);
      continue;
    }
    if (response.status >= 500 && response.status < 600) {
      if (attempt === maxAttempts) return response;
      await backoff(attempt);
      continue;
    }
    return response;
  }
  return lastResponse!;
}

function backoff(attempt: number): Promise<void> {
  const base = 200 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * base);
  return new Promise((r) => setTimeout(r, base + jitter));
}
