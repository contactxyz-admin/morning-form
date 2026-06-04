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
  constructor(message = 'resend api key invalid', public details?: string) {
    super(`${message}${details ? `: ${details}` : ''}`);
    this.name = 'ResendAuthError';
  }
}
export class ResendSenderError extends Error {
  constructor(public details?: string) {
    super(`resend sender/domain not authorized${details ? `: ${details}` : ''}`);
    this.name = 'ResendSenderError';
  }
}
export class ResendRateLimitError extends Error {
  constructor(public retryAfterSeconds?: number) {
    super('resend rate limited');
    this.name = 'ResendRateLimitError';
  }
}
export class ResendTransientError extends Error {
  constructor(public status: number, public details?: string) {
    super(`resend transient error: ${status}${details ? ` — ${details}` : ''}`);
    this.name = 'ResendTransientError';
  }
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML alternative. When omitted, only the text part is sent. */
  html?: string;
}

export interface SendEmailResult {
  /** True when an actual HTTP call was made to Resend. False in dev-bypass mode. */
  sent: boolean;
}

/**
 * Generic Resend sender. The single place that talks to Resend so every
 * outbound email (magic link, export notice, export download link, deletion
 * confirmation) shares the same env guards, dev/test console-log bypass,
 * EU-residency endpoint, retry/backoff, and typed error mapping.
 *
 * Dev/test bypass: when RESEND_API_KEY is unset and NODE_ENV !== 'production',
 * the email is logged to stdout and `{ sent: false }` is returned. This is
 * what makes auth + GDPR flows exercisable without external credentials —
 * but it also means the "owner notice" control is only real where the key is
 * set (callers must treat `sent: false` accordingly).
 */
export async function sendEmail({ to, subject, text, html }: SendEmailArgs): Promise<SendEmailResult> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'production') {
      throw new ResendAuthError('RESEND_API_KEY required in production');
    }
    // Dev/test bypass — emit the message so a human or test can inspect it.
    console.log(`[email] dev email to ${to} — ${subject}\n${text}`);
    return { sent: false };
  }
  if (!env.RESEND_FROM) {
    throw new ResendAuthError('RESEND_FROM required');
  }

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
      ...(html ? { html } : {}),
    }),
  });

  if (response.status === 401) {
    const body = await response.text().catch(() => '');
    throw new ResendAuthError('resend api key invalid', summarizeResendError(body));
  }
  if (response.status === 403) {
    const body = await response.text().catch(() => '');
    throw new ResendSenderError(summarizeResendError(body));
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ResendTransientError(response.status, summarizeResendError(body));
  }
  return { sent: true };
}

export interface SendMagicLinkArgs {
  to: string;
  verifyUrl: string;
}

export type SendMagicLinkResult = SendEmailResult;

export async function sendMagicLinkEmail({ to, verifyUrl }: SendMagicLinkArgs): Promise<SendMagicLinkResult> {
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

  return sendEmail({ to, subject, text, html });
}

function summarizeResendError(body: string): string | undefined {
  const trimmed = body.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.length > 500 ? `${trimmed.slice(0, 497)}...` : trimmed;
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
