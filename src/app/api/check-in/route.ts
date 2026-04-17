import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { type, responses, date } = body;

    if (!type || !responses || !date) {
      return NextResponse.json({ error: 'Missing required fields: type, responses, date' }, { status: 400 });
    }

    // In production: save to database via Prisma
    // await prisma.checkIn.create({ data: { userId, type, responses: JSON.stringify(responses), date } });

    return NextResponse.json({ success: true, message: 'Check-in recorded' });
  } catch (error) {
    console.error('[API] Check-in error:', error);
    return NextResponse.json({ error: 'Failed to record check-in' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    // In production: query from database
    // const checkIns = await prisma.checkIn.findMany({ where: { userId, date: { gte: startDate, lte: endDate } } });

    return NextResponse.json({ checkIns: [] });
  } catch (error) {
    console.error('[API] Check-in fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch check-ins' }, { status: 500 });
  }
}
