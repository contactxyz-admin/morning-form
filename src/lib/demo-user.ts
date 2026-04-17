import { prisma } from '@/lib/db';

/**
 * Provision the seeded demo user for dev scripts, marketing previews, and
 * onboarding fixtures. **Must never be called from API route handlers** —
 * authenticated routes resolve the caller via `getCurrentUser()`. An ESLint
 * rule (`no-restricted-imports` in `.eslintrc.json`) forbids importing this
 * helper from `src/app/api/**`.
 */
export async function getDemoUserForSeedOnly() {
  return prisma.user.upsert({
    where: { email: 'demo@morningform.com' },
    update: {},
    create: {
      email: 'demo@morningform.com',
      name: 'Demo User',
    },
  });
}
