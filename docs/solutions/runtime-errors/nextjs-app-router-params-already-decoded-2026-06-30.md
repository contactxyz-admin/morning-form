---
title: "Next.js App Router dynamic params are already percent-decoded — a second decodeURIComponent throws URIError (500)"
date: 2026-06-30
category: docs/solutions/runtime-errors
module: app/api/markers/[name]/trajectory / next app router
problem_type: double_decode_crash
component: route_handler
symptoms:
  - "A dynamic [param] route 500s on names containing '%' (e.g. /api/markers/vitamin%20c%20100%25/...)"
  - "Uncaught URIError: URI malformed from decodeURIComponent inside the handler"
  - "A param legitimately containing '%' is silently mangled before a DB lookup → empty/no result"
root_cause: redundant_decoding
resolution_type: code_change
severity: medium
tags:
  - nextjs
  - app-router
  - dynamic-route
  - decodeuricomponent
  - uri-malformed
  - 500
---

# Next.js App Router dynamic params are already decoded — don't decode again

## Problem

A new dynamic route `GET /api/markers/[name]/trajectory` defensively decoded its segment:

```ts
const markerName = decodeURIComponent(params.name).trim();   // ← double-decode
```

The App Router has **already** percent-decoded the dynamic segment by the time it reaches `params.name`. The second `decodeURIComponent` has two failure modes:

- **Crash:** a request whose decoded name contains a literal `%` (e.g. the route receives `params.name === "vitamin c 100%"`) makes `decodeURIComponent("…100%")` throw `URIError: URI malformed`. The handler had no try/catch, so it returns an opaque framework **500** instead of the route's documented 400/404 contract — an easy, reproducible bad-input 500.
- **Silent mangle:** a name that legitimately contains an encoded `%` is decoded twice and corrupted before the DB lookup, returning an empty result with no error.

## Symptoms

- `GET /api/markers/vitamin%20c%20100%25/trajectory` → 500 (URIError), not a clean response.
- A marker whose real name contains `%` returns an empty series for no visible reason.

## Solution

Use the param as-is — the framework already decoded it:

```ts
const markerName = params.name.trim();   // App Router already percent-decoded the segment
```

If the handler does other throwing work (DB calls), wrap the body in try/catch and return a clean error envelope — but the decode itself should simply be removed, not guarded.

## Why This Works

`decodeURIComponent` is idempotent only for strings with no `%`; on already-decoded text it's not a no-op — it's a re-decode that either throws (lone/invalid `%`) or transforms (`%XX` sequences that survived the first decode). Since the App Router guarantees `params.*` is decoded, the correct number of decodes the handler performs is **zero**.

## Prevention

1. **Never call `decodeURIComponent` on `params.*` in an App Router route** — it's already decoded. (This differs from raw query strings you parse yourself, which may not be.)
2. **Test a dynamic-param route with a name containing `%` and a space** — asserts no 500 and correct handling, the case the happy-path tests miss.
3. If you truly need to handle attacker-malformed input, wrap in try/catch and return your route's error contract — don't let a `URIError` become a framework 500.

## Related Issues

- Caught in the Phase 2 review of the longitudinal-trajectory work (plan 2026-06-30-001 U5); the regression test lives in `src/app/api/markers/[name]/trajectory/route.test.ts` ("does not 500 on a name containing a literal '%'").
