import { NextResponse } from 'next/server';
import type { HealthProvider } from '@/types';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { getCurrentUser } from '@/lib/session';
import { WhoopClient } from '@/lib/health/whoop';
import { OuraClient } from '@/lib/health/oura';
import { FitbitClient } from '@/lib/health/fitbit';
import { GoogleFitClient } from '@/lib/health/google-fit';
import { DexcomClient } from '@/lib/health/dexcom';
import { HealthSyncService } from '@/lib/health/sync';
import { TerraClient, type TerraUserInfo } from '@/lib/health/terra';

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

  const user = await getCurrentUser();
  if (!user) {
    return redirectToIntegrations('error', provider, 'not_authenticated');
  }

  if (error) {
    await persistCallbackError(provider, user.id, error);
    return redirectToIntegrations('error', provider, error);
  }

  if (provider === 'garmin' && url.searchParams.get('terra_status') === 'failure') {
    await persistCallbackError(provider, user.id, 'terra_auth_failed');
    return redirectToIntegrations('error', provider, 'terra_auth_failed');
  }

  try {
    const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/health/callback/${provider}`;

    if (mock || provider === 'apple_health') {
      const syncService = new HealthSyncService();
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

    if (provider === 'garmin') {
      return handleGarminTerraCallback(url, user.id);
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

    const syncService = new HealthSyncService();
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
    await persistCallbackError(
      provider,
      user.id,
      caughtError instanceof Error ? caughtError.message : 'callback_failed',
    );
    return redirectToIntegrations('error', provider, 'callback_failed');
  }
}

async function handleGarminTerraCallback(url: URL, userId: string) {
  const terraUserId = firstParam(url, 'user_id', 'terra_user_id', 'userId');
  const referenceId = firstParam(url, 'reference_id', 'referenceId');
  const resource = normalizeTerraProvider(firstParam(url, 'resource', 'provider'));

  if (!terraUserId) {
    return redirectToIntegrations('pending', 'garmin', 'awaiting_terra_webhook');
  }

  if (referenceId && referenceId !== userId) {
    return redirectToIntegrations('error', 'garmin', 'terra_reference_mismatch');
  }

  const referenceMatches = referenceId === userId;
  let confirmedUser: TerraUserInfo | undefined;
  try {
    const users = await new TerraClient().getUserInfo({ userId: terraUserId });
    confirmedUser = users.find((candidate) => candidate.user_id === terraUserId) ?? users[0];
  } catch (confirmationError) {
    if (!referenceMatches) {
      console.warn('[API] Garmin Terra callback confirmation failed:', confirmationError);
      return redirectToIntegrations('pending', 'garmin', 'awaiting_terra_webhook');
    }
  }

  if (confirmedUser?.reference_id && confirmedUser.reference_id !== userId) {
    return redirectToIntegrations('error', 'garmin', 'terra_reference_mismatch');
  }

  const confirmedProvider = normalizeTerraProvider(confirmedUser?.provider);
  if (confirmedProvider && confirmedProvider !== 'GARMIN') {
    return redirectToIntegrations('error', 'garmin', 'terra_provider_mismatch');
  }

  if (!referenceMatches && !confirmedUser) {
    return redirectToIntegrations('pending', 'garmin', 'awaiting_terra_webhook');
  }

  const verificationMethod = confirmedUser ? 'terra_user_info' : 'reference_id';
  const metadata = JSON.stringify({
    mode: 'terra',
    provider: 'garmin',
    resource: resource ?? confirmedProvider ?? 'GARMIN',
    referenceId: referenceId ?? confirmedUser?.reference_id ?? null,
    scopes: confirmedUser?.scopes ?? null,
    verificationMethod,
    connectedAt: new Date().toISOString(),
  });

  await prisma.healthConnection.upsert({
    where: { userId_provider: { userId, provider: 'garmin' } },
    update: {
      status: 'connected',
      terraUserId,
      lastSyncAt: null,
      metadata,
    },
    create: {
      userId,
      provider: 'garmin',
      status: 'connected',
      terraUserId,
      metadata,
    },
  });

  return redirectToIntegrations('connected', 'garmin');
}

async function persistCallbackError(provider: HealthProvider, userId: string, errorCode: string) {
  await prisma.healthConnection.upsert({
    where: { userId_provider: { userId, provider } },
    update: {
      status: 'error',
      metadata: JSON.stringify({
        syncError: errorCode,
        callbackProvider: provider,
        lastSyncFailedAt: new Date().toISOString(),
      }),
    },
    create: {
      userId,
      provider,
      status: 'error',
      metadata: JSON.stringify({
        syncError: errorCode,
        callbackProvider: provider,
        lastSyncFailedAt: new Date().toISOString(),
      }),
    },
  });
}

function firstParam(url: URL, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value) return value;
  }
  return null;
}

function normalizeTerraProvider(provider?: string | null): string | null {
  if (!provider) return null;
  return provider.trim().toUpperCase();
}
