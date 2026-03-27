import type { AssessmentResponses, StateProfile, Protocol, ProtocolItem } from '@/types';

type Archetype = 'sustained-activator' | 'fragmented-sleeper' | 'sympathetic-dominant' | 'flat-liner' | 'over-stimulated' | 'well-regulated';

interface BaseProtocol {
  items: Omit<ProtocolItem, 'id'>[];
  rationale: string;
}

const BASE_PROTOCOLS: Record<Archetype, BaseProtocol> = {
  'sustained-activator': {
    rationale: 'Your profile suggests sustained sympathetic activation through the afternoon. L-tyrosine and Alpha-GPC support clean focus via dopamine and acetylcholine pathways without the adrenergic load of caffeine. L-theanine at midday creates a buffer, reducing norepinephrine without impairing alertness. Evening magnesium L-threonate and apigenin target GABAergic and melatonergic pathways for natural sleep onset.',
    items: [
      { timeSlot: 'morning', timeLabel: 'Morning — Activation Support', compounds: 'L-Tyrosine + Alpha-GPC', dosage: '500mg + 300mg', timingCue: 'Before breakfast', mechanism: 'Supports dopamine and acetylcholine synthesis for sustained focus without adrenergic stimulation.', evidenceTier: 'strong', sortOrder: 0 },
      { timeSlot: 'afternoon', timeLabel: 'Afternoon — Transition Buffer', compounds: 'L-Theanine', dosage: '200mg', timingCue: 'After lunch', mechanism: 'Promotes alpha wave activity, reducing stress while maintaining alertness. Smooths the cortisol curve.', evidenceTier: 'strong', sortOrder: 1 },
      { timeSlot: 'evening', timeLabel: 'Evening — Downshift Protocol', compounds: 'Magnesium L-Threonate + Apigenin', dosage: '200mg + 50mg', timingCue: '90 minutes before bed', mechanism: 'Supports GABA activity and melatonin onset. Magnesium L-threonate crosses the blood-brain barrier for neural calming.', evidenceTier: 'strong', sortOrder: 2 },
    ],
  },
  'fragmented-sleeper': {
    rationale: 'Your sleep architecture appears disrupted — good energy but fragmented nights. The protocol focuses on consolidating sleep stages through glycine and magnesium glycinate, with morning rhodiola for clean energy without disrupting your sleep recovery.',
    items: [
      { timeSlot: 'morning', timeLabel: 'Morning — Resilience Support', compounds: 'Rhodiola Rosea', dosage: '300mg', timingCue: 'Before breakfast', mechanism: 'Adaptogenic support for stress resilience and mental clarity without stimulation.', evidenceTier: 'moderate', sortOrder: 0 },
      { timeSlot: 'afternoon', timeLabel: 'Afternoon — Regulation', compounds: 'L-Theanine', dosage: '200mg', timingCue: 'After lunch', mechanism: 'Maintains calm alertness and supports transition toward evening recovery.', evidenceTier: 'strong', sortOrder: 1 },
      { timeSlot: 'evening', timeLabel: 'Evening — Sleep Architecture', compounds: 'Glycine + Magnesium Glycinate', dosage: '3g + 400mg', timingCue: '60 minutes before bed', mechanism: 'Glycine lowers core body temperature and enhances sleep quality. Magnesium glycinate supports GABA for sleep consolidation.', evidenceTier: 'strong', sortOrder: 2 },
    ],
  },
  'sympathetic-dominant': {
    rationale: 'Your nervous system shows chronic sympathetic activation — the stress response is tonically elevated. The protocol prioritizes nervous system regulation with ashwagandha, phosphatidylserine for cortisol modulation, and a strong evening GABAergic stack.',
    items: [
      { timeSlot: 'morning', timeLabel: 'Morning — Cortisol Modulation', compounds: 'Ashwagandha KSM-66 + Phosphatidylserine', dosage: '300mg + 100mg', timingCue: 'With breakfast', mechanism: 'Ashwagandha reduces cortisol output. Phosphatidylserine blunts the cortisol response to stress.', evidenceTier: 'strong', sortOrder: 0 },
      { timeSlot: 'afternoon', timeLabel: 'Afternoon — Calm Focus', compounds: 'L-Theanine + Lemon Balm', dosage: '200mg + 300mg', timingCue: 'After lunch', mechanism: 'Dual anxiolytic support without sedation. Lemon balm inhibits GABA transaminase.', evidenceTier: 'moderate', sortOrder: 1 },
      { timeSlot: 'evening', timeLabel: 'Evening — Deep Regulation', compounds: 'Magnesium L-Threonate + Taurine', dosage: '200mg + 1g', timingCue: '90 minutes before bed', mechanism: 'Combined GABAergic and glycinergic support for nervous system downregulation.', evidenceTier: 'strong', sortOrder: 2 },
    ],
  },
  'flat-liner': {
    rationale: 'Your profile suggests low variability across the day — consistent but subdued energy. The protocol aims to restore healthy circadian amplitude with morning activation support and evening contrast.',
    items: [
      { timeSlot: 'morning', timeLabel: 'Morning — Activation', compounds: 'L-Tyrosine + B-Complex', dosage: '500mg + 1 cap', timingCue: 'Before breakfast', mechanism: 'L-tyrosine for dopamine precursor support. B vitamins for cellular energy metabolism.', evidenceTier: 'strong', sortOrder: 0 },
      { timeSlot: 'afternoon', timeLabel: 'Afternoon — Sustain', compounds: 'Alpha-GPC + Lion\'s Mane', dosage: '300mg + 500mg', timingCue: 'After lunch', mechanism: 'Cholinergic support for sustained cognitive output. Lion\'s Mane for NGF stimulation.', evidenceTier: 'moderate', sortOrder: 1 },
      { timeSlot: 'evening', timeLabel: 'Evening — Contrast', compounds: 'Magnesium Glycinate + Glycine', dosage: '400mg + 3g', timingCue: '60 minutes before bed', mechanism: 'Creates clear contrast between daytime activation and nighttime recovery.', evidenceTier: 'strong', sortOrder: 2 },
    ],
  },
  'over-stimulated': {
    rationale: 'High stimulant sensitivity with anxiety patterns suggests your catecholamine system is already running hot. No stimulating compounds — focus on calming, balancing, and protecting sleep.',
    items: [
      { timeSlot: 'morning', timeLabel: 'Morning — Gentle Support', compounds: 'L-Theanine + Phosphatidylserine', dosage: '200mg + 100mg', timingCue: 'With breakfast', mechanism: 'L-theanine for alpha wave promotion without stimulation. Phosphatidylserine for cortisol modulation.', evidenceTier: 'strong', sortOrder: 0 },
      { timeSlot: 'afternoon', timeLabel: 'Afternoon — Regulation', compounds: 'Ashwagandha KSM-66', dosage: '300mg', timingCue: 'After lunch', mechanism: 'Adaptogenic cortisol reduction. Counteracts afternoon anxiety spikes.', evidenceTier: 'strong', sortOrder: 1 },
      { timeSlot: 'evening', timeLabel: 'Evening — Deep Calm', compounds: 'Magnesium L-Threonate + Apigenin + Glycine', dosage: '200mg + 50mg + 3g', timingCue: '90 minutes before bed', mechanism: 'Triple-pathway sleep support: GABAergic, melatonergic, and temperature regulation.', evidenceTier: 'strong', sortOrder: 2 },
    ],
  },
  'well-regulated': {
    rationale: 'Your profile shows generally good regulation with minor optimization opportunities. A light-touch protocol focused on subtle enhancement rather than correction.',
    items: [
      { timeSlot: 'morning', timeLabel: 'Morning — Enhancement', compounds: 'Alpha-GPC', dosage: '300mg', timingCue: 'Before breakfast', mechanism: 'Cholinergic support for cognitive clarity. Subtle enhancement, not correction.', evidenceTier: 'strong', sortOrder: 0 },
      { timeSlot: 'afternoon', timeLabel: 'Afternoon — Maintenance', compounds: 'L-Theanine', dosage: '100mg', timingCue: 'After lunch', mechanism: 'Low-dose alpha wave support. Maintains calm focus through the afternoon.', evidenceTier: 'strong', sortOrder: 1 },
      { timeSlot: 'evening', timeLabel: 'Evening — Sleep Quality', compounds: 'Magnesium Glycinate', dosage: '400mg', timingCue: '60 minutes before bed', mechanism: 'Supports sleep quality and muscle relaxation. Gentle and well-tolerated.', evidenceTier: 'strong', sortOrder: 2 },
    ],
  },
};

