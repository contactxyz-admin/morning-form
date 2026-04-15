import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateDemoUser } from '@/lib/demo-user';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider') ?? undefined;
    const requestedUserId = url.searchParams.get('userId');
    const limitParam = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitParam) ? limitParam : DEFAULT_LIMIT));

    // Demo-user gated: only the seeded demo user's payloads are accessible.
    // Any other userId returns an empty list rather than a leak.
    const demo = await getOrCreateDemoUser();
    const userId = requestedUserId ?? demo.id;
    if (userId !== demo.id) {
      return NextResponse.json({ rows: [] });
    }

    const rows = await prisma.rawProviderPayload.findMany({
      where: { userId, ...(provider ? { provider } : {}) },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        provider: r.provider,
        source: r.source,
        receivedAt: r.receivedAt.toISOString(),
        sizeBytes: r.sizeBytes,
        payload: r.payload,
        traceId: r.traceId,
      })),
    });
  } catch (error) {
    console.error('[API] raw-payloads error:', error);
    return NextResponse.json({ error: 'Failed to fetch raw payloads' }, { status: 500 });
  }
}
