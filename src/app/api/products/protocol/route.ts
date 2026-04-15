import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateDemoUser } from '@/lib/demo-user';
import { getArchetypePack, getAllCompounds } from '@/lib/compound-resolver';

export async function GET() {
  try {
    const user = await getOrCreateDemoUser();

    const stateProfile = await prisma.stateProfile.findUnique({
      where: { userId: user.id },
    });

    const archetype = stateProfile?.archetype ?? 'sustained-activator';
    const pack = await getArchetypePack(archetype);
    const allCompounds = await getAllCompounds();

    // Compounds not in the user's pack (available as add-ons)
    const packCompoundIds = new Set(pack?.packCompounds.map((pc) => pc.compound.id) ?? []);
    const addOns = allCompounds.filter((c) => !packCompoundIds.has(c.id));

    return NextResponse.json({ archetype, pack, addOns });
  } catch (error) {
    console.error('Failed to fetch protocol products:', error);
    return NextResponse.json({ error: 'Failed to fetch protocol products' }, { status: 500 });
  }
}