export function determineArchetype(responses: AssessmentResponses): Archetype {
  const stim = responses.stimulant_sensitivity as string;
  const stress = responses.stress_level as number;
  const anxiety = responses.anxiety_frequency as string;
  const windDown = responses.wind_down_ability as number;
  const sleepQuality = responses.sleep_quality as number;
  const morningEnergy = responses.morning_energy as number;
  const afternoonEnergy = responses.afternoon_energy as number;
  const nightWaking = responses.night_waking as string;
  const goal = responses.primary_goal as string;

  // Over-stimulated: high sensitivity + frequent anxiety
  if ((stim === 'high' || anxiety === 'daily' || anxiety === 'often') && stress >= 4) {
    return 'over-stimulated';
  }

  // Sympathetic dominant: high stress + poor wind-down
  if (stress >= 4 && windDown <= 2) {
    return 'sympathetic-dominant';
  }

  // Fragmented sleeper: ok energy but disrupted sleep
  if ((nightWaking === '3_plus' || nightWaking === 'variable') && morningEnergy <= 2 && afternoonEnergy >= 3) {
    return 'fragmented-sleeper';
  }

  // Flat liner: low energy, low variability
  if (morningEnergy <= 2 && afternoonEnergy <= 2) {
    return 'flat-liner';
  }

  // Sustained activator: high output, poor downshift (default for focus/sleep goals)
  if ((goal === 'focus' || goal === 'sleep') && afternoonEnergy >= 3 && windDown <= 3) {
    return 'sustained-activator';
  }

  // Well-regulated: decent across the board
  if (sleepQuality >= 4 && stress <= 2 && morningEnergy >= 3) {
    return 'well-regulated';
  }

  return 'sustained-activator'; // Default
}

