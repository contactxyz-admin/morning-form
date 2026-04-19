import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import type { EveningCheckIn, MorningCheckIn } from '@/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultWindow(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start: isoDate(start), end: isoDate(end) };
}

/**
 * POST /api/check-in — persist a morning or evening check-in.
 *
 * Idempotent by (userId, date, type): re-submitting the same day's check-in
 * replaces the prior row rather than creating a duplicate. Weekly review
 * aggregation in GET /api/insights/weekly counts one row per day per type.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: { type?: unknown; responses?: unknown; date?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, responses, date } = body;

  if (type !== 'morning' && type !== 'evening') {
    return NextResponse.json(
      { error: "Field 'type' must be 'morning' or 'evening'." },
      { status: 400 },
    );
  }

  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "Field 'date' must be a YYYY-MM-DD string." },
      { status: 400 },
    );
  }

  if (!responses || typeof responses !== 'object') {
    return NextResponse.json({ error: "Field 'responses' is required." }, { status: 400 });
  }

  try {
    const row = await prisma.checkIn.upsert({
      where: { userId_date_type: { userId: user.id, date, type } },
      update: { responses: JSON.stringify(responses) },
      create: { userId: user.id, type, date, responses: JSON.stringify(responses) },
    });
    return NextResponse.json({ success: true, id: row.id });
  } catch (error) {
    console.error('[API] Check-in error:', error);
    return NextResponse.json({ error: 'Failed to record check-in' }, { status: 500 });
  }
}

/**
 * GET /api/check-in?start=YYYY-MM-DD&end=YYYY-MM-DD — list the current user's
 * check-ins in the date range (inclusive). Defaults to the last 7 days.
 *
 * `responses` is stored as a JSON string on CheckIn; this handler parses it
 * before returning so callers work with the typed MorningCheckIn/EveningCheckIn.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const startParam = url.searchParams.get('start');
  const endParam = url.searchParams.get('end');

  if (startParam !== null && !DATE_RE.test(startParam)) {
    return NextResponse.json({ error: "'start' must be YYYY-MM-DD." }, { status: 400 });
  }
  if (endParam !== null && !DATE_RE.test(endParam)) {
    return NextResponse.json({ error: "'end' must be YYYY-MM-DD." }, { status: 400 });
  }

  const { start: defaultStart, end: defaultEnd } = defaultWindow();
  const start = startParam ?? defaultStart;
  const end = endParam ?? defaultEnd;

  try {
    const rows = await prisma.checkIn.findMany({
      where: { userId: user.id, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });
    const checkIns = rows.map((row) => ({
      date: row.date,
      type: row.type as 'morning' | 'evening',
      responses: JSON.parse(row.responses) as MorningCheckIn | EveningCheckIn,
    }));
    return NextResponse.json({ checkIns });
  } catch (error) {
    console.error('[API] Check-in fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch check-ins' }, { status: 500 });
  }
}
