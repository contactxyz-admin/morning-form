import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getOrCreateDemoUser } from '@/lib/demo-user';
import { env } from '@/lib/env';

export async function POST() {
  try {
    const user = await getOrCreateDemoUser();

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    if (subscription.stripeCustomerId.startsWith('mock_')) {
      return NextResponse.json({ url: `${env.NEXT_PUBLIC_APP_URL}/settings/subscription` });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/settings/subscription`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Portal session failed:', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
