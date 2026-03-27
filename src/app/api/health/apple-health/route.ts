import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateDemoUser } from '@/lib/demo-user';

type AppleHealthSnapshotPayload = {
  stepCount?: number | null;
  heartRate?: number | null;
  restingHeartRate?: number | null;
  heartRateVariability?: number | null;
  sleepHours?: number | null;
  capturedAt?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AppleHealthSnapshotPayload;
    const user = await getOrCreateDemoUser();
    const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date();

    await prisma.healthConnection.upsert({
      where: { userId_provider: { userId: user.id, provider: 'apple_health' } },
      update: {
        status: 'connected',
        lastSyncAt: capturedAt,
        metadata: JSON.stringify({
          source: 'native_healthkit',
          connectedAt: capturedAt.toISOString(),
          lastUploadAt: new Date().toISOString(),
        }),
      },
      create: {
        userId: user.id,
        provider: 'apple_health',
        status: 'connected',
        lastSyncAt: capturedAt,
        metadata: JSON.stringify({
          source: 'native_healthkit',
          connectedAt: capturedAt.toISOString(),
          lastUploadAt: new Date().toISOString(),
        }),
      },
    });

    const windowStart = new Date(capturedAt);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 1);

    await prisma.healthDataPoint.deleteMany({
      where: {
        userId: user.id,
        provider: 'apple_health',
        timestamp: {
          gte: windowStart,
          lt: windowEnd,
        },
      },
    });

    const points = [
      body.stepCount != null
        ? {
            userId: user.id,
            provider: 'apple_health',
            category: 'activity',
            metric: 'steps',
            value: body.stepCount,
            unit: 'steps',
            timestamp: capturedAt,
            metadata: JSON.stringify({ source: 'native_healthkit' }),
          }
        : null,
      body.heartRate != null
        ? {
            userId: user.id,
            provider: 'apple_health',
            category: 'heart',
            metric: 'avg_hr',
            value: body.heartRate,
            unit: 'bpm',
            timestamp: capturedAt,
            metadata: JSON.stringify({ source: 'native_healthkit' }),
          }
        : null,
      body.restingHeartRate != null
        ? {
            userId: user.id,
            provider: 'apple_health',
            category: 'heart',
            metric: 'resting_hr',
            value: body.restingHeartRate,
            unit: 'bpm',
            timestamp: capturedAt,
            metadata: JSON.stringify({ source: 'native_healthkit' }),
          }
        : null,
      body.heartRateVariability != null
        ? {
            userId: user.id,
            provider: 'apple_health',
            category: 'recovery',
            metric: 'hrv',
            value: body.heartRateVariability,
            unit: 'ms',
            timestamp: capturedAt,
            metadata: JSON.stringify({ source: 'native_healthkit' }),
          }
        : null,
      body.sleepHours != null
        ? {
            userId: user.id,
            provider: 'apple_health',
            category: 'sleep',
            metric: 'duration',
            value: body.sleepHours,
            unit: 'hours',
            timestamp: capturedAt,
            metadata: JSON.stringify({ source: 'native_healthkit' }),
          }
        : null,
    ].filter(Boolean) as Array<{
      userId: string;
      provider: string;
      category: string;
      metric: string;
      value: number;
      unit: string;
      timestamp: Date;
      metadata: string;
    }>;

    if (points.length > 0) {
      await prisma.healthDataPoint.createMany({ data: points });
    }

    return NextResponse.json({
      success: true,
      provider: 'apple_health',
      pointsStored: points.length,
      capturedAt: capturedAt.toISOString(),
    });
  } catch (error) {
    console.error('[API] Apple Health upload error:', error);
    return NextResponse.json({ error: 'Failed to upload Apple Health snapshot' }, { status: 500 });
  }
}

