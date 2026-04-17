const required = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
};

const optional = {
  TERRA_API_KEY: process.env.TERRA_API_KEY ?? '',
  TERRA_DEV_ID: process.env.TERRA_DEV_ID ?? '',
  TERRA_WEBHOOK_SECRET: process.env.TERRA_WEBHOOK_SECRET ?? '',
  WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID ?? '',
  WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET ?? '',
  OURA_CLIENT_ID: process.env.OURA_CLIENT_ID ?? '',
  OURA_CLIENT_SECRET: process.env.OURA_CLIENT_SECRET ?? '',
  FITBIT_CLIENT_ID: process.env.FITBIT_CLIENT_ID ?? '',
  FITBIT_CLIENT_SECRET: process.env.FITBIT_CLIENT_SECRET ?? '',
  GARMIN_CONSUMER_KEY: process.env.GARMIN_CONSUMER_KEY ?? '',
  GARMIN_CONSUMER_SECRET: process.env.GARMIN_CONSUMER_SECRET ?? '',
  GOOGLE_FIT_CLIENT_ID: process.env.GOOGLE_FIT_CLIENT_ID ?? '',
  GOOGLE_FIT_CLIENT_SECRET: process.env.GOOGLE_FIT_CLIENT_SECRET ?? '',
  // Secret used to derive the AES-GCM key that encrypts stored provider
  // tokens (Libre, and anything else that persists bearer tokens). Required
  // in production; a deterministic dev fallback is used otherwise.
  HEALTH_TOKEN_ENCRYPTION_KEY: process.env.HEALTH_TOKEN_ENCRYPTION_KEY ?? '',
  LIBRE_ENABLED: process.env.LIBRE_ENABLED ?? '',
  // LLM (Anthropic) — required in production. MOCK_LLM=true forces canned
  // responses in dev/test so callers don't need to stub the SDK.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  MOCK_LLM: process.env.MOCK_LLM ?? '',
  // Auth (U0a + U0b). SESSION_SECRET hashes cookie tokens and magic-link
  // tokens — rotating it invalidates every live session + unconsumed link.
  // RESEND_API_KEY sends magic-link emails (EU region, UK-GDPR posture).
  // RESEND_FROM is the verified from-address once DNS lands; falls back to
  // onboarding@resend.dev in dev.
  SESSION_SECRET: process.env.SESSION_SECRET ?? '',
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  RESEND_FROM: process.env.RESEND_FROM ?? 'onboarding@resend.dev',
};

export const env = {
  ...required,
  ...optional,
};

/**
 * Fail-closed startup check for production-only required secrets.
 *
 * Called from server-side entry points (middleware, route handlers) on first
 * import. In dev/test it no-ops — the magic-link + session code paths fall
 * back to deterministic dev-only behaviour so the flow stays exercisable.
 *
 * Rotating SESSION_SECRET in prod invalidates every outstanding session and
 * unconsumed magic-link token — that's the intended kill-switch.
 */
export function assertAuthEnv(): void {
  if (env.NODE_ENV !== 'production') return;
  const missing: string[] = [];
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET (>=32 chars)');
  if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (missing.length) {
    throw new Error(`[env] Missing required auth secrets in production: ${missing.join(', ')}`);
  }
}

/**
 * Dev-only fallback secret. Deterministic across restarts so tokens issued
 * in one dev run still verify in the next. Never used in production — the
 * `assertAuthEnv()` guard above refuses boot if SESSION_SECRET is unset.
 */
export function getSessionSecret(): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.NODE_ENV === 'production') {
    throw new Error('[env] SESSION_SECRET is required in production');
  }
  return 'dev-only-session-secret-not-for-prod-use-0123456789abcdef';
}
