import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateDemoUser } from '@/lib/demo-user';

export async function PATCH(request: Request) {
  try {
    const user = await getOrCreateDemoUser();
    const body = await request.json() as { add?: string[]; remove?: string[] };
    const { add = [], remove = [] } = body;

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
      include: { items: true },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
    }

    // Remove items
    if (remove.length > 0) {
      const remainingCount = subscription.items.length - remove.length + add.length;
      if (remainingCount < 1) {
        return NextResponse.json({ error: 'Subscription must have at least one compound' }, { status: 400 });
      }

      await prisma.subscriptionItem.deleteMany({
        where: {
          subscriptionId: subscription.id,
          productId: { in: remove },
        },
      });
    }

    // Add items
    if (add.length > 0) {
      const existingProductIds = new Set(subscription.items.map((i) => i.productId));
      const newProductIds = add.filter((id) => !existingProductIds.has(id));

      if (newProductIds.length > 0) {
        await prisma.subscriptionItem.createMany({
          data: newProductIds.map((productId) => ({
            subscriptionId: subscription.id,
            productId,
            isFromProtocol: false,
          })),
        });
      }
    }

    // Return updated subscription
    const updated = await prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: { items: { include: { product: true } } },
    });

    return NextResponse.json({ ok: true, items: updated?.items });
  } catch (error) {
    console.error('Failed to update subscription items:', error);
    return NextResponse.json({ error: 'Failed to update items' }, { status: 500 });
  }
}
