'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import type { HealthProvider } from '@/types';

interface ProviderConfig {
  name: string;
  description: string;
  icon: string;
  features: string[];
}

const providers: Record<HealthProvider, ProviderConfig> = {
  apple_health: { name: 'Apple Health', description: 'Sleep, activity, heart rate, HRV', icon: '♥', features: ['sleep', 'activity', 'heart', 'hrv'] },
  whoop: { name: 'Whoop', description: 'Recovery, strain, sleep stages, HRV', icon: 'W', features: ['recovery', 'strain', 'sleep', 'hrv'] },
  oura: { name: 'Oura', description: 'Readiness, sleep quality, activity, temperature', icon: 'O', features: ['readiness', 'sleep', 'activity', 'temperature'] },
  fitbit: { name: 'Fitbit', description: 'Sleep, heart rate, activity, SpO2', icon: 'F', features: ['sleep', 'heart', 'activity', 'spo2'] },
  garmin: { name: 'Garmin', description: 'Training load, recovery, sleep, stress', icon: 'G', features: ['training', 'recovery', 'sleep', 'stress'] },
  google_fit: { name: 'Google Fit', description: 'Activity, sleep, vitals', icon: '⊕', features: ['activity', 'sleep', 'vitals'] },
};

export default function IntegrationsPage() {
  const router = useRouter();
  const [connections, setConnections] = useState<Record<string, { connected: boolean; lastSync: string | null; status?: string }>>({});
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [callbackState, setCallbackState] = useState<{ status: string | null; provider: string | null; message: string | null }>({
    status: null,
    provider: null,
    message: null,
  });

  useEffect(() => {
    const loadConnections = async () => {
      const response = await fetch('/api/health/connections', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const normalized = (data.connections as Array<{ provider: string; status: string; lastSyncAt: string | null }>).reduce(
        (acc, connection) => {
          acc[connection.provider] = {
            connected: connection.status === 'connected',
            lastSync: connection.lastSyncAt,
            status: connection.status,
          };
          return acc;
        },
        {} as Record<string, { connected: boolean; lastSync: string | null; status?: string }>
      );
      setConnections(normalized);
    };

    loadConnections();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackState({
      status: params.get('status'),
      provider: params.get('provider'),
      message: params.get('message'),
    });
  }, []);

  const connectProvider = async (provider: HealthProvider) => {
    setLoadingProvider(provider);
    try {
      const response = await fetch('/api/health/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect');
      }

      window.location.href = data.authUrl;
    } catch (error) {
      console.error(error);
      setLoadingProvider(null);
    }
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
    } finally {
      setLoadingProvider(null);
    }
  };

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

      <div className="space-y-4">
        {(Object.entries(providers) as [HealthProvider, ProviderConfig][]).map(([key, provider], i) => {
          const conn = connections[key];
          const isConnected = conn?.connected || false;
          const lastSync = conn?.lastSync;

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
                      </div>
                      <p className="text-caption text-text-secondary mt-0.5">{provider.description}</p>
                      {isConnected && lastSync && (
                        <p className="text-caption text-text-tertiary mt-1">
                          Last synced: {new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant={isConnected ? 'secondary' : 'primary'}
                    size="sm"
                    loading={loadingProvider === key}
                    onClick={() => (isConnected ? disconnectProvider(key) : connectProvider(key))}
                  >
                    {isConnected ? 'Disconnect' : 'Connect'}
                  </Button>
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
