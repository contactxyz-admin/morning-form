/**
 * Fatigue cohort template.
 *
 * Consumed by `pnpm marketing:scaffold --cohort=fatigue --slug=<...> --market=<uk|us>`.
 * Editorial review owns the actual prose; this scaffold supplies the
 * structure + placeholder copy that passes the editorial-QA gate.
 *
 * The scaffolder substitutes `__SLUG__`, `__MARKET__`, `__SEO_TITLE__`,
 * and other placeholders below. After scaffolding, the file is a
 * normal page-data file — the founder/editorial reviewer fills in
 * real content.
 */
export const FATIGUE_TEMPLATE = `import { defineMarketingPage } from '@/lib/marketing/page-schema';

export default defineMarketingPage({
  slug: '__SLUG__',
  market: '__MARKET__',
  cohortKey: 'fatigue',

  seoTitle: '__SEO_TITLE__',
  metaDescription:
    '__META_DESCRIPTION__',
  h1: '__H1__',
  aboveFold:
    '__ABOVE_FOLD__',

  sections: [
    {
      heading: 'Section heading',
      paragraphs: [
        'Replace this paragraph with content. Keep prose descriptive, not prescriptive: explain what a marker shows, what high or low values may indicate, and what a clinician might investigate. Avoid imperative language and dose strings.',
      ],
    },
  ],

  faq: [
    {
      question: 'Replace with a real user question.',
      answer:
        'Replace with a plain-English answer (~80–150 words). Cite the underlying biology where helpful; avoid certainty claims about diagnosis.',
    },
  ],

  escalation: {
    heading: 'When to speak to a clinician',
    paragraphs: [
      'Symptoms that should trigger a clinician conversation. Anchor on what is observable (duration, intensity, accompanying symptoms), not on diagnostic labels.',
    ],
    bullets: [
      'Specific red-flag symptom 1',
      'Specific red-flag symptom 2',
    ],
  },

  cta: {
    label: 'Upload your last blood panel',
    href: '/onboarding',
    caption: '8 minutes · free · no signup',
  },

  publishedAt: '__TODAY__',
  lastReviewedAt: '__TODAY__',
  reviewerKey: 'morning-form-editorial',
});
`;
