import type { HealthProvider, HealthCategory, ProviderAccessStatus } from '@/types';
import type { ProviderCapabilities } from './strategy';

export interface ProviderDefinition {
  name: string;
  description: string;
  dataCategories: HealthCategory[];
  oauthBaseUrl: string;
  features: string[];
  scopes: string[];
  capabilities: ProviderCapabilities;
  accessStatus: ProviderAccessStatus;
  accessMessage?: string;
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

const NATIVE_HEALTHKIT_UPLOAD: ProviderCapabilities = {
  supportsPull: false,
  supportsPush: true,
  supportsSDK: true,
  supportsXmlImport: false,
  webhookNotifyOnly: false,
};

const DIRECT_PARTNER_ACCESS_PENDING: ProviderCapabilities = {
  supportsPull: false,
  supportsPush: false,
  supportsSDK: false,
  supportsXmlImport: false,
  webhookNotifyOnly: false,
};

export const HEALTH_PROVIDERS: Record<HealthProvider, ProviderDefinition> = {
  apple_health: {
    name: 'Apple Health',
    description: 'Sleep, activity, heart rate, HRV through the iPhone app',
    dataCategories: ['sleep', 'activity', 'heart', 'recovery'],
    oauthBaseUrl: '',
    features: ['sleep_duration', 'sleep_stages', 'heart_rate', 'hrv', 'steps', 'calories', 'active_minutes'],
    scopes: [],
    capabilities: NATIVE_HEALTHKIT_UPLOAD,
    accessStatus: 'native_required',
    accessMessage: 'Apple Health requires the Morning Form iPhone app and cannot be connected from the web.',
  },
  whoop: {
    name: 'Whoop',
    description: 'Recovery, strain, sleep stages, HRV',
    dataCategories: ['sleep', 'activity', 'heart', 'recovery'],
    oauthBaseUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    features: ['recovery_score', 'strain', 'sleep_stages', 'hrv', 'resting_hr', 'respiratory_rate'],
    scopes: ['read:recovery', 'read:cycles', 'read:sleep', 'read:workout', 'read:profile', 'read:body_measurement'],
    capabilities: PULL_WITH_NOTIFY_WEBHOOK,
    accessStatus: 'available',
  },
  oura: {
    name: 'Oura',
    description: 'Readiness, sleep quality, activity, temperature',
    dataCategories: ['sleep', 'activity', 'heart', 'recovery', 'body'],
    oauthBaseUrl: 'https://cloud.ouraring.com/oauth/authorize',
    features: ['readiness_score', 'sleep_score', 'activity_score', 'hrv', 'temperature_deviation', 'respiratory_rate'],
    scopes: ['daily', 'heartrate', 'personal', 'session', 'workout'],
    capabilities: PULL_WITH_NOTIFY_WEBHOOK,
    accessStatus: 'available',
  },
  fitbit: {
    name: 'Fitbit',
    description: 'Sleep, heart rate, activity, SpO2',
    dataCategories: ['sleep', 'activity', 'heart'],
    oauthBaseUrl: 'https://www.fitbit.com/oauth2/authorize',
    features: ['sleep_duration', 'sleep_stages', 'heart_rate', 'steps', 'calories', 'spo2'],
    scopes: ['activity', 'heartrate', 'sleep', 'oxygen_saturation', 'respiratory_rate'],
    capabilities: PULL_WITH_NOTIFY_WEBHOOK,
    accessStatus: 'available',
  },
  garmin: {
    name: 'Garmin',
    description: 'Training load, recovery, sleep, stress',
    dataCategories: ['sleep', 'activity', 'heart', 'recovery', 'body'],
    oauthBaseUrl: 'https://connect.garmin.com/oauthConfirm',
    features: ['training_load', 'body_battery', 'stress_level', 'sleep_score', 'heart_rate', 'steps'],
    scopes: [],
    capabilities: DIRECT_PARTNER_ACCESS_PENDING,
    accessStatus: 'application_required',
    accessMessage: 'Garmin direct access is pending Garmin Connect Developer Program approval.',
  },
  google_fit: {
    name: 'Google Fit',
    description: 'Activity, sleep, vitals',
    dataCategories: ['sleep', 'activity', 'heart'],
    oauthBaseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    features: ['steps', 'calories', 'heart_rate', 'sleep_duration', 'active_minutes'],
    scopes: ['https://www.googleapis.com/auth/fitness.activity.read', 'https://www.googleapis.com/auth/fitness.sleep.read', 'https://www.googleapis.com/auth/fitness.heart_rate.read'],
    capabilities: PULL_ONLY,
    accessStatus: 'deprecated',
    accessMessage: 'Google Fit is a legacy path. New Android health work should use Health Connect.',
  },
  dexcom: {
    name: 'Dexcom',
    description: 'Continuous glucose monitoring (estimated glucose values)',
    dataCategories: ['metabolic'],
    oauthBaseUrl: 'https://api.dexcom.com/v2/oauth2/login',
    features: ['glucose', 'glucose_fasting'],
    scopes: ['offline_access'],
    capabilities: PULL_ONLY,
    accessStatus: 'available',
  },
  libre: {
    name: 'FreeStyle Libre',
    description: 'Continuous glucose monitoring via LibreLinkUp (unofficial)',
    dataCategories: ['metabolic'],
    oauthBaseUrl: '', // Credential auth, not OAuth
    features: ['glucose'],
    scopes: [],
    capabilities: PULL_ONLY,
    accessStatus: 'available',
  },
};

export function canStartProviderConnection(provider: ProviderDefinition): boolean {
  return provider.accessStatus === 'available' || provider.accessStatus === 'deprecated';
}

export function canSyncProviderConnection(provider: ProviderDefinition): boolean {
  return canStartProviderConnection(provider);
}
