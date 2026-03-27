# Health Provider Setup

This document is the credential and callback setup checklist for Morning Form's live wearable integrations.

## Base app configuration

Set these locally first:

```env
DATABASE_URL="file:/ABSOLUTE/PATH/TO/morning-form/prisma/dev.db"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Morning Form constructs provider callback URLs from `NEXT_PUBLIC_APP_URL`.

For local development, the callback base is:

```txt
http://localhost:3000/api/health/callback
```

## Callback URLs

Register these exact callback URLs with each provider:

- Whoop: `http://localhost:3000/api/health/callback/whoop`
- Oura: `http://localhost:3000/api/health/callback/oura`
- Fitbit: `http://localhost:3000/api/health/callback/fitbit`
- Google Fit: `http://localhost:3000/api/health/callback/google_fit`

Terra-backed flows:

- Apple Health: routed through Terra widget session, then back into Morning Form
- Garmin: currently routed through Terra widget session, then back into Morning Form

## Support status by provider

### Whoop

Status:

- direct OAuth URL generation: implemented
- authorization code exchange: implemented
- refresh token exchange: implemented
- recovery and sleep mock retrieval: implemented
- production credential entry: required

Env vars:

```env
WHOOP_CLIENT_ID=""
WHOOP_CLIENT_SECRET=""
```

Provider notes:

- register the exact local callback above in the Whoop developer dashboard
- grant scopes needed for recovery, cycles, sleep, workout, profile, and body measurement

## Oura

Status:

- direct OAuth URL generation: implemented
- authorization code exchange: implemented
- refresh token exchange: implemented
- sleep/readiness/activity mock retrieval: implemented
- production credential entry: required

Env vars:

```env
OURA_CLIENT_ID=""
OURA_CLIENT_SECRET=""
```

Provider notes:

- register the local callback in the Oura application settings
- Morning Form expects the standard authorization code flow

## Fitbit

Status:

- direct OAuth URL generation: implemented
- authorization code exchange: implemented
- live exchange uses Basic auth with client id/secret
- sleep retrieval remains mock-mode after connection unless expanded further

Env vars:

```env
FITBIT_CLIENT_ID=""
FITBIT_CLIENT_SECRET=""
```

Provider notes:

- register the Fitbit callback exactly
- confirm the app type and allowed redirect URI in Fitbit's developer console

## Google Fit

Status:

- direct OAuth URL generation: implemented
- authorization code exchange: implemented
- activity/sleep/heart-rate retrieval scaffolding: implemented
- production Google Cloud consent screen and scopes: still required

Env vars:

```env
GOOGLE_FIT_CLIENT_ID=""
GOOGLE_FIT_CLIENT_SECRET=""
```

Provider notes:

- create OAuth client credentials in Google Cloud
- enable Fitness API / relevant scopes
- register the exact callback URI

## Apple Health

Status:

- cannot be completed from the current local web app
- requires a native iOS app using Terra Mobile SDK / HealthKit
- the current web product can store/display Apple Health-backed data later, but it cannot initiate the HealthKit permission flow itself
- production Terra credentials and native app setup are required

Env vars:

```env
TERRA_API_KEY=""
TERRA_DEV_ID=""
TERRA_WEBHOOK_SECRET=""
```

Provider notes:

- Apple Health is not a web-widget integration
- you need an iOS shell app with Terra's iOS / React Native / Flutter mobile SDK
- configure Terra webhook to point to:

```txt
http://localhost:3000/api/health/terra/webhook
```

- for remote environments, update both Terra callback and webhook URLs to the deployed origin

## Garmin

Status:

- current in-app path uses Terra rather than a direct Garmin OAuth 1.0a implementation
- direct Garmin consumer key/secret fields are reserved for a future pass

Env vars:

```env
TERRA_API_KEY=""
TERRA_DEV_ID=""
TERRA_WEBHOOK_SECRET=""
GARMIN_CONSUMER_KEY=""
GARMIN_CONSUMER_SECRET=""
```

Provider notes:

- if we stay with Terra, only Terra credentials matter for the live flow
- if we move to direct Garmin later, we’ll need a separate OAuth 1.0a signing implementation

## Recommended credential rollout order

To reduce debugging surface area, wire providers in this order:

1. Whoop
2. Oura
3. Fitbit
4. Google Fit
5. Terra for Apple Health
6. Terra for Garmin

## How to test each provider locally

1. Add the provider secrets to `.env`
2. Restart `npm run dev`
3. Visit `/settings/integrations`
4. Click `Connect`
5. Complete the provider consent flow
6. Confirm redirect back to `/settings/integrations?status=connected&provider=...`
7. Confirm the provider appears as connected in the UI
8. Optionally hit `POST /api/health/sync` to validate the sync path

## Current limitations

- tokens are persisted, but downstream live sync is still partly mock for some providers
- Terra callback handling is still simplified
- Apple Health and Garmin remain Terra-mediated only
- disconnect currently clears stored tokens but does not notify external providers
- no background refresh scheduler exists yet for expiring access tokens

## Recommended next implementation pass

- add real live data fetch after successful OAuth exchange for each direct provider
- add refresh-token rotation and expiry handling
- add provider-specific sync status and error messages in the UI
- add Terra user mapping from widget session to stored `terraUserId`
- add webhook signature verification and event persistence beyond logging
- build a native iOS wrapper if Apple Health is a true requirement
