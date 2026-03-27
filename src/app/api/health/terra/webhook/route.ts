import { NextResponse } from 'next/server';
import { TerraClient } from '@/lib/health/terra';

export async function POST(request: Request) {
  try {
    // Verify webhook signature in production
    const webhookSecret = process.env.TERRA_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get('terra-signature');
      if (!signature) {
        return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 });
      }
      // In production: verify HMAC signature
    }

    const payload = await request.json();
    const terra = new TerraClient();
    await terra.handleWebhook(payload);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[API] Terra webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
