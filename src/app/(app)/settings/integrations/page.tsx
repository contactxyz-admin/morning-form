'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import type { HealthProvider, HealthSummary } from '@/types';

interface ProviderConfig {
  name: string;
  description: string;
  icon: string;
  features: string[];
}

const providers: Record<HealthProvider, ProviderConfig> = {
  apple_health: { name: 'Apple Health', description: 'Connected through the Morning Form iPhone app', icon: '♥', features: ['sleep', 'activity', 'heart', 'hrv'] },
  whoop: { name: 'Whoop', description: 'Recovery, strain, sleep stages, HRV', icon: 'W', features: ['recovery', 'strain', 'sleep', 'hrv'] },
  oura: { name: 'Oura', description: 'Readiness, sleep quality, activity, temperature', icon: 'O', features: ['readiness', 'sleep', 'activity', 'temperature'] },
  fitbit: { name: 'Fitbit', description: 'Sleep, heart rate, activity, SpO2', icon: 'F', features: ['sleep', 'heart', 'activity', 'spo2'] },
  garmin: { name: 'Garmin', description: 'Training load, recovery, sleep, stress', icon: 'G', features: ['training', 'recovery', 'sleep', 'stress'] },
  google_fit: { name: 'Google Fit', description: 'Activity, sleep, vitals', icon: '⊕', features: ['activity', 'sleep', 'vitals'] },
  dexcom: { name: 'Dexcom', description: 'Continuous glucose monitoring (CGM)', icon: '◉', features: ['glucose'] },
  libre: { name: 'FreeStyle Libre', description: 'CGM via LibreLinkUp — enter your Libre email and password', icon: '◎', features: ['glucose'] },
};

