---
title: "Bootstrapping the test stack in the agent-proxy sandbox (npm ci, Prisma engines, Postgres)"
date: 2026-06-30
category: docs/solutions/runtime-errors
module: tooling / remote-execution environment / vitest + prisma + postgres
problem_type: environment_setup_failure
component: ops
symptoms:
  - "`npm ci` fails on the `@prisma/engines` postinstall with `Error: aborted` / ECONNRESET"
  - "`prisma generate` aborts mid-download even though `curl` to binaries.prisma.sh returns 200"
  - "node_modules half-disappears after backgrounding `npm ci &` in one Bash call and `wait`-ing in another"
  - "vitest globalSetup fails: P1001 Can't reach database server at 127.0.0.1:5432, or P1000 auth failed for `postgres`"
  - "tests need a real Postgres DB even for pure node-env unit tests (globalSetup runs `prisma db push`)"
root_cause: cli_input_handling
resolution_type: command_change
severity: high
tags:
  - remote-execution
  - agent-proxy
  - prisma
  - prisma-engines
  - postgres
  - vitest
  - npm-ci
  - bash-tool
  - test-database
---

# Bootstrapping the test stack in the agent-proxy sandbox

## Problem

A fresh remote session (cloud sandbox, outbound HTTPS through the agent proxy) starts with **no `node_modules`, no Prisma client, and Postgres down**. The vitest suite is the primary verification surface here — and `vitest.global-setup.ts` runs `npx prisma db push --skip-generate --force-reset`, so **even pure `node`-env unit tests need a reachable Postgres test DB**. Getting from cold-start to a green `vitest run` hit four distinct failures, none obvious, each costing time.

## Symptoms

- `npm ci` exits non-zero; the log ends in `@prisma/engines` `postinstall.js` → `Error: aborted` (a TLS socket close, ECONNRESET) while fetching the query engine.
- After a couple of `npx prisma generate` retries, `node_modules/.bin` and then all of `node_modules` are **gone**.
- `vitest run` for a pure unit test still fails in globalSetup with `P1001 Can't reach database server at 127.0.0.1:5432` or `P1000 Authentication failed ... for 'postgres'`.

## What Didn't Work

- **Backgrounding the install across Bash calls.** `npm ci & ` in one Bash tool call, then `wait <pid>` in a *second* call. The Bash tool starts a **fresh shell per call** — shell state does not persist — so the second call's `wait` referenced a PID it didn't own, the backgrounded `npm ci` (which `rm -rf node_modules` as its first step) was orphaned/killed, and the tree was left **half-removed**. This is the trap that "disappeared" node_modules.
- **Retrying `prisma generate`.** The engine download aborts deterministically through the proxy, not flakily — retries just re-abort.
- **Assuming Postgres + a usable role exist.** The cluster was down; once up, the OS user (`root`) had no Postgres role, and TCP (`localhost:5432`) uses `scram-sha-256` host auth, so a peer/passwordless connection fails.

## Solution

Four steps, each run **synchronously in a single Bash call** (never background-then-wait across calls):

**1. Install deps without the failing postinstall, then fetch Prisma engines by hand.**
```bash
npm ci --ignore-scripts           # gets a complete node_modules; skips the @prisma/engines download
V=$(node -e "console.log(require('@prisma/engines-version').enginesVersion)")
PLAT=debian-openssl-3.0.x         # match `openssl version` major (3 → 3.0.x)
base="https://binaries.prisma.sh/all_commits/$V/$PLAT"
DEST=node_modules/@prisma/engines
curl -fsSL "$base/libquery_engine.so.node.gz" | gunzip > "$DEST/libquery_engine-$PLAT.so.node"
curl -fsSL "$base/schema-engine.gz"          | gunzip > "$DEST/schema-engine-$PLAT" && chmod +x "$DEST/schema-engine-$PLAT"
```
`curl` succeeds through the proxy where Prisma's own Node downloader aborts.

**2. Point Prisma at the hand-fetched engines so `generate`/`db push` never try to download.**
```bash
export PRISMA_QUERY_ENGINE_LIBRARY="$PWD/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node"
export PRISMA_SCHEMA_ENGINE_BINARY="$PWD/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x"
export PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
./node_modules/.bin/prisma generate     # OK — uses the local engines
```

**3. Bring up Postgres and create a TCP-authable role.**
```bash
pg_ctlcluster 16 main start
sudo -u postgres psql -c "CREATE ROLE root SUPERUSER LOGIN PASSWORD 'testpw';"
sudo -u postgres createdb -O root morning_form_test
export TEST_DATABASE_URL="postgresql://root:testpw@127.0.0.1:5432/morning_form_test"
export DATABASE_URL="$TEST_DATABASE_URL"
```
The password matters: host connections (`127.0.0.1`) use `scram-sha-256` in `pg_hba.conf`, so a passwordless/peer role that works over the unix socket still fails over TCP — which is how Prisma connects.

**4. Persist the env in a sourceable file** and `source` it before every test/build call (the Bash tool's env does not persist between calls either):
```bash
# /tmp/test-env.sh — NODE_EXTRA_CA_CERTS, PRISMA_*; TEST_DATABASE_URL/DATABASE_URL; SESSION_SECRET (≥32 chars) for `next dev`
source /tmp/test-env.sh && ./node_modules/.bin/vitest run
```

## Why This Works

The two engine downloads (query + schema) are the only network step Prisma needs at install/generate time; pre-placing them and exporting `PRISMA_QUERY_ENGINE_LIBRARY` / `PRISMA_SCHEMA_ENGINE_BINARY` removes the download entirely. `--ignore-scripts` lets `npm ci` complete a full, consistent tree without the one failing postinstall. Running everything synchronously in one call sidesteps the Bash-tool's per-call shell (no orphaned background jobs). And a password-bearing superuser role satisfies the TCP `scram-sha-256` host auth that Prisma uses.

## Prevention

1. **Never background a long job in one Bash call and `wait`/poll it in another.** The shell is fresh each call; the job is orphaned. Run long installs/builds **synchronously** (a single call with a generous timeout). Use `run_in_background` only for fire-and-forget timers you don't `wait` on.
2. **Reach for `curl` when a tool's own downloader fails through the proxy.** `curl` (with `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` already trusted) is the reliable fetch; a 200 from `curl` to the same URL the tool aborts on tells you it's the tool's HTTP path, not a policy block.
3. **Pure unit tests still need the DB here** — vitest globalSetup does `prisma db push`. Bring Postgres up first, even to run one `.test.ts`.
4. **Postgres may be down on cold start and `root` has no role** — start the cluster, create a password role, and use a TCP URL (`127.0.0.1`), not a socket assumption.
5. **Keep a `/tmp/test-env.sh` and `source` it** at the top of every test/build/run Bash call.

## Related Issues

- Discovered while standing up the longitudinal-trajectory work (plans `docs/plans/2026-06-30-001-*`). The same `/tmp/test-env.sh` also booted `next dev` for an in-browser smoke test (needs `SESSION_SECRET` ≥32 chars + `NEXT_PUBLIC_APP_URL`).
- Sibling proxy gotcha already documented: `docs/solutions/runtime-errors/vercel-readfilesync-enoent-bundling-2026-05-15.md` (bundling, not network) and the proxy README at `/root/.ccr/README.md`.
