import { describe, expect, it } from 'vitest';
import {
  DRAFT_KEY,
  DRAFT_MAX_AGE_MS,
  DRAFT_VERSION,
  clearDraft,
  loadDraft,
  saveDraft,
  type AssessmentDraft,
} from './assessment-draft';

/**
 * In-memory storage stand-in. Lets us drive every branch without needing
 * a real DOM or jsdom — the module is intentionally storage-agnostic.
 */
function makeStorage(initial: Record<string, string> = {}): {
  storage: {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem(k: string): void;
  };
  dump: () => Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    storage: {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => {
        data[k] = v;
      },
      removeItem: (k) => {
        delete data[k];
      },
    },
    dump: () => ({ ...data }),
  };
}

describe('assessment-draft — loadDraft', () => {
  it('returns null when no draft is stored', () => {
    const { storage } = makeStorage();
    expect(loadDraft(storage)).toBeNull();
  });

  it('returns the draft when version matches and within TTL', () => {
    const now = 1_700_000_000_000;
    const draft: AssessmentDraft = {
      version: DRAFT_VERSION,
      responses: { q1: 'a', q2: ['b', 'c'] },
      currentIndex: 7,
      savedAt: now - 1000,
    };
    const { storage } = makeStorage({ [DRAFT_KEY]: JSON.stringify(draft) });

    const result = loadDraft(storage, now, 100);
    expect(result).toEqual(draft);
  });

  it('drops drafts with a stale version (schema-change defence)', () => {
    const stale = {
      version: 'v0',
      responses: { q1: 'a' },
      currentIndex: 3,
      savedAt: Date.now(),
    };
    const { storage } = makeStorage({ [DRAFT_KEY]: JSON.stringify(stale) });
    expect(loadDraft(storage)).toBeNull();
  });

  it('drops drafts older than DRAFT_MAX_AGE_MS', () => {
    const now = 1_700_000_000_000;
    const draft: AssessmentDraft = {
      version: DRAFT_VERSION,
      responses: { q1: 'a' },
      currentIndex: 1,
      savedAt: now - DRAFT_MAX_AGE_MS - 1,
    };
    const { storage } = makeStorage({ [DRAFT_KEY]: JSON.stringify(draft) });
    expect(loadDraft(storage, now, 100)).toBeNull();
  });

  it('drops drafts with currentIndex past the end of the question list', () => {
    // Critical: a schema shrink (removed question) would leave a stored
    // currentIndex that crashes the renderer on rehydrate. Guard before
    // returning.
    const draft: AssessmentDraft = {
      version: DRAFT_VERSION,
      responses: { q1: 'a' },
      currentIndex: 99,
      savedAt: Date.now(),
    };
    const { storage } = makeStorage({ [DRAFT_KEY]: JSON.stringify(draft) });
    expect(loadDraft(storage, Date.now(), 10)).toBeNull();
  });

  it('drops drafts with negative currentIndex', () => {
    const draft: AssessmentDraft = {
      version: DRAFT_VERSION,
      responses: {},
      currentIndex: -1,
      savedAt: Date.now(),
    };
    const { storage } = makeStorage({ [DRAFT_KEY]: JSON.stringify(draft) });
    expect(loadDraft(storage, Date.now(), 10)).toBeNull();
  });

  it('drops drafts that fail to parse as JSON', () => {
    const { storage } = makeStorage({ [DRAFT_KEY]: 'not-json {' });
    expect(loadDraft(storage)).toBeNull();
  });

  it('drops drafts whose responses field is missing or wrong type', () => {
    const broken = {
      version: DRAFT_VERSION,
      responses: 'oops',
      currentIndex: 1,
      savedAt: Date.now(),
    };
    const { storage } = makeStorage({ [DRAFT_KEY]: JSON.stringify(broken) });
    expect(loadDraft(storage, Date.now(), 10)).toBeNull();
  });

  it('returns null when storage is null (SSR / unavailable)', () => {
    expect(loadDraft(null)).toBeNull();
  });
});

describe('assessment-draft — saveDraft', () => {
  it('writes a versioned draft with savedAt timestamp', () => {
    const { storage, dump } = makeStorage();
    saveDraft({ q1: 'hello' }, 5, storage, 12345);

    const stored = dump()[DRAFT_KEY];
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored) as AssessmentDraft;
    expect(parsed.version).toBe(DRAFT_VERSION);
    expect(parsed.responses).toEqual({ q1: 'hello' });
    expect(parsed.currentIndex).toBe(5);
    expect(parsed.savedAt).toBe(12345);
  });

  it('round-trips via loadDraft', () => {
    const { storage } = makeStorage();
    saveDraft({ q1: 'a', q2: ['b'] }, 3, storage, 100);
    const loaded = loadDraft(storage, 200, 50);
    expect(loaded?.responses).toEqual({ q1: 'a', q2: ['b'] });
    expect(loaded?.currentIndex).toBe(3);
  });

  it('does not throw when storage is null', () => {
    expect(() => saveDraft({}, 0, null)).not.toThrow();
  });
});

describe('assessment-draft — clearDraft', () => {
  it('removes the draft entry', () => {
    const { storage, dump } = makeStorage({ [DRAFT_KEY]: '{}' });
    clearDraft(storage);
    expect(dump()[DRAFT_KEY]).toBeUndefined();
  });

  it('is a no-op when no draft exists', () => {
    const { storage, dump } = makeStorage();
    clearDraft(storage);
    expect(dump()).toEqual({});
  });

  it('does not throw when storage is null', () => {
    expect(() => clearDraft(null)).not.toThrow();
  });
});
