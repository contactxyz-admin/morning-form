import { NextResponse } from 'next/server';
import type { HealthProvider } from '@/types';
import { HEALTH_PROVIDERS } from '@/lib/health/providers';
import {
  TerraAuthError,
  TerraClient,
  TerraConfigError,
  TerraRateLimitError,
  TerraTransientError,
} from '@/lib/health/terra';
import { WhoopClient } from '@/lib/health/whoop';
import { OuraClient } from '@/lib/health/oura';
import { FitbitClient } from '@/lib/health/fitbit';
import { GoogleFitClient } from '@/lib/health/google-fit';
import { DexcomClient } from '@/lib/health/dexcom';
import { LibreClient } from '@/lib/health/libre';
import { encryptToken } from '@/lib/health/crypto';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { env } from '@/lib/env';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider } = body as { provider: HealthProvider };

    if (!provider || !HEALTH_PROVIDERS[provider]) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const requestUrl = new URL(request.url);
    const origin = env.NEXT_PUBLIC_APP_URL || requestUrl.origin;
    const callbackUrl = `${origin}/api/health/callback/${provider}`;

    let authUrl: string;

    switch (provider) {
      case 'apple_health': {
        return NextResponse.json(
          {
            error: 'Apple Health requires a native iOS app with Terra Mobile SDK / HealthKit. It cannot be connected from this local web app alone.',
            provider,
            requiresMobileApp: true,
          },
          { status: 400 }
        );
      }
      case 'garmin': {
        const terra = new TerraClient();
        let session;
        try {
          session = await terra.generateWidgetSession(user.id, {
            providers: 'GARMIN',
            successRedirectUrl: `${callbackUrl}?terra_status=success`,
            failureRedirectUrl: `${callbackUrl}?terra_status=failure`,
          });
        } catch (connectError) {
          const code = classifyTerraConnectError(connectError);
          await markExistingConnectionError(user.id, provider, code, connectError);
          return NextResponse.json(
            { error: 'Failed to initiate Garmin connection', code, provider },
            { status: 503 },
          );
        }

        authUrl = session.url;
        const attemptedAt = new Date().toISOString();
        const metadata = JSON.stringify({
          mode: 'terra',
          provider: 'garmin',
          resource: 'GARMIN',
          terraWidgetSessionId: session.sessionId,
          terraWidgetExpiresAt: session.expiresAt,
          connectionAttemptedAt: attemptedAt,
          callbackUrl,
        });

        await prisma.healthConnection.upsert({
          where: { userId_provider: { userId: user.id, provider } },
          update: {
            status: 'syncing',
            accessToken: null,
            refreshToken: null,
            expiresAt: null,
            terraUserId: null,
            metadata,
          },
          create: {
            userId: user.id,
            provider,
            status: 'syncing',
            terraUserId: null,
            metadata,
          },
        });

        return NextResponse.json({ authUrl, provider, callbackUrl });
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
      case 'dexcom': {
        const dexcom = new DexcomClient();
        authUrl = dexcom.getAuthUrl(callbackUrl);
        break;
      }
      case 'libre': {
        // LibreLinkUp uses credential auth (email + password), not OAuth.
        // We exchange the credentials for a session token here and persist
        // ONLY the token — never the plaintext password.
        const { email, password } = body as { email?: string; password?: string };
        if (!email || !password) {
          return NextResponse.json(
            { error: 'Libre requires email and password', provider },
            { status: 400 }
          );
        }
        const libre = new LibreClient();
        if (process.env.LIBRE_ENABLED !== 'true' && process.env.NODE_ENV === 'production') {
          console.warn('[API] Libre connect in production with LIBRE_ENABLED!=true — routing to mock');
        }
        let session;
        try {
          session = await libre.login(email, password);
        } catch (loginError) {
          // Log only the message, not the raw error — error objects from fetch
          // wrappers can carry request context in non-obvious fields.
          const msg = loginError instanceof Error ? loginError.message : 'unknown';
          console.error('[API] Libre login failed:', msg);
          return NextResponse.json(
            { error: 'Libre login failed — check your email and password', provider },
            { status: 401 }
          );
        }
        await prisma.healthConnection.upsert({
          where: { userId_provider: { userId: user.id, provider } },
          update: {
            status: 'connected',
            accessToken: encryptToken(session.accessToken),
            expiresAt: new Date(session.expiresAt),
            metadata: JSON.stringify({ patientId: session.patientId, connectedAt: new Date().toISOString() }),
          },
          create: {
            userId: user.id,
            provider,
            status: 'connected',
            accessToken: encryptToken(session.accessToken),
            expiresAt: new Date(session.expiresAt),
            metadata: JSON.stringify({ patientId: session.patientId, connectedAt: new Date().toISOString() }),
          },
        });
        return NextResponse.json({ provider, connected: true });
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

function classifyTerraConnectError(error: unknown): string {
  if (error instanceof TerraConfigError) return 'terra_config_error';
  if (error instanceof TerraAuthError) return 'terra_auth_error';
  if (error instanceof TerraRateLimitError) return 'terra_rate_limited';
  if (error instanceof TerraTransientError) return 'terra_unavailable';
  return 'terra_connect_failed';
}

async function markExistingConnectionError(
  userId: string,
  provider: HealthProvider,
  code: string,
  error: unknown,
) {
  const existing = await prisma.healthConnection.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!existing) return;

  const metadata = parseMetadata(existing.metadata);
  await prisma.healthConnection.update({
    where: { id: existing.id },
    data: {
      status: 'error',
      metadata: JSON.stringify({
        ...metadata,
        syncError: code,
        syncErrorMessage: error instanceof Error ? error.message : code,
        lastSyncFailedAt: new Date().toISOString(),
      }),
    },
  });
}

function parseMetadata(metadata?: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return {};
  }
}
