/**
 * Specialty registry types — see
 * docs/plans/2026-04-25-001-feat-synthetic-demo-and-referral-scribes-plan.md.
 *
 * The specialty registry is one rung above the topic-policy registry. A
 * specialty has a public-facing name, a scope description, and a status
 * ('core' = built out; 'stub' = registered-but-not-implemented). The general
 * scribe lists every specialty in its prompt so it can talk about them
 * honestly; only `core` specialties are reachable through the referral tool
 * with a working specialist response. Stub referrals fall back to the
 * general scribe with a visible "specialist not yet built" annotation.
 *
 * Distinct from the topic-policy registry (`src/lib/scribe/policy/registry`):
 * a Specialty is the higher-level concept; the safetyPolicyKey field links
 * back to the underlying SafetyPolicy that gates an actual scribe execution.
 */

export type SpecialtyStatus = 'core' | 'stub';

export interface Specialty {
  readonly key: string;
  readonly status: SpecialtyStatus;
  readonly displayName: string;
  readonly scope: string;
  /**
   * Repo-relative path to the specialist's system prompt markdown. Null for
   * stubs (no prompt yet). Stored as a path string rather than the prompt
   * text itself so prompts can be edited as plain markdown without a code
   * change; the loader reads the file at scribe-construction time.
   */
  readonly systemPromptPath: string | null;
  /**
   * Key into the topic-policy registry (`getPolicy`). Null for stubs. Core
   * specialties always have one — the executor would throw without it.
   */
  readonly safetyPolicyKey: string | null;
  /**
   * Message returned by the referral tool when the general scribe attempts
   * to consult a stub specialty. Required for stubs so the fallback isn't
   * silent; undefined for core specialties (the actual response is the
   * specialist's reply).
   */
  readonly referralFallbackMessage?: string;
}
