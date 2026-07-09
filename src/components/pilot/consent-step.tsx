'use client';

/**
 * The procedure e-consent step of the in-gym booking flow: versioned consent
 * copy + explicit checkbox + typed full-name e-signature. Purely
 * presentational — the parent owns the state and performs the atomic
 * consent-with-booking write (the consent is never POSTed on its own, so no
 * orphaned consents and no version drift between consent and booking).
 */
import {
  PROCEDURE_CONSENT_POINTS,
  PROCEDURE_CONSENT_SIGNATURE_PROMPT,
  PROCEDURE_CONSENT_TITLE,
  PROCEDURE_CONSENT_VERSION,
} from '@/lib/pilot/consent';

export interface ConsentStepProps {
  signedName: string;
  onSignedNameChange: (value: string) => void;
  consentAccepted: boolean;
  onConsentAcceptedChange: (value: boolean) => void;
}

export function ConsentStep({
  signedName,
  onSignedNameChange,
  consentAccepted,
  onConsentAcceptedChange,
}: ConsentStepProps) {
  return (
    <div className="border border-border rounded-card p-5 bg-surface">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
        {PROCEDURE_CONSENT_TITLE} · {PROCEDURE_CONSENT_VERSION}
      </p>
      <ul className="mt-3 space-y-2">
        {PROCEDURE_CONSENT_POINTS.map((point, i) => (
          <li key={i} className="text-caption text-text-secondary leading-relaxed">
            {point}
          </li>
        ))}
      </ul>
      <label className="mt-4 flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={consentAccepted}
          onChange={(e) => onConsentAcceptedChange(e.target.checked)}
          className="mt-1"
        />
        <span className="text-caption text-text-primary leading-relaxed">
          I have read and understood the points above, and I consent to the blood draw.
        </span>
      </label>
      <p className="mt-4 text-caption text-text-tertiary leading-relaxed">
        {PROCEDURE_CONSENT_SIGNATURE_PROMPT}
      </p>
      <input
        type="text"
        value={signedName}
        onChange={(e) => onSignedNameChange(e.target.value)}
        placeholder="Full legal name"
        autoComplete="name"
        className="mt-2 w-full border border-border rounded-card px-3 py-2 text-body text-text-primary bg-bg"
      />
    </div>
  );
}
