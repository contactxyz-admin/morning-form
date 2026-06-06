# Concierge Booking Fulfillment Runbook

## Overview

When a user requests concierge booking ("MorningForm arranges it"), ops buys
a gift code/voucher from the market's partner lab. The user reveals the
**redemption code** (the user-facing term — "gift card/voucher" is the ops-side
purchase term only) once in-app and redeems it under their own identity. No
user-identifying data crosses to the lab.

## Build-Time Re-Verification (do before each ops cycle / quarterly)

Partner terms drift. Before relying on the steps below, re-confirm:

- **Denomination vs test-specific codes** — prefer denomination (account-unbound,
  value-only) codes wherever the partner offers them: a denomination code means
  the partner learns only that MorningForm buys codes, NOT which test the user
  seeks. A test-specific code leaks the test type to the partner at redemption.
  Re-check at each partner whether denomination codes are still available; if a
  partner has moved to test-specific-only, note it for the Unit 5 boundary
  analysis (it changes what the partner learns).
- **Gift-code validity window** and whether codes remain account-unbound.
- **Blocked-state lists** per provider (state regulators change these).

## Per-Partner Purchase Steps

### UK — Medichecks

1. Go to https://medichecks.com — e-gift card purchase flow
2. Select the relevant test(s) based on the request's markerNames
3. Purchase the e-gift card (denomination codes preferred over test-specific
   where available — partner learns less; see Re-Verification above)
4. Mark the booking `arranged` in the ops endpoint
5. Mark `delivered` with the raw redemption code in `codeReference` — the
   endpoint encrypts it at rest for the user's one-time in-app reveal (the raw
   code is never stored in plaintext, never emailed, never logged)

### US — Ulta Lab Tests

1. Go to https://ultalabtests.com — voucher/employer purchase flow
2. Select the relevant test(s)
3. Purchase voucher
4. Mark `arranged`, then `delivered` with the redemption code in `codeReference`
   (encrypted at rest for the one-time in-app reveal — same as UK)

**Blocked states (hard blocks, all providers):** NY, NJ, RI — requests from
these states are blocked at form submission (422). No ops action needed.

**Provider-dependent states:** AZ, HI — NOT hard-blocked. Availability depends
on the specific lab. The booking form's blocked-state guidance copy surfaces
this caveat; if a partner cannot serve an AZ/HI request, cancel with reason and
the user falls back to the GP route. Re-verify per-provider state lists each
cycle.

## Ops Endpoint

```
POST /api/booking/ops/status
Authorization: Bearer <OPS_SECRET>
```

### Actions

**List pending requests:**
```json
{ "action": "list" }
```

**Get request details (incl. userId, markerNames):**
```json
{ "action": "get", "bookingId": "<id>" }
```

**Mark as arranged:**
```json
{ "action": "arrange", "bookingId": "<id>" }
```

**Mark as delivered (encrypts + stores the redemption code, nullifies markerNames):**
`codeReference` is REQUIRED (non-empty). The endpoint encrypts it at rest; the
user reveals it once in-app. Only an `arranged` booking can be delivered.
```json
{ "action": "deliver", "bookingId": "<id>", "codeReference": "<redemption-code>" }
```

**Cancel (partner unavailable):**
```json
{ "action": "cancel", "bookingId": "<id>", "reason": "partner stock unavailable" }
```

## User Flow

1. User submits request → ops email (reference only) + user confirmation email
2. Ops buys code → marks `arranged`
3. Ops marks `delivered` with the redemption code (encrypted at rest)
4. User gets "ready" email → links to in-app status block (NO code in email)
5. User reveals the redemption code in-app (behind their session, one-time —
   the ciphertext is nulled on first reveal)
6. User books their own draw at the partner lab under their own identity

## Code Reveal

- Redemption code is encrypted-at-rest (AES-256-GCM via
  `src/lib/health/crypto.ts`, keyed by `HEALTH_TOKEN_ENCRYPTION_KEY`)
- Code reveals exactly once behind the user's authenticated session; the
  ciphertext column is nulled on first reveal (a second reveal returns 410)
- Never in email, logs, or ops notifications

## Revocation (unredeemed code outstanding)

If a code is still unredeemed and the account is compromised OR the user
requests deletion, revoke partner-side before the code can be used:

1. **Identify** the outstanding code. If it has NOT yet been revealed, it is
   still encrypted on the BookingRequest row; if revealed, ops holds the
   purchase record from the partner's order history (not in MorningForm).
2. **UK (Medichecks):** contact Medichecks support with the gift-card order
   reference and request cancellation/refund of the unredeemed code per their
   gift-card terms.
3. **US (Ulta Lab Tests):** contact Ulta/voucher support with the voucher
   order reference and request voucher invalidation.
4. **Record** the revocation outcome against the booking reference in ops notes.
5. On account deletion: the BookingRequest row (incl. any remaining ciphertext)
   is erased by the GDPR cascade, but a partner-side code can outlive the row —
   so run steps 1–4 BEFORE confirming an erasure where an unredeemed,
   already-revealed code may exist.

## Retention

- `markerNames` nullified when status reaches `delivered` or `cancelled`
- Booking reference, market, status, and timestamps retained for ops history
- Full row deleted on account erasure (GDPR cascade)

## SLA

- Target: 1–2 business days from `requested` to `arranged`
- If partner is out of stock: cancel with reason, user notified
