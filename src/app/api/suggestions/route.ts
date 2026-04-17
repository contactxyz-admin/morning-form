import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { ensureTodaysSuggestions } from '@/lib/suggestions/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const suggestions = await ensureTodaysSuggestions(user.id);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('[API] Suggestions error:', error);
    return NextResponse.json({ error: 'Failed to load suggestions' }, { status: 500 });
  }
}
