import { defineHomeFaq } from '@/lib/marketing/page-schema';

/**
 * Market-homepage FAQ — the objections a data product must answer
 * before the ask. Market-neutral copy (no currency, no clinician word),
 * shared by /uk and /us.
 *
 * Lives in content/ so it sits inside the static-copy compliance scan
 * and the editorial tree; validated against HomeFaqSchema at import, so
 * a malformed entry fails the build, not the page.
 */
export const HOME_FAQ = defineHomeFaq({
  publishedAt: '2026-06-11',
  lastReviewedAt: '2026-06-11',
  reviewerKey: 'morning-form-editorial',
  entries: [
    {
      question: 'Is this medical advice?',
      answer:
        'No. Morning Form reads and explains your own data, and points you to a clinician when a marker needs one. It never diagnoses, and it never replaces your clinician — it gives you a better record to bring them.',
    },
    {
      question: 'Which devices and apps work?',
      answer:
        'Whoop, Oura, Fitbit, Dexcom and FreeStyle Libre connect from the web; Apple Health connects through the iPhone app. Any blood panel can be uploaded as a PDF, whoever ran it.',
    },
    {
      question: 'I don’t have a wearable — can I still use it?',
      answer:
        'Yes. Upload a blood panel, or begin with the assessment and daily check-ins. The record builds from whatever you give it, and gets sharper with each source you add.',
    },
    {
      question: 'Is my data private?',
      answer:
        'Your record is yours. It is never sold and never used for advertising, and you can export the whole thing — or delete it — from settings at any time.',
    },
    {
      question: 'What happens if something looks wrong?',
      answer:
        'When a marker crosses a threshold that needs a real clinician, Morning Form flags it clearly, explains it in plain English, and recommends you speak to one. Flags are never buried, and never sold around.',
    },
    {
      question: 'What does it cost?',
      answer:
        'Nothing while we are in private beta — no card required. Membership pricing will be announced at launch, and beta members will hear it first.',
    },
  ],
});
