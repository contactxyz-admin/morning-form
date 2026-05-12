'use client';

import { cn } from '@/lib/utils';
import { VAULT_MODES, parseVaultMode, type VaultMode } from './vault-mode';

// Re-export the pure-logic symbols so consumers have one canonical import.
export { VAULT_MODES, parseVaultMode };
export type { VaultMode };

interface VaultModeToggleProps {
  active: VaultMode;
  onChange: (mode: VaultMode) => void;
  /** Disabled when the user has no graph yet — map mode would be empty. */
  disabled?: boolean;
}

const MODES: { id: VaultMode; label: string; hint: string }[] = [
  { id: 'index', label: 'Index', hint: 'Topics, activity, catalogue' },
  { id: 'map', label: 'Map', hint: 'Force-directed graph of your record' },
];

/**
 * Pill-style mode toggle for the vault header. Stateless — owner reads/writes
 * the mode via URL state (`?mode=`) so the choice is bookmarkable.
 *
 * When `disabled` (no nodes yet), both pills render but only the active one
 * remains clickable to its own state. The non-active disabled pill exposes
 * a tooltip explaining why — see <VaultLayout> for the empty-state copy.
 */
export function VaultModeToggle({ active, onChange, disabled }: VaultModeToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Vault view"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-warm/60 p-1 backdrop-blur-sm"
    >
      {MODES.map((mode) => {
        const isActive = active === mode.id;
        const isClickable = !disabled || isActive;
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={!isClickable}
            disabled={!isClickable}
            onClick={() => isClickable && onChange(mode.id)}
            title={mode.hint}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-caption font-medium uppercase tracking-[0.06em]',
              'transition-colors duration-300 ease-spring',
              isActive
                ? 'bg-bg text-text-primary shadow-sm'
                : isClickable
                  ? 'text-text-tertiary hover:text-text-secondary'
                  : 'text-text-whisper cursor-not-allowed',
            )}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
