import { describe, expect, it, vi } from 'vitest';

const incrementDiagnostic = vi.fn();
const redirect = vi.fn((path: string) => {
  // next/navigation's redirect signals control flow by throwing a special
  // marker error. We mimic the throw so the action terminates after the
  // redirect, the same way it does in a real server-action invocation.
  throw new Error(`__NEXT_REDIRECT:${path}`);
});

vi.mock('@/lib/marketing/diagnostic', () => ({
  incrementDiagnostic: (key: string) => incrementDiagnostic(key),
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}));

import { trackIntakeClickAndRedirect } from './actions';

describe('trackIntakeClickAndRedirect', () => {
  it('increments the priorities-to-intake-click counter and redirects to /intake', async () => {
    await expect(trackIntakeClickAndRedirect()).rejects.toThrow(
      '__NEXT_REDIRECT:/intake',
    );

    expect(incrementDiagnostic).toHaveBeenCalledWith('priorities-to-intake-click');
    expect(incrementDiagnostic).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith('/intake');
  });
});
