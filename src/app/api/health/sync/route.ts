import { NextResponse } from 'next/server';
import { HEALTH_PROVIDERS, canSyncProviderConnection } from '@/lib/health/providers';
import { HealthSyncService } from '@/lib/health/sync';
import type { HealthCategory, HealthDataPoint, HealthProvider } from '@/types';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

type SyncRouteResult = {
  provider: HealthProvider;
  ok: boolean;
  count: number;
  points: HealthDataPoint[];
  error?: string | null;
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const body = await request.json();
    const { providers } = body as { providers?: HealthProvider[] };

    const syncService = new HealthSyncService();
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

    const results: SyncRouteResult[] = await Promise.all(
      targetConnections.map((connection) => {
        const provider = connection.provider as HealthProvider;
        const providerDefinition = HEALTH_PROVIDERS[provider];
        if (canSyncProviderConnection(providerDefinition)) {
          return syncService.syncConnection(connection, user.id, weekAgo, today);
        }

        return {
          provider,
          ok: false,
          count: 0,
          points: [],
          error: `provider_${providerDefinition.accessStatus}`,
        };
      })
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
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
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
