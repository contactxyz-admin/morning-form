import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { guideResponses } from '@/lib/mock-data';

const responsePatterns: [RegExp, string][] = [
  [/why.*(this|my) protocol/i, guideResponses['why this protocol']],
  [/adjust.*(timing|time|schedule)/i, guideResponses['can i adjust timing']],
  [/what.*(expect|happen|timeline)/i, guideResponses['what should i expect']],
  [/l.?tyrosine/i, 'L-tyrosine is an amino acid precursor to dopamine. In your protocol, it supports sustained focus in the morning without the adrenergic stimulation of caffeine.\n\nIt works best on an empty stomach, which is why we recommend it before breakfast.'],
  [/alpha.?gpc/i, 'Alpha-GPC is a choline compound that supports acetylcholine synthesis — the neurotransmitter most associated with attention and working memory. It pairs well with L-tyrosine to provide dual-pathway cognitive support.\n\nSome people notice sharper recall and quicker thinking. The effect is subtle, not dramatic.'],
  [/theanine/i, 'L-theanine is an amino acid found naturally in tea. It promotes alpha brain wave activity — the state associated with calm alertness.\n\nIn your protocol, it serves as a transition buffer between your morning activation and evening downshift.'],
  [/magnesium/i, 'Magnesium L-threonate is the form that crosses the blood-brain barrier most effectively. It enhances synaptic plasticity and promotes neural calming via GABA pathways.\n\nWe chose this form specifically because your profile indicates difficulty with the activation-to-rest transition. Standard magnesium (citrate, glycinate) works peripherally but doesn\'t reach the brain as effectively.'],
  [/apigenin/i, 'Apigenin is a flavonoid found in chamomile. It acts as a mild anxiolytic by binding to benzodiazepine receptors — but without the dependence risk of pharmaceutical benzodiazepines.\n\nIt supports natural sleepiness and pairs well with magnesium L-threonate for your evening downshift.'],
  [/headache|side effect|nausea/i, 'Side effects with this protocol are uncommon but can include:\n\n· Mild headache from L-tyrosine (usually resolves in 2-3 days, ensure adequate hydration)\n· Digestive mild upset from magnesium (take with a small amount of food if needed)\n· Vivid dreams from magnesium L-threonate (normal, usually subsides)\n\nIf any effect persists beyond 3-4 days, we should adjust. Would you like to modify something?'],
  [/stop|quit|cancel/i, 'You can pause or stop your protocol at any time. There are no withdrawal effects from these compounds — they support natural processes rather than creating dependence.\n\nIf you\'d like to pause, I\'d recommend tapering the morning protocol over 2-3 days rather than stopping abruptly, just for comfort.\n\nWould you like to pause, or is there a specific concern I can address?'],
  [/doctor|medical|prescription|ssri|medication/i, 'I can\'t advise on prescription medications — that\'s a conversation for your prescribing doctor. What I can do is ensure your Morning Form protocol doesn\'t include anything that interacts with your medications.\n\nIf you\'d like, I can review your current protocol for any interaction flags. You can also share a printable summary of your protocol with your doctor.'],
];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let response = guideResponses['default'];
    for (const [pattern, reply] of responsePatterns) {
      if (pattern.test(message)) {
        response = reply;
        break;
      }
    }

    return NextResponse.json({ response });
  } catch (error) {
    console.error('[API] Guide error:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
