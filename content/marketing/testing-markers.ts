import type { Market } from '@/lib/marketing/constants';

/**
 * The baseline panel's full marker index — one entry per marker group,
 * organised into the same six panels as `panelGroups()` on the testing
 * page. Lives in content/ alongside testing-faq.ts so the static-copy
 * compliance gate scans this editorial copy too.
 *
 * Two entries carry market-conditional naming (the UK/US spelling and
 * lab-naming differences already handled elsewhere on this page):
 * Oestradiol/Estradiol and Full/Complete blood count.
 */

export interface MarkerCategory {
  readonly id: string;
  readonly label: string;
  /** Tailwind background-color class for the row dot and category accent. */
  readonly dotClass: string;
}

export interface MarkerEntry {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  /** Measurement count annotation, e.g. "4 measures" — empty for a single measure. */
  readonly sub: string;
  readonly description: string;
}

export const MARKER_CATEGORIES: ReadonlyArray<MarkerCategory> = [
  { id: 'metabolic', label: 'Metabolic & heart', dotClass: 'bg-brand-blue-500' },
  { id: 'hormones', label: 'Hormones & thyroid', dotClass: 'bg-brand-bluegrey' },
  { id: 'recovery', label: 'Recovery, blood & iron', dotClass: 'bg-brand-sage-500' },
  { id: 'inflammation', label: 'Inflammation & immune', dotClass: 'bg-brand-orange-500' },
  { id: 'nutrients', label: 'Nutrients & vitamins', dotClass: 'bg-brand-sage-700' },
  { id: 'organ', label: 'Liver, kidney & organ', dotClass: 'bg-brand-blue-700' },
];

