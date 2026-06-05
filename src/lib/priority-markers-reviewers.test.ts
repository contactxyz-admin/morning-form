import { afterEach, describe, expect, it } from 'vitest';
import {
  REVIEWERS,
  resolveReviewer,
} from '../../content/priority-markers/reviewers';

/**
 * Resolver for the priority-markers reveal attribution. The fail-safe is the
 * point: we render a "Medically reviewed by …" line ONLY for a registered,
 * displayable clinical key with a parseable review date. Every other path —
 * internal editorial key, unknown key, bad date — must resolve to null so the
 * UI never claims a medical review that didn't happen.
 */

// Probe key used to exercise the "registered clinical key" path without
// depending on the (currently empty) live clinical registry. Added per-test
// and torn down so the module-level registry is left untouched.
const PROBE_KEY = '__test-clinical-probe__';

afterEach(() => {
  delete REVIEWERS[PROBE_KEY];
});

describe('resolveReviewer', () => {
  it('returns null for the internal editorial key (NOT a medical review)', () => {
    expect(resolveReviewer('morning-form-editorial', '2026-05-10')).toBeNull();
  });

  it("maps 'morning-form-editorial' to a non-displayable (null) registry entry", () => {
    // Guards the CRITICAL invariant: the key is registered but explicitly
    // non-displayable, distinct from "unregistered".
    expect('morning-form-editorial' in REVIEWERS).toBe(true);
    expect(REVIEWERS['morning-form-editorial']).toBeNull();
  });

  it('returns null for an unknown / unregistered key (fail-safe)', () => {
    expect(resolveReviewer('not-a-real-key', '2026-05-10')).toBeNull();
  });

  it('builds the prefixed line + formatted date for a registered clinical key', () => {
    REVIEWERS[PROBE_KEY] = {
      displayName: 'Dr A Smith, GP (GMC 1234567) · Dr B Jones, MD',
      credentials: 'UK GP (GMC-registered) · US PCP (board-certified)',
    };

    const resolved = resolveReviewer(PROBE_KEY, '2026-05-10');

    expect(resolved).not.toBeNull();
    expect(resolved?.line).toBe(
      'Medically reviewed by Dr A Smith, GP (GMC 1234567) · Dr B Jones, MD',
    );
    expect(resolved?.reviewedAt).toBe('May 10, 2026');
  });

  it('returns null when the review date is missing or unparseable', () => {
    REVIEWERS[PROBE_KEY] = {
      displayName: 'Dr A Smith, GP',
      credentials: 'UK GP',
    };

    expect(resolveReviewer(PROBE_KEY, '')).toBeNull();
    expect(resolveReviewer(PROBE_KEY, 'not-a-date')).toBeNull();
  });
});
