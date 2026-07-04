/**
 * Testing page FAQ — market-neutral.
 *
 * Rendered on /uk/testing and /us/testing (src/app/[market]/testing).
 * Lives in content/ so the static-copy compliance gate scans it and the
 * provenance schema validates it at import — same pattern as
 * content/marketing/home-faq.ts (the schema is a generic entries +
 * provenance fragment, not homepage-specific).
 */
import { defineHomeFaq } from '@/lib/marketing/page-schema';

export const TESTING_FAQ = defineHomeFaq({
  entries: [
    {
      question: 'Do I have to test at a gym?',
      answer:
        'No. Draw days at partner clubs are one route. If your club isn’t a partner yet — or you’d rather test privately — the at-home kit collects the core panel where available, with a prepaid return to the same accredited lab.',
    },
    {
      question: 'What happens on a draw day?',
      answer:
        'On set days, a registered phlebotomist runs a private room at a partner club. You book a slot in the app, the draw itself takes a few minutes, and your sample goes to an accredited reference lab. The results land in your record, in plain English.',
    },
    {
      question: 'Do I need to fast before a draw?',
      answer:
        'Some markers read best after an overnight fast, which is why draw-day slots run in the morning. The app tells you before you book whether your panel is one of them.',
    },
    {
      question: 'Which markers are in the baseline panel?',
      answer:
        'One venous draw across eight systems: metabolic and heart, hormones and thyroid, recovery and iron, inflammation and immune, nutrients and vitamins, and liver and kidney function — sixty-plus markers, finalised with our medical director and processed by an accredited reference lab.',
    },
    {
      question: 'Is this a diagnosis?',
      answer:
        'No. Morning Form is descriptive, not diagnostic. It explains where each marker sits and what’s worth watching — and when a result needs a clinician, you get a clear referral, never an upsell.',
    },
    {
      question: 'Can my coach or trainer see my results?',
      answer:
        'Only if you share them. Results are private to your record by default; you can share a read-only link and revoke it whenever you like.',
    },
  ],
  publishedAt: '2026-07-04',
  lastReviewedAt: '2026-07-04',
  reviewerKey: 'morning-form-editorial',
});
