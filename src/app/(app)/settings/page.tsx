'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/toggle';
import { TimePicker } from '@/components/ui/time-picker';
import Link from 'next/link';
import { EXPORT_MAX_DURATION_S } from '@/lib/account/export-constants';
import { type Preferences, PREF_DEFAULTS } from '@/lib/account/preferences-types';

// Latest export request as surfaced by GET /api/account/export.
type ExportRequest = {
  id: string;
  status: 'pending' | 'complete' | 'failed';
  failureReason: string | null;
  expiresAt: string | null;
  createdAt: string;
};

// Local view-state for the export control. `requesting` is the in-flight POST;
// `pending` is a server-side pending row (assembly underway). A pending row
// older than the route's maxDuration (300s) can never mark its own status (a
// timeout kill can't update its own row), so we present it as stale/failed.
type ExportView =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'pending' }
  | { kind: 'complete'; expiresAt: string | null }
  | { kind: 'failed'; reason: string | null };

// A pending row older than this is treated as stale. Derived from the route's
// maxDuration (EXPORT_MAX_DURATION_S) plus a 5-minute grace margin so a request
// still finishing right at the timeout edge isn't prematurely shown as failed.
// Once past it the request can no longer complete or self-fail.
const EXPORT_STALE_MS = (EXPORT_MAX_DURATION_S + 5 * 60) * 1000;

function exportViewFromRequest(req: ExportRequest | null): ExportView {
  if (!req) return { kind: 'idle' };
  if (req.status === 'complete') return { kind: 'complete', expiresAt: req.expiresAt };
  if (req.status === 'failed') return { kind: 'failed', reason: req.failureReason };
  // 'pending' — and any unrecognized status value — is treated as a pending
  // request (assembly underway) rather than silently dropping to idle. A
  // pending row older than the route could possibly still be running is stale.
  const age = Date.now() - new Date(req.createdAt).getTime();
  if (age > EXPORT_STALE_MS) {
    return { kind: 'failed', reason: 'The export timed out. Please try again.' };
  }
  return { kind: 'pending' };
}

// Local view-state for the delete control.
type DeleteView =
  | { kind: 'idle' }
  | { kind: 'confirming'; value: string; error: string | null }
  | { kind: 'requesting' }
  | { kind: 'sent' };

