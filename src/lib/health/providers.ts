import type { HealthProvider, HealthCategory } from '@/types';
import type { ProviderCapabilities } from './strategy';

export interface ProviderDefinition {
  name: string;
  description: string;
  dataCategories: HealthCategory[];
  oauthBaseUrl: string;
  features: string[];
  scopes: string[];
  capabilities: ProviderCapabilities;
}

const PULL_ONLY: ProviderCapabilities = {
  supportsPull: true,
  supportsPush: false,
  supportsSDK: false,
  supportsXmlImport: false,
  webhookNotifyOnly: false,
};

const PULL_WITH_NOTIFY_WEBHOOK: ProviderCapabilities = {
  supportsPull: true,
  supportsPush: true,
  supportsSDK: false,
  supportsXmlImport: false,
  webhookNotifyOnly: true,
};

const TERRA_AGGREGATED: ProviderCapabilities = {
  supportsPull: true,
  supportsPush: true,
  supportsSDK: true,
  supportsXmlImport: true,
  webhookNotifyOnly: false,
};

export const HEALTH_PROVIDERS: Record<HealthProvider, ProviderDefinition> = {
  apple_health: {
    name: 'Apple Health',
    description: 'Sleep, activity, heart rate, HRV via Terra',
    dataCategories: ['sleep', 'activity', 'heart', 'recovery'],
    oauthBaseUrl: '', // Connected via Terra widget
    features: ['sleep_duration', 'sleep_stages', 'heart_rate', 'hrv', 'steps', 'calories', 'active_minutes'],
    scopes: [],
    capabilities: TERRA_AGGREGATED,
  },
  whoop: {
    name: 'Whoop',
    description: 'Recovery, strain, sleep stages, HRV',
    dataCategories: ['sleep', 'activity', 'heart', 'recovery'],
    oauthBaseUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    features: ['recovery_score', 'strain', 'sleep_stages', 'hrv', 'resting_hr', 'respiratory_rate'],
    scopes: ['read:recovery', 'read:cycles', 'read:sleep', 'read:workout', 'read:profile', 'read:body_measurement'],
    capabilities: PULL_WITH_NOTIFY_WEBHOOK,
  },
  oura: {
    name: 'Oura',
    description: 'Readiness, sleep quality, activity, temperature',
    dataCategories: ['sleep', 'activity', 'heart', 'recovery', 'body'],
    oauthBaseUrl: 'https://cloud.ouraring.com/oauth/authorize',
    features: ['readiness_score', 'sleep_score', 'activity_score', 'hrv', 'temperature_deviation', 'respiratory_rate'],
    scopes: ['daily', 'heartrate', 'personal', 'session', 'sleep', 'workout'],
    capabilities: PULL_WITH_NOTIFY_WEBHOOK,
  },
  fitbit: {
    name: 'Fitbit',
    description: 'Sleep, heart rate, activity, SpO2',
    dataCategories: ['sleep', 'activity', 'heart'],
    oauthBaseUrl: 'https://www.fitbit.com/oauth2/authorize',
    features: ['sleep_duration', 'sleep_stages', 'heart_rate', 'steps', 'calories', 'spo2'],
    scopes: ['activity', 'heartrate', 'sleep', 'oxygen_saturation', 'respiratory_rate'],
    capabilities: PULL_WITH_NOTIFY_WEBHOOK,
  },
  garmin: {
    name: 'Garmin',
    description: 'Training load, recovery, sleep, stress',
    dataCategories: ['sleep', 'activity', 'heart', 'recovery', 'body'],
    oauthBaseUrl: 'https://connect.garmin.com/oauthConfirm',
    features: ['training_load', 'body_battery', 'stress_level', 'sleep_score', 'heart_rate', 'steps'],
    scopes: [],
    capabilities: TERRA_AGGREGATED,
  },
  google_fit: {
    name: 'Google Fit',
    description: 'Activity, sleep, vitals',
    dataCategories: ['sleep', 'activity', 'heart'],
    oauthBaseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    features: ['steps', 'calories', 'heart_rate', 'sleep_duration', 'active_minutes'],
    scopes: ['https://www.googleapis.com/auth/fitness.activity.read', 'https://www.googleapis.com/auth/fitness.sleep.read', 'https://www.googleapis.com/auth/fitness.heart_rate.read'],
    capabilities: PULL_ONLY,
  },
  dexcom: {
    name: 'Dexcom',
    description: 'Continuous glucose monitoring (estimated glucose values)',
    dataCategories: ['metabolic'],
    oauthBaseUrl: 'https://api.dexcom.com/v2/oauth2/login',
    features: ['glucose', 'glucose_fasting'],
    scopes: ['offline_access'],
    capabilities: PULL_ONLY,
  },
};
