/**
 * Deploy gate for the Anthropic DPA artifact — runs at the front of
 * `vercel-build` (see src/lib/compliance/dpa-gate.ts for why this is a
 * build-time gate rather than the runtime boot assert the sub-processor
 * register originally sketched).
 *
 * Behavior:
 *   - ANTHROPIC_DPA_SHA256 unset  → one-line notice, exit 0 (gate dormant).
 *   - Artifact present + matching → confirmation, exit 0.
 *   - Missing or altered artifact → error, exit 1 → the deploy fails.
 *
 * Usage: tsx scripts/verify-dpa-artifact.ts
 */
import { DPA_ARTIFACT_PATH, verifyDpaArtifact } from '../src/lib/compliance/dpa-gate';

const result = verifyDpaArtifact({ expectedSha256: process.env.ANTHROPIC_DPA_SHA256 });

if (!result.ok) {
  console.error(`[dpa-gate] FAIL (${result.reason}): ${result.detail}`);
  console.error(
    '[dpa-gate] Deploys are blocked until the signed Anthropic DPA at ' +
      `${DPA_ARTIFACT_PATH} matches ANTHROPIC_DPA_SHA256. Fix the artifact ` +
      'or correct the env var in Vercel.',
  );
  process.exit(1);
}

if (result.reason === 'env_unset') {
  console.log(
    '[dpa-gate] ANTHROPIC_DPA_SHA256 not set — gate dormant, build continues. ' +
      `Set it in Vercel once legal supplies ${DPA_ARTIFACT_PATH}.`,
  );
} else {
  console.log(`[dpa-gate] Verified ${DPA_ARTIFACT_PATH} against ANTHROPIC_DPA_SHA256.`);
}
