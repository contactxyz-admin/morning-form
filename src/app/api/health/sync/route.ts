import { NextResponse } from 'next/server';
import { HealthSyncService } from '@/lib/health/sync';
import type { HealthCategory, HealthDataPoint, HealthProvider } from '@/types';
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
    const targetConnections = storedConnections.filter((connection) =>
      connectedProviders.includes(connection.provider as HealthProvider)
    );
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const results = await Promise.all(
      targetConnections.map((connection) =>
        syncService.syncConnection(connection, user.id, weekAgo, today)
      )
    );

    const allPoints = results.flatMap((result) => result.points);
    const summary = syncService.aggregateToSummary(allPoints);

    return NextResponse.json({
      summary,
      dataPoints: allPoints.length,
      results: results.map((result) => ({
        provider: result.provider,
        ok: result.ok,
        count: result.count,
        error: result.error ?? null,
      })),
      synced: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Health sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getOrCreateDemoUser();
    const syncService = new HealthSyncService();
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const dataPoints = await prisma.healthDataPoint.findMany({
      where: {
        userId: user.id,
        timestamp: {
          gte: since,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    const normalizedPoints: HealthDataPoint[] = dataPoints.map((point) => ({
      category: point.category as HealthCategory,
      metric: point.metric,
      value: point.value,
      unit: point.unit,
      timestamp: point.timestamp.toISOString(),
      provider: point.provider as HealthProvider,
    }));

    const summary = syncService.aggregateToSummary(normalizedPoints);

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('[API] Health summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch health summary' }, { status: 500 });
  }
}