export function generateStateProfile(responses: AssessmentResponses): StateProfile {
  const archetype = determineArchetype(responses);
  const profiles: Record<Archetype, Omit<StateProfile, 'archetype'>> = {
    'sustained-activator': {
      primaryPattern: 'Sustained activation with impaired downshift',
      patternDescription: 'You maintain high output during the day but struggle to transition into rest. Your system stays "on" longer than it should.',
      observations: [
        { label: 'High afternoon energy but poor sleep onset', detail: 'Energy stays elevated at the cost of sleep.' },
        { label: `Stimulant sensitivity: ${responses.stimulant_sensitivity || 'moderate'}`, detail: 'Caffeine timing is critical.' },
        { label: 'Recovery perception: below baseline', detail: 'Despite sleep, you feel under-recovered.' },
        { label: 'Stress pattern: sustained elevation', detail: 'Sympathetic tone remains high.' },
      ],
      constraints: [
        { label: 'Caffeine cutoff recommended before 1pm', type: 'timing' },
        ...(responses.pregnancy === 'yes' || responses.pregnancy === 'prefer_not' ? [{ label: 'Pregnancy flag — conservative protocol applied', type: 'safety' as const }] : []),
        { label: 'No contraindicated conditions flagged', type: 'safety' },
      ],
      sensitivities: [
        { label: 'Stimulant sensitivity', level: (responses.stimulant_sensitivity === 'high' ? 'high' : 'moderate-high') as 'high' | 'moderate-high' },
      ],
    },
    'fragmented-sleeper': {
      primaryPattern: 'Fragmented sleep architecture',
      patternDescription: 'You have reasonable daytime energy but your sleep is disrupted — frequent waking or difficulty maintaining deep sleep stages.',
      observations: [
        { label: 'Frequent night waking reported', detail: 'Sleep continuity is the primary issue.' },
        { label: 'Morning energy: low despite adequate time in bed', detail: 'Sleep quality, not duration.' },
        { label: 'Afternoon energy maintained', detail: 'Your daytime system compensates well.' },
      ],
      constraints: [{ label: 'Focus on sleep consolidation over stimulation', type: 'preference' }],
      sensitivities: [{ label: 'Sleep architecture sensitivity', level: 'high' }],
    },
    'sympathetic-dominant': {
      primaryPattern: 'Chronic sympathetic activation',
      patternDescription: 'Your stress response is persistently elevated. The nervous system struggles to downregulate, affecting both recovery and cognitive clarity.',
      observations: [
        { label: 'Stress level: persistently elevated', detail: 'Cortisol output appears chronically high.' },
        { label: 'Poor wind-down ability', detail: 'Transition to rest is impaired.' },
        { label: 'Anxiety pattern: frequent', detail: 'Catecholamine system is overactive.' },
      ],
      constraints: [{ label: 'Avoid stimulating compounds', type: 'safety' }],
      sensitivities: [{ label: 'Stress reactivity', level: 'high' }, { label: 'Stimulant sensitivity', level: 'moderate-high' }],
    },
    'flat-liner': {
      primaryPattern: 'Low variability with reduced energy',
      patternDescription: 'Your energy is consistently low across the day. The circadian amplitude appears blunted — not enough contrast between activation and rest.',
      observations: [
        { label: 'Morning and afternoon energy both low', detail: 'No clear peak in the day.' },
        { label: 'Possible burnout pattern', detail: 'Sustained low output suggests depletion.' },
      ],
      constraints: [{ label: 'Build gradually — avoid aggressive protocols', type: 'preference' }],
      sensitivities: [{ label: 'Energy depletion', level: 'moderate' }],
    },
    'over-stimulated': {
      primaryPattern: 'Over-stimulated nervous system',
      patternDescription: 'Your system is running hot — high stimulant sensitivity combined with frequent anxiety. The protocol must calm without sedating.',
      observations: [
        { label: 'Very high stimulant sensitivity', detail: 'Even moderate caffeine causes issues.' },
        { label: 'Frequent anxiety', detail: 'Catecholamine excess pattern.' },
        { label: 'High stress with poor regulation', detail: 'The brake system is underpowered.' },
      ],
      constraints: [{ label: 'No stimulating compounds', type: 'safety' }, { label: 'Prioritize anxiolytic support', type: 'preference' }],
      sensitivities: [{ label: 'Stimulant sensitivity', level: 'high' }, { label: 'Anxiety sensitivity', level: 'high' }],
    },
    'well-regulated': {
      primaryPattern: 'Well-regulated with optimization opportunity',
      patternDescription: 'Your baseline is strong. The protocol provides subtle enhancement rather than correction — maintaining what works and gently improving areas with room.',
      observations: [
        { label: 'Good sleep quality', detail: 'Foundation is solid.' },
        { label: 'Manageable stress', detail: 'Regulation is effective.' },
        { label: 'Adequate energy', detail: 'Minor optimization available.' },
      ],
      constraints: [{ label: 'Light-touch protocol — avoid over-intervention', type: 'preference' }],
      sensitivities: [{ label: 'Generally low sensitivity', level: 'low' }],
    },
  };

  return { archetype, ...profiles[archetype] };
}