export default function IntegrationsPage() {
  const router = useRouter();
  const [connections, setConnections] = useState<Record<string, { connected: boolean; lastSync: string | null; status?: string; expiresAt?: string | null; metadata?: Record<string, unknown> | null }>>({});
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);
  const [callbackState, setCallbackState] = useState<{ status: string | null; provider: string | null; message: string | null }>({
    status: null,
    provider: null,
    message: null,
  });
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  // Libre is credential-auth. We collect email + password via an inline form
  // rather than `window.prompt` so the password input can be masked
  // (`<input type="password">`). The values live in local state only for the
  // submit cycle; they are never persisted client-side.
  const [libreFormOpen, setLibreFormOpen] = useState(false);
  const [libreEmail, setLibreEmail] = useState('');
  const [librePassword, setLibrePassword] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackState({
      status: params.get('status'),
      provider: params.get('provider'),
      message: params.get('message'),
    });
  }, []);

  const reloadConnections = async () => {
    const [connectionsResponse, summaryResponse] = await Promise.all([
      fetch('/api/health/connections', { cache: 'no-store' }),
      fetch('/api/health/sync', { cache: 'no-store' }),
    ]);

    if (connectionsResponse.ok) {
      const data = await connectionsResponse.json();
      const normalized = (data.connections as Array<{ provider: string; status: string; lastSyncAt: string | null; expiresAt: string | null; metadata: Record<string, unknown> | null }>).reduce(
        (acc, connection) => {
          acc[connection.provider] = {
            connected: connection.status === 'connected',
            lastSync: connection.lastSyncAt,
            status: connection.status,
            expiresAt: connection.expiresAt,
            metadata: connection.metadata,
          };
          return acc;
        },
        {} as Record<string, { connected: boolean; lastSync: string | null; status?: string; expiresAt?: string | null; metadata?: Record<string, unknown> | null }>
      );
      setConnections(normalized);
    }

    if (summaryResponse.ok) {
      const data = await summaryResponse.json();
      setHealthSummary((data.summary ?? null) as HealthSummary | null);
    }
  };

  useEffect(() => {
    reloadConnections();

    const interval = window.setInterval(() => {
      reloadConnections();
    }, 5000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        reloadConnections();
      }
    };

    window.addEventListener('focus', reloadConnections);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', reloadConnections);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const connectProvider = async (provider: HealthProvider, extraBody: Record<string, string> = {}) => {
    // Libre takes a credentials path via submitLibreCredentials. Callers that
    // hit the Connect button for libre should open the inline form instead
    // of invoking this directly with no credentials.
    if (provider === 'libre' && !extraBody.email) {
      setLibreFormOpen(true);
      return;
    }

    setLoadingProvider(provider);
    try {
      const response = await fetch('/api/health/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...extraBody }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect');
      }

      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        // Credential providers (e.g. libre) don't redirect — reload state.
        await reloadConnections();
        setLoadingProvider(null);
      }
    } catch (error) {
      console.error(error);
      setSyncMessage(error instanceof Error ? error.message : 'Failed to connect provider');
      setLoadingProvider(null);
    }
  };

  const submitLibreCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!libreEmail || !librePassword) return;
    await connectProvider('libre', { email: libreEmail, password: librePassword });
    setLibreEmail('');
    setLibrePassword('');
    setLibreFormOpen(false);
  };

  const disconnectProvider = async (provider: HealthProvider) => {
    setLoadingProvider(provider);
    try {
      const response = await fetch('/api/health/connections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      setConnections((prev) => ({
        ...prev,
        [provider]: { connected: false, lastSync: null, status: 'disconnected' },
      }));
    } catch (error) {
      console.error(error);
      setSyncMessage(error instanceof Error ? error.message : 'Failed to disconnect provider');
    } finally {
      setLoadingProvider(null);
    }
  };

  const syncProvider = async (provider: HealthProvider) => {
    setSyncingProvider(provider);
    setSyncMessage(null);
    try {
      const response = await fetch('/api/health/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: [provider] }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync provider');
      }

      const result = data.results?.[0];
      if (result?.ok) {
        setSyncMessage(`${providers[provider].name} synced successfully.`);
      } else if (result?.error) {
        setSyncMessage(result.error);
      }
      await reloadConnections();
    } catch (error) {
      console.error(error);
      setSyncMessage(error instanceof Error ? error.message : 'Failed to sync provider');
    } finally {
      setSyncingProvider(null);
    }
  };

  const appleHealthConnection = connections.apple_health;
  const appleHealthConnected = appleHealthConnection?.connected || false;
  const appleHealthHasData = Boolean(
    healthSummary?.sleep.duration ||
      healthSummary?.activity.steps ||
      healthSummary?.heart.avgHR ||
      healthSummary?.heart.restingHR ||
      healthSummary?.recovery.hrv
  );

  return (
    <div className="px-5 pt-6 pb-8">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.back()} className="text-text-tertiary hover:text-text-primary">
          <Icon name="back" size="md" />
        </button>
        <h1 className="text-heading font-medium text-text-primary">Health Integrations</h1>
      </div>
      <p className="text-body text-text-secondary mb-8">
        Connect your devices to enrich your profile with objective health data.
      </p>

      <Card variant={appleHealthConnected ? 'contextual' : 'action'} accentColor={appleHealthConnected ? undefined : 'teal'} className="mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-card bg-accent-light flex items-center justify-center text-accent font-mono text-body font-medium shrink-0">
            ♥
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body font-medium text-text-primary">
              {appleHealthConnected ? 'Apple Health is connected through your iPhone.' : 'Finish Apple Health connection on your iPhone.'}
            </p>
            <p className="mt-1 text-caption text-text-secondary leading-relaxed">
              {appleHealthConnected
                ? 'Open the Morning Form iPhone app, tap Refresh, then Sync to Morning Form. This page refreshes automatically and should show the latest data within a few seconds.'
                : 'Run through Morning Form on the web first, then open the Morning Form iPhone app to authorize Apple Health and sync the snapshot back here.'}
            </p>

            {!appleHealthConnected && (
              <div className="mt-4 space-y-2">
                <p className="text-caption text-text-primary">Recommended flow</p>
                <div className="space-y-1.5">
                  <p className="text-caption text-text-secondary">1. Complete onboarding and assessment in Morning Form web.</p>
                  <p className="text-caption text-text-secondary">2. Open the iPhone app and tap Authorize Apple Health.</p>
                  <p className="text-caption text-text-secondary">3. Tap Refresh, then Sync to Morning Form.</p>
                  <p className="text-caption text-text-secondary">4. Return here to confirm connection and see synced data.</p>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => reloadConnections()}>
                Refresh status
              </Button>
              <Button size="sm" variant="secondary" onClick={() => router.push('/home')}>
                Go to Home
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {appleHealthConnected && appleHealthHasData && healthSummary && (
        <Card variant="default" className="mb-6">
          <p className="text-caption uppercase tracking-widest text-text-tertiary">Apple Health Snapshot</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="font-mono text-data text-accent">{healthSummary.sleep.duration ?? '—'}{healthSummary.sleep.duration ? 'h' : ''}</p>
              <p className="text-caption text-text-tertiary">Sleep</p>
            </div>
            <div>
              <p className="font-mono text-data text-accent">{healthSummary.activity.steps ?? '—'}</p>
              <p className="text-caption text-text-tertiary">Steps</p>
            </div>
            <div>
              <p className="font-mono text-data text-accent">{healthSummary.heart.avgHR ?? '—'}{healthSummary.heart.avgHR ? ' bpm' : ''}</p>
              <p className="text-caption text-text-tertiary">Heart rate</p>
            </div>
            <div>
              <p className="font-mono text-data text-accent">{healthSummary.recovery.hrv ?? '—'}{healthSummary.recovery.hrv ? ' ms' : ''}</p>
              <p className="text-caption text-text-tertiary">HRV</p>
            </div>
          </div>
          {appleHealthConnection?.lastSync && (
            <p className="mt-4 text-caption text-text-tertiary">
              Last synced {new Date(appleHealthConnection.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </Card>
      )}

      {callbackState.status && callbackState.provider && (
        <Card variant={callbackState.status === 'connected' ? 'contextual' : 'action'} accentColor={callbackState.status === 'connected' ? undefined : 'amber'} className="mb-6">
          <p className="text-body text-text-primary">
            {callbackState.status === 'connected'
              ? `${providers[callbackState.provider as HealthProvider]?.name || callbackState.provider} connected successfully.`
              : `Connection issue for ${providers[callbackState.provider as HealthProvider]?.name || callbackState.provider}.`}
          </p>
          {callbackState.message && <p className="mt-1 text-caption text-text-secondary">{callbackState.message}</p>}
        </Card>
      )}

      {syncMessage && (
        <Card variant="contextual" className="mb-6">
          <p className="text-caption text-text-secondary">{syncMessage}</p>
        </Card>
      )}

      <div className="space-y-4">
        {(Object.entries(providers) as [HealthProvider, ProviderConfig][]).map(([key, provider], i) => {
          const conn = connections[key];
          const isConnected = conn?.connected || false;
          const lastSync = conn?.lastSync;
          const syncError = typeof conn?.metadata?.syncError === 'string' ? conn.metadata.syncError : null;
          const expiresAt = conn?.expiresAt ? new Date(conn.expiresAt) : null;
          const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : false;
          const requiresNativeApp = key === 'apple_health';
          const nativeHealthKitSource = conn?.metadata?.source === 'native_healthkit';

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card variant="default">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 rounded-card bg-accent-light flex items-center justify-center text-accent font-mono text-body font-medium shrink-0">
                      {provider.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-body font-medium text-text-primary">{provider.name}</h3>
                        {isConnected && <div className="w-2 h-2 rounded-full bg-positive shrink-0" />}
                        {conn?.status === 'syncing' && <span className="text-[10px] uppercase tracking-wide text-accent">Syncing</span>}
                        {conn?.status === 'error' && <span className="text-[10px] uppercase tracking-wide text-alert">Error</span>}
                      </div>
                      <p className="text-caption text-text-secondary mt-0.5">{provider.description}</p>
                      {requiresNativeApp && (
                        <p className="text-caption text-caution mt-1">
                          Apple Health sync is driven by the native iPhone app. Open the iOS wrapper, authorize Apple Health, then sync back into Morning Form.
                        </p>
                      )}
                      {nativeHealthKitSource && (
                        <p className="text-caption text-positive mt-1">
                          Connected via native iPhone app.
                        </p>
                      )}
                      {isConnected && lastSync && (
                        <p className="text-caption text-text-tertiary mt-1">
                          Last synced: {new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                      {isExpired && (
                        <p className="text-caption text-caution mt-1">Access token expired. Morning Form will try to refresh it on next sync.</p>
                      )}
                      {syncError && (
                        <p className="text-caption text-alert mt-1">{syncError}</p>
                      )}
                      {key === 'libre' && libreFormOpen && !isConnected && (
                        <form onSubmit={submitLibreCredentials} className="mt-3 space-y-2">
                          <input
                            type="email"
                            required
                            autoComplete="email"
                            placeholder="LibreLinkUp email"
                            value={libreEmail}
                            onChange={(e) => setLibreEmail(e.target.value)}
                            className="w-full rounded-card border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                          <input
                            type="password"
                            required
                            autoComplete="current-password"
                            placeholder="LibreLinkUp password"
                            value={librePassword}
                            onChange={(e) => setLibrePassword(e.target.value)}
                            className="w-full rounded-card border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" loading={loadingProvider === 'libre'}>
                              Connect
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setLibreFormOpen(false);
                                setLibreEmail('');
                                setLibrePassword('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {isConnected && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={syncingProvider === key}
                        disabled={requiresNativeApp}
                        onClick={() => syncProvider(key)}
                      >
                        {requiresNativeApp ? 'Sync in iPhone app' : 'Sync now'}
                      </Button>
                    )}
                    <Button
                      variant={isConnected ? 'secondary' : 'primary'}
                      size="sm"
                      loading={loadingProvider === key}
                      disabled={requiresNativeApp}
                      onClick={() => (isConnected ? disconnectProvider(key) : connectProvider(key))}
                    >
                      {requiresNativeApp ? (isConnected ? 'Connected on iPhone' : 'Use iPhone app') : isConnected ? 'Disconnect' : 'Connect'}
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <p className="mt-8 text-caption text-text-tertiary leading-relaxed">
        Data from connected devices is used to enhance your protocol recommendations.
        We never share your health data. All connections use industry-standard OAuth
        and data is encrypted at rest.
      </p>
    </div>
  );
}
