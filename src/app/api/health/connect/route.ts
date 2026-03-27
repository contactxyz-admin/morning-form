import { NextResponse } from 'next/server';
import type { HealthProvider } from '@/types';
import { HEALTH_PROVIDERS } from '@/lib/health/providers';
import { TerraClient } from '@/lib/health/terra';
import { WhoopClient } from '@/lib/health/whoop';
import { OuraClient } from '@/lib/health/oura';
import { FitbitClient } from '@/lib/health/fitbit';
import { GoogleFitClient } from '@/lib/health/google-fit';
import { prisma } from '@/lib/db';
import { getOrCreateDemoUser } from '@/lib/demo-user';
import { env } from '@/lib/env';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider } = body as { provider: HealthProvider };

    if (!provider || !HEALTH_PROVIDERS[provider]) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const user = await getOrCreateDemoUser();
    const requestUrl = new URL(request.url);
    const origin = env.NEXT_PUBLIC_APP_URL || requestUrl.origin;
    const callbackUrl = `${origin}/api/health/callback/${provider}`;

    let authUrl: string;

    switch (provider) {
      case 'apple_health':
      case 'garmin': {
        const terra = new TerraClient();
        const session = await terra.generateWidgetSession(user.id);
        authUrl = session.url || `${callbackUrl}?mock=1&provider=${provider}`;
        break;
      }
      case 'whoop': {
        const whoop = new WhoopClient();
        authUrl = whoop.getAuthUrl(callbackUrl);
        break;
      }
      case 'oura': {
        const oura = new OuraClient();
        authUrl = oura.getAuthUrl(callbackUrl);
        break;
      }
      case 'fitbit': {
        const fitbit = new FitbitClient();
        authUrl = fitbit.getAuthUrl(callbackUrl);
        break;
      }
      case 'google_fit': {
        const gfit = new GoogleFitClient();
        authUrl = gfit.getAuthUrl(callbackUrl);
        break;
      }
      default:
        return NextResponse.json({ error: 'Provider not supported' }, { status: 400 });
    }

    await prisma.healthConnection.upsert({
      where: { userId_provider: { userId: user.id, provider } },
      update: { status: 'syncing' },
      create: { userId: user.id, provider, status: 'syncing' },
    });

    return NextResponse.json({ authUrl, provider, callbackUrl });
  } catch (error) {
    console.error('[API] Health connect error:', error);
    return NextResponse.json({ error: 'Failed to initiate connection' }, { status: 500 });
  }
}
