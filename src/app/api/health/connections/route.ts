import { NextResponse } from 'next/server';
import type { HealthProvider } from '@/types';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { TerraClient } from '@/lib/health/terra';
import { incrementDiagnostic } from '@/lib/marketing/diagnostic';
import { HEALTH_PROVIDERS } from '@/lib/health/providers';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const connections = await prisma.healthConnection.findMany({
      where: { userId: user.id },
      orderBy: { provider: 'asc' },
    });

    return NextResponse.json({
      connections: connections.map((connection) => ({
        provider: connection.provider,
        status: connection.status,
        lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
        expiresAt: connection.expiresAt?.toISOString() ?? null,
        metadata: connection.metadata ? JSON.parse(connection.metadata) : null,
      })),
    });
  } catch (error) {
    console.error('[API] Health connections fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const { provider } = (await request.json()) as { provider: HealthProvider };
    if (!provider || !HEALTH_PROVIDERS[provider]) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const disconnectMetadata = await externalDisconnectMetadata(user.id, provider);

    await prisma.healthConnection.upsert({
      where: { userId_provider: { userId: user.id, provider } },
      update: {
        status: 'disconnected',
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        terraUserId: null,
        lastSyncAt: null,
        metadata: disconnectMetadata,
      },
      create: {
        userId: user.id,
        provider,
        status: 'disconnected',
        metadata: disconnectMetadata,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Health disconnect error:', error);
    return NextResponse.json({ error: 'Failed to disconnect provider' }, { status: 500 });
  }
}

async function externalDisconnectMetadata(userId: string, provider: HealthProvider): Promise<string | null> {
  if (provider !== 'garmin') return null;

  const existing = await prisma.healthConnection.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!existing?.terraUserId) return null;

  try {
    await new TerraClient().deauthenticateUser(existing.terraUserId);
    return null;
  } catch (error) {
    await incrementDiagnostic('terra-deauth-failed');
    return JSON.stringify({
      ...parseMetadata(existing.metadata),
      terraDeauthError: error instanceof Error ? error.message : 'terra_deauth_failed',
      disconnectedAt: new Date().toISOString(),
    });
  }
}

function parseMetadata(metadata?: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return {};
  }
}
