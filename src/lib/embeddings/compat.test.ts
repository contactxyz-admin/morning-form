import { afterEach, describe, expect, it } from 'vitest';
import {
  getVectorSearchStrategy,
  isHybridRetrievalEnabled,
  isPgvectorAvailable,
  isGroundingGateEnabled,
  getGroundingFloor,
} from './compat';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe('embedding rollout compatibility helpers', () => {
  it('treats Postgres as pgvector-capable unless explicitly disabled', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/morning_form';
    delete process.env.PGVECTOR_ENABLED;
    expect(isPgvectorAvailable()).toBe(true);

    process.env.PGVECTOR_ENABLED = 'false';
    expect(isPgvectorAvailable()).toBe(false);

    process.env.DATABASE_URL = 'file:./dev.db';
    process.env.PGVECTOR_ENABLED = '';
    expect(isPgvectorAvailable()).toBe(false);
  });

  it('defaults vector search to js-cosine and allows the native override', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/morning_form';
    process.env.VECTOR_SEARCH_STRATEGY = '';
    expect(getVectorSearchStrategy()).toBe('js-cosine');

    process.env.VECTOR_SEARCH_STRATEGY = 'native-pgvector';
    expect(getVectorSearchStrategy()).toBe('native-pgvector');
  });

  it('defaults hybrid retrieval on when an embedding provider is configured', () => {
    process.env.HYBRID_RETRIEVAL_ENABLED = '';
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.MOCK_LLM = '';

    expect(isHybridRetrievalEnabled()).toBe(true);
  });

  it('keeps an explicit kill switch above provider availability', () => {
    process.env.HYBRID_RETRIEVAL_ENABLED = 'false';
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';

    expect(isHybridRetrievalEnabled()).toBe(false);
  });

  it('supports explicit enablement for mocked tests without a real provider key', () => {
    process.env.HYBRID_RETRIEVAL_ENABLED = 'true';
    process.env.EMBEDDING_PROVIDER = 'mock';
    process.env.OPENAI_API_KEY = '';
    process.env.MOCK_LLM = '';

    expect(isHybridRetrievalEnabled()).toBe(true);
  });

  it('stays disabled by default when no provider is configured', () => {
    process.env.HYBRID_RETRIEVAL_ENABLED = '';
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = '';
    process.env.MOCK_LLM = '';

    expect(isHybridRetrievalEnabled()).toBe(false);
  });
});

describe('grounded-answer gate config (A4)', () => {
  it('is off by default and honours truthy flag values', () => {
    process.env.GROUNDING_GATE_ENABLED = '';
    expect(isGroundingGateEnabled()).toBe(false);
    for (const v of ['true', '1', 'on', 'TRUE', ' On ']) {
      process.env.GROUNDING_GATE_ENABLED = v;
      expect(isGroundingGateEnabled(), v).toBe(true);
    }
    for (const v of ['false', '0', 'off', 'no', '']) {
      process.env.GROUNDING_GATE_ENABLED = v;
      expect(isGroundingGateEnabled(), v).toBe(false);
    }
  });

  it('parses and clamps the floor, defaulting to 0.5 on garbage', () => {
    process.env.GROUNDING_FLOOR = '0.7';
    expect(getGroundingFloor()).toBeCloseTo(0.7, 5);
    process.env.GROUNDING_FLOOR = '1.5';
    expect(getGroundingFloor()).toBe(1);
    process.env.GROUNDING_FLOOR = '-0.2';
    expect(getGroundingFloor()).toBe(0);
    process.env.GROUNDING_FLOOR = 'not-a-number';
    expect(getGroundingFloor()).toBe(0.5);
    process.env.GROUNDING_FLOOR = '';
    expect(getGroundingFloor()).toBe(0.5);
  });
});
