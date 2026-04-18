# Data Protection Impact Assessment — Morning Form v1

**Status:** DRAFT — launch gate. Must be approved by DPO/legal before any v1
production traffic.
**Version:** 0.1
**Owner:** Morning Form engineering + legal
**Last updated:** 2026-04-17

This DPIA covers the v1 launch of Morning Form: a personal health-record
service that ingests intake answers, lab results, wearable data, and free-text
check-ins, then uses LLM inference to produce topic-page interpretations,
protocol drafts, and shareable summaries. Processing is Article 9 special
category (health) under UK-GDPR.

Template sections follow ICO guidance. Presence of each section is enforced
by repo structure; content is filled in and sign-off captured before launch.

---

## 1. Nature, scope, context, and purposes

### 1.1 Nature of processing

- **Collection:** intake questionnaire, uploaded lab reports (OCR + parse),
  wearable sync via Terra, free-text daily check-ins.
- **Storage:** Neon Postgres (EU-West-2), encrypted at rest, durable.
- **Use:** compilation of per-topic pages, protocol drafts, GP-prep summaries;
  shareable read-only views by token.
- **Disclosure:** LLM sub-processor (Anthropic PBC, US) under zero-retention
  DPA; shared-view recipients chosen explicitly by the data subject.
- **Retention:** indefinite by default while the account is active; deletion
  on user request cascades across all data (SharedView, GraphNodeLayout,
  SourceDocument, graph nodes, auth records).
- **Erasure:** user-initiated delete (Settings → Data → Delete account)
  hard-deletes all rows; confirmed by unit tests on `deleteUserData`.

### 1.2 Scope

- **Data categories:** email, display name, date of birth, sex at birth, lab
  values, symptoms, conditions, medications, lifestyle factors, wearable
  signals (sleep, HRV, steps, workouts), free-text check-ins, uploaded
  document images.
- **Special categories:** all health data above — Article 9 UK-GDPR.
- **Geography:** UK-resident users at launch. US sub-processors (Anthropic,
  Terra, Resend, Vercel) under UK–US Data Bridge / SCCs.
- **Volume:** low-thousands of accounts at launch; single-digit GB of durable
  data.
- **Duration:** as long as the account remains active; lifetime for the
  persistent health record by design.

### 1.3 Context

- **Relationship with data subjects:** direct B2C. Users sign up voluntarily
  and can delete at any time.
- **Reasonable expectations:** users expect Morning Form to help them make
  sense of their own health data and generate shareable summaries for
  clinicians. They would not expect their data to train third-party AI models
  (mitigated by the Anthropic zero-retention / no-training DPA).
- **Children:** service is 18+; age gate at signup.
- **Prior concerns:** none on record at v1.

### 1.4 Purposes

- **Primary:** help users understand their own health data and prepare for
  clinical conversations.
- **Secondary:** longitudinal trend tracking across intake, labs, and
  wearables.
- **NOT:** medical diagnosis or device, drug recommendations, or advertising.
  Regulatory copy at `src/components/ui/disclaimer.tsx` states this
  explicitly on every generated page.

### 1.5 Legal basis

- **Processing:** Article 6(1)(b) — performance of contract (the user asks us
  to interpret their health data).
- **Special-category processing:** Article 9(2)(a) — explicit consent,
  captured on the onboarding consent screen with timestamp, and withdrawable
  at any time (Settings → Privacy).
- **Cross-border transfer to Anthropic (US):** UK–US Data Bridge adequacy
  decision (primary); SCCs as fallback.

---

## 2. Necessity and proportionality

- **Is LLM processing necessary?** Yes for the product thesis — interpretation
  and synthesis of heterogeneous health data requires a capable language
  model. Rule-based alternatives tested during spikes (U9–U11) produced
  unusable output.
- **Could we process less?** We do not send direct identifiers (email, name)
  to Anthropic — only an opaque `user_id` and the health content the user is
  actively asking about. Single topic queries; no batch training corpora.
