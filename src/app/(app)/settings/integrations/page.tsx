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
  const [connections, setConnections] = useState<Record<string, { connected: boolean; lastSync: string | null }>>({});

  useEffect(() => {
    const saved = localStorage.getItem('mf_health_connections');
    if (saved) setConnections(JSON.parse(saved));
    else {
      // Default: Whoop and Oura connected for demo
      const defaults: Record<string, { connected: boolean; lastSync: string | null }> = {
        whoop: { connected: true, lastSync: '2026-03-26T08:30:00Z' },
        oura: { connected: true, lastSync: '2026-03-26T07:45:00Z' },
      };
      setConnections(defaults);
      localStorage.setItem('mf_health_connections', JSON.stringify(defaults));
    }
  }, []);

  const toggleConnection = (provider: string) => {
    setConnections(prev => {
      const next = { ...prev };
      if (next[provider]?.connected) {
        next[provider] = { connected: false, lastSync: null };
      } else {
        next[provider] = { connected: true, lastSync: new Date().toISOString() };
      }
      localStorage.setItem('mf_health_connections', JSON.stringify(next));
      return next;
    });
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
                    onClick={() => toggleConnection(key)}
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
