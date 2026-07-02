/**
 * Load a user's captured demographics (sex-at-birth + birth year) for
 * demographic-aware reference ranges (A6). Raw stored values — normalisation
 * (sex) and age derivation happen at the point of use
 * (`compare_to_reference_range` via `@/lib/markers/demographic-ranges`).
 *
 * Kept tiny and separate so the scribe path (`chat/turn.ts`, `mcp/tool-adapter`)
 * can load demographics once per request without pulling in the cookie-bound
 * `getCurrentUser`.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export interface UserDemographics {
  sexAtBirth: string | null;
  birthYear: number | null;
}

export async function loadUserDemographics(db: Db, userId: string): Promise<UserDemographics> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { sexAtBirth: true, birthYear: true },
  });
  return {
    sexAtBirth: user?.sexAtBirth ?? null,
    birthYear: user?.birthYear ?? null,
  };
}
