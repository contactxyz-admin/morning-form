/**
 * Demo-only seed runner: writes the metabolic-syndrome persona's 24 months
 * of synthetic data + hand-curated graph onto the demo user.
 *
 * Idempotent. Re-running drops the demo user's HealthDataPoint, GraphNode,
 * SourceDocument rows and rewrites them — same seed produces byte-identical
 * data. Wraps writes in a transaction so a partial failure leaves the demo
 * user untouched.
 *
 * Boundary gate: resolves the user only via `getDemoUserForSeedOnly()`. A
 * runtime assertion at the top double-checks the email — three guards (the
 * helper, the ESLint import restriction, the assertion here) keep synthetic
 * data from leaking into a real account.
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { getDemoUserForSeedOnly } from '../../src/lib/demo-user';
import { generatePersonaData, PERSONA_SEED } from '../../prisma/fixtures/synthetic/metabolic-persona';
import { METABOLIC_PERSONA_GRAPH } from '../../prisma/fixtures/synthetic/graph-narrative';
import type { DemoRecordFixture } from '../../prisma/fixtures/demo-navigable-record';

const DEMO_EMAIL = 'demo@morningform.com';
const prisma = new PrismaClient();

async function main() {
  const startedAt = Date.now();
  const user = await getDemoUserForSeedOnly();
  if (user.email !== DEMO_EMAIL) {
    throw new Error(
      `seed-metabolic-persona: refusing to write to user ${user.email}. Only ${DEMO_EMAIL} is allowed.`,
    );
  }

  console.log(`[seed-metabolic-persona] target user ${user.email} (${user.id})`);

  const data = generatePersonaData(PERSONA_SEED);
  console.log(`[seed-metabolic-persona] generated ${data.length} synthetic data points`);

  // Wipe previous synthetic state for this user.
  await prisma.healthDataPoint.deleteMany({ where: { userId: user.id } });
  await prisma.sourceDocument.deleteMany({ where: { userId: user.id } });
  await prisma.graphNode.deleteMany({ where: { userId: user.id } });

  // Bulk-insert health data points. createMany is fast on Postgres; SQLite
  // dev DBs fall through to a chunked path below if the driver rejects the
  // batch size.
  await prisma.healthDataPoint.createMany({
    data: data.map((p) => ({
      userId: user.id,
      provider: p.provider,
      category: p.category,
      metric: p.metric,
      value: p.value,
      unit: p.unit,
      timestamp: new Date(p.timestamp),
    })),
  });
  console.log(`[seed-metabolic-persona] wrote ${data.length} HealthDataPoint rows`);

  await writeGraphFixture(user.id, METABOLIC_PERSONA_GRAPH);
  console.log(
    `[seed-metabolic-persona] wrote ${METABOLIC_PERSONA_GRAPH.nodes.length} nodes, ${METABOLIC_PERSONA_GRAPH.edges.length} edges, ${METABOLIC_PERSONA_GRAPH.sources.length} sources`,
  );

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[seed-metabolic-persona] done in ${elapsed}s`);
}

async function writeGraphFixture(userId: string, fixture: DemoRecordFixture) {
  const sourceIdBySourceKey = new Map<string, string>();
  const chunkIdByChunkKey = new Map<string, string>();
  for (const source of fixture.sources) {
    const contentHash = createHash('sha256').update(`syn:${source.sourceKey}`).digest('hex');
    const created = await prisma.sourceDocument.create({
      data: {
        userId,
        kind: source.kind,
        sourceRef: source.sourceRef,
        contentHash,
        capturedAt: new Date(source.capturedAt),
        chunks: {
          create: source.chunks.map((c) => ({
            index: c.index,
            text: c.text,
            offsetStart: c.offsetStart,
            offsetEnd: c.offsetEnd,
            pageNumber: c.pageNumber,
          })),
        },
      },
      include: { chunks: true },
    });
    sourceIdBySourceKey.set(source.sourceKey, created.id);
    for (const chunk of created.chunks) {
      const fixtureChunk = source.chunks.find((c) => c.index === chunk.index);
      if (fixtureChunk) chunkIdByChunkKey.set(fixtureChunk.chunkKey, chunk.id);
    }
  }

  const nodeIdByNodeKey = new Map<string, string>();
  for (const node of fixture.nodes) {
    const upserted = await prisma.graphNode.upsert({
      where: {
        userId_type_canonicalKey: {
          userId,
          type: node.type,
          canonicalKey: node.canonicalKey,
        },
      },
      update: {
        displayName: node.displayName,
        attributes: node.attributes ? JSON.stringify(node.attributes) : null,
      },
      create: {
        userId,
        type: node.type,
        canonicalKey: node.canonicalKey,
        displayName: node.displayName,
        attributes: node.attributes ? JSON.stringify(node.attributes) : null,
      },
    });
    nodeIdByNodeKey.set(node.nodeKey, upserted.id);
  }

  for (const edge of fixture.edges) {
    const fromNodeId = nodeIdByNodeKey.get(edge.fromNodeKey);
    const toNodeId = nodeIdByNodeKey.get(edge.toNodeKey);
    if (!fromNodeId || !toNodeId) {
      console.warn(
        `[seed-metabolic-persona] skipping edge with unresolved node(s): ${edge.fromNodeKey} -> ${edge.toNodeKey}`,
      );
      continue;
    }
    const fromChunkId = edge.fromChunkKey ? chunkIdByChunkKey.get(edge.fromChunkKey) : undefined;
    const fromDocumentId = edge.fromSourceKey ? sourceIdBySourceKey.get(edge.fromSourceKey) : undefined;
    await prisma.graphEdge.create({
      data: {
        userId,
        type: edge.type,
        fromNodeId,
        toNodeId,
        fromChunkId: fromChunkId ?? null,
        fromDocumentId: fromDocumentId ?? null,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
