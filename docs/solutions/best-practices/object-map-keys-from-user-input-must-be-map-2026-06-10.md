---
title: "An object literal keyed by user-controlled input is a prototype-chain read — use Map"
date: 2026-06-10
category: docs/solutions/best-practices
module: data structures / user input
problem_type: prototype_chain_lookup
component: marker-aliases
symptoms:
  - "Plain-object lookup with `obj[userToken] ?? default` returns inherited members instead of falling back"
  - "Tokens like 'constructor', 'toString', '__proto__', 'hasOwnProperty' produce non-undefined values from the prototype chain"
  - "Downstream `.map`/`.length`/`.includes` on the wrongly-typed value throws TypeError → 500 on the user request"
root_cause: object_literal_index_walks_prototype_chain
resolution_type: structural_change
severity: high
tags:
  - javascript-pitfalls
  - prototype-pollution
  - data-structures
  - user-input-validation
  - code-review
---

# An object literal keyed by user-controlled input is a prototype-chain read — use Map

## Problem

JavaScript object indexing walks the prototype chain. For an object literal, `obj['constructor']` returns `Object.prototype.constructor` — a `Function`, which is truthy — so `obj[token] ?? fallback` silently bypasses the fallback for any string that names a prototype member. When the value is then treated as a domain-typed thing (an alias list, a config), the next operation on it (`.map`, `.length`, `.includes`) throws `TypeError`. If the lookup is on a path reachable from a URL parameter, every prototype-member name becomes a way to 500 the request.

The longitudinal graph PR shipped this shape in `src/lib/markers/metric-aliases.ts`:

```ts
const METRIC_ALIASES: Record<string, readonly string[]> = {
  ferritin: ['ferritin_ng_ml'],
  hba1c: ['hba1c_percent', 'hba1c_mmol_mol'],
  // ...
};

export function wearableMetricNamesFor(markerName: string): string[] {
  const token = markerName.trim().toLowerCase();
  const aliases = METRIC_ALIASES[token] ?? [];            // <-- prototype-chain read
  return Array.from(new Set([token, ...aliases.map((a) => a.toLowerCase())]));
}
```

Reachable path: `GET /decisions/marker/constructor` → page calls `buildMarkerTrajectory('constructor')` → `loadWearableSeries` → `wearableMetricNamesFor('constructor')` → `METRIC_ALIASES['constructor']` returns `Object.prototype.constructor` (the `Function` for `Object`) → `aliases.map is not a function` → `TypeError` propagates out of the server component → 500. Same shape for `'toString'`, `'valueOf'`, `'hasOwnProperty'`, `'__proto__'`.

Code-review angle D caught it; verifier confirmed it as a real user-reachable crash.

## Symptoms

- A `Record<string, T>` (or `{ ... }`) is indexed by a value that the user can influence (URL param, form input, header).
- The lookup uses `obj[token] ?? default` or `obj[token] || default` — the fallback is invisible for prototype-member keys.
- The next operation expects `T`'s shape; for prototype members it gets `Function` / `Object` / a string, then throws.

## Solution

Use a `Map` for the table:

```ts
const METRIC_ALIASES: ReadonlyMap<string, readonly string[]> = new Map([
  ['ferritin', ['ferritin_ng_ml']],
  ['hba1c', ['hba1c_percent', 'hba1c_mmol_mol']],
  // ...
]);

const aliases = METRIC_ALIASES.get(token) ?? [];
```

`Map.get(unknownKey)` returns `undefined` and never walks any prototype.

Equivalent fixes when a `Map` doesn't fit:
- `Object.create(null)` — the literal has no prototype, so `obj[token]` returns `undefined` for `'constructor'`.
- Explicit own-property guard: `Object.hasOwn(obj, token) ? obj[token] : []`.

`Map` is the strongest because the type system encodes the safety: `Map.get` returns `T | undefined`, and there is no API on `Map` that resolves a prototype member.

## What Didn't Work

- **Trusting that "marker names come from our codebase".** They do for the canonical happy path, but the marker page accepts any string from `params.name`. Trusting upstream filtering for a one-line structural fix is bad altitude.
- **Adding an allowlist guard at the route layer.** It works but doesn't fix the underlying primitive — the next consumer of the alias map will reintroduce the bug. The structural fix (Map) makes the unsafe pattern unrepresentable.
- **Catching the TypeError and falling back.** Defends the crash but the wrong value (a `Function`) still flowed through the function for several lines before throwing — the actual semantic was "no aliases known", not "exception recover".

## Why This Works

A `Map` is the right data structure for an open-domain lookup table. The bug only existed because `Record<string, T>` looked like a Map but indexes through the prototype chain. Replacing the structure removes the entire class of bug for this surface, and the test cost is one parametrized assertion:

```ts
for (const hostile of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
  expect(wearableMetricNamesFor(hostile)).toEqual([hostile.toLowerCase()]);
}
```

The test is also a documentation artifact: a future reader sees explicitly which inputs are safe.

## When to Apply

- Any object map keyed by a string that traces back to a URL param, route segment, form field, header, query string, or external API payload.
- Server components / route handlers where a `TypeError` surfaces as a 500.
- Scribe / tool handler arg dispatch — if you have `HANDLERS[toolName]`, audit it.
- Plugin / strategy registries — `STRATEGIES[name]` is the same shape.

The rule of thumb: if the key is `string` and you can't enumerate the values at the type level (i.e. you're not using a `Record<UnionLiteral, T>` exhaustively narrowed before the lookup), prefer `Map`.

## Related

- Found by `/ce:code-review` Angle D (language pitfalls) and verified before the merge — see PR #162.
- General class: prototype-pollution reads. The repo's `lib/intake/biomarkers.ts` registry uses array iteration with `find`, not object indexing, so it's already safe.
- The `BIOMARKER_REGISTRY` entries have aliases as arrays inside objects keyed by canonicalKey — also array-iteration, safe.
