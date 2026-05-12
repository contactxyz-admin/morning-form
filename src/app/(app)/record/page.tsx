import { Suspense } from 'react';
import { VaultLayout } from '@/components/record/vault-layout';

/**
 * `/record` is the unified vault surface — the merged `/record` + `/graph`
 * UX from docs/plans/2026-05-12-001-feat-record-vault-unification-plan.md.
 *
 * Page-level entry is intentionally thin; the orchestrator handles auth,
 * data fetch, URL-state, and the index/map mode swap.
 *
 * Suspense wrapper required because `<VaultLayout>` reads URL state via
 * `useSearchParams()`, which forces a client-side-rendering bailout at
 * build time without a boundary — see
 * https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout.
 * `fallback={null}` because `<VaultLayout>` renders its own loading state
 * the moment it hydrates.
 */
export default function RecordPage() {
  return (
    <Suspense fallback={null}>
      <VaultLayout />
    </Suspense>
  );
}
