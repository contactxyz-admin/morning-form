import { describe, expect, it } from 'vitest';
import { classifyInsightsArms, type ArmStatus } from './use-insights-data';

/**
 * The hook itself relies on React state/effects and runs only in the browser,
 * so we test its load decision at the pure seam: `classifyInsightsArms`. This
 * function owns the per-arm policy the page depends on — weekly + check-in are
 * required, health-history is optional and degrades to an empty section.
 *
 * (node-env vitest; no jsdom — see vitest.config.ts.)
 */

const ok = (status = 200): ArmStatus => ({ ok: true, status });
const fail = (status = 500): ArmStatus => ({ ok: false, status });

describe('classifyInsightsArms', () => {
  it('all arms ok → proceed with health-history readable (empty payloads stay ready)', () => {
    // An ok-but-empty payload is still ok at the HTTP layer; readiness/empty
    // handling lives in the body, not the classifier.
    expect(classifyInsightsArms(ok(), ok(), ok())).toEqual({
      kind: 'proceed',
      healthHistoryOk: true,
    });
  });

  it('health-history 500 → proceed (degraded), health-history NOT read', () => {
    // The verified gap: a failed wearable/history arm must not fail the page.
    expect(classifyInsightsArms(ok(), ok(), fail(500))).toEqual({
      kind: 'proceed',
      healthHistoryOk: false,
    });
  });

  it('check-in 500 → page-level error (required arm)', () => {
    const result = classifyInsightsArms(ok(), fail(500), ok());
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toBe('HTTP 200/500/200');
    }
  });

  it('weekly 500 → page-level error (required arm)', () => {
    const result = classifyInsightsArms(fail(500), ok(), ok());
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toBe('HTTP 500/200/200');
    }
  });

  it('a failed required arm wins over a failed optional arm', () => {
    // weekly fails AND health-history fails → still an error (required dominates).
    expect(classifyInsightsArms(fail(500), ok(), fail(500)).kind).toBe('error');
  });

  it('401 on the health-history arm → unauthenticated (session gone for all)', () => {
    expect(classifyInsightsArms(ok(), ok(), fail(401))).toEqual({
      kind: 'unauthenticated',
    });
  });

  it('401 on a required arm → unauthenticated, not error', () => {
    expect(classifyInsightsArms(fail(401), ok(), ok())).toEqual({
      kind: 'unauthenticated',
    });
    expect(classifyInsightsArms(ok(), fail(401), ok())).toEqual({
      kind: 'unauthenticated',
    });
  });

  it('401 takes precedence over a 500 on another arm', () => {
    // A required arm 500 plus an optional arm 401 → unauthenticated (auth first).
    expect(classifyInsightsArms(fail(500), ok(), fail(401))).toEqual({
      kind: 'unauthenticated',
    });
  });
});
