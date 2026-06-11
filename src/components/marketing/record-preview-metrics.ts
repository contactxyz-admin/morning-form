/**
 * The four fixture series shown on the landing hero's RecordPreview.
 *
 * Chosen because their first→last values read cleanly in the direction
 * of improvement (others, like HbA1c, improve against the pre-inflection
 * peak but look flat start-to-now, which would confuse a five-second
 * scan). Source labels are editorial names for the fixture's provider
 * attribution ('cuff' → Daily readings, 'lab' → Blood panel).
 *
 * Lives in a .ts module (not the .tsx component) so record-preview.test.ts
 * can pin every key against the fixture without a JSX transform.
 */
export const PREVIEW_METRICS: ReadonlyArray<{ metric: string; source: string }> = [
  { metric: 'systolic_bp_mmhg_morning', source: 'Daily readings' },
  { metric: 'hrv_ms', source: 'Wearable' },
  { metric: 'total_sleep_hours', source: 'Wearable' },
  { metric: 'hscrp_mg_l', source: 'Blood panel' },
];
