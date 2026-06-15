/**
 * MarketingPage data schema.
 *
 * Page-data files at content/marketing/{market}/{slug}.ts export an
 * object satisfying this Zod schema. A single TSX template renders any
 * page from data; the rigid section list (hero / sections / faq /
 * escalation / cta) is what makes the editorial-QA Vitest gate
 * effective — it scans for forbidden phrases against flat strings,
 * never component trees.
 */
import { z } from 'zod';
import { MARKETS } from './constants';
import { COHORT_KEYS } from './cohorts';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SectionSchema = z.object({
  /** Optional H2; if absent the section renders without a heading. */
  heading: z.string().optional(),
  /** Body paragraphs. Each one is scanned for forbidden phrases by R6. */
  paragraphs: z.array(z.string().min(1)).min(1),
  /** Optional bullet list (e.g., "what to test", "what to ask"). */
  bullets: z.array(z.string().min(1)).optional(),
});

const FaqEntrySchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const EscalationSchema = z.object({
  /** Heading for the "when to speak to a clinician" panel. */
  heading: z.string().min(1),
  /** Plain-text paragraphs and explicit threshold/red-flag bullets. */
  paragraphs: z.array(z.string().min(1)).min(1),
  bullets: z.array(z.string().min(1)).optional(),
});

const CtaSchema = z.object({
  /** Primary CTA label, e.g., "Upload your last blood panel". */
  label: z.string().min(1),
  /** Where the CTA points: '/upload' (Phase 1) or `/${market}` (Phase 0). */
  href: z.string().min(1),
  /** Sub-caption, e.g., "8 minutes · free · no signup". */
  caption: z.string().optional(),
});

export const MarketingPageSchema = z.object({
  /** URL-safe slug. Must match SLUG_PATTERN. */
  slug: z.string().regex(SLUG_PATTERN, 'slug must be kebab-case lowercase'),
  market: z.enum(MARKETS),
  cohortKey: z.enum(COHORT_KEYS),

  // SEO + GEO
  seoTitle: z.string().min(1).max(70),
  metaDescription: z.string().min(50).max(170),
  h1: z.string().min(1),
  /** Above-the-fold direct answer (1–3 sentences). */
  aboveFold: z.string().min(20),

  // Body
  sections: z.array(SectionSchema).min(1),

  // Trust + safety modules
  faq: z.array(FaqEntrySchema).optional(),
  escalation: EscalationSchema,

  // Conversion
  cta: CtaSchema,

  // Editorial provenance
  publishedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'must be ISO date'),
  lastReviewedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'must be ISO date'),
  reviewerKey: z.string().min(1),
});

export type MarketingPage = z.infer<typeof MarketingPageSchema>;
export type MarketingSection = z.infer<typeof SectionSchema>;
export type MarketingFaqEntry = z.infer<typeof FaqEntrySchema>;
export type MarketingEscalation = z.infer<typeof EscalationSchema>;
export type MarketingCta = z.infer<typeof CtaSchema>;

/**
 * Build-time helper: validate a page-data file at import. Throws
 * loudly on invalid pages so CI fails before broken pages ship.
 */
export function defineMarketingPage(input: unknown): MarketingPage {
  return MarketingPageSchema.parse(input);
}

/**
 * FAQ fragment for the market homepages. Full marketing pages carry
 * their provenance inside MarketingPageSchema; the landing FAQ is a
 * fragment rather than a page, so it gets its own slim schema with the
 * same editorial-provenance fields. Content lives at
 * content/marketing/home-faq.ts — inside the static-copy compliance
 * scan roots AND validated here at import.
 */
export const HomeFaqSchema = z.object({
  entries: z.array(FaqEntrySchema).min(1),
  publishedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'must be ISO date'),
  lastReviewedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'must be ISO date'),
  reviewerKey: z.string().min(1),
});

export type HomeFaq = z.infer<typeof HomeFaqSchema>;

export function defineHomeFaq(input: unknown): HomeFaq {
  return HomeFaqSchema.parse(input);
}
