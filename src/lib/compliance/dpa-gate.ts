/**
 * Anthropic DPA artifact gate (sub-processor register, "DPA artifact gate").
 *
 * Implemented as a DEPLOY gate, not a runtime boot gate: assertAuthEnv()
 * runs in Edge middleware where node:fs/node:crypto are unavailable, and
 * failing the Vercel build is strictly better than refusing runtime boot
 * (no prod outage window). scripts/verify-dpa-artifact.ts runs this at the
 * front of `vercel-build`.
 *
 * Dormant until legal supplies the signed artifact and its hash is set in
 * Vercel as ANTHROPIC_DPA_SHA256 — with the env var unset the gate passes
 * with a notice, so nothing changes for current deploys (safe-increment
 * posture). Once set, a deploy whose repo copy of the signed DPA is missing
 * or altered fails the build.
 *
 * Node-only (node:fs/node:crypto) — must never be imported from app runtime
 * code; the build script is the sole production caller.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const DPA_ARTIFACT_PATH = 'docs/legal/anthropic-dpa-signed.pdf';

export type DpaGateResult =
  | { ok: true; reason: 'env_unset' | 'verified' }
  | { ok: false; reason: 'missing_artifact' | 'hash_mismatch'; detail: string };

export function verifyDpaArtifact(input: {
  expectedSha256: string | undefined;
  artifactPath?: string;
}): DpaGateResult {
  const expected = (input.expectedSha256 ?? '').trim().toLowerCase();
  if (expected === '') {
    return { ok: true, reason: 'env_unset' };
  }

  const artifactPath = input.artifactPath ?? DPA_ARTIFACT_PATH;
  let bytes: Buffer;
  try {
    bytes = readFileSync(artifactPath);
  } catch {
    return {
      ok: false,
      reason: 'missing_artifact',
      detail: `ANTHROPIC_DPA_SHA256 is set but ${artifactPath} is missing or unreadable.`,
    };
  }

  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    return {
      ok: false,
      reason: 'hash_mismatch',
      // Both hashes are safe to print — they identify the artifact, they
      // don't reveal its contents.
      detail: `sha256(${artifactPath}) = ${actual}, expected ${expected}.`,
    };
  }

  return { ok: true, reason: 'verified' };
}