export function generateProtocol(responses: AssessmentResponses): Protocol {
  const archetype = determineArchetype(responses);
  const base = BASE_PROTOCOLS[archetype];

  // Apply modifiers
  let items = base.items.map((item, i) => ({ ...item, id: `pi_${i}` }));

  // Pregnancy: behavioral only
  if (responses.pregnancy === 'yes' || responses.pregnancy === 'prefer_not') {
    return {
      id: `proto_${Date.now()}`,
      version: 1,
      status: 'active',
      rationale: 'Given your current situation, we recommend a non-supplement protocol focused on behavioral optimization: sleep scheduling, stress regulation, and light exposure guidance.',
      confidence: 'high',
      items: [
        { id: 'pi_0', timeSlot: 'morning', timeLabel: 'Morning — Light Exposure', compounds: 'Bright light exposure', dosage: '10–15 minutes', timingCue: 'Within 30 minutes of waking', mechanism: 'Morning light anchors circadian rhythm and supports cortisol awakening response.', evidenceTier: 'strong', sortOrder: 0 },
        { id: 'pi_1', timeSlot: 'afternoon', timeLabel: 'Afternoon — Movement', compounds: 'Light movement', dosage: '10-minute walk', timingCue: 'After lunch', mechanism: 'Gentle movement supports afternoon alertness and aids evening sleep onset.', evidenceTier: 'strong', sortOrder: 1 },
        { id: 'pi_2', timeSlot: 'evening', timeLabel: 'Evening — Wind-down', compounds: 'Light dimming + breathwork', dosage: '5-minute practice', timingCue: '60 minutes before bed', mechanism: 'Reduced light exposure and parasympathetic activation via slow breathing.', evidenceTier: 'strong', sortOrder: 2 },
      ],
    };
  }

  // High stimulant sensitivity modifier: reduce morning doses
  if (responses.stimulant_sensitivity === 'high') {
    items = items.map(item => {
      if (item.timeSlot === 'morning' && item.compounds.includes('Tyrosine')) {
        return { ...item, dosage: '250mg + 150mg', mechanism: item.mechanism + ' Dose reduced for high stimulant sensitivity.' };
      }
      return item;
    });
  }

  return {
    id: `proto_${Date.now()}`,
    version: 1,
    status: 'active',
    rationale: base.rationale,
    confidence: 'high',
    items,
  };
}
