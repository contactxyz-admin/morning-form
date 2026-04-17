'use client';

import { Card } from '@/components/ui/card';
import { useIntakeStore } from '@/lib/intake/store';
import type { EssentialsForm } from '@/lib/intake/types';

const FIELDS: {
  id: keyof EssentialsForm;
  label: string;
  placeholder: string;
  required?: boolean;
}[] = [
  {
    id: 'goals',
    label: 'What are you trying to achieve?',
    placeholder: 'e.g. better sleep, more energy, understand my fatigue',
    required: true,
  },
  {
    id: 'currentMedications',
    label: 'Current medications',
    placeholder: 'One per line. Include dose if you know it. Type "none" if none.',
  },
  {
    id: 'currentDiagnoses',
    label: 'Current diagnoses',
    placeholder: 'One per line. Type "none" if none.',
  },
  {
    id: 'allergies',
    label: 'Allergies',
    placeholder: 'One per line. Type "none" if none.',
  },
];

export function EssentialsTab() {
  const essentials = useIntakeStore((s) => s.essentials);
  const setField = useIntakeStore((s) => s.setEssentialsField);
  const complete = useIntakeStore((s) => s.isEssentialsComplete());

  return (
    <div className="space-y-6 stagger">
      <header>
        <div className="flex items-baseline gap-2.5 mb-4">
          <span className="font-mono text-label uppercase text-text-whisper">03</span>
          <span className="text-label uppercase text-text-whisper">Essentials</span>
        </div>
        <h2 className="font-display text-display-sm sm:text-display font-light text-text-primary mb-4 -tracking-[0.035em]">
          The minimum we need.
        </h2>
        <p className="text-body-lg text-text-secondary max-w-lg">
          For when you can&rsquo;t share documents or write a story. Goals plus at least one of
          meds, diagnoses, or allergies is enough to finish.
        </p>
      </header>

      <Card inset>
        <div className="divide-y divide-border">
          {FIELDS.map((field) => (
            <div key={field.id} className="px-5 sm:px-6 py-5 sm:py-6">
              <div className="flex items-baseline justify-between mb-3 gap-3">
                <label className="block text-label uppercase text-text-tertiary">
                  {field.label}
                </label>
                {field.required && (
                  <span className="text-caption italic text-text-tertiary lowercase tracking-normal">
                    required
                  </span>
                )}
              </div>
              <textarea
                value={essentials[field.id]}
                onChange={(e) => setField(field.id, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                className="w-full bg-transparent text-body-lg text-text-primary placeholder:text-text-whisper focus:outline-none resize-none -tracking-[0.005em] leading-relaxed"
              />
            </div>
          ))}
        </div>
      </Card>

      {!complete && (
        <p className="text-caption text-text-tertiary text-center px-4 pt-2 max-w-sm mx-auto leading-relaxed">
          Add a goal plus at least one of medications, diagnoses, or allergies to finish intake.
        </p>
      )}
    </div>
  );
}
