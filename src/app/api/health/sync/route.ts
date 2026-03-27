import { NextResponse } from 'next/server';
import { HealthSyncService } from '@/lib/health/sync';
import type { HealthProvider } from '@/types';
import { prisma } from '@/lib/db';
import { getOrCreateDemoUser } from '@/lib/demo-user';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { providers } = body as { providers?: HealthProvider[] };

    const syncService = new HealthSyncService();
    const user = await getOrCreateDemoUser();
    const storedConnections = await prisma.healthConnection.findMany({
      where: { userId: user.id, status: 'connected' },
    });
    const connectedProviders: HealthProvider[] =
      providers || storedConnections.map((connection) => connection.provider as HealthProvider);
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const dataPoints = await syncService.syncAllProviders(connectedProviders, weekAgo, today);
    const summary = syncService.aggregateToSummary(dataPoints);

    return NextResponse.json({ summary, dataPoints: dataPoints.length, synced: new Date().toISOString() });
  } catch (error) {
    console.error('[API] Health sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const syncService = new HealthSyncService();
    const user = await getOrCreateDemoUser();
    const storedConnections = await prisma.healthConnection.findMany({
      where: { userId: user.id, status: 'connected' },
    });
    const today = new Date().toISOString().split('T')[0];
    const provider = (storedConnections[0]?.provider as HealthProvider | undefined) || 'whoop';
    const dataPoints = await syncService.syncProvider(provider, today, today);
    const summary = syncService.aggregateToSummary(dataPoints);

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('[API] Health summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch health summary' }, { status: 500 });
  }
}
