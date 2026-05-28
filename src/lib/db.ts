import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// PR 1 (vector embeddings foundation, zero behavior change):
// - VectorEmbedding model (Float[] for day-1 Prisma compat) + relation on SourceChunk added in prisma/schema.prisma.
// - One-time pgvector extension: docs/migrations/2026-05-28-enable-pgvector.sql (run via Neon SQL/psql once per project).
// - Guard + fallback helper: src/lib/embeddings/compat.ts (isPgvectorAvailable, ensurePgvector stub, withPgvectorFallback).
// sqlite (env.ts default) tolerated for `pnpm prisma db push` + local dev/CI; postgres + extension required for hybrid paths (later PRs).
// See design: docs/plans/2026-05-28-001-feat-hybrid-retrieval-pgvector-rrf.md (Data Model Changes + PR 1).
