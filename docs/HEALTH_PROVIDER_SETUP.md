# Health Provider Setup

This document is the credential and callback setup checklist for Morning Form's live wearable integrations.

## Strategic direction after Terra pricing review

Morning Form is not provisioning Terra as the default long-term wearable aggregation layer. Terra-backed Garmin was merged as a functional scaffold, but new work should follow the direct-provider plan in `docs/plans/2026-06-02-002-feat-direct-health-provider-platform-plan.md`.

For Garmin, prepare the official Garmin Connect Developer Program application in `docs/runbooks/garmin-connect-developer-program-application.md`. Do not build against private Garmin Connect endpoints or scrape consumer sessions.

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

Register these exact callback URLs with each web OAuth provider:

- Whoop: `http://localhost:3000/api/health/callback/whoop`
- Oura: `http://localhost:3000/api/health/callback/oura`
- Fitbit: `http://localhost:3000/api/health/callback/fitbit`
- Google Fit: `http://localhost:3000/api/health/callback/google_fit`

No web callback is active today for:

- Apple Health: native iPhone app / HealthKit upload path only
- Garmin: direct Garmin access pending Garmin Connect Developer Program approval

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
- requires a native iOS app using HealthKit
- the current web product can store/display Apple Health-backed data from the native upload endpoint, but it cannot initiate the HealthKit permission flow itself
- the web `Connect` action returns `provider_native_required`

Env vars:

```env
# No Apple Health web OAuth credentials are required.
```

Provider notes:

- Apple Health is not a web-widget integration
- use the native upload endpoint after HealthKit authorization:

```txt
POST http://localhost:3000/api/health/apple-health
```

- for remote environments, replace `http://localhost:3000` with the deployed `NEXT_PUBLIC_APP_URL`
- do not provision Terra for Apple Health unless a future plan explicitly reopens aggregator evaluation

## Garmin

Status:

- direct access is pending Garmin Connect Developer Program approval
- the web `Connect` action returns `provider_application_required`
- manual sync refuses connected Garmin rows with `provider_application_required`
- old Terra-backed code remains as dormant scaffold only; do not configure it as the active product path
- consumer scraping and private Garmin Connect endpoints are out of scope

Env vars:

```env
# No Garmin credentials are required until Garmin approves the application.
```

Provider notes:

- prepare and submit the Garmin application packet in `docs/runbooks/garmin-connect-developer-program-application.md`
- add Garmin credentials, callback URLs, deauthorization handling, webhook handling, token lifecycle, and parsers only after approval
- keep the direct-provider plan in `docs/plans/2026-06-02-002-feat-direct-health-provider-platform-plan.md` as the source of truth
- do not set `TERRA_API_KEY`, `TERRA_DEV_ID`, or `TERRA_WEBHOOK_SECRET` for Garmin rollout

## Recommended credential rollout order

To reduce debugging surface area, wire providers in this order:

1. Whoop
2. Oura
3. Fitbit
4. Dexcom
5. FreeStyle Libre
6. Google Fit only if legacy demand justifies it
7. Apple Health native iPhone upload
8. Garmin direct integration after approval

## How to test each provider locally

1. Add the provider secrets to `.env`
2. Restart `npm run dev`
3. Visit `/settings/integrations`
4. Click `Connect`
5. Complete the provider consent flow
6. Confirm redirect back to `/settings/integrations?status=connected&provider=...`
7. Confirm the provider appears as connected in the UI
8. Optionally hit `POST /api/health/sync` to validate the sync path

For Apple Health, test through `POST /api/health/apple-health` or the native app wrapper rather than `/api/health/connect`.

For Garmin, verify the web app shows `Access pending` and that `POST /api/health/sync` returns `provider_application_required` for any old connected Garmin row.

## Current limitations

- tokens are persisted, but downstream live sync is still partly mock for some providers
- Apple Health still requires a native app for HealthKit authorization and upload
- Garmin direct access remains deferred until developer-program approval
- Terra-backed Garmin/Apple scaffold is dormant and not part of the active rollout
- no background refresh scheduler exists yet for expiring access tokens

## Recommended next implementation pass

- add real live data fetch after successful OAuth exchange for each direct provider
- add refresh-token rotation and expiry handling
- add provider-specific sync status and error messages in the UI
- build and ship the native iOS wrapper if Apple Health is a true requirement
- complete the Garmin developer-program application and implement the approved direct API path
- add first-class workout/sleep entities and graph source documents for wearable windows
