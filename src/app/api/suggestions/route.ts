import { NextResponse } from 'next/server';
import { getOrCreateDemoUser } from '@/lib/demo-user';
import { ensureTodaysSuggestions } from '@/lib/suggestions/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getOrCreateDemoUser();
    const suggestions = await ensureTodaysSuggestions(user.id);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('[API] Suggestions error:', error);
    return NextResponse.json({ error: 'Failed to load suggestions' }, { status: 500 });
  }
}
