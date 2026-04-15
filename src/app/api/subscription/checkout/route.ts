import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStripe, hasStripeKey } from '@/lib/stripe';
import { getOrCreateDemoUser } from '@/lib/demo-user';
import { env } from '@/lib/env';

export async function POST(request: Request) {
  try {
    const user = await getOrCreateDemoUser();
    const body = await request.json() as { productIds: string[] };
    const { productIds } = body;

    if (!productIds?.length) {
      return NextResponse.json({ error: 'No products selected' }, { status: 400 });
    }

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, active: true, type: 'compound' },
    });

    if (products.length === 0) {
      return NextResponse.json({ error: 'No valid products found' }, { status: 400 });
    }

    const appUrl = env.NEXT_PUBLIC_APP_URL;

    // If no Stripe key, create a mock subscription directly
    if (!hasStripeKey()) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subscription = await prisma.subscription.upsert({
        where: { userId: user.id },
        update: {
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
        create: {
          userId: user.id,
          stripeCustomerId: `mock_cus_${user.id}`,
          stripeSubscriptionId: `mock_sub_${Date.now()}`,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      // Clear existing items and add new ones
      await prisma.subscriptionItem.deleteMany({ where: { subscriptionId: subscription.id } });
      await prisma.subscriptionItem.createMany({
        data: products.map((p) => ({
          subscriptionId: subscription.id,
          productId: p.id,
          isFromProtocol: true,
        })),
      });

      // Create initial order
      await prisma.order.create({
        data: {
          subscriptionId: subscription.id,
          status: 'pending',
        },
      });

      return NextResponse.json({ url: `${appUrl}/protocol/subscribe/success?mock=true` });
    }

    // Real Stripe checkout
    const lineItems = products.map((p) => {
      if (p.stripePriceId) {
        return { price: p.stripePriceId, quantity: 1 };
      }
      return {
        price_data: {
          currency: 'gbp',
          product_data: { name: p.name, description: p.description },
          unit_amount: p.priceInCents,
          recurring: { interval: 'month' as const },
        },
        quantity: 1,
      };
    });

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${appUrl}/protocol/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/protocol/subscribe`,
      metadata: { userId: user.id, productIds: JSON.stringify(productIds) },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout failed:', error);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
