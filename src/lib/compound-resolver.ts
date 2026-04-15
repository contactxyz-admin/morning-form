import { prisma } from '@/lib/db';
import type { ProtocolItem } from '@/types';

export function normalizeCompoundKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s+/g, '-');
}

export function splitCompounds(compoundsString: string): string[] {
  return compoundsString.split('+').map((s) => s.trim()).filter(Boolean);
}

export async function resolveProtocolProducts(protocolItems: ProtocolItem[]) {
  const allCompoundNames = protocolItems.flatMap((item) => splitCompounds(item.compounds));
  const keys = [...new Set(allCompoundNames.map(normalizeCompoundKey))];

  const mappings = await prisma.compoundMapping.findMany({
    where: { compoundKey: { in: keys } },
    include: { product: true },
  });

  return mappings.map((m) => m.product);
}

export async function getArchetypePack(archetype: string) {
  return prisma.product.findFirst({
    where: { slug: `pack-${archetype}`, type: 'pack', active: true },
    include: {
      packCompounds: { include: { compound: true } },
    },
  });
}

export async function getAllCompounds() {
  return prisma.product.findMany({
    where: { type: 'compound', active: true },
    orderBy: { name: 'asc' },
  });
}
