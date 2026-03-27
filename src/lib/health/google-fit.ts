/**
 * Google Fit REST API Client
 */

export interface GoogleFitTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class GoogleFitClient {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.GOOGLE_FIT_CLIENT_ID || '';
    this.clientSecret = clientSecret || process.env.GOOGLE_FIT_CLIENT_SECRET || '';
  }

  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.sleep.read https://www.googleapis.com/auth/fitness.heart_rate.read',
      access_type: 'offline',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<GoogleFitTokens> {
    return { access_token: `mock_gfit_${code}`, refresh_token: 'mock', expires_in: 3600 };
  }

  async getSteps(startDate: string, endDate: string): Promise<number> {
    return 8430;
  }

  async getSleep(startDate: string, endDate: string): Promise<{ duration_minutes: number; start: string; end: string }[]> {
    return [{ duration_minutes: 435, start: `${startDate}T23:00:00Z`, end: `${endDate}T06:15:00Z` }];
  }

  async getHeartRate(startDate: string, endDate: string): Promise<{ avg: number; min: number; max: number }> {
    return { avg: 72, min: 48, max: 168 };
  }
}
