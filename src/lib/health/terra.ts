/**
 * Terra API Client
 *
 * Terra (tryterra.co) is a health data aggregator that connects to
 * Apple Health, Samsung Health, Garmin, and other providers through
 * a single integration. In production, replace mock returns with
 * actual Terra API calls.
 */

export interface TerraSession {
  sessionId: string;
  url: string;
  expiresAt: string;
}

export interface TerraSleepData {
  start_time: string;
  end_time: string;
  duration_seconds: number;
  sleep_efficiency: number;
  deep_sleep_seconds: number;
  rem_sleep_seconds: number;
  light_sleep_seconds: number;
  awake_seconds: number;
  avg_hr: number;
  min_hr: number;
  avg_hrv: number;
  respiratory_rate: number;
}

export interface TerraActivityData {
  start_time: string;
  end_time: string;
  steps: number;
  calories: number;
  active_duration_seconds: number;
  avg_hr: number;
  max_hr: number;
  distance_meters: number;
}

export interface TerraBodyData {
  timestamp: string;
  weight_kg: number | null;
  body_fat_percentage: number | null;
  temperature_delta: number | null;
}

export interface TerraDailyData {
  date: string;
  steps: number;
  calories: number;
  active_minutes: number;
  resting_hr: number;
  avg_hrv: number;
  stress_level: number | null;
  recovery_score: number | null;
}

export class TerraClient {
  private apiKey: string;
  private devId: string;
  private baseUrl = 'https://api.tryterra.co/v2';

  constructor(apiKey?: string, devId?: string) {
    this.apiKey = apiKey || process.env.TERRA_API_KEY || '';
    this.devId = devId || process.env.TERRA_DEV_ID || '';
  }

  private get headers() {
    return {
      'dev-id': this.devId,
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async generateWidgetSession(referenceId: string): Promise<TerraSession> {
    // In production:
    // const res = await fetch(`${this.baseUrl}/auth/generateWidgetSession`, {
    //   method: 'POST',
    //   headers: this.headers,
    //   body: JSON.stringify({ reference_id: referenceId, providers: 'APPLE,GARMIN,SAMSUNG' }),
    // });
    return {
      sessionId: `session_${Date.now()}`,
      url: `https://widget.tryterra.co/session/mock_${referenceId}`,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    };
  }

  async getSleep(terraUserId: string, startDate: string, endDate: string): Promise<TerraSleepData[]> {
    // Mock data for local dev
    return [{
      start_time: `${startDate}T23:15:00Z`,
      end_time: `${endDate}T06:45:00Z`,
      duration_seconds: 27000,
      sleep_efficiency: 0.87,
      deep_sleep_seconds: 5400,
      rem_sleep_seconds: 6300,
      light_sleep_seconds: 12600,
      awake_seconds: 2700,
      avg_hr: 54,
      min_hr: 48,
      avg_hrv: 65,
      respiratory_rate: 14.5,
    }];
  }

  async getActivity(terraUserId: string, startDate: string, endDate: string): Promise<TerraActivityData[]> {
    return [{
      start_time: `${startDate}T07:00:00Z`,
      end_time: `${startDate}T08:15:00Z`,
      steps: 8430,
      calories: 2180,
      active_duration_seconds: 4500,
      avg_hr: 135,
      max_hr: 168,
      distance_meters: 6200,
    }];
  }

  async getBody(terraUserId: string, startDate: string, endDate: string): Promise<TerraBodyData[]> {
    return [{
      timestamp: `${startDate}T07:00:00Z`,
      weight_kg: 75.2,
      body_fat_percentage: 14.5,
      temperature_delta: -0.1,
    }];
  }

  async getDaily(terraUserId: string, startDate: string, endDate: string): Promise<TerraDailyData[]> {
    return [{
      date: startDate,
      steps: 8430,
      calories: 2180,
      active_minutes: 45,
      resting_hr: 52,
      avg_hrv: 68,
      stress_level: 35,
      recovery_score: 74,
    }];
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<void> {
    const type = payload.type as string;
    switch (type) {
      case 'sleep':
      case 'activity':
      case 'body':
      case 'daily':
        // Process and store data
        console.log(`[Terra] Received ${type} webhook for user ${payload.user?.toString()}`);
        break;
      case 'auth':
        console.log('[Terra] Auth webhook — user connected');
        break;
      case 'deauth':
        console.log('[Terra] Deauth webhook — user disconnected');
        break;
      default:
        console.log(`[Terra] Unknown webhook type: ${type}`);
    }
  }
}
