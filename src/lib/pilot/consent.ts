/**
 * Procedure consent for the in-gym blood-draw pilot.
 *
 * This is CONSENT TO A PROCEDURE (venipuncture by the partner phlebotomist),
 * legally distinct from the existing LLM data-processing consent
 * (User.llmConsentAcceptedAt / src/lib/llm/consent.ts). Each capture writes a
 * ConsentRecord row pinned to the documentVersion below; changing the copy in
 * any material way REQUIRES bumping the version so every stored signature
 * stays tied to exactly the text the member saw.
 *
 * PENDING CLINICAL REVIEW: this copy ships dark behind IN_GYM_BOOKING_ENABLED
 * and must be signed off by the named clinician before the flag flips
 * (program handoff item). Register: descriptive, calm, no diagnosis language.
 */

export const PROCEDURE_CONSENT_TYPE = 'procedure_blood_draw';

export const PROCEDURE_CONSENT_VERSION = 'blood_draw_v1';

export const PROCEDURE_CONSENT_TITLE = 'Consent to a blood draw';

/**
 * The member-visible consent statements. Rendered as a list above the
 * e-signature block; stored implicitly via documentVersion (the text itself
 * is versioned in git, not duplicated per row).
 */
export const PROCEDURE_CONSENT_POINTS: readonly string[] = [
  'I consent to a blood sample being taken from me by venipuncture (a needle draw from a vein in the arm), performed by a trained phlebotomist from Morning Form’s partner provider.',
  'I understand the common, usually minor effects: brief discomfort, a small bruise at the draw site, and occasionally feeling lightheaded or faint for a short time afterwards.',
  'I understand that I can change my mind and withdraw at any point before the draw takes place, without giving a reason — cancelling my booking withdraws this consent.',
  'I confirm the sample may be sent to an accredited laboratory for the agreed panel of tests, and that results will appear in my Morning Form record.',
  'I understand this consent covers the draw procedure itself. How my data is processed is covered separately by the data-processing consent I have already given (or will be asked for) in the app.',
];

export const PROCEDURE_CONSENT_SIGNATURE_PROMPT =
  'Type your full legal name below as your signature. Your typed name, the date, and the version of this consent text are recorded with your booking.';
