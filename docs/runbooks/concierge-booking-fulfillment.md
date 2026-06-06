# Concierge Booking Fulfillment Runbook

## Overview

When a user requests concierge booking ("MorningForm arranges it"), ops buys
a gift code/voucher from the market's partner lab. The user redeems it under
their own identity. No user-identifying data crosses to the lab.

## Per-Partner Purchase Steps

### UK — Medichecks

1. Go to https://medichecks.com — e-gift card purchase flow
2. Select the relevant test(s) based on the request's markerNames
3. Purchase the e-gift card (denomination codes preferred over test-specific
   where available — partner learns less)
4. Record the gift code reference in the ops endpoint

### US — Ulta Lab Tests

1. Go to https://ultalabtests.com — voucher/employer purchase flow
2. Select the relevant test(s)
3. Purchase voucher
4. Record the voucher reference in the ops endpoint

**Blocked states:** NY, NJ, RI, AZ, HI — requests from these states are
blocked at form submission (422). No ops action needed.

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

**Mark as delivered (nullifies markerNames, stores code reference):**
```json
{ "action": "deliver", "bookingId": "<id>", "codeReference": "<gift-card-code>" }
```

**Cancel (partner unavailable):**
```json
{ "action": "cancel", "bookingId": "<id>", "reason": "partner stock unavailable" }
```

## User Flow

1. User submits request → ops email (reference only) + user confirmation email
2. Ops buys code → marks `arranged`
3. User gets "ready" email → links to in-app status block
4. User reveals redemption code in-app (behind their session, one-time)
5. User books their own draw at the partner lab under their own identity
6. Ops (or user) marks `delivered` after confirmation

## Code Reveal

- Redemption code is encrypted-at-rest (AES-256-GCM with HEALTH_TOKEN_ENCRYPTION_KEY)
- Code reveals once behind the user's authenticated session
- Never in email, logs, or ops notifications
- If unredeemed and account is compromised: partner-side revocation per
  partner's gift-card terms

## Retention

- `markerNames` nullified when status reaches `delivered` or `cancelled`
- Booking reference, market, status, and timestamps retained for ops history
- Full row deleted on account erasure (GDPR cascade)

## SLA

- Target: 1–2 business days from `requested` to `arranged`
- If partner is out of stock: cancel with reason, user notified
