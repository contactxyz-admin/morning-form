#!/usr/bin/env tsx
/**
 * Backfill VectorEmbedding rows from existing SourceChunk.text.
 *
 * Explicit operator tool: dry-run and estimate before writing production
 * vectors. The script embeds only raw SourceChunk.text and writes progress to
 * EmbeddingBackfillState so an interrupted run is auditable and safe to rerun.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { embedMany } from '../src/lib/embeddings/pipeline';
import {
  assertBackfillResultModel,
  DEFAULT_BACKFILL_BATCH_SIZE,
  estimateBackfillCandidates,
  normalizeBackfillBatchSize,
  validateBackfillModel,
  type BackfillCandidate,
  type BackfillEstimate,
} from '../src/lib/embeddings/backfill';
import { DEFAULT_EMBEDDING_MODEL } from '../src/lib/embeddings/types';

interface Args {
  userId: string | null;
  model: string;
  batchSize: number;
  limit: number | null;
  dryRun: boolean;
  estimateOnly: boolean;
  resumeId: string | null;
}

const HELP = `Usage: npx tsx scripts/backfill-embeddings.ts [options]

Options:
  --user USER_ID          Restrict backfill to one user (recommended first run)
  --model MODEL           Embedding model (default ${DEFAULT_EMBEDDING_MODEL})
  --batch N               Batch size, 1-100 (default ${DEFAULT_BACKFILL_BATCH_SIZE})
  --limit N               Process/estimate at most N chunks in this invocation
  --dry-run               Estimate and record an audit state row, but do not call the provider or write vectors
  --estimate              Estimate pending chunks/tokens/cost and exit without writing vectors
  --resume STATE_ID       Continue updating an existing EmbeddingBackfillState row
  --help, -h              Show this help

Examples:
  npx tsx scripts/backfill-embeddings.ts --dry-run --estimate
  npx tsx scripts/backfill-embeddings.ts --user user_123 --dry-run --estimate
  npx tsx scripts/backfill-embeddings.ts --user user_123 --batch 80

Notes:
  - Only SourceChunk.text is embedded. Nodes, generated summaries, and diagnostic outputs are never embedded.
  - The script is idempotent: VectorEmbedding writes use skipDuplicates on sourceChunkId.
  - Rerunning after an interruption is safe; already-embedded chunks are skipped by the query.
`;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    userId: null,
    model: DEFAULT_EMBEDDING_MODEL,
    batchSize: DEFAULT_BACKFILL_BATCH_SIZE,
    limit: null,
    dryRun: false,
    estimateOnly: false,
    resumeId: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--estimate' || arg === '--estimate-cost') {
      args.estimateOnly = true;
      args.dryRun = true;
      continue;
    }
    if (arg === '--user' || arg === '--user-id') {
      args.userId = readFlagValue(argv, ++i, arg);
      continue;
    }
    if (arg.startsWith('--user=')) {
      args.userId = valueAfterEquals(arg, '--user');
      continue;
    }
    if (arg === '--model') {
      args.model = readFlagValue(argv, ++i, arg);
      continue;
    }
    if (arg.startsWith('--model=')) {
      args.model = valueAfterEquals(arg, '--model');
      continue;
    }
    if (arg === '--batch') {
      args.batchSize = parsePositiveInt(readFlagValue(argv, ++i, arg), '--batch');
      continue;
    }
    if (arg.startsWith('--batch=')) {
      args.batchSize = parsePositiveInt(valueAfterEquals(arg, '--batch'), '--batch');
      continue;
    }
    if (arg === '--limit') {
      args.limit = parsePositiveInt(readFlagValue(argv, ++i, arg), '--limit');
      continue;
    }
    if (arg.startsWith('--limit=')) {
      args.limit = parsePositiveInt(valueAfterEquals(arg, '--limit'), '--limit');
      continue;
    }
    if (arg === '--resume') {
      args.resumeId = readFlagValue(argv, ++i, arg);
      continue;
    }
    if (arg.startsWith('--resume=')) {
      args.resumeId = valueAfterEquals(arg, '--resume');
      continue;
    }
    throw new Error(`Unknown argument: ${arg}. See --help for usage.`);
  }

  args.model = validateBackfillModel(args.model);
  args.batchSize = normalizeBackfillBatchSize(args.batchSize);
  return args;
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function valueAfterEquals(arg: string, flag: string): string {
  const value = arg.slice(flag.length + 1);
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

type ChunkCursor = Pick<BackfillCandidate, 'id' | 'createdAt'>;

function pendingChunkWhere(args: Args, cursor?: ChunkCursor): Prisma.SourceChunkWhereInput {
  const filters: Prisma.SourceChunkWhereInput[] = [
    { text: { not: '' } },
    // VectorEmbedding.sourceChunkId is unique in the MVP schema, so "missing"
    // means no embedding row at all. Model-upgrade cohorts need a future schema
    // change before they can coexist per chunk.
    { embeddings: { none: {} } },
  ];
  if (args.userId) {
    filters.push({ sourceDocument: { userId: args.userId } });
  }
  if (cursor) {
    filters.push({
      OR: [
        { createdAt: { gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ],
    });
  }
  return { AND: filters };
}

async function fetchPendingChunks(
  prisma: PrismaClient,
  args: Args,
  take: number,
  cursor?: ChunkCursor,
): Promise<BackfillCandidate[]> {
  return prisma.sourceChunk.findMany({
    where: pendingChunkWhere(args, cursor),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take,
    select: { id: true, text: true, createdAt: true },
  });
}

async function estimatePending(
  prisma: PrismaClient,
  args: Args,
): Promise<BackfillEstimate> {
  let cursor: ChunkCursor | undefined;
  let remaining = args.limit ?? Number.POSITIVE_INFINITY;
  let chunks = 0;
  let tokens = 0;
  let costUsd = 0;

  while (remaining > 0) {
    const take = Math.min(1000, remaining);
    const batch = await fetchPendingChunks(prisma, args, take, cursor);
    if (batch.length === 0) break;
    const estimate = estimateBackfillCandidates(batch);
    chunks += estimate.chunks;
    tokens += estimate.tokens;
    costUsd += estimate.costUsd;
    const last = batch[batch.length - 1];
    cursor = { id: last.id, createdAt: last.createdAt };
    remaining -= batch.length;
    if (batch.length < take) break;
  }

  return { chunks, tokens, costUsd };
}

async function createOrResumeState(
  prisma: PrismaClient,
  args: Args,
  estimate: BackfillEstimate,
) {
  const data = {
    userId: args.userId,
    model: args.model,
    status: 'running',
    dryRun: args.dryRun,
    estimateOnly: args.estimateOnly,
    batchSize: args.batchSize,
    estimatedPendingChunks: estimate.chunks,
    estimatedPendingTokens: estimate.tokens,
    estimatedPendingCostUsd: estimate.costUsd,
    error: null,
    completedAt: null,
  };

  if (args.resumeId) {
    return prisma.embeddingBackfillState.update({
      where: { id: args.resumeId },
      data,
    });
  }

  return prisma.embeddingBackfillState.create({ data });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  let stateId: string | null = null;

  try {
    const estimate = await estimatePending(prisma, args);
    process.stdout.write(
      [
        '[backfill-embeddings] pending estimate',
        `scope=${args.userId ?? 'all-users'}`,
        `model=${args.model}`,
        `chunks=${estimate.chunks}`,
        `tokens=${estimate.tokens}`,
        `costUsd=${formatUsd(estimate.costUsd)}`,
        args.limit ? `limit=${args.limit}` : null,
      ]
        .filter(Boolean)
        .join(' ') + '\n',
    );

    const state = await createOrResumeState(prisma, args, estimate);
    stateId = state.id;

    if (args.dryRun || args.estimateOnly) {
      await prisma.embeddingBackfillState.update({
        where: { id: state.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          processedChunks: estimate.chunks,
          totalTokens: estimate.tokens,
          totalCostUsd: estimate.costUsd,
        },
      });
      process.stdout.write(
        `[backfill-embeddings] dry-run complete state=${state.id}; no provider calls or VectorEmbedding writes performed.\n`,
      );
      return;
    }

    let processedChunks = state.processedChunks;
    let embeddedChunks = state.embeddedChunks;
    let skippedChunks = state.skippedChunks;
    let totalTokens = state.totalTokens;
    let totalCostUsd = state.totalCostUsd;
    let remaining = args.limit ?? Number.POSITIVE_INFINITY;

    while (remaining > 0) {
      const take = Math.min(args.batchSize, remaining);
      const chunks = await fetchPendingChunks(prisma, args, take);
      if (chunks.length === 0) break;

      const embedded = await embedMany(
        chunks.map((chunk) => ({
          sourceChunkId: chunk.id,
          text: chunk.text,
          userId: args.userId ?? undefined,
        })),
      );

      const rows = embedded.results
        .filter((result) => result.sourceChunkId)
        .map((result) => {
          assertBackfillResultModel(args.model, result.model);
          return {
            sourceChunkId: result.sourceChunkId!,
            model: result.model,
            dimensions: result.dimensions,
            vector: result.vector,
          };
        });

      const write = await prisma.vectorEmbedding.createMany({
        data: rows,
        skipDuplicates: true,
      });

      const last = chunks[chunks.length - 1];
      processedChunks += chunks.length;
      embeddedChunks += write.count;
      skippedChunks += chunks.length - write.count;
      totalTokens += embedded.totalTokens;
      totalCostUsd += embedded.totalCostUsd;
      remaining -= chunks.length;

      await prisma.embeddingBackfillState.update({
        where: { id: state.id },
        data: {
          processedChunks,
          embeddedChunks,
          skippedChunks,
          totalTokens,
          totalCostUsd,
          lastProcessedChunkId: last.id,
          lastProcessedChunkCreatedAt: last.createdAt,
        },
      });

      process.stdout.write(
        [
          '[backfill-embeddings] batch',
          `state=${state.id}`,
          `processed=${processedChunks}`,
          `inserted=${write.count}`,
          `skipped=${skippedChunks}`,
          `tokens=${totalTokens}`,
          `costUsd=${formatUsd(totalCostUsd)}`,
        ].join(' ') + '\n',
      );
    }

    await prisma.embeddingBackfillState.update({
      where: { id: state.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        processedChunks,
        embeddedChunks,
        skippedChunks,
        totalTokens,
        totalCostUsd,
      },
    });

    process.stdout.write(
      `[backfill-embeddings] complete state=${state.id} processed=${processedChunks} embedded=${embeddedChunks} skipped=${skippedChunks} costUsd=${formatUsd(totalCostUsd)}\n`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (stateId) {
      try {
        await prisma.embeddingBackfillState.update({
          where: { id: stateId },
          data: {
            status: 'failed',
            error: message.slice(0, 2000),
            completedAt: new Date(),
          },
        });
      } catch {
        // Preserve the original failure; best-effort audit updates must not mask it.
      }
    }
    if (message && process.env.NODE_ENV !== 'test') {
      process.stderr.write(`[backfill-embeddings] ${message}\n`);
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

function formatUsd(value: number): string {
  return value.toFixed(6);
}

main().catch(() => {
  process.exit(1);
});
