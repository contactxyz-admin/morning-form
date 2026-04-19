import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import {
  currentMonday,
  deriveWeeklyReview,
  parseMonday,
  type StoredCheckIn,
} from '@/lib/insights/weekly-review';
import type { EveningCheckIn, MorningCheckIn } from '@/types';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * GET /api/insights/weekly?weekStart=YYYY-MM-DD — derived WeeklyReview for a
 * user's week. `weekStart` must be a Monday; defaults to the current week.
 *
 * The aggregation function loads the current + prior week's check-ins so the
 * trend classifier has a baseline.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get('weekStart');

  let weekStart: Date;
  if (weekStartParam !== null) {
    const parsed = parseMonday(weekStartParam);
    if (!parsed) {
      return NextResponse.json(
        { error: "'weekStart' must be a Monday in YYYY-MM-DD format." },
        { status: 400 },
      );
    }
    weekStart = parsed;
  } else {
    weekStart = currentMonday();
  }

  const priorStart = new Date(weekStart);
  priorStart.setUTCDate(priorStart.getUTCDate() - 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  try {
    const rows = await prisma.checkIn.findMany({
      where: {
        userId: user.id,
        date: { gte: isoDate(priorStart), lte: isoDate(weekEnd) },
      },
    });

    const parsed: StoredCheckIn[] = rows.map((row) => ({
      date: row.date,
      type: row.type as 'morning' | 'evening',
      responses: JSON.parse(row.responses) as MorningCheckIn | EveningCheckIn,
    }));

    const review = deriveWeeklyReview(parsed, weekStart);
    return NextResponse.json({ review });
  } catch (error) {
    console.error('[API] Weekly insights error:', error);
    return NextResponse.json({ error: 'Failed to build weekly review' }, { status: 500 });
  }
}
