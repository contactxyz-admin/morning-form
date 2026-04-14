/**
 * Provider strategy contract.
 *
 * Every health-data provider client (Whoop, Oura, Fitbit, Google Fit, Dexcom, Libre, Terra...)
 * advertises its capabilities and exposes a uniform shape so the sync orchestrator
 * can treat them interchangeably.
 *
 * Methods are intentionally not part of this interface — provider clients keep their
 * existing per-vendor methods (`getRecovery`, `getSleep`, `getSteps`, ...). The
 * normalization happens in `sync.ts` via `pointFromCanonical`.
 */

import type { HealthProvider } from '@/types';

export interface ProviderCapabilities {
  /** Supports REST polling for historical data over a date range. */
  supportsPull: boolean;
  /** Pushes data to us via webhooks (we still own normalization). */
  supportsPush: boolean;
  /** Native SDK on device (Apple HealthKit, Google Fit on-device). */
  supportsSDK: boolean;
  /** User uploads an export file (Apple Health XML). */
  supportsXmlImport: boolean;
  /** Webhook is a notification only — we must pull to get the actual data. */
  webhookNotifyOnly: boolean;
}

export interface HealthProviderStrategy {
  readonly provider: HealthProvider;
  readonly capabilities: ProviderCapabilities;
}
