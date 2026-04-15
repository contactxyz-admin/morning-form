import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CompoundDef {
  name: string;
  slug: string;
  description: string;
  dosage: string;
  priceInCents: number;
}

const COMPOUNDS: CompoundDef[] = [
  { name: 'L-Tyrosine', slug: 'l-tyrosine', description: 'Dopamine precursor for sustained focus and motivation.', dosage: '500mg', priceInCents: 1200 },
  { name: 'Alpha-GPC', slug: 'alpha-gpc', description: 'Cholinergic support for cognitive clarity and acetylcholine synthesis.', dosage: '300mg', priceInCents: 1400 },
  { name: 'L-Theanine', slug: 'l-theanine', description: 'Promotes alpha wave activity for calm alertness without sedation.', dosage: '200mg', priceInCents: 800 },
  { name: 'Magnesium L-Threonate', slug: 'magnesium-l-threonate', description: 'Crosses the blood-brain barrier for neural calming and GABA support.', dosage: '200mg', priceInCents: 1600 },
  { name: 'Apigenin', slug: 'apigenin', description: 'Natural flavonoid supporting melatonin onset and sleep quality.', dosage: '50mg', priceInCents: 900 },
  { name: 'Rhodiola Rosea', slug: 'rhodiola-rosea', description: 'Adaptogenic support for stress resilience and mental clarity.', dosage: '300mg', priceInCents: 1100 },
  { name: 'Glycine', slug: 'glycine', description: 'Lowers core body temperature and enhances sleep architecture.', dosage: '3g', priceInCents: 600 },
  { name: 'Magnesium Glycinate', slug: 'magnesium-glycinate', description: 'Supports GABA activity for sleep consolidation and muscle relaxation.', dosage: '400mg', priceInCents: 1000 },
  { name: 'Ashwagandha KSM-66', slug: 'ashwagandha-ksm-66', description: 'Reduces cortisol output and supports stress adaptation.', dosage: '300mg', priceInCents: 1300 },
  { name: 'Phosphatidylserine', slug: 'phosphatidylserine', description: 'Blunts cortisol response to stress for better regulation.', dosage: '100mg', priceInCents: 1500 },
  { name: 'Lemon Balm', slug: 'lemon-balm', description: 'Inhibits GABA transaminase for anxiolytic support without sedation.', dosage: '300mg', priceInCents: 700 },
  { name: 'Taurine', slug: 'taurine', description: 'GABAergic and glycinergic support for nervous system downregulation.', dosage: '1g', priceInCents: 500 },
  { name: 'B-Complex', slug: 'b-complex', description: 'Essential B vitamins for cellular energy metabolism.', dosage: '1 cap', priceInCents: 800 },
  { name: "Lion's Mane", slug: 'lions-mane', description: 'Stimulates nerve growth factor for cognitive support.', dosage: '500mg', priceInCents: 1400 },
];

interface PackDef {
  name: string;
  slug: string;
  archetype: string;
  description: string;
  compoundSlugs: string[];
}

const PACKS: PackDef[] = [
  {
    name: 'Sustained Activator Pack',
    slug: 'pack-sustained-activator',
    archetype: 'sustained-activator',
    description: 'For sustained activation with clean downshift. Supports dopamine-driven focus during the day and GABAergic sleep onset at night.',
    compoundSlugs: ['l-tyrosine', 'alpha-gpc', 'l-theanine', 'magnesium-l-threonate', 'apigenin'],
  },
  {
    name: 'Fragmented Sleeper Pack',
    slug: 'pack-fragmented-sleeper',
    archetype: 'fragmented-sleeper',
    description: 'For disrupted sleep architecture. Consolidates sleep stages through glycine and magnesium with adaptogenic morning support.',
    compoundSlugs: ['rhodiola-rosea', 'l-theanine', 'glycine', 'magnesium-glycinate'],
  },
  {
    name: 'Sympathetic Dominant Pack',
    slug: 'pack-sympathetic-dominant',
    archetype: 'sympathetic-dominant',
    description: 'For chronic stress activation. Prioritizes cortisol modulation, anxiolytic support, and nervous system downregulation.',
    compoundSlugs: ['ashwagandha-ksm-66', 'phosphatidylserine', 'l-theanine', 'lemon-balm', 'magnesium-l-threonate', 'taurine'],
  },
  {
    name: 'Flat Liner Pack',
    slug: 'pack-flat-liner',
    archetype: 'flat-liner',
    description: 'For low variability and reduced energy. Restores circadian amplitude with morning activation and evening contrast.',
    compoundSlugs: ['l-tyrosine', 'b-complex', 'alpha-gpc', 'lions-mane', 'magnesium-glycinate', 'glycine'],
  },
  {
    name: 'Over-Stimulated Pack',
    slug: 'pack-over-stimulated',
    archetype: 'over-stimulated',
    description: 'For high sensitivity and anxiety patterns. Calming compounds only — no stimulants. Triple-pathway sleep support.',
    compoundSlugs: ['l-theanine', 'phosphatidylserine', 'ashwagandha-ksm-66', 'magnesium-l-threonate', 'apigenin', 'glycine'],
  },
  {
    name: 'Well-Regulated Pack',
    slug: 'pack-well-regulated',
    archetype: 'well-regulated',
    description: 'Light-touch protocol for strong baselines. Subtle cognitive enhancement and sleep quality support.',
    compoundSlugs: ['alpha-gpc', 'l-theanine', 'magnesium-glycinate'],
  },
];

async function seedProducts() {
  console.log('Seeding products...');

  // Create compounds
  const compoundRecords: Record<string, string> = {};
  for (const c of COMPOUNDS) {
    const product = await prisma.product.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, dosage: c.dosage, priceInCents: c.priceInCents },
      create: { name: c.name, slug: c.slug, type: 'compound', description: c.description, dosage: c.dosage, priceInCents: c.priceInCents },
    });
    compoundRecords[c.slug] = product.id;

    // Create compound mapping
    await prisma.compoundMapping.upsert({
      where: { compoundKey: c.slug },
      update: { productId: product.id },
      create: { compoundKey: c.slug, productId: product.id },
    });
  }
  console.log(`  Created ${COMPOUNDS.length} compounds`);

  // Create packs
  for (const p of PACKS) {
    const packPrice = p.compoundSlugs.reduce((sum, slug) => {
      const compound = COMPOUNDS.find((c) => c.slug === slug);
      return sum + (compound?.priceInCents ?? 0);
    }, 0);
    // 15% discount for buying the pack
    const discountedPrice = Math.round(packPrice * 0.85);

    const pack = await prisma.product.upsert({
      where: { slug: p.slug },
      update: { name: p.name, description: p.description, priceInCents: discountedPrice },
      create: { name: p.name, slug: p.slug, type: 'pack', description: p.description, priceInCents: discountedPrice },
    });

    // Link compounds to pack
    for (const compoundSlug of p.compoundSlugs) {
      const compoundId = compoundRecords[compoundSlug];
      await prisma.productPackItem.upsert({
        where: { packId_compoundId: { packId: pack.id, compoundId } },
        update: {},
        create: { packId: pack.id, compoundId },
      });
    }
  }
  console.log(`  Created ${PACKS.length} packs`);

  console.log('Product seeding complete.');
}

seedProducts()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
