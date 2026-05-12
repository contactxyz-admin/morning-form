/**
 * Pure-logic side of the vault mode primitive. Lives in a `.ts` file so
 * unit tests can import it without pulling the `.tsx` toggle's JSX through
 * vitest's node environment (no JSX plugin is configured at the moment;
 * see vitest.config.ts). The `<VaultModeToggle>` component re-exports the
 * symbols below so consumers have one canonical import path.
 */

/**
 * Canonical mode set for the vault surface. Adding a new mode (e.g. a
 * future timeline view) is a one-line append here — the parser, the type,
 * and the toggle's render loop all derive from this tuple.
 */
export const VAULT_MODES = ['index', 'map'] as const;
export type VaultMode = (typeof VAULT_MODES)[number];

/**
 * Coerce an unvalidated `?mode=` query param into a canonical {@link VaultMode}.
 * Anything outside the known set falls through to `'index'` — silently, so
 * stale or typo-d deep-links resolve to a working view rather than throwing.
 */
export function parseVaultMode(raw: string | null | undefined): VaultMode {
  return raw && (VAULT_MODES as readonly string[]).includes(raw) ? (raw as VaultMode) : 'index';
}
