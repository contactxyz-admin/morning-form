import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      packCompounds: { include: { compound: true } },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ products });
}
