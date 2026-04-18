/**
 * Scribe persistence surface — see docs/plans/2026-04-18-001-feat-clinical-scribes-in-content-plan.md.
 *
 * Invariants:
 * - One Scribe per (userId, topicKey); enforced by a unique index AND the
 *   per-user `ScribeTopicLink` row. `getOrCreateScribeForTopic` tolerates
 *   concurrent first calls via upsert + P2002 recovery.
 * - `modelVersion` is captured once at creation (D9). Subsequent calls do not
 *   mutate the stored version even if the caller passes a newer value.
 * - `ScribeAudit` is append-only (D6, D11). The only write path is an
 *   idempotent upsert keyed by `(scribeId, requestId)`. No update or delete
 *   path is exposed — this is a structural guarantee, enforced by a test.
 */

import type { Prisma, PrismaClient, Scribe, ScribeAudit } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_SCRIBE_MODEL = 'openrouter/openai/gpt-4.1';

export const DEFAULT_SCRIBE_TEMPERATURE = 0.3;

/**
 * The six tool names every new scribe is seeded with. U3 implements the
 * adapters; U1 seeds the metadata so the policy enforcer has a stable palette
 * to validate against.
 */
export const DEFAULT_SCRIBE_TOOLS = [
  'graph.findNodesForTopic',
  'graph.getNodeDetails',
  'graph.getCitations',
  'rag.searchTopic',
  'history.readOwnBaselines',
  'reference.lookupRange',
] as const;

export type ScribeToolName = (typeof DEFAULT_SCRIBE_TOOLS)[number];

export type ScribeMode = 'compile' | 'runtime';

export interface CreateScribeOptions {
  modelVersion: string;
  systemPrompt?: string | null;
  model?: string;
  temperature?: number;
}

export interface RecordAuditInput {
  requestId: string;
  topicKey: string;
  mode: ScribeMode;
  prompt: string;
  toolCalls: unknown;
  output: string;
  citations: unknown;
  safetyClassification: string;
  modelVersion: string;
}

/**
 * Returns the scribe for `(userId, topicKey)`, creating it with the default
 * tool palette and topic-link on first call. First-write-wins on all scribe
 * fields — later calls read the existing row rather than update it.
 */
export async function getOrCreateScribeForTopic(
  db: Db,
  userId: string,
  topicKey: string,
  options: CreateScribeOptions,
): Promise<Scribe> {
  const existing = await db.scribe.findUnique({
    where: { userId_topicKey: { userId, topicKey } },
  });
  if (existing) return existing;

  const model = options.model ?? DEFAULT_SCRIBE_MODEL;
  const temperature = options.temperature ?? DEFAULT_SCRIBE_TEMPERATURE;
  const systemPrompt = options.systemPrompt ?? null;

  try {
    return await (db as PrismaClient).$transaction(async (tx) => {
      const scribe = await tx.scribe.create({
        data: {
          userId,
          topicKey,
          systemPrompt,
          model,
          modelVersion: options.modelVersion,
          temperature,
        },
      });
      await tx.scribeTool.createMany({
        data: DEFAULT_SCRIBE_TOOLS.map((toolName) => ({
          scribeId: scribe.id,
          toolName,
          enabled: true,
        })),
      });
      await tx.scribeTopicLink.create({
        data: { userId, topicKey, scribeId: scribe.id },
      });
      return scribe;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const winner = await db.scribe.findUnique({
        where: { userId_topicKey: { userId, topicKey } },
      });
      if (winner) return winner;
    }
    throw err;
  }
}

/**
 * Writes an audit row. Idempotent by `(scribeId, requestId)` — repeat calls
 * with the same requestId return the existing row unchanged (first-write-wins
 * on output, toolCalls, citations, modelVersion). The scribe-side caller
 * generates requestId once per model invocation so retries fold into one row.
 */
export async function recordAudit(
  db: Db,
  userId: string,
  scribeId: string,
  input: RecordAuditInput,
): Promise<ScribeAudit> {
  return db.scribeAudit.upsert({
    where: { scribeId_requestId: { scribeId, requestId: input.requestId } },
    create: {
      scribeId,
      userId,
      topicKey: input.topicKey,
      requestId: input.requestId,
      mode: input.mode,
      prompt: input.prompt,
      toolCalls: JSON.stringify(input.toolCalls ?? []),
      output: input.output,
      citations: JSON.stringify(input.citations ?? []),
      safetyClassification: input.safetyClassification,
      modelVersion: input.modelVersion,
    },
    update: {},
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}
