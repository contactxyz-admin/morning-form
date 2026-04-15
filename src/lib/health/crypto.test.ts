import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken, isEncrypted } from './crypto';

describe('token crypto', () => {
  it('round-trips a token', () => {
    const plain = 'libre-session-abc123';
    const enc = encryptToken(plain);
    expect(enc).not.toContain(plain);
    expect(decryptToken(enc)).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = encryptToken('same-input');
    const b = encryptToken('same-input');
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe('same-input');
    expect(decryptToken(b)).toBe('same-input');
  });

  it('rejects tampered ciphertext via auth tag', () => {
    const enc = encryptToken('secret');
    const [iv, tag, ct] = enc.split(':');
    const flipped = ct.slice(0, -2) + (ct.endsWith('00') ? 'ff' : '00');
    expect(() => decryptToken(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it('rejects malformed payloads', () => {
    expect(() => decryptToken('not-encrypted')).toThrow();
    expect(() => decryptToken('aa:bb')).toThrow();
  });

  it('isEncrypted recognizes output of encryptToken', () => {
    expect(isEncrypted(encryptToken('x'))).toBe(true);
    expect(isEncrypted('plain-text-token')).toBe(false);
    expect(isEncrypted('mock_libre_abc123')).toBe(false);
  });
});
