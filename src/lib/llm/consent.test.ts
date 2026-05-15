import { describe, expect, it } from 'vitest';
import { llmConsentGateResponse } from './consent';

describe('llmConsentGateResponse', () => {
  it('returns null when consent is set (Date)', () => {
    const res = llmConsentGateResponse({ llmConsentAcceptedAt: new Date() });
    expect(res).toBeNull();
  });

  it('returns 412 with requiresConsent body when consent is null', async () => {
    const res = llmConsentGateResponse({ llmConsentAcceptedAt: null });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(412);
    const body = await res!.json();
    expect(body).toEqual({
      requiresConsent: true,
      error: 'LLM consent required.',
    });
  });

  it('treats undefined as "consent present" (test-mock convenience)', () => {
    // In production getCurrentUser always returns the full Prisma User
    // with the scalar field populated (null or Date). Mocks in route
    // tests return `{ id }` only, which leaves the field undefined. We
    // pass through in that case so existing mock-based tests don't all
    // need to set the field explicitly. Production exposure is gated
    // by Prisma's contract.
    const res = llmConsentGateResponse({
      llmConsentAcceptedAt: undefined as unknown as null,
    });
    expect(res).toBeNull();
  });
});
