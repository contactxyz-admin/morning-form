import { NextResponse } from 'next/server';
import type { HealthProvider } from '@/types';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { getOrCreateDemoUser } from '@/lib/demo-user';
import { WhoopClient } from '@/lib/health/whoop';
import { OuraClient } from '@/lib/health/oura';
import { FitbitClient } from '@/lib/health/fitbit';
import { GoogleFitClient } from '@/lib/health/google-fit';
import { DexcomClient } from '@/lib/health/dexcom';
import { HealthSyncService } from '@/lib/health/sync';

type RouteContext = {
  params: {
    provider: string;
  };
};

function redirectToIntegrations(status: string, provider: string, message?: string) {
  const url = new URL('/settings/integrations', env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set('status', status);
  url.searchParams.set('provider', provider);
  if (message) url.searchParams.set('message', message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request, { params }: RouteContext) {
  const provider = params.provider as HealthProvider;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const mock = url.searchParams.get('mock');

  if (error) {
    return redirectToIntegrations('error', provider, error);
  }

  try {
    const user = await getOrCreateDemoUser();
    const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/health/callback/${provider}`;
    const syncService = new HealthSyncService();

    if (mock || provider === 'apple_health' || provider === 'garmin') {
      const connection = await prisma.healthConnection.upsert({
        where: { userId_provider: { userId: user.id, provider } },
        update: {
          status: 'connected',
          terraUserId: `terra_${provider}_${user.id}`,
          lastSyncAt: new Date(),
          metadata: JSON.stringify({ mode: 'mock_or_terra', connectedAt: new Date().toISOString() }),
        },
        create: {
          userId: user.id,
          provider,
          status: 'connected',
          terraUserId: `terra_${provider}_${user.id}`,
          lastSyncAt: new Date(),
          metadata: JSON.stringify({ mode: 'mock_or_terra', connectedAt: new Date().toISOString() }),
        },
      });

      await syncService.syncConnection(connection, user.id, new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0], new Date().toISOString().split('T')[0]);

      return redirectToIntegrations('connected', provider);
    }

    if (!code) {
      return redirectToIntegrations('error', provider, 'missing_code');
    }

    let tokenResponse:
      | { access_token: string; refresh_token: string; expires_in: number }
      | undefined;

    switch (provider) {
      case 'whoop':
        tokenResponse = await new WhoopClient().exchangeCode(code, callbackUrl);
        break;
      case 'oura':
        tokenResponse = await new OuraClient().exchangeCode(code, callbackUrl);
        break;
      case 'fitbit':
        tokenResponse = await new FitbitClient().exchangeCode(code, callbackUrl);
        break;
      case 'google_fit':
        tokenResponse = await new GoogleFitClient().exchangeCode(code, callbackUrl);
        break;
      case 'dexcom':
        tokenResponse = await new DexcomClient().exchangeCode(code, callbackUrl);
        break;
      default:
        return redirectToIntegrations('error', provider, 'unsupported_provider');
    }

    const connection = await prisma.healthConnection.upsert({
      where: { userId_provider: { userId: user.id, provider } },
      update: {
        status: 'connected',
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        lastSyncAt: new Date(),
        metadata: JSON.stringify({ connectedAt: new Date().toISOString(), callbackUrl }),
      },
      create: {
        userId: user.id,
        provider,
        status: 'connected',
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        lastSyncAt: new Date(),
        metadata: JSON.stringify({ connectedAt: new Date().toISOString(), callbackUrl }),
      },
    });

    await syncService.syncConnection(connection, user.id, new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0], new Date().toISOString().split('T')[0]);

    return redirectToIntegrations('connected', provider);
  } catch (caughtError) {
    console.error('[API] Health callback error:', caughtError);
    const user = await getOrCreateDemoUser();
    await prisma.healthConnection.upsert({
      where: { userId_provider: { userId: user.id, provider } },
      update: {
        status: 'error',
        metadata: JSON.stringify({
          syncError: caughtError instanceof Error ? caughtError.message : 'callback_failed',
          lastSyncFailedAt: new Date().toISOString(),
        }),
      },
      create: {
        userId: user.id,
        provider,
        status: 'error',
        metadata: JSON.stringify({
          syncError: caughtError instanceof Error ? caughtError.message : 'callback_failed',
          lastSyncFailedAt: new Date().toISOString(),
        }),
      },
    });
    return redirectToIntegrations('error', provider, 'callback_failed');
  }
}
