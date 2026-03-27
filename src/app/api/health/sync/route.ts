import { NextResponse } from 'next/server';
import { HealthSyncService } from '@/lib/health/sync';
import type { HealthProvider } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { providers } = body as { providers?: HealthProvider[] };

    const syncService = new HealthSyncService();
    const connectedProviders: HealthProvider[] = providers || ['whoop', 'oura'];
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
    // Return latest health summary (mock for MVP)
    const syncService = new HealthSyncService();
    const today = new Date().toISOString().split('T')[0];
    const dataPoints = await syncService.syncProvider('whoop', today, today);
    const summary = syncService.aggregateToSummary(dataPoints);

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('[API] Health summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch health summary' }, { status: 500 });
  }
}
