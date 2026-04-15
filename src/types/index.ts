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

// ── Protocol Types ──

export interface Protocol {
  id: string;
  version: number;
  status: 'active' | 'paused' | 'completed';
  rationale: string;
  confidence: 'high' | 'moderate' | 'low';
  items: ProtocolItem[];
}

export interface ProtocolItem {
  id: string;
  timeSlot: 'morning' | 'afternoon' | 'evening';
  timeLabel: string;
  compounds: string;
  dosage: string;
  timingCue: string;
  mechanism: string;
  evidenceTier: 'strong' | 'moderate' | 'emerging';
  sortOrder?: number;
}

export interface ProtocolAdjustment {
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

export type HealthProvider = 'apple_health' | 'whoop' | 'oura' | 'fitbit' | 'garmin' | 'google_fit' | 'dexcom';

export interface HealthConnection {
  id: string;
  provider: HealthProvider;
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
  lastSyncAt: string | null;
}

export interface HealthDataPoint {
  category: HealthCategory;
  metric: string;
  value: number;
  unit: string;
  timestamp: string;
  provider: HealthProvider;
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

export type NavTab = 'home' | 'protocol' | 'check-in' | 'insights' | 'you';

// ── Onboarding ──

export type OnboardingStep = 0 | 1 | 2;

export type AppPhase =
  | 'landing'
  | 'onboarding'
  | 'assessment'
  | 'processing'
  | 'reveal-profile'
  | 'reveal-protocol'
  | 'reveal-rationale'
  | 'reveal-expectations'
  | 'reveal-begin'
  | 'setup'
  | 'app';