- **Accuracy:** outputs cite back to the graph nodes they were generated
  from; users can follow citations to verify.
- **Retention:** minimum we can credibly offer a "persistent health record"
  on is lifetime-of-account. Anthropic retains nothing per the DPA.
- **Information rights:** data-subject access, rectification, export, and
  erasure are all available in-app or by emailing `privacy@morningform.health`
  (Settings → Privacy).

---

## 3. Risks to rights and freedoms of data subjects

| # | Risk | Likelihood | Severity | Overall |
|---|------|-----------|----------|---------|
| R1 | LLM hallucination presents false clinical info as authoritative | Medium | High | High |
| R2 | Shareable links leak health data via forwarding or indexing | Medium | High | High |
| R3 | Cross-border transfer to Anthropic becomes unlawful if UK–US Data Bridge is withdrawn | Low | High | Medium |
| R4 | Breach of durable store (Neon) exposes health records | Low | High | Medium |
| R5 | Anthropic trains on customer data contrary to DPA | Very low | High | Medium |
| R6 | Account takeover exposes another user's record | Low | High | Medium |
| R7 | Delete-account leaves orphaned rows in peripheral tables | Low | Medium | Low |

---

## 4. Measures to reduce risk

| Risk | Mitigations |
|------|-------------|
| R1 | Regulatory disclaimer on every topic and share page (U18); no drug-dose or imperative clinical directive language in generated output (enforced by copy-grep test); three-tier structure distinguishes "understanding / can do now / discuss with clinician" so users are explicitly pointed to professional advice for anything actionable. |
| R2 | Share tokens are long-random, HMAC-hashed at rest (PR 38), expire by default, revocable by the owner; redaction (`redactForShare`) strips identifiers and free-text not explicitly in scope; `X-Robots-Tag: noindex` on share routes; host-header injection closed (PR 39); cross-user IDOR on share creation closed (PR 39). |
| R3 | SCCs fallback clause in Anthropic DPA; quarterly review of UK adequacy status; incident-response plan to pause Anthropic calls if adequacy is withdrawn. |
| R4 | Neon encryption at rest and TLS in transit; row-level access scoped to `userId`; principle-of-least-privilege on application credentials; no production DB access without audit trail. |
| R5 | DPA artifact-gated at boot (U2): `docs/legal/anthropic-dpa-signed.pdf` sha256 asserted against `ANTHROPIC_DPA_SHA256`; app refuses boot in production if file is missing or hash mismatches. |
| R6 | Magic-link auth only, HMAC-hashed tokens, short TTL, single-use; session cookies `httpOnly + secure + sameSite=strict`; CSRF protection on mutating routes; rate limiting on auth endpoints. |
| R7 | `deleteUserData` tested to cascade across User, SharedView, GraphNodeLayout, SourceDocument, and auth records (PR 37); schema uses `onDelete: Cascade` for all user-owned foreign keys. |

---

## 5. Consultation

- **DPO:** {{name}} — review and sign-off required before launch.
- **Legal:** {{firm}} — reviewed sub-processor DPAs (Anthropic, Terra,
  Resend, Vercel, Neon).
- **Clinical advisor:** {{name}} — reviewed disclaimer and three-tier copy
  structure.
- **Data subjects:** not consulted at v1 (pre-launch). Post-launch:
  `privacy@morningform.health` for data-subject requests; user research
  sessions inform copy evolution.

---

## 6. Sign-off

DPIA must be signed off before v1 production launch. The signatures live in a
separate signed artifact (`docs/legal/dpia-signed-off.pdf`) — this markdown
file is the living reviewable version.

| Role | Name | Date | Signature |
|------|------|------|-----------|
| DPO | | | |
| Legal | | | |
| Engineering lead | | | |
| Product lead | | | |

---

## 7. Review schedule

- **Quarterly:** re-review risks R1–R7 against incident log, sub-processor
  changes, and UK–US adequacy status.
- **Event-triggered:** any new sub-processor, any change to Anthropic's DPA,
  any breach, any substantial change to intake or share scope.