export default function SettingsPage() {
  const router = useRouter();
  const [wakeTime, setWakeTime] = useState(PREF_DEFAULTS.wakeTime);
  const [windDownTime, setWindDownTime] = useState(PREF_DEFAULTS.windDownTime);
  const [notifications, setNotifications] = useState({
    morning: PREF_DEFAULTS.notifyMorning,
    protocol: PREF_DEFAULTS.notifyProtocol,
    evening: PREF_DEFAULTS.notifyEvening,
    weekly: PREF_DEFAULTS.notifyWeekly,
  });
  // Guards write-through during the initial load so hydrating state from the
  // server doesn't echo straight back as a PUT.
  const loadedRef = useRef(false);

  // Account email — the real session user's email, loaded alongside preferences
  // (GET /api/user/preferences returns it as a sibling field). Null until loaded.
  const [email, setEmail] = useState<string | null>(null);

  // Data section: export + delete view-state.
  const [exportView, setExportView] = useState<ExportView>({ kind: 'idle' });
  const [deleteView, setDeleteView] = useState<DeleteView>({ kind: 'idle' });
  // Synchronous in-flight guards: a double-tap (two clicks before the view
  // state flips to a disabled state) must fire exactly one request.
  const exportInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);

  const requestExport = async () => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExportView({ kind: 'requesting' });
    try {
      const res = await fetch('/api/account/export', { method: 'POST' });
      if (res.ok) {
        // POST resolves only once the archive is built + emailed.
        setExportView({ kind: 'complete', expiresAt: null });
        return;
      }
      if (res.status === 429) {
        setExportView({
          kind: 'failed',
          reason: "You've reached the export limit. Please try again later.",
        });
        return;
      }
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      setExportView({ kind: 'failed', reason: json?.error ?? 'Export failed. Please try again.' });
    } catch {
      setExportView({ kind: 'failed', reason: 'Network error. Please try again.' });
    } finally {
      exportInFlightRef.current = false;
    }
  };

  const submitDeletion = async () => {
    // Only ever fired from the confirming view (the Delete button is rendered
    // there); guard on that rather than fabricating a 'DELETE' fallback value.
    if (deleteView.kind !== 'confirming') return;
    if (deleteInFlightRef.current) return;
    deleteInFlightRef.current = true;
    setDeleteView({ kind: 'requesting' });
    try {
      const res = await fetch('/api/account/delete/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (res.ok) {
        setDeleteView({ kind: 'sent' });
        return;
      }
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      setDeleteView({
        kind: 'confirming',
        value: 'DELETE',
        error: json?.error ?? 'Could not start deletion. Please try again.',
      });
    } catch {
      setDeleteView({
        kind: 'confirming',
        value: 'DELETE',
        error: 'Network error. Please try again.',
      });
    } finally {
      deleteInFlightRef.current = false;
    }
  };

  // Write the given fields through to the server. Local state is the optimistic
  // echo; this persists the change. Fire-and-forget — failures are non-fatal to
  // the local UI (a later unit can surface them if needed).
  const persist = (patch: Partial<Preferences>) => {
    if (!loadedRef.current) return;
    void fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  };

  const applyPrefs = (prefs: Preferences) => {
    setWakeTime(prefs.wakeTime);
    setWindDownTime(prefs.windDownTime);
    setNotifications({
      morning: prefs.notifyMorning,
      protocol: prefs.notifyProtocol,
      evening: prefs.notifyEvening,
      weekly: prefs.notifyWeekly,
    });
  };

  useEffect(() => {
    let cancelled = false;

    // Reads the legacy localStorage source-of-truth, if present. Only wake/
    // wind-down were ever stored there.
    const readLocalLegacy = (): Partial<Preferences> | null => {
      try {
        const raw = localStorage.getItem('mf_preferences');
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const obj = parsed as Record<string, unknown>;
        const patch: Partial<Preferences> = {};
        if (typeof obj.wakeTime === 'string') patch.wakeTime = obj.wakeTime;
        if (typeof obj.windDownTime === 'string') patch.windDownTime = obj.windDownTime;
        return Object.keys(patch).length > 0 ? patch : null;
      } catch {
        return null;
      }
    };

    (async () => {
      let serverPrefs: Preferences = PREF_DEFAULTS;
      let hasRow = false;
      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const json = (await res.json()) as {
            preferences?: Preferences;
            email?: string | null;
            hasRow?: boolean;
          };
          if (!cancelled && typeof json.email === 'string') setEmail(json.email);
          if (json.preferences) {
            serverPrefs = json.preferences;
            // The server reports authoritatively whether a real row exists.
            hasRow = json.hasRow === true;
          }
        }
      } catch {
        // Network failure — fall back to defaults / local below.
      }
      if (cancelled) return;

      // One-time migration: server has no row but a local mf_preferences exists
      // → PUT it once to preserve the per-device value, then adopt it locally.
      const localPatch = !hasRow ? readLocalLegacy() : null;
      if (localPatch) {
        const merged: Preferences = { ...serverPrefs, ...localPatch };
        applyPrefs(merged);
        try {
          await fetch('/api/user/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localPatch),
          });
        } catch {
          // Best-effort migration; local echo already applied.
        }
        // Only open the write-through gate AFTER the migration PUT resolves, so
        // a persist() racing the migration can't fire before it. Honor cancel.
        if (cancelled) return;
        loadedRef.current = true;
        return;
      }

      applyPrefs(serverPrefs);
      loadedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load the latest export request so a returning user sees current state
  // (e.g. "your export is ready") rather than a bare idle button.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/export');
        if (!res.ok) return;
        const json = (await res.json()) as { request?: ExportRequest | null };
        if (cancelled) return;
        setExportView(exportViewFromRequest(json.request ?? null));
      } catch {
        // Non-fatal: leave the control idle.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="px-5 pt-6 pb-8 grain-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="inline-flex items-center justify-center rounded-full -m-2 p-2 text-text-tertiary hover:text-text-primary transition-colors duration-300 ease-spring focus-visible:outline-none focus-visible:shadow-ring-focus"
          >
            <Icon name="back" size="md" />
          </button>
          <span className="text-label uppercase text-text-tertiary">Settings</span>
        </div>
      </div>

      <div className="rise">
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary mb-12 -tracking-[0.04em]">
          Preferences.
        </h1>
      </div>

      <div className="space-y-12 stagger">
        {/* Protocol Timing */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-5">
            <span className="font-mono text-label uppercase text-text-tertiary">01</span>
            <span className="text-label uppercase text-text-tertiary">Protocol timing</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-caption text-text-secondary mb-2">Wake time</label>
              <TimePicker
                value={wakeTime}
                onChange={(v) => {
                  setWakeTime(v);
                  persist({ wakeTime: v });
                }}
              />
            </div>
            <div>
              <label className="block text-caption text-text-secondary mb-2">Wind-down time</label>
              <TimePicker
                value={windDownTime}
                onChange={(v) => {
                  setWindDownTime(v);
                  persist({ windDownTime: v });
                }}
              />
            </div>
          </div>
        </section>

        <div className="rule" />

        {/* Notifications */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-5">
            <span className="font-mono text-label uppercase text-text-tertiary">02</span>
            <span className="text-label uppercase text-text-tertiary">Notifications</span>
          </div>
          <div className="space-y-5">
            <Toggle
              checked={notifications.morning}
              onChange={(v) => {
                setNotifications((prev) => ({ ...prev, morning: v }));
                persist({ notifyMorning: v });
              }}
              label="Morning check-in"
            />
            <Toggle
              checked={notifications.protocol}
              onChange={(v) => {
                setNotifications((prev) => ({ ...prev, protocol: v }));
                persist({ notifyProtocol: v });
              }}
              label="Protocol reminders"
            />
            <Toggle
              checked={notifications.evening}
              onChange={(v) => {
                setNotifications((prev) => ({ ...prev, evening: v }));
                persist({ notifyEvening: v });
              }}
              label="Evening check-in"
            />
            <Toggle
              checked={notifications.weekly}
              onChange={(v) => {
                setNotifications((prev) => ({ ...prev, weekly: v }));
                persist({ notifyWeekly: v });
              }}
              label="Weekly review"
            />
          </div>
        </section>

        <div className="rule" />

        {/* Integrations */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">03</span>
            <span className="text-label uppercase text-text-tertiary">Health integrations</span>
          </div>
          <Link
            href="/settings/integrations"
            className="inline-flex items-center gap-1.5 text-body text-accent font-medium group"
          >
            Manage connections
            <span aria-hidden className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5">→</span>
          </Link>
        </section>

        <div className="rule" />

        {/* Account */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">04</span>
            <span className="text-label uppercase text-text-tertiary">Account</span>
          </div>
          <div className="space-y-3">
            <p className="text-body text-text-secondary">{email ?? '—'}</p>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                router.push('/');
                router.refresh();
              }}
              className="block text-caption text-text-secondary hover:text-text-primary transition-colors duration-300 ease-spring"
            >
              Sign out
            </button>
          </div>
        </section>

        <div className="rule" />

        {/* Data */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">05</span>
            <span className="text-label uppercase text-text-tertiary">Data</span>
          </div>
          <div className="space-y-6">
            {/* Export my data */}
            <div className="space-y-2">
              {exportView.kind === 'requesting' ? (
                <p className="text-body text-text-tertiary">Preparing your export…</p>
              ) : exportView.kind === 'pending' ? (
                <p className="text-body text-text-tertiary">
                  Your export is being prepared. We&rsquo;ll email you when it&rsquo;s ready.
                </p>
              ) : exportView.kind === 'complete' ? (
                <div className="space-y-1">
                  <p className="text-body text-text-primary">
                    Your export is ready — we&rsquo;ve emailed you a download link.
                  </p>
                  <p className="text-caption text-text-tertiary">
                    The link expires in 24 hours and requires you to be signed in.
                  </p>
                </div>
              ) : exportView.kind === 'failed' ? (
                <div className="space-y-2">
                  <p className="text-body text-alert">
                    {exportView.reason ?? 'Export failed. Please try again.'}
                  </p>
                  <button
                    onClick={requestExport}
                    className="text-caption text-accent hover:underline underline-offset-4 block"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <button
                  onClick={requestExport}
                  className="text-body text-text-primary hover:text-accent transition-colors duration-300 ease-spring block"
                >
                  Export my data
                </button>
              )}
            </div>

            {/* Delete account */}
            <div className="space-y-2">
              {deleteView.kind === 'sent' ? (
                <p className="text-body text-text-secondary">
                  Check your email to confirm deletion. The confirmation link expires in 15
                  minutes.
                </p>
              ) : deleteView.kind === 'idle' ? (
                <button
                  onClick={() => setDeleteView({ kind: 'confirming', value: '', error: null })}
                  className="text-body text-alert hover:opacity-80 transition-opacity block"
                >
                  Delete account
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-caption text-text-secondary">
                    This permanently erases your account and all your data. Type{' '}
                    <span className="font-mono text-text-primary">DELETE</span> to confirm.
                  </p>
                  <input
                    type="text"
                    // During 'requesting' the input is disabled and shows the
                    // confirmed 'DELETE' value; 'value' lives only on the
                    // 'confirming' variant.
                    value={deleteView.kind === 'confirming' ? deleteView.value : 'DELETE'}
                    onChange={(e) =>
                      setDeleteView({ kind: 'confirming', value: e.target.value, error: null })
                    }
                    disabled={deleteView.kind === 'requesting'}
                    autoFocus
                    aria-label="Type DELETE to confirm account deletion"
                    placeholder="DELETE"
                    className="w-full bg-transparent border-b border-border focus:border-alert outline-none text-body text-text-primary py-1.5 font-mono placeholder:text-text-tertiary placeholder:font-mono transition-colors duration-300 ease-spring"
                  />
                  {deleteView.kind === 'confirming' && deleteView.error && (
                    <p className="text-caption text-alert">{deleteView.error}</p>
                  )}
                  <div className="flex items-center gap-5">
                    <button
                      onClick={submitDeletion}
                      disabled={
                        deleteView.kind === 'requesting' || deleteView.value !== 'DELETE'
                      }
                      className="text-body text-alert hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deleteView.kind === 'requesting' ? 'Sending…' : 'Delete account'}
                    </button>
                    {deleteView.kind !== 'requesting' && (
                      <button
                        onClick={() => setDeleteView({ kind: 'idle' })}
                        className="text-caption text-text-secondary hover:text-text-primary transition-colors duration-300 ease-spring"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="rule" />

        {/* Privacy */}
        <section>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-mono text-label uppercase text-text-tertiary">06</span>
            <span className="text-label uppercase text-text-tertiary">Privacy</span>
          </div>
          <Link
            href="/settings/privacy"
            className="inline-flex items-center gap-1.5 text-body text-accent font-medium group"
          >
            Sub-processors & your rights
            <span aria-hidden className="transition-transform duration-450 ease-spring group-hover:translate-x-0.5">→</span>
          </Link>
        </section>
      </div>
    </div>
  );
}
