/**
 * Client-side track() — fire-and-forget event posts to /api/events.
 *
 * Generates and persists a stable `funnelId` in localStorage on first
 * call. The id survives across pre-signin and post-signin paths so a
 * user's pre-auth landing+assessment+reveal events stitch to their
 * post-auth sign_in_completed and first_ask_sent.
 *
 * Uses fetch keepalive so events fire even when the page is about to
 * unload (e.g. clicking a link from /reveal/begin to /sign-in).
 */

const FUNNEL_ID_KEY = 'mf_funnel_id';

function generateFunnelId(): string {
  // crypto.randomUUID is available in all modern browsers + Node 19+.
  // Falls back to Math.random for ancient Safari (data-quality hit,
  // not a correctness issue — the id just needs to be unique enough
  // to identify one user's session path).
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function getFunnelId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(FUNNEL_ID_KEY);
    if (existing) return existing;
    const fresh = generateFunnelId();
    window.localStorage.setItem(FUNNEL_ID_KEY, fresh);
    return fresh;
  } catch {
    // Private browsing / quota — emit a per-call ephemeral id so the
    // event still gets written, but cross-event stitching breaks.
    // Better partial data than zero data.
    return generateFunnelId();
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const funnelId = getFunnelId();
  if (!funnelId) return;

  const body = JSON.stringify({
    funnelId,
    event,
    path: window.location.pathname,
    properties: properties ?? null,
  });

  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // Survives navigation — critical for events fired just before
      // a route transition (e.g. assessment_completed → /processing).
      keepalive: true,
    });
  } catch {
    /* analytics MUST NOT break the flow it's measuring */
  }
}
