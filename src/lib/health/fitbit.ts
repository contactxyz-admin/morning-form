/**
 * Fitbit Web API Client
 */

export interface FitbitTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface FitbitSleep {
  dateOfSleep: string;
  duration: number;
  efficiency: number;
  minutesAsleep: number;
  minutesAwake: number;
  startTime: string;
  endTime: string;
  levels: { summary: { deep: { minutes: number }; light: { minutes: number }; rem: { minutes: number }; wake: { minutes: number } } };
}

export class FitbitClient {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.FITBIT_CLIENT_ID || '';
    this.clientSecret = clientSecret || process.env.FITBIT_CLIENT_SECRET || '';
  }

  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'activity heartrate sleep oxygen_saturation respiratory_rate',
    });
    return `https://www.fitbit.com/oauth2/authorize?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<FitbitTokens> {
    return { access_token: `mock_fitbit_${code}`, refresh_token: 'mock', expires_in: 28800 };
  }

  async getSleep(startDate: string, endDate: string): Promise<FitbitSleep[]> {
    return [{
      dateOfSleep: startDate, duration: 27000000, efficiency: 89, minutesAsleep: 420,
      minutesAwake: 30, startTime: `${startDate}T23:00:00`, endTime: `${endDate}T06:30:00`,
      levels: { summary: { deep: { minutes: 90 }, light: { minutes: 210 }, rem: { minutes: 105 }, wake: { minutes: 30 } } },
    }];
  }
}
