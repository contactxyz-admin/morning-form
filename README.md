# Morning Form

Morning Form is a premium mobile-first state-optimization web app covering assessment, profile generation, protocol recommendation, daily guidance, check-ins, insights, and wearable integrations.

## Local development

```bash
cd /Users/reubenselby/Desktop/morning-form
npm install
npx prisma db push
npm run db:seed
npm run dev
```

App URL:

```txt
http://localhost:3000
```

Demo user seeded locally:

```txt
demo@morningform.com
```

## Current branch workflow

- `main`: built MVP
- `feat/real-health-oauth`: review branch for real provider connection wiring

Open PR:

```txt
https://github.com/contactxyz-admin/morning-form/pull/1
```

## Health integrations

Morning Form currently supports:

- Terra-backed Apple Health and Garmin connection flow
- Direct OAuth scaffolding for Whoop, Oura, Fitbit, and Google Fit
- persisted provider connections via Prisma
- callback routes and token exchange when credentials are configured
- graceful mock fallback when credentials are absent

Detailed provider setup lives in:

[`docs/HEALTH_PROVIDER_SETUP.md`](/Users/reubenselby/Desktop/morning-form/docs/HEALTH_PROVIDER_SETUP.md)

