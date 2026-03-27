import { NextResponse } from 'next/server';
import type { HealthProvider } from '@/types';
import { prisma } from '@/lib/db';
import { getOrCreateDemoUser } from '@/lib/demo-user';

export async function GET() {
  try {
    const user = await getOrCreateDemoUser();
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
    const { provider } = (await request.json()) as { provider: HealthProvider };
    const user = await getOrCreateDemoUser();

    await prisma.healthConnection.upsert({
      where: { userId_provider: { userId: user.id, provider } },
      update: {
        status: 'disconnected',
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        terraUserId: null,
        lastSyncAt: null,
        metadata: null,
      },
      create: {
        userId: user.id,
        provider,
        status: 'disconnected',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Health disconnect error:', error);
    return NextResponse.json({ error: 'Failed to disconnect provider' }, { status: 500 });
  }
}
