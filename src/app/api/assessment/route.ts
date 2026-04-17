import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { generateStateProfile, generateProtocol } from '@/lib/protocol-engine';
import type { AssessmentResponses } from '@/types';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const responses = body.responses as AssessmentResponses;

    if (!responses || typeof responses !== 'object') {
      return NextResponse.json({ error: 'Invalid assessment responses' }, { status: 400 });
    }

    const stateProfile = generateStateProfile(responses);
    const protocol = generateProtocol(responses);

    return NextResponse.json({ stateProfile, protocol });
  } catch (error) {
    console.error('[API] Assessment error:', error);
    return NextResponse.json({ error: 'Failed to process assessment' }, { status: 500 });
  }
}
