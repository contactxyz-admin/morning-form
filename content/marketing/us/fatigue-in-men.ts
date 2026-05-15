/**
 * Fatigue in men — US
 *
 * Anchor page targeting "why am I always tired male 35", "fatigue blood
 * test men", "low energy despite sleeping". Path A regulatory posture:
 * descriptive, not prescriptive. No dose strings, no Rx names, no
 * imperative-treatment language.
 */
import { defineMarketingPage } from '@/lib/marketing/page-schema';

export default defineMarketingPage({
  slug: 'fatigue-in-men',
  market: 'us',
  cohortKey: 'fatigue',

  seoTitle: 'Why am I always tired? Blood tests for men — Morning Form',
  metaDescription:
    'High-functioning men, persistent fatigue: the markers (ferritin, vitamin D, thyroid, testosterone) that explain it, and how to read your panel against your wearable data.',
  h1: 'Why am I always tired? A panel-based guide for men 30+',
  aboveFold:
    'If you sleep eight hours and still feel flat, your bloods and your wearable are usually telling you why. Here is the shortlist most clinicians work through, what each marker actually shows, and how to tell whether your data is the cause or the symptom.',

  sections: [
    {
      heading: "What 'tired' usually means in this age group",
      paragraphs: [
        'In your 30s and 40s, fatigue is rarely one thing. It is a stack: iron handling, vitamin D status, thyroid baseline, testosterone trajectory, sleep architecture, and the training-and-stress load you carry through the week. Each of those leaves a signal somewhere — in a blood panel, on your wearable, or in how your body responds to a normal week.',
        'A useful way to read fatigue is to start with the cheapest, most informative markers, then narrow down based on what they show.',
      ],
    },
    {
      heading: 'The blood tests that usually surface a cause',
      paragraphs: [
        'These are the markers a Quest or LabCorp panel typically includes. None are diagnostic on their own — they are signal-finders.',
      ],
      bullets: [
        'Ferritin and CBC — iron stores often run low in men who train hard, donate blood, or eat plant-forward, even when hemoglobin reads normal.',
        'Vitamin D (25-OH) — Northern winters consistently produce low values in men who work indoors. Low vitamin D correlates with low energy and low mood.',
        'TSH and free T4 — your thyroid baseline. A subclinical shift here can leave you flat for months before anyone investigates it.',
        'Total testosterone, free testosterone, SHBG — energy, libido, and recovery all sit downstream of these. Sub-optimal does not mean clinically low; it means worth watching.',
        'HbA1c and fasting glucose — metabolic flexibility. Energy crashes after meals are often the symptom that reads most like fatigue.',
        'hs-CRP — a non-specific inflammation marker. Persistently elevated values are a flag that something else is doing the work.',
      ],
    },
    {
      heading: 'What your wearable can tell you (and what it cannot)',
      paragraphs: [
        'Resting heart rate, HRV, and sleep architecture from a Whoop, Oura, Apple Watch, or similar are the cheapest fatigue diagnostic you have. A trend that looks healthy on a panel but flat on your wearable is a real signal — usually about sleep quality or training load, not bloods.',
        'What wearables cannot do is tell you whether you have low ferritin, low vitamin D, or a thyroid drift. Those need a panel. The two together — bloods plus wearable — is where most of the answer lives.',
      ],
    },
    {
      heading: 'Common patterns we see',
      paragraphs: [
        "The most common one in men 30–45: ferritin in single digits, hemoglobin still in range, training volume up, sleep in the 6.5–7-hour band, vitamin D low. Each marker on its own gets dismissed; the stack explains the symptom.",
        'The second most common: testosterone trending down year over year while training and alcohol stay constant. Often this is sleep — sleep apnea, late screens, alcohol within four hours of bed — rather than the gland itself. The clinical question is whether to investigate cause or address the marker.',
      ],
    },
  ],

  faq: [
    {
      question: 'What blood tests should I order if I am tired all the time?',
      answer:
        'A CBC, ferritin, vitamin D, TSH and free T4, total and free testosterone, SHBG, HbA1c, and hs-CRP cover the highest-yield markers for fatigue in men. Most direct-to-consumer providers (Quest, LabCorp, Function Health, InsideTracker) bundle these into a male-energy or men-over-30 panel.',
    },
    {
      question: 'Could low ferritin cause fatigue if my hemoglobin is normal?',
      answer:
        'Yes. Iron stores can be depleted long before red blood cell production drops. In men who train, donate blood, or eat plant-forward diets, ferritin in single digits with normal hemoglobin is a recognised pattern in the literature. The right next step is a conversation with your clinician about whether to investigate cause and how to track the marker.',
    },
    {
      question: 'How do I tell if my fatigue is hormonal versus stress-driven?',
      answer:
        'Hormonal fatigue tends to track with libido changes, slower recovery from workouts, and a dampened response to training. Stress-driven fatigue tends to track with HRV drops, poor sleep architecture, and morning cortisol that does not normalise. The blood panel and the wearable, read together, separate these patterns more reliably than either alone.',
    },
    {
      question: 'Should I just buy a multivitamin?',
      answer:
        'A general multivitamin without a panel is informed guessing. Some markers (ferritin, vitamin D) are genuinely common low findings; others (B12, folate) are usually fine in men eating a varied diet. Spending the same money on a panel typically tells you which interventions would actually move your numbers, and which would not.',
    },
  ],

  escalation: {
    heading: 'When to speak to a clinician — and when to push for a panel',
    paragraphs: [
      'Fatigue that lasts more than four to six weeks, or fatigue accompanied by any of the signals below, should be a clinician conversation. Bring your wearable trend, your last panel if you have one, and the date your symptoms started. A focused, evidence-led conversation produces better referrals than a vague "I am tired" complaint.',
    ],
    bullets: [
      'Unintended weight loss, night sweats, or persistent fevers',
      'New shortness of breath on stairs you used to handle',
      'Significant changes in mood, sleep, or libido that have lasted more than a month',
      'Any chest pain, palpitations, or dizziness alongside the fatigue',
      'Family history of thyroid, autoimmune, or cardiovascular conditions and your symptoms are new',
    ],
  },

  cta: {
    label: 'Upload your last blood panel',
    href: '/sign-in',
    caption: 'Free · sign in with email',
  },

  publishedAt: '2026-05-09',
  lastReviewedAt: '2026-05-09',
  reviewerKey: 'morning-form-editorial',
});
