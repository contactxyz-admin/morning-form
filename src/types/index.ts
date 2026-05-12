// ── Assessment Types ──

export type QuestionType = 'card-select' | 'multi-select' | 'slider' | 'time-picker' | 'free-text';

export interface AssessmentQuestion {
  id: string;
  group: string;
  groupLabel: string;
  groupDescription: string;
  question: string;
  type: QuestionType;
  options?: { label: string; value: string }[];
  sliderLabels?: [string, string];
  sliderMin?: number;
  sliderMax?: number;
  required?: boolean;
  conditional?: { questionId: string; values: string[] };
  placeholder?: string;
}

export interface AssessmentResponses {
  [questionId: string]: string | string[] | number;
}

// ── State Profile Types ──

export interface StateProfile {
  archetype: string;
  primaryPattern: string;
  patternDescription: string;
  observations: Observation[];
  constraints: Constraint[];
  sensitivities: Sensitivity[];
}

export interface Observation {
  label: string;
  detail: string;
}

export interface Constraint {
  label: string;
  type: 'safety' | 'timing' | 'preference';
}

export interface Sensitivity {
  label: string;
  level: 'low' | 'moderate' | 'moderate-high' | 'high';
}

// ── Priority-marker Types ──
// (Pivoted from the previous-gen Protocol output. Markers are
// data-acquisition guidance — what biomarkers to measure for the
// user's archetype — never compounds or supplement names. The
// editorial-QA gate at src/lib/compliance/static-copy.test.ts
// catches drift.)

export interface Priorities {
  id: string;
  version: number;
  status: 'active' | 'paused' | 'completed';
  rationale: string;
  confidence: 'high' | 'moderate' | 'low';
  items: PriorityMarker[];
}

export interface PriorityMarker {
  id: string;
  /** Marker name, e.g. "Ferritin", "Free testosterone", "ApoB". */
  markerName: string;
  /** One-sentence "why this matters for someone like you". */
  rationale: string;
  /** Grouping tag (e.g. "iron", "hormones", "cardio"). */
  category: string;
  /** Where the marker appears in typical private-blood-test panels. */
  panelAvailability: 'uk' | 'us' | 'both' | 'neither';
  sortOrder?: number;
}

export interface PrioritiesAdjustment {
  id: string;
  description: string;
  rationale: string;
  status: 'pending' | 'accepted' | 'deferred' | 'reverted';
  createdAt: string;
}

// ── Check-in Types ──

export type CheckInType = 'morning' | 'evening';

export interface MorningCheckIn {
  sleepQuality: 'poorly' | 'ok' | 'well' | 'great';
  currentFeeling: 'low' | 'flat' | 'steady' | 'sharp';
}

export interface EveningCheckIn {
  focusQuality: 'scattered' | 'variable' | 'good' | 'locked-in';
  afternoonEnergy: 'crashed' | 'dipped' | 'steady' | 'strong';
  protocolAdherence: 'fully' | 'mostly' | 'partially' | 'skipped';
}

// ── Insights Types ──

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  sleepQuality: MetricSummary;
  focusConsistency: MetricSummary;
  protocolAdherence: MetricSummary;
  patternInsight: string | null;
  protocolStatus: 'no-changes' | 'adjustment-recommended';
}

export interface MetricSummary {
  filled: number;
  total: number;
  trend: 'improving' | 'stable' | 'declining';
  label: string;
}

// ── Chat Types ──

export interface ChatMessage {
  id: string;
  role: 'user' | 'guide';
  content: string;
  timestamp: string;
}

// ── Health Integration Types ──

export type HealthProvider = 'apple_health' | 'whoop' | 'oura' | 'fitbit' | 'garmin' | 'google_fit' | 'dexcom' | 'libre';

export interface HealthConnection {
  id: string;
  provider: HealthProvider;
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
  lastSyncAt: string | null;
}

export interface HealthDataPoint {
  id?: string;
  category: HealthCategory;
  metric: string;
  value: number;
  unit: string;
  timestamp: string;
  provider: HealthProvider;
}

export type SuggestionTier = 'gentle' | 'moderate' | 'strong';

export interface Suggestion {
  id: string;
  date: string;
  kind: string;
  title: string;
  tier: SuggestionTier;
  triggeringMetricIds: string[];
}

export type HealthCategory = 'sleep' | 'activity' | 'heart' | 'recovery' | 'body' | 'metabolic';

export interface HealthSummary {
  sleep: {
    duration: number | null;
    quality: number | null;
    deepSleep: number | null;
    remSleep: number | null;
    restingHR: number | null;
  };
  activity: {
    steps: number | null;
    calories: number | null;
    activeMinutes: number | null;
    strain: number | null;
  };
  recovery: {
    hrv: number | null;
    recoveryScore: number | null;
    respiratoryRate: number | null;
  };
  heart: {
    restingHR: number | null;
    maxHR: number | null;
    avgHR: number | null;
  };
  metabolic: {
    glucose: number | null;
  };
}

// ── Navigation ──

export type NavTab = 'home' | 'record' | 'ask' | 'you';

// ── Onboarding ──

export type OnboardingStep = 0 | 1 | 2;

export type AppPhase =
  | 'landing'
  | 'onboarding'
  | 'assessment'
  | 'processing'
  | 'reveal-profile'
  | 'reveal-priorities'
  | 'reveal-rationale'
  | 'reveal-expectations'
  | 'reveal-begin'
  | 'app';
