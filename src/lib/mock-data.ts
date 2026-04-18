import type { StateProfile, Protocol, ProtocolItem, HealthSummary } from '@/types';

export const mockStateProfile: StateProfile = {
  archetype: 'sustained-activator',
  primaryPattern: 'Sustained activation with impaired downshift',
  patternDescription:
    'You maintain high output during the day but struggle to transition into rest. Your system stays "on" longer than it should. This pattern is common in high-performers with demanding cognitive workloads and inconsistent recovery practices.',
  observations: [
    { label: 'High afternoon energy but poor sleep onset', detail: 'Your energy stays elevated through the day but this comes at the cost of sleep quality.' },
    { label: 'Stimulant sensitivity: moderate-high', detail: 'Caffeine after early afternoon likely disrupts your sleep architecture.' },
    { label: 'Recovery perception: below baseline', detail: 'Despite adequate sleep duration, you report feeling under-recovered.' },
    { label: 'Stress pattern: constant low-level elevation', detail: 'Your sympathetic nervous system appears tonically activated rather than cycling normally.' },
  ],
  constraints: [
    { label: 'Caffeine cutoff recommended before 1pm', type: 'timing' },
    { label: 'No contraindicated conditions flagged', type: 'safety' },
  ],
  sensitivities: [
    { label: 'Stimulant sensitivity', level: 'moderate-high' },
    { label: 'Stress reactivity', level: 'moderate' },
  ],
};

export const mockProtocolItems: ProtocolItem[] = [
  {
    id: 'pi_morning',
    timeSlot: 'morning',
    timeLabel: 'Morning — Activation Support',
    compounds: 'L-Tyrosine + Alpha-GPC',
    dosage: '500mg + 300mg',
    timingCue: 'Before breakfast',
    mechanism: 'Supports dopamine and acetylcholine synthesis for sustained focus without adrenergic stimulation. L-tyrosine provides the precursor for dopamine production, while Alpha-GPC enhances cholinergic signaling for attention and working memory.',
    evidenceTier: 'strong',
  },
  {
    id: 'pi_afternoon',
    timeSlot: 'afternoon',
    timeLabel: 'Afternoon — Transition Buffer',
    compounds: 'L-Theanine',
    dosage: '200mg',
    timingCue: 'After lunch',
    mechanism: 'Smooths the cortisol curve without sedation. L-theanine promotes alpha brain wave activity, reducing anxiety and mental stress while maintaining alertness. It buffers the transition from peak activation toward evening downshift.',
    evidenceTier: 'strong',
  },
  {
    id: 'pi_evening',
    timeSlot: 'evening',
    timeLabel: 'Evening — Downshift Protocol',
    compounds: 'Magnesium L-Threonate + Apigenin',
    dosage: '200mg + 50mg',
    timingCue: '90 minutes before bed',
    mechanism: 'Supports GABA activity and melatonin onset. Magnesium L-threonate crosses the blood-brain barrier to enhance synaptic plasticity and calm neural excitability. Apigenin binds to benzodiazepine receptors to promote natural sleepiness without dependence.',
    evidenceTier: 'strong',
  },
];

export const mockProtocol: Protocol = {
  id: 'proto_1',
  version: 1,
  status: 'active',
  rationale:
    'Your profile suggests sustained sympathetic activation through the afternoon. L-tyrosine and Alpha-GPC in the morning support clean focus via dopamine and acetylcholine pathways — without the adrenergic load of caffeine. L-theanine at midday creates a buffer, reducing norepinephrine without impairing alertness, making your evening downshift protocol more effective. Magnesium L-threonate and apigenin in the evening target GABAergic and melatonergic pathways to support your natural sleep onset.',
  confidence: 'high',
  items: mockProtocolItems,
};

export const mockHealthSummary: HealthSummary = {
  sleep: { duration: 7.2, quality: 82, deepSleep: 1.4, remSleep: 1.8, restingHR: 52 },
  activity: { steps: 8430, calories: 2180, activeMinutes: 45, strain: 12.4 },
  recovery: { hrv: 68, recoveryScore: 74, respiratoryRate: 14.8 },
  heart: { restingHR: 52, maxHR: 168, avgHR: 72 },
  metabolic: { glucose: 98 },
};

export const guideResponses: Record<string, string> = {
  'why this protocol': `Your profile shows sustained activation with impaired downshift — you stay "on" too long. The morning protocol (L-tyrosine + Alpha-GPC) supports focus through dopamine and acetylcholine pathways without the adrenergic load of caffeine, which your stimulant sensitivity would make counterproductive by afternoon.\n\nThe midday L-theanine acts as a transition buffer — it promotes alpha wave activity that smooths the shift from high output to recovery mode. The evening combination of magnesium L-threonate and apigenin targets the specific mechanisms your pattern needs: GABAergic calming and melatonin onset support.\n\nEach compound was chosen to address a specific observation in your profile. This isn't a generic stack — it's sequenced for your state pattern.`,

  'can i adjust timing': `Yes, timing is adjustable within safe windows. Your protocol currently has three anchor points:\n\n· Morning dose: before breakfast (ideally 30 min before)\n· Afternoon dose: after lunch (between 12–2pm)\n· Evening dose: 90 min before bed\n\nThe morning and afternoon windows are flexible by about an hour in either direction. The evening timing is more important — the 90-minute window is calibrated to your melatonin onset.\n\nWould you like me to shift any of these?`,

  'what should i expect': `Realistic expectations by timeline:\n\nWeek 1–2: Adjustment period. You may notice subtle shifts in sleep onset and morning clarity. Some people feel the morning protocol on day 2–3; for others, it's more gradual. Don't over-index on daily variation.\n\nWeek 3–4: Patterns should stabilize. Focus duration and sleep quality are the first reliable signals. Your check-ins will start showing consistent trends.\n\nWeek 5+: This is where the feedback loop matters most. Your data shapes protocol refinement. The system gets smarter about your patterns.\n\nImportant: this isn't a stimulant. You won't feel a "hit." The goal is consistent state optimization, not acute effects.`,

  'default': `I can help with questions about your protocol, timing adjustments, compound explanations, and side effects. Try asking about a specific part of your protocol, or choose from the suggestions above.`,
};
