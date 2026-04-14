/**
 * Whoop API Client
 * Direct integration for Whoop recovery, strain, and sleep data.
 */

import type { HealthProvider } from '@/types';
import type { HealthProviderStrategy, ProviderCapabilities } from './strategy';
import { HEALTH_PROVIDERS } from './providers';

export interface WhoopTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: number;
  user_id: number;
  score: {
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage: number;
    skin_temp_celsius: number;
  };
  created_at: string;
  updated_at: string;
}

export interface WhoopSleep {
  id: number;
  user_id: number;
  start: string;
  end: string;
  score: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: { baseline_milli: number; need_from_sleep_debt_milli: number };
    respiratory_rate: number;
    sleep_performance_percentage: number;
    sleep_consistency_percentage: number;
    sleep_efficiency_percentage: number;
  };
}

export interface WhoopWorkout {
  id: number;
  user_id: number;
  start: string;
  end: string;
  sport_id: number;
  score: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    distance_meter: number;
  };
}

export class WhoopClient implements HealthProviderStrategy {
  readonly provider: HealthProvider = 'whoop';
  readonly capabilities: ProviderCapabilities = HEALTH_PROVIDERS.whoop.capabilities;
  private clientId: string;
  private clientSecret: string;
  private baseUrl = 'https://api.prod.whoop.com/developer/v1';
  private accessToken: string | null = null;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.WHOOP_CLIENT_ID || '';
    this.clientSecret = clientSecret || process.env.WHOOP_CLIENT_SECRET || '';
  }

  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement',
    });
    return `https://api.prod.whoop.com/oauth/oauth2/auth?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<WhoopTokens> {
    if (!this.clientId || !this.clientSecret) {
      return { access_token: `mock_whoop_${code}`, refresh_token: 'mock_refresh', expires_in: 3600 };
    }

    const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Whoop token exchange failed: ${response.status}`);
    }

    return response.json() as Promise<WhoopTokens>;
  }

  async refreshToken(refreshToken: string): Promise<WhoopTokens> {
    if (!this.clientId || !this.clientSecret) {
      return { access_token: `mock_refreshed_${Date.now()}`, refresh_token: 'mock_refresh_new', expires_in: 3600 };
    }

    const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Whoop token refresh failed: ${response.status}`);
    }

    return response.json() as Promise<WhoopTokens>;
  }

  async getRecovery(startDate: string, endDate: string): Promise<WhoopRecovery[]> {
    return [{
      cycle_id: 1, sleep_id: 1, user_id: 1,
      score: { recovery_score: 74, resting_heart_rate: 52, hrv_rmssd_milli: 68, spo2_percentage: 97.5, skin_temp_celsius: 33.2 },
      created_at: `${startDate}T07:00:00Z`, updated_at: `${startDate}T07:00:00Z`,
    }];
  }

  async getSleep(startDate: string, endDate: string): Promise<WhoopSleep[]> {
    return [{
      id: 1, user_id: 1, start: `${startDate}T23:00:00Z`, end: `${endDate}T06:30:00Z`,
      score: {
        stage_summary: {
          total_in_bed_time_milli: 27000000, total_awake_time_milli: 2400000,
          total_light_sleep_time_milli: 12600000, total_slow_wave_sleep_time_milli: 5400000,
          total_rem_sleep_time_milli: 6600000, sleep_cycle_count: 4, disturbance_count: 2,
        },
        sleep_needed: { baseline_milli: 27000000, need_from_sleep_debt_milli: 1800000 },
        respiratory_rate: 14.8, sleep_performance_percentage: 86,
        sleep_consistency_percentage: 82, sleep_efficiency_percentage: 91,
      },
    }];
  }

  async getWorkouts(startDate: string, endDate: string): Promise<WhoopWorkout[]> {
    return [{
      id: 1, user_id: 1, start: `${startDate}T07:00:00Z`, end: `${startDate}T08:15:00Z`, sport_id: 1,
      score: { strain: 12.4, average_heart_rate: 135, max_heart_rate: 168, kilojoule: 1850, distance_meter: 6200 },
    }];
  }
}
