# Data Rights Implementation — Export (Art. 15) & Erasure (Art. 17)

**Status:** living document, shipped with the first-session-completeness work
(docs/plans/2026-06-04-001-feat-first-session-completeness-plan.md). Written as
the merge-gate privacy note for that PR; flag for a privacy-lawyer skim
alongside the clinical review.
**Last updated:** 2026-06-04

Self-service implementations live in `src/lib/account/export.ts`,
`src/lib/account/delete.ts`, and the `/api/account/*` routes. A manual path
(user emails us) must still be honoured — the ICO one-month response window
applies either way.

## Export (Article 15 / right of access)

- The archive contains every user-data domain: account, preferences,
  assessment, state profile, priorities (+ markers/adjustments), check-ins,
  chat messages, scribes, health connections + data points, shared views,
  suggestions, and full record/graph content including source-document text
  and the original uploaded PDFs.
- **Documented exclusions** (mirrored in each archive's `manifest.json`):
  - *Vector embeddings* — opaque internal numeric representations, not
    intelligible personal data (ICO right-of-access expects data "in a form
    they can easily understand"); the source text they derive from IS
    exported.
  - *Session rows, magic-link/MCP/deletion tokens* — credentials, not
    portability data.
  - *Internal audit logs* (ScribeAudit, MCPAuditEvent) — system accountability
    records; the user-meaningful content they reference is exported via its
    own domain.
  - *Health-connection OAuth access/refresh tokens* — stripped from the
    exported connection records (credentials).
- A structural test (`src/lib/account/export.test.ts`) walks the Prisma schema
  and fails if any user-owned model is neither exported nor on the documented
  exclusion list — a new table cannot silently fall out of the archive.
- Delivery: the emailed link points at a session-gated, owner-only download
  proxy with a 24-hour expiry. A bare capability URL to a PHI archive in email
  was rejected as the wrong threat posture.
- Failed export attempts do not count against the per-user rate limit — a
  transient failure must never lock a user out of an Article 15 right.

## Erasure (Article 17 / right to be forgotten) + accountability (Art. 5(2))

- Hard deletion: blob files first (uploaded PDFs and export archives), then a
  single ordered database transaction covering every user-linked table —
  including grandchild tables and PII held in analytics rows without a user
  foreign key (`FunnelEvent.userId`, `LandingPageVisit.email`,
  `RawProviderPayload.userId`). A residue test scans `information_schema` for
  any surviving occurrence of the deleted id/email.
- Re-confirmation: deletion requires a typed confirmation, a fresh single-use
  emailed token (15 min), AND an active session for the same user — under
  passwordless auth, neither a session alone nor a mailbox read alone may
  authorise irreversible erasure.
- **Retention after erasure — the tombstone** (`AccountDeletionTombstone`, no
  User FK by construction). Retained as minimal Art. 5(2) proof that the
  erasure obligation was met and consent was held:
  - salted one-way email hash — duplicate-request detection only; cannot
    re-identify the subject without the salt-protected original;
  - salted IP hash of the confirming request — abuse forensics; the raw IP is
    deliberately never stored (fresh PII about a just-erased subject);
  - `consentHeldAt` timestamp snapshot — proof LLM-processing consent existed
    (Art. 7 accountability) after the consent record itself is erased;
  - request/confirm/completion timestamps and per-domain deleted-row counts.
  - **Open question for legal skim:** tombstone retention period. Current
    posture: indefinite (it is the only proof of compliance). If a fixed
    period is preferred, 6 years (UK limitation period) is the conventional
    anchor.

## Related

- DPIA: `docs/compliance/dpia.md` (the consent-trail gap it flags is closed by
  the lazy-consent design + this tombstone snapshot).
- Sub-processors involved: Vercel Blob (archive + document storage), Resend
  (notice/confirmation email) — see `docs/compliance/sub-processor-register.md`.
