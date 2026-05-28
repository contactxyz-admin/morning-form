# One-time / manual SQL for Neon

This directory holds scripts for operations not managed by Prisma `db push`/`migrate` (e.g. `CREATE EXTENSION`, future `ALTER COLUMN` to native `vector` type after backfill).

Run via Neon SQL Editor or `psql` on the pooled URL, once per project (UK + US replicas). See each .sql header for ownership + exact instructions.

Introduced in PR 1 for the VectorEmbedding + pgvector foundation (per design "dir creation + README note here").
