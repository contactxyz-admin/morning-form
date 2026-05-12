import { VaultLayout } from '@/components/record/vault-layout';

/**
 * `/record` is the unified vault surface — the merged `/record` + `/graph`
 * UX from docs/plans/2026-05-12-001-feat-record-vault-unification-plan.md.
 *
 * Page-level entry is intentionally thin; the orchestrator handles auth,
 * data fetch, URL-state, and the index/map mode swap.
 */
export default function RecordPage() {
  return <VaultLayout />;
}