export function testingMarkers(market: Market): ReadonlyArray<MarkerEntry> {
  const uk = market === 'uk';
  return [
    {
      id: 'hba1c',
      categoryId: 'metabolic',
      name: 'HbA1c',
      sub: '',
      description:
        'Your average blood sugar over the last three months. A steady read here means your energy runs on an even keel, day to day.',
    },
    {
      id: 'glucose',
      categoryId: 'metabolic',
      name: 'Glucose (fasting)',
      sub: '',
      description:
        'Blood sugar in the moment your sample was taken. Read next to HbA1c, it shows how your body is handling fuel right now.',
    },
    {
      id: 'insulin',
      categoryId: 'metabolic',
      name: 'Insulin (HOMA-IR)',
      sub: '2 measures',
      description:
        'How hard your body works to keep blood sugar in check. Caught early, a drift here is one of the most reversible signals there is.',
    },
    {
      id: 'lipids',
      categoryId: 'metabolic',
      name: 'Cholesterol · LDL · HDL · triglycerides',
      sub: '4 measures',
      description:
        'The full lipid picture — the balance of fats your heart moves through every day. The ratios between them matter more than any single number.',
    },
    {
      id: 'apob',
      categoryId: 'metabolic',
      name: 'ApoB',
      sub: '',
      description:
        'A direct count of the particles that actually carry cholesterol into artery walls. Many clinicians now weigh it over LDL alone.',
    },
    {
      id: 'lpa',
      categoryId: 'metabolic',
      name: 'Lp(a)',
      sub: 'measured once',
      description:
        'A largely inherited risk marker you only need to check once. Knowing it early shapes how closely everything else is watched.',
    },
    {
      id: 'testosterone',
      categoryId: 'hormones',
      name: 'Total & free testosterone',
      sub: '2 measures',
      description:
        'The hormone behind strength, drive and recovery — in everyone. Free testosterone is the share your body can actually use.',
    },
    {
      id: 'shbg',
      categoryId: 'hormones',
      name: 'SHBG',
      sub: '',
      description:
        'The protein that binds sex hormones and sets how much stays available. It is the context that makes a testosterone number make sense.',
    },
    {
      id: 'lhfsh',
      categoryId: 'hormones',
      name: 'LH · FSH',
      sub: '2 measures',
      description:
        'The signals from your brain that set hormone production in motion. They help locate where a hormonal shift begins.',
    },
    {
      id: 'oestradiol',
      categoryId: 'hormones',
      name: uk ? 'Oestradiol' : 'Estradiol',
      sub: '',
      description:
        'The primary oestrogen — central to bone, mood and cycle health, and relevant at every stage of life.',
    },
    {
      id: 'dheas',
      categoryId: 'hormones',
      name: 'DHEA-S',
      sub: '',
      description:
        'A precursor your body draws on to make other hormones. Often read as a window on adrenal reserve and how you handle stress.',
    },
    {
      id: 'cortisol',
      categoryId: 'hormones',
      name: 'Cortisol (morning)',
      sub: '',
      description:
        'Your main stress hormone, highest in the morning by design. Measured with a morning draw, it maps how you meet the day.',
    },
    {
      id: 'thyroid',
      categoryId: 'hormones',
      name: 'TSH · free T4 · free T3',
      sub: '3 measures',
      description:
        'The core thyroid trio, setting the pace of your metabolism. Together they show whether your engine runs fast, slow or steady.',
    },
    {
      id: 'tpo',
      categoryId: 'hormones',
      name: 'TPO antibodies',
      sub: '',
      description:
        'An immune marker that can flag thyroid issues before levels shift. It answers why, not just what.',
    },
    {
      id: 'fbc',
      categoryId: 'recovery',
      name: uk ? 'Full blood count' : 'Complete blood count',
      sub: '~15 measures',
      description:
        'A wide look at your red and white cells and platelets — recovery, immunity and oxygen delivery in one information-dense read.',
    },
    {
      id: 'ferritin',
      categoryId: 'recovery',
      name: 'Ferritin',
      sub: '',
      description:
        'Your iron stores in the bank. Low ferritin is a common, quiet reason training starts to feel harder than it should.',
    },
    {
      id: 'iron',
      categoryId: 'recovery',
      name: 'Iron · TIBC',
      sub: '2 measures',
      description:
        'Iron in circulation and your capacity to carry more. Read together, they show whether supply is meeting demand.',
    },
    {
      id: 'tsat',
      categoryId: 'recovery',
      name: 'Transferrin saturation',
      sub: '',
      description:
        'How full your iron transport is running, as a percentage. It sharpens the picture ferritin and iron begin to draw.',
    },
    {
      id: 'hscrp',
      categoryId: 'inflammation',
      name: 'hs-CRP',
      sub: '',
      description:
        'A sensitive read on background inflammation across the body. It tends to fall as sleep, training and nutrition settle into rhythm.',
    },
    {
      id: 'esr',
      categoryId: 'inflammation',
      name: 'ESR',
      sub: '',
      description:
        'A steady, classic measure of inflammation over time. Slower to move than hs-CRP, it adds the longer view.',
    },
    {
      id: 'homocysteine',
      categoryId: 'inflammation',
      name: 'Homocysteine',
      sub: '',
      description:
        'An amino acid tied to heart and brain health, and to your B-vitamin status. Often nudged back into range with straightforward changes.',
    },
    {
      id: 'uricacid',
      categoryId: 'inflammation',
      name: 'Uric acid',
      sub: '',
      description:
        'A by-product of metabolism linked to joints and blood pressure — and responsive to what you eat and drink.',
    },
    {
      id: 'nlr',
      categoryId: 'inflammation',
      name: 'Neutrophil–lymphocyte ratio',
      sub: '',
      description:
        'A simple ratio from your blood count that tracks immune balance and stress load. A quiet, useful read on how you are coping.',
    },
    {
      id: 'vitd',
      categoryId: 'nutrients',
      name: 'Vitamin D',
      sub: '',
      description:
        'Central to bone, immune and mood health — and widely low in northern winters. One of the simplest markers to move.',
    },
    {
      id: 'b12',
      categoryId: 'nutrients',
      name: 'Vitamin B12',
      sub: '',
      description:
        'Fuel for nerves, energy and red blood cells. A shortfall shows up as fatigue long before much else.',
    },
    {
      id: 'folate',
      categoryId: 'nutrients',
      name: 'Folate',
      sub: '',
      description:
        'Works hand in hand with B12 for energy and cell repair. Read together, they explain a lot about how you feel.',
    },
    {
      id: 'magnesium',
      categoryId: 'nutrients',
      name: 'Magnesium',
      sub: '',
      description:
        'A mineral behind sleep, muscle function and hundreds of daily reactions. Quietly foundational, and easily overlooked.',
    },
    {
      id: 'zinc',
      categoryId: 'nutrients',
      name: 'Zinc',
      sub: '',
      description:
        'Supports immunity, hormones and recovery. Small shifts here are often felt more than the number suggests.',
    },
    {
      id: 'omega3',
      categoryId: 'nutrients',
      name: 'Omega-3 index',
      sub: '',
      description:
        'The share of protective omega-3s built into your cell membranes. A slow marker to change — and a rewarding one to watch.',
    },
    {
      id: 'liverenzymes',
      categoryId: 'organ',
      name: 'ALT · AST · GGT · ALP',
      sub: '4 measures',
      description:
        'The core liver enzymes, reading how one of your hardest-working organs is coping with training load, alcohol and recovery.',
    },
    {
      id: 'bilirubin',
      categoryId: 'organ',
      name: 'Bilirubin · albumin',
      sub: '2 measures',
      description:
        'Two reads on liver function and protein status. Albumin doubles as a broad marker of overall resilience.',
    },
    {
      id: 'kidney',
      categoryId: 'organ',
      name: 'Creatinine · eGFR · urea',
      sub: '3 measures',
      description:
        'How well your kidneys are filtering, day in and day out. eGFR turns the raw numbers into a single, trackable score.',
    },
    {
      id: 'electrolytes',
      categoryId: 'organ',
      name: 'Electrolytes',
      sub: '4 measures',
      description:
        'Sodium, potassium and the balance that keeps nerves, muscles and hydration in tune. The quiet chemistry behind feeling steady.',
    },
  ];
}
