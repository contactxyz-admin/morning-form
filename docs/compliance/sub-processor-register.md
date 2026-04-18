# Sub-processor Register

**Status:** living document. Update when adding, removing, or changing any third
party that processes Morning Form user data under contract.

Committed source of truth for the sub-processors named on
`/settings/privacy`. The UI list in
`src/components/ui/sub-processor-list.tsx` must mirror this file — if the two
disagree, this file wins and the UI is out of compliance.

See `docs/compliance/dpia.md` for the launch-gate Data Protection Impact
Assessment that authorises these transfers.

---

## Anthropic PBC

- **Purpose:** LLM inference — generating topic-page interpretations, protocol
  drafts, and shared-view summaries from graph nodes authored by the user.
- **Jurisdiction:** United States (processing on Anthropic infrastructure).
- **Data categories:** Special-category health data (lab values, symptoms,
  conditions, medications, free-text intake) keyed by opaque `user_id` only.
  No direct identifiers (email, name) transit to Anthropic.
- **Transfer mechanism:** UK–US Data Bridge adequacy decision (primary);
  Standard Contractual Clauses (SCCs) as fallback if the adequacy decision is
  withdrawn.
- **Contractual protections:** Executed Data Processing Agreement specifying
  zero-retention tier, no training on customer data, and breach notification
  terms.
- **DPA artifact gate:** `docs/legal/anthropic-dpa-signed.pdf`; sha256 asserted
  against `ANTHROPIC_DPA_SHA256` at boot (U2). The app refuses to boot in
  production if the file is missing or the hash mismatches.
- **Consent:** Named explicitly on the onboarding consent screen and on
  `/settings/privacy`. Users can withdraw consent to LLM processing at any
  time by contacting `privacy@morningform.health`.

## Terra API (Tryterra Inc.)

- **Purpose:** Wearable and health-device integrations — normalising data from
  Apple Health, Garmin, Oura, WHOOP, Fitbit, and similar providers into a
  single ingest stream.
- **Jurisdiction:** United States.
- **Data categories:** Device-derived health signals (sleep, HRV, steps,
  workouts, body composition). No free-text health content.
- **Transfer mechanism:** Standard Contractual Clauses.
- **Contractual protections:** Executed DPA; Terra acts as sub-processor to
  Morning Form and does not re-use data for its own purposes.

## Resend

- **Purpose:** Transactional email — magic-link sign-in, protocol reminders,
  and data-subject-request acknowledgements.
- **Jurisdiction:** United States.
- **Data categories:** Email address and message content. No health data
  content transits Resend.
- **Transfer mechanism:** Standard Contractual Clauses.

## Vercel

- **Purpose:** Application hosting — serves the Next.js app and terminates
  user sessions. Edge/CDN caching of static assets only; no health data is
  cached.
- **Jurisdiction:** United States (primary region: `iad1`).
- **Data categories:** HTTP request metadata (IP, user agent) for routing
  and abuse prevention; transient in-memory handling of authenticated
  requests.
- **Transfer mechanism:** Standard Contractual Clauses.

## Neon

- **Purpose:** Managed Postgres — primary durable store for all application
  data.
- **Jurisdiction:** Data region pinned to `eu-west-2` (London) for UK-resident
  users; US region reserved for future expansion.
- **Data categories:** All persisted application data, including
  special-category health data.
- **Transfer mechanism:** N/A for UK-resident data (EU processing). SCCs
  apply to any operational access by Neon support staff from outside the UK.

---

## Change log

| Date       | Change                                      | Actor    |
|------------|---------------------------------------------|----------|
| 2026-04-17 | Initial register committed alongside U18.   | Morning Form eng |
