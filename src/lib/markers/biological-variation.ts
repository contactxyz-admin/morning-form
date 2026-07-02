/**
 * Biological-variation + Reference Change Value (RCV) — the analytical/biological
 * noise floor for "did this marker actually change?" (audit item A7).
 *
 * A raw delta between two lab draws blends three things: a real change, the
 * assay's analytical imprecision (CVA), and the person's own day-to-day
 * biological variation (CVI). The Reference Change Value is the threshold a
 * delta must clear to be distinguishable from the latter two.
 *
 * We use the LOG-NORMAL RCV (Fokkema 2006; EFLM), which is the appropriate form
 * for the right-skewed distributions most blood analytes follow and, unlike the
 * naive symmetric percentage, gives DIFFERENT up- and down-limits:
 *
 *     σ_ln     = √2 · √( ln(1+CVA²) + ln(1+CVI²) )     (CVs as fractions)
 *     RCV_up   = (e^{ Z·σ_ln} − 1)                     (rise limit, fraction)
 *     RCV_down = (1 − e^{−Z·σ_ln})                     (fall limit, fraction)
 *
 * with Z = 1.96 for a two-sided 95% probability. For low-CV analytes the two
 * limits are nearly equal (≈ the classic symmetric form); for high-CV skewed
 * ones (ferritin, TSH, triglycerides) they diverge substantially, so a real
 * fall isn't wrongly dismissed as noise. A change smaller than the
 * direction-appropriate limit is statistically indistinguishable from noise —
 * so we should not tell a user their marker "improved" or "worsened" on it.
 *
 * Data source: within-subject biological variation (CVI) figures are the
 * long-established desirable-specification values from the EFLM Biological
 * Variation Database (Ricós et al., "Current databases on biological
 * variation"). Analytical CV (CVA) is modelled as the *desirable analytical
 * performance* spec, CVA = 0.5 · CVI (Fraser), rather than any single lab's
 * assay — a standard, conservative convention. A lab-specific CVA can replace
 * the modelled one per marker when we have it.
 *
 * Pure and dependency-free (no Prisma) so it can be bundled anywhere the change
 * classifier is (incl. the client demo path).
 */

export interface BiologicalVariation {
  /** Within-subject biological variation, % (EFLM/Ricós desirable spec). */
  readonly cviPct: number;
  /** Analytical CV, % — modelled here as the desirable spec 0.5·CVI. */
  readonly cvaPct: number;
}

/**
 * A marker's reference change value, as separate rise/fall limits (percent of
 * the prior value). `upPct` is always ≥ `downPct` for the log-normal form.
 */
export interface ReferenceChangeValue {
  /** A rise must exceed this % of the prior value to be a real change. */
  readonly upPct: number;
  /** A fall's magnitude must exceed this % of the prior value to be real. */
  readonly downPct: number;
}

/** Z for a two-sided 95% reference change value. */
export const RCV_Z_BIDIRECTIONAL_95 = 1.96;

/**
 * Within-subject biological variation by biomarker `canonicalKey`
 * (see `src/lib/intake/biomarkers.ts`). CVI from the EFLM Biological Variation
 * Database (Ricós et al.); CVA = desirable spec (0.5·CVI). Keys are lowercase
 * to match the panel-diff join key.
 */
export const BIOLOGICAL_VARIATION: Readonly<Record<string, BiologicalVariation>> = {
  total_cholesterol: { cviPct: 6.0, cvaPct: 3.0 },
  ldl_cholesterol: { cviPct: 8.3, cvaPct: 4.2 },
  hdl_cholesterol: { cviPct: 7.4, cvaPct: 3.7 },
  triglycerides: { cviPct: 20.9, cvaPct: 10.5 },
  hba1c: { cviPct: 1.9, cvaPct: 1.0 },
  glucose_fasting: { cviPct: 5.7, cvaPct: 2.9 },
  creatinine: { cviPct: 6.0, cvaPct: 3.0 },
  urea: { cviPct: 12.3, cvaPct: 6.2 },
  alt: { cviPct: 18.0, cvaPct: 9.0 },
  ast: { cviPct: 12.0, cvaPct: 6.0 },
  ggt: { cviPct: 14.0, cvaPct: 7.0 },
  albumin: { cviPct: 3.1, cvaPct: 1.6 },
  ferritin: { cviPct: 14.2, cvaPct: 7.1 },
  tsh: { cviPct: 19.3, cvaPct: 9.7 },
  free_t4: { cviPct: 5.7, cvaPct: 2.9 },
  testosterone_total: { cviPct: 9.3, cvaPct: 4.7 },
};

/**
 * Log-normal reference change value (rise/fall limits as % of the prior value).
 */
export function referenceChangeValue(
  cvaPct: number,
  cviPct: number,
  z: number = RCV_Z_BIDIRECTIONAL_95,
): ReferenceChangeValue {
  const cva = cvaPct / 100;
  const cvi = cviPct / 100;
  const sigmaLn = Math.SQRT2 * Math.sqrt(Math.log(1 + cva * cva) + Math.log(1 + cvi * cvi));
  return {
    upPct: (Math.exp(z * sigmaLn) - 1) * 100,
    downPct: (1 - Math.exp(-z * sigmaLn)) * 100,
  };
}

/**
 * RCV for a biomarker join key, or null when we have no biological-variation
 * data for it (caller then falls back to plain range-relative classification).
 */
export function getReferenceChangeValue(
  markerKey: string,
  z: number = RCV_Z_BIDIRECTIONAL_95,
): ReferenceChangeValue | null {
  const bv = BIOLOGICAL_VARIATION[markerKey.toLowerCase()];
  if (!bv) return null;
  return referenceChangeValue(bv.cvaPct, bv.cviPct, z);
}

/**
 * Whether the change from `before` to `after` exceeds the direction-appropriate
 * reference change value — i.e. is distinguishable from analytical + biological
 * noise. When `before` is 0 or non-finite the percentage is undefined, so we
 * return `true` (can't assess ⇒ don't suppress a real move). A flat move
 * (after == before) never exceeds.
 */
export function exceedsReferenceChangeValue(
  before: number,
  after: number,
  rcv: ReferenceChangeValue,
): boolean {
  if (!Number.isFinite(before) || before === 0) return true;
  const changePct = ((after - before) / before) * 100;
  if (changePct > 0) return changePct > rcv.upPct;
  if (changePct < 0) return -changePct > rcv.downPct;
  return false;
}
