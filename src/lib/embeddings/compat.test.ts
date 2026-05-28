import { afterEach, describe, expect, it } from 'vitest';
import {
  getVectorSearchStrategy,
  isHybridRetrievalEnabled,
  isPgvectorAvailable,
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
