/**
 * Developer-only: regenerate `prisma/fixtures/demo-navigable-record-topics.json`.
 *
 * Why this exists: the demo's TopicPage content is seeded from a
 * committed JSON fixture, NOT compiled on every deploy. This script is
 * the only path that calls the Anthropic API to produce that fixture.
 *
 * Run this script when:
 *   - Topic content (system prompts, three-tier shape, etc.) changes.
 *   - The underlying graph fixture in
 *     `prisma/fixtures/demo-navigable-record.ts` changes.
 *   - The TopicCompiledOutputSchema changes shape.
 *   - A new topic is added to the registry.
 *
 * What it does:
 *   1. Connects to whatever DB DATABASE_URL points at (typically your
 *      Neon dev branch, or a local Postgres). The script is destructive
 *      on the demo user's graph for that DB — it wipes and re-seeds
 *      sources + nodes + edges. Real-user data is untouched.
 *   2. Calls `compileTopic` for every key in the topic registry with
 *      `force: true` so prior cached rows don't short-circuit.
 *   3. Reads back the resulting TopicPage rows and writes them to the
 *      fixture file.
 *   4. Prints a checklist for the developer to commit + verify.
 *
 * Cost: ~$1–3 of Anthropic tokens depending on registry size. Time:
 * 1–10 minutes depending on Anthropic latency.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   pnpm tsx scripts/demo/regenerate-topic-fixture.ts
 *
 * To re-bootstrap prod (rare — only if you've never committed a
 * fixture), point this at prod's unpooled URL and run it from there.
 */
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { LLMClient } from '../../src/lib/llm/client';
import { compileTopic } from '../../src/lib/topics/compile';
import { listTopicKeys } from '../../src/lib/topics/registry';
import { TopicCompiledOutputSchema } from '../../src/lib/topics/types';
import {
  DEMO_NAVIGABLE_RECORD,
  type DemoRecordFixture,
} from '../../prisma/fixtures/demo-navigable-record';
import {
  DEMO_EMAIL,
  demoChunkId,
  demoNodeId,
  demoSourceId,
} from '../../prisma/fixtures/demo-ids';
import type {
  DemoTopicFixture,
  DemoTopicFixtureRow,
} from '../../prisma/fixtures/demo-navigable-record-topics';

const FIXTURE_PATH = join(
  process.cwd(),
  'prisma/fixtures/demo-navigable-record-topics.json',
);

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY required. Source your env first.');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  // Ensure the demo user + their graph exists in this DB. Idempotent.
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: 'Demo User' },
  });
  console.log(`[regen] demo user ${user.id} (${user.email})`);

  await seedGraph(prisma, user.id, DEMO_NAVIGABLE_RECORD);
  console.log(`[regen] graph seeded`);

  // Compile every topic in the registry. `force: true` bypasses the
  // compile cache so prior stale rows don't short-circuit.
  const llm = new LLMClient();
  const rows: DemoTopicFixtureRow[] = [];
  const registryKeys = listTopicKeys();

  for (const topicKey of registryKeys) {
    console.log(`[regen] compiling ${topicKey}...`);
    const result = await compileTopic({
      db: prisma,
      llm,
      userId: user.id,
      topicKey,
      force: true,
    });
    if (result.status !== 'full' || !result.output) {
      console.error(
        `[regen] compile for ${topicKey} returned status=${result.status}, refusing to write fixture.`,
      );
      process.exit(1);
    }
    rows.push({
      topicKey,
      graphRevisionHash: result.graphRevisionHash,
      output: result.output,
    });
    console.log(`[regen] compiled ${topicKey} (${result.cached ? 'cached' : 'fresh'})`);
  }

  // Validate every row against the current schema before writing.
  for (const row of rows) {
    const parsed = TopicCompiledOutputSchema.safeParse(row.output);
    if (!parsed.success) {
      console.error(
        `[regen] compiled output for ${row.topicKey} failed schema validation:`,
        parsed.error.issues,
      );
      process.exit(1);
    }
  }

  const fixture: DemoTopicFixture = {
    generatedAt: new Date().toISOString(),
    topics: rows,
  };

  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
  console.log(`[regen] wrote ${rows.length} topic(s) to ${FIXTURE_PATH}`);
  console.log(`[regen] next: git diff the fixture, then commit.`);

  await prisma.$disconnect();
}

/**
 * Wipe + re-seed the demo user's graph (sources, chunks, nodes, edges)
 * from the DEMO_NAVIGABLE_RECORD fixture. Scoped to the demo user; real
 * user data is untouched. Idempotent — running twice produces the same
 * row set.
 */
async function seedGraph(
  prisma: PrismaClient,
  userId: string,
  fixture: DemoRecordFixture,
) {
  await prisma.sourceDocument.deleteMany({ where: { userId } });
  await prisma.graphNode.deleteMany({ where: { userId } });

  // Deterministic IDs so the captured topic fixture survives re-seeds.
  // See prisma/fixtures/demo-ids.ts for the full reasoning.
  const sourceIdBySourceKey = new Map<string, string>();
  const chunkIdByChunkKey = new Map<string, string>();
  for (const source of fixture.sources) {
    const contentHash = createHash('sha256').update(source.sourceKey).digest('hex');
    const sourceId = demoSourceId(source.sourceKey);
    const created = await prisma.sourceDocument.create({
      data: {
        id: sourceId,
        userId,
        kind: source.kind,
        sourceRef: source.sourceRef,
        contentHash,
        capturedAt: new Date(source.capturedAt),
        chunks: {
          create: source.chunks.map((c) => ({
            id: demoChunkId(source.sourceKey, c.chunkKey),
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
    const nodeId = demoNodeId(node.type, node.canonicalKey);
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
        id: nodeId,
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
    if (!fromNodeId || !toNodeId) continue;
    const fromChunkId = edge.fromChunkKey ? chunkIdByChunkKey.get(edge.fromChunkKey) : undefined;
    const fromDocumentId = edge.fromSourceKey
      ? sourceIdBySourceKey.get(edge.fromSourceKey)
      : undefined;
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
