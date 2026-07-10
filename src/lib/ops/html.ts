/**
 * Escaping helpers shared by every ops surface that builds founder-facing
 * markup from user-entered text (task titles, org names, next steps).
 * One implementation so a hardening fix can never apply to one email and
 * miss the other.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Slack messages use &, < and > as control characters (links, mentions,
 * <!channel> broadcasts). Escaping them stops a task titled "<!channel>"
 * from paging the whole workspace and keeps "<v2 draft>" visible.
 */
export function escapeSlackText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
