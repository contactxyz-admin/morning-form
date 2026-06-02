# Garmin Connect Developer Program Application Packet

This runbook prepares Morning Form's Garmin direct-access application. It should be completed by the operator before submitting through Garmin's contact/application flow.

Official references:

- Garmin Health API: https://developer.garmin.com/gc-developer-program/health-api/
- Garmin Connect Developer Program FAQ: https://developer.garmin.com/gc-developer-program/program-faq/
- Garmin to Apple Health support note: https://support.garmin.com/en-US/?faq=lK5FPB9iPF5PXFkIpFlFPA
- Garmin to Health Connect support note: https://support.garmin.com/en-US/?faq=JToBEy0jfe6pIygark2Ui5

## Known Garmin Facts

- The Garmin Connect Developer Program is for business use.
- The APIs use OAuth 2.0.
- Garmin says application status is usually confirmed within two business days.
- Garmin says a typical integration takes one to four weeks after approval.
- Garmin says there are no general licensing or maintenance fees for program access, but some metrics or commercial use may require a license fee payment or minimum device order quantity.
- Health API includes all-day health data such as steps, heart rate, sleep, stress, Pulse Ox, Body Battery, body composition, respiration, and blood pressure.
- Garmin supports push or ping/pull style architectures after user consent and device sync to Garmin Connect.

## Submission Positioning

Use this framing unless the business model changes:

> Morning Form is a consumer health intelligence product that helps users combine wearable data, self-reported symptoms, and health records into a longitudinal personal health picture. We are requesting read-only, user-consented access to Garmin health data so users can bring their Garmin sleep, activity, heart, recovery, stress, and related wellness data into their Morning Form account. We will use the data to produce personal insights, health-history summaries, and user-facing trends. We will not sell user data, and users can disconnect Garmin and request deletion.

## Requested APIs

### Required for v1

- Garmin Health API

Requested data families:

- steps
- calories
- sleep and sleep stages
- heart rate
- respiration
- stress
- Pulse Ox when available
- Body Battery when available
- body composition and weight when available
- blood pressure when available

### Likely follow-up

- Garmin Activity API, if Garmin Health API does not cover workout detail, training-load inputs, or activity-level heart-rate detail needed by Morning Form.

Do not request Training API unless we plan to write training plans to Garmin devices. Current Morning Form scope is read-only ingestion.

## Architecture To Describe

Morning Form will operate a server-side integration:

1. User clicks "Connect Garmin" inside Morning Form.
2. Morning Form redirects the user through Garmin OAuth 2.0.
3. Garmin redirects back to Morning Form's callback URL.
4. Morning Form stores encrypted tokens or provider identifiers server-side.
5. Morning Form receives Garmin push events or notification events, depending on the approved integration mode.
6. Morning Form stores raw Garmin payloads for audit/debugging before normalizing into canonical health metrics.
7. Morning Form displays user-facing trends and insights.
8. User can disconnect Garmin from Morning Form; Morning Form clears local credentials and follows Garmin deauthorization requirements.

Morning Form will not access Garmin through private consumer endpoints or screen scraping.

## Security And Privacy Posture

Use these points in the application or follow-up call:

- user-consented access only
- least-privilege read scopes
- encrypted credential storage
- signed webhook verification where Garmin supports signatures
- raw payload retention for debugging and audit, scoped to the user's account
- disconnect/deletion path honored in Morning Form
- no sale of health data
- production logs should not include raw tokens or secrets
- data is used for personal health insights, summaries, and longitudinal trends

## URLs To Prepare

Fill these before submission:

- Production app URL: `TODO`
- Privacy policy URL: `TODO`
- Terms URL: `TODO`
- Support email: `TODO`
- OAuth callback URL: `TODO`, likely `https://<production-origin>/api/health/callback/garmin`
- Webhook URL: `TODO`, likely `https://<production-origin>/api/health/garmin/webhook`

## Business Answers Needed

Garmin may ask for these. Fill them before submitting.

- Legal entity name: `TODO`
- Trading/product name: `Morning Form`
- Company website: `TODO`
- Company country: `TODO`
- Primary contact name/email: `TODO`
- Business category: `consumer health insights / wellness / patient monitoring adjacent`
- Expected launch geography: `TODO`
- Expected first-year Garmin-connected users: `TODO`
- Expected first-year Garmin devices, if devices are distributed or recommended: `TODO`
- Whether Morning Form will purchase/resell Garmin devices: `No, unless business chooses otherwise`
- Whether data is for individual user insights, clinician review, corporate wellness, research, or another use case: `TODO`
- Whether minors are supported: `TODO`
- Whether Morning Form needs historical backfill: `Yes, date-windowed historical import is required for onboarding context`
- Whether Morning Form needs continuous updates: `Yes, via Garmin-supported push or ping/pull`

## Engineering Answers Needed After Approval

Do not code these as facts until Garmin gives portal documentation or sample payloads:

- exact OAuth authorization URL
- exact token URL
- required redirect URI format
- scopes or product permissions
- webhook signature scheme, if any
- ping/pull endpoint shape
- payload schemas for Health API summaries
- deauthorization/disconnect requirements
- backfill limits and rate limits
- sandbox/evaluation environment URLs

## Internal Follow-Up Once Approved

1. Store Garmin portal docs or sample payloads in a private, non-repo location if they are confidential.
2. Create sanitized fixtures for tests under `src/lib/health/__fixtures__/garmin/`.
3. Implement `src/lib/health/garmin.ts` against official evaluation endpoints.
4. Add `src/app/api/health/garmin/webhook/route.ts` if Garmin uses push or notification events.
5. Replace Garmin's access status from `application_required` to `available` only after end-to-end sandbox verification.

