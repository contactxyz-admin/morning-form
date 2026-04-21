/**
 * Pure helpers for the `AskAnywhereCard` home-surface entry point.
 * Kept separate from the component so they can be unit-tested in the
 * node-only test env (no jsdom/RTL).
 */

/**
 * Build a deep-link into `/ask` that auto-fires the first turn.
 * Returns `null` for empty/whitespace input so a malformed submit
 * can't navigate to a spurious URL.
 */
export function buildAskHref(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  return `/ask?seed=${encodeURIComponent(trimmed)}`;
}
