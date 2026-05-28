-- docs/migrations/2026-05-28-enable-pgvector.sql
-- PR 1: feat: Add VectorEmbedding model + pgvector extension SQL
-- Ownership: explicitly created + documented in PR 1.
-- Run once per Neon project (UK + US replicas) via SQL Editor or `psql` on pooled connection
-- before or after `pnpm prisma db push`.
--
-- See Data Model Changes in docs/plans/2026-05-28-001-feat-hybrid-retrieval-pgvector-rrf.md
-- and src/lib/embeddings/compat.ts for the isPgvectorAvailable() guard.

CREATE EXTENSION IF NOT EXISTS vector;

-- Optional later (after data volume justifies, in a follow-up PR after backfill):
-- ALTER TABLE "VectorEmbedding" ALTER COLUMN vector TYPE vector(1536) USING vector::vector;
-- CREATE INDEX vector_embedding_hnsw ON "VectorEmbedding" USING hnsw (vector vector_cosine_ops);
