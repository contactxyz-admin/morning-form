import { NextResponse } from 'next/server';
import { mockProtocol } from '@/lib/mock-data';

export async function GET() {
  // In production: fetch from database for authenticated user
  return NextResponse.json({ protocol: mockProtocol });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { adjustmentId, action } = body;

    if (!adjustmentId || !['accept', 'defer', 'revert'].includes(action)) {
      return NextResponse.json({ error: 'Invalid adjustment action' }, { status: 400 });
    }

    // In production: update adjustment status in database
    return NextResponse.json({ success: true, message: `Adjustment ${action}ed` });
  } catch (error) {
    console.error('[API] Protocol update error:', error);
    return NextResponse.json({ error: 'Failed to update protocol' }, { status: 500 });
  }
}
