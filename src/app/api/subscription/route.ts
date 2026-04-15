import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStripe, hasStripeKey } from '@/lib/stripe';
import { getOrCreateDemoUser } from '@/lib/demo-user';

export async function GET() {
  try {
    const user = await getOrCreateDemoUser();

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
      include: {
        items: { include: { product: true } },
        orders: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!subscription) {
      return NextResponse.json({ subscription: null });
    }

    const monthlyTotalCents = subscription.items.reduce(
      (sum, item) => sum + item.product.priceInCents * item.quantity,
      0
    );

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        items: subscription.items.map((item) => ({
          id: item.id,
          product: item.product,
          quantity: item.quantity,
          isFromProtocol: item.isFromProtocol,
        })),
        monthlyTotalCents,
        orders: subscription.orders.map((o) => {
          // Auto-progress demo order status based on age
          const ageHours = (Date.now() - o.createdAt.getTime()) / (1000 * 60 * 60);
          let status = o.status;
          if (status === 'pending' && ageHours > 1) status = 'processing';
          if ((status === 'pending' || status === 'processing') && ageHours > 24) status = 'shipped';
          if (ageHours > 72) status = 'delivered';
          const trackingNumber = (status === 'shipped' || status === 'delivered')
            ? (o.trackingNumber || `MF${o.id.slice(-8).toUpperCase()}`)
            : o.trackingNumber;
          return {
            id: o.id,
            status,
            trackingNumber,
            createdAt: o.createdAt.toISOString(),
          };
        }),
      },
    });
  } catch (error) {
    console.error('Failed to fetch subscription:', error);
    return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getOrCreateDemoUser();
    const body = await request.json() as { action: string };
    const { action } = body;

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
    }

    if (action === 'pause') {
      if (subscription.stripeSubscriptionId.startsWith('mock_')) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'paused' },
        });
      } else {
        await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
          pause_collection: { behavior: 'void' },
        });
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'paused' },
        });
      }
    } else if (action === 'resume') {
      if (subscription.stripeSubscriptionId.startsWith('mock_')) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'active' },
        });
      } else {
        await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
          pause_collection: '',
        });
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'active' },
        });
      }
    } else if (action === 'cancel') {
      if (subscription.stripeSubscriptionId.startsWith('mock_')) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { cancelAtPeriodEnd: true, status: 'canceled' },
        });
      } else {
        await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { cancelAtPeriodEnd: true },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Subscription action failed:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
