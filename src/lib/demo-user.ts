import { prisma } from '@/lib/db';
import { DEMO_EMAIL } from '../../prisma/fixtures/demo-ids';

/**
 * Provision the seeded demo user for dev scripts, marketing previews, and
 * onboarding fixtures. **Must never be called from API route handlers** —
 * authenticated routes resolve the caller via `getCurrentUser()`. An ESLint
 * rule (`no-restricted-imports` in `.eslintrc.json`) forbids importing this
 * helper from `src/app/api/**`.
 */
export async function getDemoUserForSeedOnly() {
  return prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      name: 'Demo User',
    },
  });
}
