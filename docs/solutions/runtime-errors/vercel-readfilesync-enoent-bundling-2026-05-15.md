---
title: "Vercel function 500s with ENOENT on a checked-in file because Next.js bundler can't trace dynamic fs.readFileSync paths"
date: 2026-05-15
category: docs/solutions/runtime-errors
module: scribe / next.js bundling
problem_type: runtime_error
component: tooling
symptoms:
  - "Vercel function 500 with: ENOENT: no such file or directory, open '/var/task/<path>/<file>'"
  - "Error fires only in production; local `next dev` works fine"
  - "The file exists in the repo and was committed"
  - "`next build` succeeds locally — the deploy doesn't fail, it 500s at runtime"
root_cause: incomplete_setup
resolution_type: config_change
severity: high
tags:
  - nextjs
  - vercel
  - bundling
  - readfilesync
  - output-file-tracing
  - enoent
  - lambda
---

# Vercel function 500s with ENOENT on a checked-in file because Next.js bundler can't trace dynamic fs.readFileSync paths

## Problem

Code that does `fs.readFileSync(path)` where `path` is computed at runtime (lookup table, registry entry, glob match) works in local dev but throws `ENOENT: no such file or directory, open '/var/task/<the-file>'` on Vercel. The file is checked into git; the bug is that Next.js never copied it into the deployed Lambda bundle.

In this repo: `src/lib/scribe/specialties/load-prompt.ts` reads `system-prompt.md` files via `fs.readFileSync(process.cwd() + systemPromptPath)` where `systemPromptPath` comes from a registry. Prod chat 500s on the first request that needs a specialty system prompt. Caught by a cold-walkthrough; CI + local + Vercel-build all green.

## Symptoms

```
Something went wrong
loadSpecialtySystemPrompt: failed to read
'src/lib/scribe/specialties/general/system-prompt.md' for specialty 'general':
ENOENT: no such file or directory, open
'/var/task/src/lib/scribe/specialties/general/system-prompt.md'
```

- Error message contains `/var/task/...` — that's the Vercel Lambda's runtime working directory
- Reproduces on first runtime hit of the code path; doesn't surface in build logs
- Local `pnpm dev` works (cwd is the repo, files are present)
- `next build` succeeds (bundler runs but the file isn't traced)
- Vercel Preview deploys succeed (same reason — the file isn't traced)

## What Didn't Work

- **Adding the file to `serverComponentsExternalPackages`.** That's for npm packages with native bindings (the existing pdf-parse / pdfjs-dist / @napi-rs/canvas entries in this repo). Doesn't apply to repo-internal files.
- **Importing the file with `import md from './foo.md'`.** Requires a webpack loader; would work but means a bundler config change AND converting every callsite to use the imported value instead of `readFileSync`. Heavier than needed.
- **Hoping Next.js would trace it.** Next.js's file tracer follows static imports + a known set of runtime patterns. It cannot follow `fs.readFileSync(process.cwd() + dynamicPath)` because the path is computed from runtime data.

## Solution

Add the missing files to `experimental.outputFileTracingIncludes` in `next.config.mjs`, keyed by the route pattern that needs them. The existing pdfjs-worker entry is the precedent in this repo.

```js
// next.config.mjs
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      // existing pdfjs entry
      '/api/intake/documents': [
        './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      ],
      // new specialty-prompt entry
      '/api/**/*': [
        './src/lib/scribe/specialties/**/system-prompt.md',
      ],
    },
  },
};
```

- Keys are route patterns (globs supported)
- Values are arrays of file globs relative to the project root
- Both `node_modules/...` paths and repo-internal paths work
- Use `'/api/**/*'` (broad scope) when multiple routes might trigger the code path. Use `'/api/<specific-route>'` when only one does — pdfjs is only needed by `/api/intake/documents`, so it stays scoped

Verify after deploy by hitting the production route. The Lambda's `/var/task/` filesystem now contains the file.

## Why This Works

Next.js's serverless bundler (file tracer) does static analysis to figure out which files a Lambda needs. It follows:
- Static `import` / `require` statements
- A built-in list of known runtime patterns

It does NOT follow:
- `fs.readFileSync(somePath)` where `somePath` is computed at runtime
- Dynamic `import(somePath)` where `somePath` is computed
- Anything where the path string is built from variables

`outputFileTracingIncludes` is the explicit override — "trust me, include these files, even though you can't trace why."

## Prevention

1. **When you write `fs.readFileSync` for a file in the repo (not `node_modules`), check whether the path is static or dynamic.**
   - Static (`readFileSync(__dirname + '/foo.md')`): Next.js can trace it. No config needed.
   - Dynamic (`readFileSync(registry[key].path)`): you need `outputFileTracingIncludes`.

2. **Prefer compile-time over runtime when feasible.** Converting `.md` files to `.ts` modules eliminates the runtime `fs` read entirely and lets the bundler trace via the static `import`:

   ```ts
   // src/lib/scribe/specialties/general/system-prompt.ts
   export const GENERAL_SYSTEM_PROMPT = `...markdown content...`;
   ```

   This is the cleaner long-term shape. Use the config override as a tactical fix; promote to compile-time when touching the area again.

3. **CI + Vercel-build will NOT catch this.** Local `next build` and Vercel's preview build both succeed because the bundler runs in the build environment with full filesystem access — the trace miss only manifests when the deployed Lambda hits the code path. **Cold-walkthrough verification (real session, real route, real path-trigger) is the only reliable test.**

4. **The `/var/task/` prefix in an `ENOENT` message is the signal.** That's Vercel's Lambda runtime working directory. If the error fires with that prefix, the file isn't in the Lambda bundle — not "missing from disk," but "not traced."

## Related Issues

- This is the same class of bug as the existing pdfjs-worker tracing fix in `next.config.mjs` (see the comment block above the `'/api/intake/documents'` entry). Both `pdf.worker.mjs` and the specialty `.md` files have dynamic resolution paths the tracer can't follow.
- A sibling learning worth a future writeup: **constant + Prisma `@default` drift.** When changing a `DEFAULT_X` constant in TS, the `@default("...")` clause in `prisma/schema.prisma` is a separate write path that fires on any insert that omits the column. Both need to change together — surfaced in the same launch session as this bug. Candidate filename: `docs/solutions/database-issues/prisma-schema-default-vs-ts-constant-drift-2026-05-15.md`.
- The original P0 fix this followed up on: PR #117 (scribe model OpenRouter 404). PR #118 contains this fix; `/ce:plan` doc at `docs/plans/2026-05-14-001-fix-scribe-model-anthropic-guard-plan.md` has the broader context.
