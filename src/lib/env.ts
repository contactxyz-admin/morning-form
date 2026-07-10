const required = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
};

const optional = {
  TERRA_API_KEY: process.env.TERRA_API_KEY ?? '',
  TERRA_DEV_ID: process.env.TERRA_DEV_ID ?? '',
  TERRA_WEBHOOK_SECRET: process.env.TERRA_WEBHOOK_SECRET ?? '',
  WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID ?? '',
  WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET ?? '',
  OURA_CLIENT_ID: process.env.OURA_CLIENT_ID ?? '',
  OURA_CLIENT_SECRET: process.env.OURA_CLIENT_SECRET ?? '',
  FITBIT_CLIENT_ID: process.env.FITBIT_CLIENT_ID ?? '',
  FITBIT_CLIENT_SECRET: process.env.FITBIT_CLIENT_SECRET ?? '',
  GARMIN_CONSUMER_KEY: process.env.GARMIN_CONSUMER_KEY ?? '',
  GARMIN_CONSUMER_SECRET: process.env.GARMIN_CONSUMER_SECRET ?? '',
  GOOGLE_FIT_CLIENT_ID: process.env.GOOGLE_FIT_CLIENT_ID ?? '',
  GOOGLE_FIT_CLIENT_SECRET: process.env.GOOGLE_FIT_CLIENT_SECRET ?? '',
  // Secret used to derive the AES-GCM key that encrypts stored provider
  // tokens (Libre, and anything else that persists bearer tokens). Required
  // in production; a deterministic dev fallback is used otherwise.
  HEALTH_TOKEN_ENCRYPTION_KEY: process.env.HEALTH_TOKEN_ENCRYPTION_KEY ?? '',
  LIBRE_ENABLED: process.env.LIBRE_ENABLED ?? '',
  // LLM (Anthropic) — required in production. MOCK_LLM=true forces canned
  // responses in dev/test so callers don't need to stub the SDK.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  MOCK_LLM: process.env.MOCK_LLM ?? '',
  // Embeddings (PR 2+). OPENAI_API_KEY follows the exact same optional + MOCK pattern
  // as ANTHROPIC. EMBEDDING_PROVIDER selects the active provider (default openai).
  // Supports OPENAI_BASE_URL for Vercel AI Gateway / future unified observability.
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER ?? 'openai',
  VECTOR_SEARCH_STRATEGY: process.env.VECTOR_SEARCH_STRATEGY ?? 'js-cosine',
  // Auth (U0a + U0b). SESSION_SECRET hashes cookie tokens and magic-link
  // tokens — rotating it invalidates every live session + unconsumed link.
  // RESEND_API_KEY sends magic-link emails (EU region, UK-GDPR posture).
  // RESEND_FROM is the verified from-address once DNS lands; falls back to
  // onboarding@resend.dev in dev.
  SESSION_SECRET: process.env.SESSION_SECRET ?? '',
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  RESEND_FROM: process.env.RESEND_FROM ?? 'onboarding@resend.dev',
  // Explicit opt-in for the demo bypass on /api/auth/request-link. When true,
  // POSTing with demo@morningform.com returns the raw verify token in the
  // response body — a dev convenience that must NEVER be true in Vercel
  // preview or production. Gating on NODE_ENV alone is unsafe: Next.js builds
  // run with NODE_ENV='production' on every Vercel environment (including
  // previews), and ambient-env semantics could change between runtimes.
  ALLOW_DEMO_BYPASS: process.env.ALLOW_DEMO_BYPASS ?? '',
  // pgvector guard (PR 1+). ''/absent = available on postgres after running
  // the one-time SQL in docs/migrations/. Set to 'false'/'0' to force
  // lexical+graph fallback even on postgres (for tests/CI).
  PGVECTOR_ENABLED: process.env.PGVECTOR_ENABLED ?? '',
  // Hybrid retrieval rollout flag. PR7 defaults the feature on when an
  // embedding provider is configured; set 'false'/'0' to force legacy
  // lexical+graph retrieval and disable ingest-time embedding writes.
  HYBRID_RETRIEVAL_ENABLED: process.env.HYBRID_RETRIEVAL_ENABLED ?? '',
  // Phase A feature flag for Ask, deep (Plan 2026-06-05-001). Off by default.
  // Flips in Unit 7 after legal + advisor gates. Unsetting returns current
  // behaviour byte-for-byte.
  ASK_DEEP_ENABLED: process.env.ASK_DEEP_ENABLED ?? '',
  // Concierge booking v1 (Plan 2026-06-06-001). Off by default. Gates
  // the booking request form + ops fulfillment loop. Flip in U5 after
  // legal/disclosure packet is signed.
  CONCIERGE_BOOKING_ENABLED: process.env.CONCIERGE_BOOKING_ENABLED ?? '',
  // Ops email for concierge booking notifications (Plan 2026-06-06-001 U3).
  // Reference-only — no health data in email. Production assert fails
  // closed when unset and CONCIERGE_BOOKING_ENABLED is true.
  OPS_EMAIL: process.env.OPS_EMAIL ?? '',
  // Ops auth secret for the booking fulfillment endpoint (Plan 2026-06-06-001
  // U4). Shared secret checked against the Authorization header. Never
  // set in dev — the endpoint returns 401.
  OPS_SECRET: process.env.OPS_SECRET ?? '',
  // Decisions-that-compound flag (Plan 2026-06-06-002 Phase B). Off by default.
  // Gates the /decisions surface, lifecycle API, trajectory views, and outcome
  // snapshots. Flip in U6 after the visual audit gate.
  DECISIONS_ENABLED: process.env.DECISIONS_ENABLED ?? '',
  // Longitudinal health graph (Plan 2026-06-10-002 Phase 0). Off by default.
  // Gates the READ surfaces only — the "what changed since last test" panel
  // diff (GET /api/markers/changes + the upload response's `changes` block
  // + the /decisions card). Dated observation-instance WRITES on lab ingest
  // are unconditional (additive, invisible until a read surface renders
  // them; gating them would create a backfill gap). Flip after the visual
  // audit gate.
  LONGITUDINAL_GRAPH_ENABLED: process.env.LONGITUDINAL_GRAPH_ENABLED ?? '',
  // Retest loop (Plan 2026-06-17-001). Off by default. Gates the Draw write
  // hooks (lab-ingest completion + cadence scheduling, booking→draw linkage)
  // and — once built — the retest-nudge cron (U3). Off = current behaviour
  // byte-for-byte (no Draw rows written, booking flow unchanged).
  RETEST_LOOP_ENABLED: process.env.RETEST_LOOP_ENABLED ?? '',
  // Cron auth secret for the retest-nudge endpoint (Plan 2026-06-17-001 U3).
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; the route refuses
  // anything else. Required (>=32 chars) in production when RETEST_LOOP_ENABLED.
  CRON_SECRET: process.env.CRON_SECRET ?? '',
  // Clinician-mediated supplement handoff (Plan 2026-06-19-001 Unit 2). LIVE
  // (founder green-lit 2026-06-19) — defaults ON; set
  // SUPPLEMENT_HANDOFF_ENABLED=false to use as a kill-switch. Enables the
  // enriched `route_to_gp_prep` payload (curated, clinician-reviewed evidence
  // context for supplement/medication questions). Still gated per-note: a note
  // only surfaces if it is clinician-reviewed AND scan-clean (see
  // scribe/supplement-handoff/evidence-notes.ts), so the flag alone can't leak
  // unreviewed content. No secret needed — the accountable-clinician gate is
  // the `reviewedBy` field, not an env value.
  SUPPLEMENT_HANDOFF_ENABLED: process.env.SUPPLEMENT_HANDOFF_ENABLED ?? 'true',
  // Grounded-answer gate (audit A4). Off by default: the hybrid-retrieval
  // grounding score stays a logged metric. Set GROUNDING_GATE_ENABLED=true to
  // ENFORCE it — a clinical-safe answer whose retrieval this turn scored below
  // GROUNDING_FLOOR (fraction of results backed by real chunk+document
  // provenance) is downgraded to the safe deferral. GROUNDING_FLOOR defaults to
  // 0.5; parsed + clamped to [0,1] in embeddings/compat.ts.
  GROUNDING_GATE_ENABLED: process.env.GROUNDING_GATE_ENABLED ?? '',
  GROUNDING_FLOOR: process.env.GROUNDING_FLOOR ?? '0.5',
  // Company Ops Board (build brief 2026-07-04). Off by default. Standalone
  // founder-only surface — see src/lib/ops/config.ts. Gates /ops, every
  // /api/ops/* route, and the ops MCP endpoint.
  COMPANY_OPS_ENABLED: process.env.COMPANY_OPS_ENABLED ?? '',
  // Comma-separated founder emails. The only allowlist in the app today —
  // magic-link sign-in itself stays open to any email.
  COMPANY_OPS_ALLOWLIST: process.env.COMPANY_OPS_ALLOWLIST ?? '',
  // JSON: [{ email, name, slackId? }] — notification routing (display name
  // in emails, optional Slack @mention).
  COMPANY_OPS_MEMBERS: process.env.COMPANY_OPS_MEMBERS ?? '',
  // Slack incoming webhook URL. Optional — empty means email-only notify.
  COMPANY_OPS_SLACK_WEBHOOK: process.env.COMPANY_OPS_SLACK_WEBHOOK ?? '',
  // JSON: [{ email, token }] — per-founder bearer tokens for the ops MCP.
  // Env-based for v1; upgrade to a DB-backed CompanyOpsToken table only if
  // per-token revocation-without-redeploy becomes a real need.
  COMPANY_OPS_MCP_TOKENS: process.env.COMPANY_OPS_MCP_TOKENS ?? '',
  // Clinician-in-the-loop review (pilot MVP plan 2026-07-04). Off by default.
  // Gates review-row creation on lab ingest, the /clinic queue, the decision
  // route, and the member-facing escalation override on /api/record.
  CLINICIAN_REVIEW_ENABLED: process.env.CLINICIAN_REVIEW_ENABLED ?? '',
  // Comma-separated clinician emails (magic-link sign-in + this allowlist =
  // the clinician role; mirrors COMPANY_OPS_ALLOWLIST).
  CLINICIAN_ALLOWLIST: process.env.CLINICIAN_ALLOWLIST ?? '',
  // In-gym event-day slot booking (pilot MVP plan 2026-07-04). Off by default.
  // Gates /book, /book/manage, and every /api/pilot/* route.
  IN_GYM_BOOKING_ENABLED: process.env.IN_GYM_BOOKING_ENABLED ?? '',
  // SHA-256 of docs/legal/anthropic-dpa-signed.pdf. When set, the deploy gate
  // (scripts/verify-dpa-artifact.ts, wired into vercel-build) fails the build
  // unless the committed artifact matches — the artifact-backed DPA assertion
  // from docs/compliance/dpia.md. Empty = gate dormant (artifact with legal).
  ANTHROPIC_DPA_SHA256: process.env.ANTHROPIC_DPA_SHA256 ?? '',
};

