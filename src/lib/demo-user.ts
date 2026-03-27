import { prisma } from '@/lib/db';

export async function getOrCreateDemoUser() {
  return prisma.user.upsert({
    where: { email: 'demo@morningform.com' },
    update: {},
    create: {
      email: 'demo@morningform.com',
      name: 'Demo User',
    },
  });
}

