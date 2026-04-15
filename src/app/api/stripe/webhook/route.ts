import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import type Stripe from 'stripe';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const productIds = session.metadata?.productIds ? JSON.parse(session.metadata.productIds) as string[] : [];

        if (!userId || !session.subscription || !session.customer) break;

        const stripeSubscription = await getStripe().subscriptions.retrieve(session.subscription as string);

        const subscription = await prisma.subscription.upsert({
          where: { userId },
          update: {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: stripeSubscription.id,
            status: 'active',
            currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          },
          create: {
            userId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: stripeSubscription.id,
            status: 'active',
            currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          },
        });

        // Create subscription items
        await prisma.subscriptionItem.deleteMany({ where: { subscriptionId: subscription.id } });
        if (productIds.length > 0) {
          await prisma.subscriptionItem.createMany({
            data: productIds.map((productId: string) => ({
              subscriptionId: subscription.id,
              productId,
              isFromProtocol: true,
            })),
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const subscription = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: invoice.subscription as string },
        });

        if (subscription) {
          await prisma.order.create({
            data: {
              subscriptionId: subscription.id,
              stripeInvoiceId: invoice.id,
              status: 'pending',
            },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: 'canceled' },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription as string },
          data: { status: 'past_due' },
        });
        break;
      }
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
