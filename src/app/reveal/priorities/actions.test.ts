import { describe, expect, it, vi } from 'vitest';
import type { incrementDiagnostic as IncrementDiagnostic } from '@/lib/marketing/diagnostic';
import type { redirect as Redirect } from 'next/navigation';

// Next signals redirects by throwing an Error with a digest of
// `NEXT_REDIRECT;<type>;<path>;<status>;`. Checking the digest prefix is the
// stable detection contract — the internal isRedirectError import path has
// shifted across Next minor versions.
const isRedirectError = (e: unknown): e is Error & { digest: string } =>
  e instanceof Error &&
  'digest' in e &&
  typeof (e as { digest: unknown }).digest === 'string' &&
  (e as { digest: string }).digest.startsWith('NEXT_REDIRECT');

const { incrementDiagnostic, redirect } = vi.hoisted(() => ({
  incrementDiagnostic: vi.fn<typeof IncrementDiagnostic>(),
  redirect: vi.fn<typeof Redirect>((path) => {
    const err = new Error('NEXT_REDIRECT') as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw err;
  }),
}));

vi.mock('@/lib/marketing/diagnostic', () => ({ incrementDiagnostic }));
vi.mock('next/navigation', () => ({ redirect }));

import { trackIntakeClickAndRedirect } from './actions';

describe('trackIntakeClickAndRedirect', () => {
  it('increments the priorities-to-intake-click counter, then redirects to /intake', async () => {
    await expect(trackIntakeClickAndRedirect()).rejects.toSatisfy(isRedirectError);
    expect(incrementDiagnostic).toHaveBeenCalledWith('priorities-to-intake-click');
    expect(redirect).toHaveBeenCalledWith('/intake');
  });
});