export const env = {
  ...required,
  ...optional,
};

/**
 * Fail-closed startup check for production-only required secrets.
 *
 * Called from server-side entry points (middleware, route handlers) on first
 * import. In dev/test it no-ops — the magic-link + session code paths fall
 * back to deterministic dev-only behaviour so the flow stays exercisable.
 *
 * Rotating SESSION_SECRET in prod invalidates every outstanding session and
 * unconsumed magic-link token — that's the intended kill-switch.
 */
export function assertAuthEnv(): void {
  if (env.NODE_ENV !== 'production') return;
  const missing: string[] = [];
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET (>=32 chars)');
  if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!env.RESEND_FROM) missing.push('RESEND_FROM');
  // Concierge booking (Plan 2026-06-06-001) — fail closed when the flag is on:
  // a missing ops address silently drops every booking; a weak/absent ops
  // secret locks the fulfillment loop; an absent encryption key would store
  // redemption codes under a trivially-derivable key.
  if (env.CONCIERGE_BOOKING_ENABLED === 'true') {
    if (!env.OPS_EMAIL) missing.push('OPS_EMAIL (required when CONCIERGE_BOOKING_ENABLED)');
    if (!env.OPS_SECRET || env.OPS_SECRET.length < 32) missing.push('OPS_SECRET (>=32 chars, required when CONCIERGE_BOOKING_ENABLED)');
    if (!env.HEALTH_TOKEN_ENCRYPTION_KEY) missing.push('HEALTH_TOKEN_ENCRYPTION_KEY (required when CONCIERGE_BOOKING_ENABLED)');
  }
  // Retest loop (Plan 2026-06-17-001) — fail closed: without a strong CRON_SECRET
  // the nudge endpoint is either world-open or permanently 401, so refuse boot.
  if (env.RETEST_LOOP_ENABLED === 'true') {
    if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) {
      missing.push('CRON_SECRET (>=32 chars, required when RETEST_LOOP_ENABLED)');
    }
  }
  // Clinician review (pilot MVP plan 2026-07-04) — fail closed: with the flag
  // on, an empty allowlist means reviews accumulate pending with nobody able
  // to see the queue (a silent safety failure), and a missing OPS_EMAIL means
  // escalation notices to ops silently drop.
  if (env.CLINICIAN_REVIEW_ENABLED === 'true') {
    if (!env.CLINICIAN_ALLOWLIST.trim()) {
      missing.push('CLINICIAN_ALLOWLIST (required when CLINICIAN_REVIEW_ENABLED)');
    }
    if (!env.OPS_EMAIL) {
      missing.push('OPS_EMAIL (required when CLINICIAN_REVIEW_ENABLED)');
    }
  }
  if (missing.length) {
    throw new Error(`[env] Missing required auth secrets in production: ${missing.join(', ')}`);
  }
}

/**
 * Dev-only fallback secret. Deterministic across restarts so tokens issued
 * in one dev run still verify in the next. Never used in production — the
 * `assertAuthEnv()` guard above refuses boot if SESSION_SECRET is unset.
 */
export function getSessionSecret(): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.NODE_ENV === 'production') {
    throw new Error('[env] SESSION_SECRET is required in production');
  }
  return 'dev-only-session-secret-not-for-prod-use-0123456789abcdef';
}
