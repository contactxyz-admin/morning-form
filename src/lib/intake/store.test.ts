import { beforeEach, describe, expect, it } from 'vitest';
import { useIntakeStore } from './store';

function makeFile(name: string, content = 'hello'): File {
  return new File([content], name, { type: 'application/pdf' });
}

beforeEach(() => {
  useIntakeStore.getState().reset();
});

describe('intake store — documents', () => {
  it('adds files and dedupes by (name + lastModified + size)', () => {
    const f1 = makeFile('labs.pdf');
    useIntakeStore.getState().addDocuments([f1]);
    expect(useIntakeStore.getState().documents).toHaveLength(1);

    // Adding the same file again should be a no-op.
    useIntakeStore.getState().addDocuments([f1]);
    expect(useIntakeStore.getState().documents).toHaveLength(1);
  });

  it('removes a staged document by id', () => {
    const f = makeFile('gp.pdf');
    useIntakeStore.getState().addDocuments([f]);
    const id = useIntakeStore.getState().documents[0].id;
    useIntakeStore.getState().removeDocument(id);
    expect(useIntakeStore.getState().documents).toHaveLength(0);
  });
});

describe('intake store — history + essentials', () => {
  it('persists history text across sets', () => {
    useIntakeStore.getState().setHistoryText('some symptoms');
    expect(useIntakeStore.getState().historyText).toBe('some symptoms');
  });

  it('updates essentials field-by-field without clobbering siblings', () => {
    useIntakeStore.getState().setEssentialsField('goals', 'sleep better');
    useIntakeStore.getState().setEssentialsField('allergies', 'penicillin');
    const e = useIntakeStore.getState().essentials;
    expect(e.goals).toBe('sleep better');
    expect(e.allergies).toBe('penicillin');
    expect(e.currentMedications).toBe('');
  });
});

describe('intake store — completion guards', () => {
  it('isEssentialsComplete: requires goals AND ≥1 of meds/diagnoses/allergies', () => {
    const s = useIntakeStore.getState();
    expect(s.isEssentialsComplete()).toBe(false);

    s.setEssentialsField('goals', 'feel better');
    expect(useIntakeStore.getState().isEssentialsComplete()).toBe(false); // goals alone insufficient

    s.setEssentialsField('allergies', 'none');
    expect(useIntakeStore.getState().isEssentialsComplete()).toBe(true);
  });

  it('isEssentialsComplete: trims whitespace before counting', () => {
    const s = useIntakeStore.getState();
    s.setEssentialsField('goals', '   ');
    s.setEssentialsField('allergies', 'none');
    expect(useIntakeStore.getState().isEssentialsComplete()).toBe(false);
  });

  it('hasAnyInput: true when any tab has content, false when fully empty', () => {
    expect(useIntakeStore.getState().hasAnyInput()).toBe(false);

    useIntakeStore.getState().setHistoryText('  ');
    expect(useIntakeStore.getState().hasAnyInput()).toBe(false); // whitespace-only doesn't count

    useIntakeStore.getState().setHistoryText('something');
    expect(useIntakeStore.getState().hasAnyInput()).toBe(true);
  });

  it('hasAnyInput: a single staged document counts', () => {
    expect(useIntakeStore.getState().hasAnyInput()).toBe(false);
    useIntakeStore.getState().addDocuments([makeFile('x.pdf')]);
    expect(useIntakeStore.getState().hasAnyInput()).toBe(true);
  });
});

describe('intake store — partial state survives tab switches', () => {
  it('mutating one tab does not reset another', () => {
    useIntakeStore.getState().setHistoryText('story');
    useIntakeStore.getState().setEssentialsField('goals', 'goal');
    useIntakeStore.getState().addDocuments([makeFile('a.pdf')]);

    // Simulate switching tabs (no-op for the store) — state should persist.
    expect(useIntakeStore.getState().historyText).toBe('story');
    expect(useIntakeStore.getState().essentials.goals).toBe('goal');
    expect(useIntakeStore.getState().documents).toHaveLength(1);
  });
});

describe('intake store — reset', () => {
  it('returns the store to initial state', () => {
    useIntakeStore.getState().setHistoryText('x');
    useIntakeStore.getState().setEssentialsField('goals', 'y');
    useIntakeStore.getState().addDocuments([makeFile('z.pdf')]);
    useIntakeStore.getState().reset();

    const s = useIntakeStore.getState();
    expect(s.documents).toEqual([]);
    expect(s.historyText).toBe('');
    expect(s.essentials.goals).toBe('');
  });
});
