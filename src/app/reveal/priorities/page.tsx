import { PrioritiesClient } from './priorities-client';
import { PrioritiesInterstitial } from './interstitial';

/**
 * `/reveal/priorities` route entry. Server component.
 *
 * Gates the rich priorities surface behind the PRIORITY_MARKERS_ENABLED
 * env flag. Default (flag unset / not 'true') = interstitial. Flip the
 * Vercel project env to `PRIORITY_MARKERS_ENABLED=true` after UK GP +
 * US PCP sign-off on `content/priority-markers/*.ts`. Process:
 *
 *   1. Clinical reviewer reads the content files, leaves notes.
 *   2. Notes addressed in a content-only commit; `reviewerKey` flipped
 *      from 'morning-form-editorial' to a reviewer identifier.
 *   3. CI green; production migration sequence runs.
 *   4. `PRIORITY_MARKERS_ENABLED=true` set in Vercel; deploy.
 *
 * The flag is server-only (not NEXT_PUBLIC_*) so the gate value is not
 * surfaced to clients. Once enabled, this wrapper is a no-op and can
 * be inlined back into the client component.
 */
export default function PrioritiesPage() {
  const enabled = process.env.PRIORITY_MARKERS_ENABLED === 'true';
  if (!enabled) return <PrioritiesInterstitial />;
  return <PrioritiesClient />;
}
