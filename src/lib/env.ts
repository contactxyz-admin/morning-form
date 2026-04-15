const required = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
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
};

export const env = {
  ...required,
  ...optional,
};
