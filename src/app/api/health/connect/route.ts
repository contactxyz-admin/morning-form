import { NextResponse } from 'next/server';
import type { HealthProvider } from '@/types';
import { HEALTH_PROVIDERS } from '@/lib/health/providers';
import { TerraClient } from '@/lib/health/terra';
import { WhoopClient } from '@/lib/health/whoop';
import { OuraClient } from '@/lib/health/oura';
import { FitbitClient } from '@/lib/health/fitbit';
import { GoogleFitClient } from '@/lib/health/google-fit';
import { DexcomClient } from '@/lib/health/dexcom';
import { LibreClient } from '@/lib/health/libre';
import { encryptToken } from '@/lib/health/crypto';
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
