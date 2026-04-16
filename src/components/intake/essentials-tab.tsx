'use client';

import { Card } from '@/components/ui/card';
import { useIntakeStore } from '@/lib/intake/store';
import type { EssentialsForm } from '@/lib/intake/types';

const FIELDS: { id: keyof EssentialsForm; label: string; placeholder: string; required?: boolean }[] = [
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
    <div className="space-y-4">
      <Card>
        <h2 className="text-heading font-semibold mb-1">The essentials</h2>
        <p className="text-body text-text-secondary mb-4">
          The minimum we need if you can&rsquo;t share documents or write a story. Goals plus at
          least one of meds, diagnoses, or allergies is enough to finish.
        </p>
      </Card>

      {FIELDS.map((field) => (
        <Card key={field.id}>
          <label className="block text-label uppercase tracking-widest text-text-tertiary mb-2">
            {field.label}
            {field.required && <span className="ml-1 text-alert">*</span>}
          </label>
          <textarea
            value={essentials[field.id]}
            onChange={(e) => setField(field.id, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className="w-full px-4 py-3 rounded-input border border-border bg-surface text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
          />
        </Card>
      ))}

      {!complete && (
        <p className="text-caption text-text-tertiary text-center px-4">
          Add a goal plus at least one of medications, diagnoses, or allergies to finish intake.
        </p>
      )}
    </div>
  );
}
