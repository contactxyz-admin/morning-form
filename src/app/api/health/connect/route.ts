import { NextResponse } from 'next/server';
import type { HealthProvider } from '@/types';
import { HEALTH_PROVIDERS } from '@/lib/health/providers';
import { TerraClient } from '@/lib/health/terra';
import { WhoopClient } from '@/lib/health/whoop';
import { OuraClient } from '@/lib/health/oura';
import { FitbitClient } from '@/lib/health/fitbit';
import { GoogleFitClient } from '@/lib/health/google-fit';
import { GarminClient } from '@/lib/health/garmin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider, redirectUri } = body as { provider: HealthProvider; redirectUri: string };

    if (!provider || !HEALTH_PROVIDERS[provider]) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    let authUrl: string;

    switch (provider) {
      case 'apple_health':
      case 'garmin': {
        // These use Terra's widget for connection
        const terra = new TerraClient();
        const session = await terra.generateWidgetSession('user_current');
        authUrl = session.url;
        break;
      }
      case 'whoop': {
        const whoop = new WhoopClient();
        authUrl = whoop.getAuthUrl(redirectUri || '/settings/integrations');
        break;
      }
      case 'oura': {
        const oura = new OuraClient();
        authUrl = oura.getAuthUrl(redirectUri || '/settings/integrations');
        break;
      }
      case 'fitbit': {
        const fitbit = new FitbitClient();
        authUrl = fitbit.getAuthUrl(redirectUri || '/settings/integrations');
        break;
      }
      case 'google_fit': {
        const gfit = new GoogleFitClient();
        authUrl = gfit.getAuthUrl(redirectUri || '/settings/integrations');
        break;
      }
      default:
        return NextResponse.json({ error: 'Provider not supported' }, { status: 400 });
    }

    return NextResponse.json({ authUrl, provider });
  } catch (error) {
    console.error('[API] Health connect error:', error);
    return NextResponse.json({ error: 'Failed to initiate connection' }, { status: 500 });
  }
}
