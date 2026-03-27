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
};

export const env = {
  ...required,
  ...optional,
};
