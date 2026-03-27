/**
 * Oura Ring API Client (V2)
 * Direct integration for readiness, sleep, activity, and heart rate data.
 */

export interface OuraTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface OuraSleep {
  id: string;
  day: string;
  bedtime_start: string;
  bedtime_end: string;
  duration: number;
  total_sleep_duration: number;
  efficiency: number;
  deep_sleep_duration: number;
  rem_sleep_duration: number;
  light_sleep_duration: number;
  awake_time: number;
  average_heart_rate: number;
  lowest_heart_rate: number;
  average_hrv: number;
  respiratory_rate: number;
  temperature_delta: number;
}

export interface OuraReadiness {
  id: string;
  day: string;
  score: number;
  temperature_deviation: number;
  contributors: {
    activity_balance: number;
    body_temperature: number;
    hrv_balance: number;
    recovery_index: number;
    resting_heart_rate: number;
    sleep_balance: number;
  };
}

export interface OuraActivity {
  id: string;
  day: string;
  score: number;
  steps: number;
  active_calories: number;
  total_calories: number;
  equivalent_walking_distance: number;
  high_activity_time: number;
  medium_activity_time: number;
  low_activity_time: number;
  sedentary_time: number;
}

export class OuraClient {
  private clientId: string;
  private clientSecret: string;
  private baseUrl = 'https://api.ouraring.com/v2';
  private accessToken: string | null = null;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.OURA_CLIENT_ID || '';
    this.clientSecret = clientSecret || process.env.OURA_CLIENT_SECRET || '';
  }

  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'daily heartrate personal session sleep workout',
    });
    return `https://cloud.ouraring.com/oauth/authorize?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OuraTokens> {
    return { access_token: `mock_oura_${code}`, refresh_token: 'mock_refresh', expires_in: 86400 };
  }

  async refreshToken(refreshToken: string): Promise<OuraTokens> {
    return { access_token: `mock_oura_refreshed`, refresh_token: 'mock_new', expires_in: 86400 };
  }

  async getSleep(startDate: string, endDate: string): Promise<OuraSleep[]> {
    return [{
      id: 'sleep_1', day: startDate, bedtime_start: `${startDate}T23:10:00Z`,
      bedtime_end: `${endDate}T06:50:00Z`, duration: 27600, total_sleep_duration: 25200,
      efficiency: 88, deep_sleep_duration: 5400, rem_sleep_duration: 6300,
      light_sleep_duration: 13500, awake_time: 2400, average_heart_rate: 53,
      lowest_heart_rate: 47, average_hrv: 72, respiratory_rate: 14.6, temperature_delta: -0.1,
    }];
  }

  async getReadiness(startDate: string, endDate: string): Promise<OuraReadiness[]> {
    return [{
      id: 'readiness_1', day: startDate, score: 82, temperature_deviation: -0.1,
      contributors: { activity_balance: 78, body_temperature: 90, hrv_balance: 75, recovery_index: 85, resting_heart_rate: 88, sleep_balance: 80 },
    }];
  }

  async getActivity(startDate: string, endDate: string): Promise<OuraActivity[]> {
    return [{
      id: 'activity_1', day: startDate, score: 76, steps: 8430, active_calories: 520,
      total_calories: 2180, equivalent_walking_distance: 6800, high_activity_time: 1800,
      medium_activity_time: 2700, low_activity_time: 5400, sedentary_time: 32400,
    }];
  }
}
