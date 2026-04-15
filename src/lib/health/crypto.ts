import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

// AES-256-GCM for provider tokens at rest. Format (hex):
//   <iv(12)>:<authTag(16)>:<ciphertext>
// Key is derived from HEALTH_TOKEN_ENCRYPTION_KEY via sha256 so operators can
// supply any non-empty secret (passphrase, generated hex, etc.). Rotating the
// env value invalidates stored tokens by design — users re-auth.

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function getKey(): Buffer {
  const raw = process.env.HEALTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('HEALTH_TOKEN_ENCRYPTION_KEY is required in production');
    }
    // Dev-only deterministic fallback so local dev doesn't require env setup.
    return createHash('sha256').update('morning-form-dev-key').digest();
  }
  return createHash('sha256').update(raw).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptToken(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }
  const [ivHex, tagHex, encHex] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

// Returns true if the value looks like an encryptToken output. Used during
// migration/transition so callers can tolerate existing plaintext rows.
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
