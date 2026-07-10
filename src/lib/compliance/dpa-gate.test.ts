import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyDpaArtifact } from './dpa-gate';

const dir = mkdtempSync(path.join(tmpdir(), 'dpa-gate-'));
const artifactPath = path.join(dir, 'anthropic-dpa-signed.pdf');
const ARTIFACT_BYTES = Buffer.from('%PDF-1.4 signed dpa fixture');
writeFileSync(artifactPath, ARTIFACT_BYTES);
const GOOD_HASH = createHash('sha256').update(ARTIFACT_BYTES).digest('hex');

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('verifyDpaArtifact', () => {
  it('passes with reason env_unset when the hash env is unset/empty/whitespace', () => {
    for (const expectedSha256 of [undefined, '', '   ']) {
      expect(verifyDpaArtifact({ expectedSha256, artifactPath })).toEqual({
        ok: true,
        reason: 'env_unset',
      });
    }
  });

  it('verifies a matching artifact, tolerating case and padding on the env value', () => {
    for (const expectedSha256 of [GOOD_HASH, ` ${GOOD_HASH.toUpperCase()} `]) {
      expect(verifyDpaArtifact({ expectedSha256, artifactPath })).toEqual({
        ok: true,
        reason: 'verified',
      });
    }
  });

  it('fails with hash_mismatch on an altered artifact', () => {
    const result = verifyDpaArtifact({ expectedSha256: 'a'.repeat(64), artifactPath });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'hash_mismatch' });
  });

  it('fails with missing_artifact when the env is set but the file is absent', () => {
    const result = verifyDpaArtifact({
      expectedSha256: GOOD_HASH,
      artifactPath: path.join(dir, 'does-not-exist.pdf'),
    });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'missing_artifact' });
  });
});
