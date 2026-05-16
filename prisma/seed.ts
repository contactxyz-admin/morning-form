import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { DEMO_NAVIGABLE_RECORD } from './fixtures/demo-navigable-record';
import type { DemoRecordFixture } from './fixtures/demo-navigable-record';
import { loadDemoTopicFixture } from './fixtures/demo-navigable-record-topics';
import { demoChunkId, demoNodeId, demoSourceId } from './fixtures/demo-ids';
import { listTopicKeys } from '../src/lib/topics/registry';
import { getOrCreateScribeForTopic } from '../src/lib/scribe/repo';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'demo@morningform.com' },
    update: {},
    create: {
      email: 'demo@morningform.com',
      name: 'Demo User',
    },
  });

  await prisma.assessmentResponse.upsert({
    where: { userId: user.id },
    update: {
      responses: JSON.stringify({
        primary_goal: 'focus',
        friction_point: 'wired_tired',
        wake_time: '07:00',
        sleep_time: '22:45',
        sleep_quality: 2,
        night_waking: '1_2',
        stimulant_sensitivity: 'moderate',
        stress_level: 4,
      }),
    },
    create: {
      userId: user.id,
      responses: JSON.stringify({
        primary_goal: 'focus',
        friction_point: 'wired_tired',
        wake_time: '07:00',
        sleep_time: '22:45',
        sleep_quality: 2,
        night_waking: '1_2',
        stimulant_sensitivity: 'moderate',
        stress_level: 4,
      }),
    },
  });

  await prisma.stateProfile.upsert({
    where: { userId: user.id },
    update: {
      archetype: 'sustained-activator',
      primaryPattern: 'Sustained activation with impaired downshift',
      patternDescription:
        'You maintain high output during the day but struggle to transition into rest. Your system stays on longer than it should.',
      observations: JSON.stringify([
        'High afternoon energy but poor sleep onset',
        'Moderate-high stimulant sensitivity',
        'Below-baseline recovery perception',
      ]),
      constraints: JSON.stringify(['Caffeine cutoff recommended before 1pm']),
      sensitivities: JSON.stringify(['Stimulant sensitivity', 'Stress reactivity']),
    },
    create: {
      userId: user.id,
      archetype: 'sustained-activator',
      primaryPattern: 'Sustained activation with impaired downshift',
      patternDescription:
        'You maintain high output during the day but struggle to transition into rest. Your system stays on longer than it should.',
      observations: JSON.stringify([
        'High afternoon energy but poor sleep onset',
        'Moderate-high stimulant sensitivity',
        'Below-baseline recovery perception',
      ]),
      constraints: JSON.stringify(['Caffeine cutoff recommended before 1pm']),
      sensitivities: JSON.stringify(['Stimulant sensitivity', 'Stress reactivity']),
    },
  });

  // Demo Priorities row — uses the priority-marker-engine output for the
  // sustained-activator archetype so the seed stays in sync with whatever
  // content/priority-markers/sustained-activator.ts says (the editorial-QA
  // gate scans that file). Avoids the seed drifting out of sync with the
  // clinically-reviewed content.
  const { buildPriorities } = await import('../src/lib/priority-marker-engine');
  const demoPriorities = buildPriorities({
    primary_goal: 'focus',
    afternoon_energy: 4,
    wind_down_ability: 2,
    morning_energy: 3,
    stress_level: 3,
    stimulant_sensitivity: 'moderate',
    sleep_quality: 3,
    anxiety_frequency: 'sometimes',
    night_waking: 'rare',
    pregnancy: 'no',
  });
  await prisma.priorities.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      version: 1,
      status: 'active',
      rationale: demoPriorities.rationale,
      confidence: 'high',
      items: {
        create: demoPriorities.items.map((m) => ({
          markerName: m.markerName,
          rationale: m.rationale,
          category: m.category,
          panelAvailability: m.panelAvailability,
          sortOrder: m.sortOrder,
        })),
      },
    },
  });

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      wakeTime: '07:00',
      windDownTime: '22:00',
      timezone: 'Europe/London',
    },
  });

  await prisma.healthConnection.upsert({
    where: { userId_provider: { userId: user.id, provider: 'whoop' } },
    update: { status: 'connected', lastSyncAt: new Date() },
    create: { userId: user.id, provider: 'whoop', status: 'connected', lastSyncAt: new Date() },
  });

  await prisma.healthConnection.upsert({
    where: { userId_provider: { userId: user.id, provider: 'oura' } },
    update: { status: 'connected', lastSyncAt: new Date() },
    create: { userId: user.id, provider: 'oura', status: 'connected', lastSyncAt: new Date() },
  });

  // Demo daily-data is wipe-and-recreate scoped to the demo user only.
  // Prior versions used `create()` inside the date loop, which multiplied
  // rows on every seed run — after N deploys the demo user accumulated
  // 14N CheckIns and 14N HealthDataPoints. Now the seed is safely
  // idempotent on every deploy.
  await prisma.checkIn.deleteMany({ where: { userId: user.id } });
  await prisma.healthDataPoint.deleteMany({ where: { userId: user.id } });

  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });

  // Deterministic PRNG so repeated runs produce the same demo dataset.
  // Math.random() drifted demo content across deploys; pinning to a seed
  // keeps fixture-derived screenshots / docs stable.
  const rng = createSeededRng('morning-form-demo');

  for (const date of dates) {
    const dateKey = date.toISOString().split('T')[0];
    await prisma.checkIn.create({
      data: {
        userId: user.id,
        type: 'morning',
        date: dateKey,
        responses: JSON.stringify({
          sleepQuality: pick(['ok', 'well', 'great'], rng),
          currentFeeling: pick(['flat', 'steady', 'sharp'], rng),
        }),
      },
    });

    await prisma.checkIn.create({
      data: {
        userId: user.id,
        type: 'evening',
        date: dateKey,
        responses: JSON.stringify({
          focusQuality: pick(['variable', 'good', 'locked-in'], rng),
          afternoonEnergy: pick(['dipped', 'steady', 'strong'], rng),
          protocolAdherence: pick(['mostly', 'fully'], rng),
        }),
      },
    });

    await prisma.healthDataPoint.createMany({
      data: [
        {
          userId: user.id,
          provider: 'whoop',
          category: 'recovery',
          metric: 'hrv',
          value: 58 + Math.round(rng() * 15),
          unit: 'ms',
          timestamp: date,
        },
        {
          userId: user.id,
          provider: 'oura',
          category: 'sleep',
          metric: 'duration',
          value: 6.8 + rng() * 1.2,
          unit: 'hours',
          timestamp: date,
        },
      ],
    });
  }

  await seedDemoNavigableRecord(user.id, DEMO_NAVIGABLE_RECORD);

  await seedScribes(user.id);
}

/**
 * Seed one clinical scribe per topic for the demo user. The repo is
 * idempotent, so re-running the seed leaves existing scribes untouched —
 * including the originally captured `modelVersion` (see D9).
 */
async function seedScribes(userId: string) {
  const modelVersion = process.env.SCRIBE_MODEL_VERSION ?? 'gpt-4.1-2026-01-01';
  for (const topicKey of listTopicKeys()) {
    const scribe = await getOrCreateScribeForTopic(prisma, userId, topicKey, { modelVersion });
    console.log(
      `[seedScribes] ${topicKey} → scribe ${scribe.id} (model=${scribe.model}, version=${scribe.modelVersion})`,
    );
  }
}

/**
 * Seed the `/r/demo-navigable-record` graph + compiled topic pages.
 *
 * Wipe-and-recreate pattern: every SourceDocument and GraphNode owned by
 * the demo user is fixture-derived, so we nuke the lot before inserting.
 * A prior contentHash-filtered wipe left v1 rows with `contentHash = null`
 * behind (Postgres: `NULL IN (list)` evaluates to NULL, not true), which
 * then violated `@@unique([userId, contentHash])` on re-seed and also
 * leaked stale chunks into later provenance queries.
 *
 * TopicPage rows are inserted directly from
 * `prisma/fixtures/demo-navigable-record-topics.json` — no LLM compile
 * at seed time. Demo content is deterministic, byte-identical across
 * environments, free, and immune to LLM/network/lint failures at
 * deploy time. To regenerate the fixture when topic content or the
 * underlying graph changes, run:
 *
 *   pnpm tsx scripts/demo/regenerate-topic-fixture.ts
 *
 * That script runs `compileTopic` against any DB the developer owns,
 * reads back the result, and writes the JSON fixture for commit.
 */
async function seedDemoNavigableRecord(userId: string, fixture: DemoRecordFixture) {
  // Wipe every fixture-owned row for this user.
  // SourceChunks cascade from SourceDocument; GraphEdges cascade from GraphNode.
  await prisma.sourceDocument.deleteMany({ where: { userId } });
  await prisma.graphNode.deleteMany({ where: { userId } });

  // Deterministic IDs for the demo's graph + sources. Why: the topic
  // fixture (`demo-navigable-record-topics.json`) baked into the repo
  // references nodeIds in its citations. If those IDs changed on every
  // re-seed, every deploy would render citations pointing at deleted
  // rows. Stable IDs keep the fixture valid across infinite redeploys.
  //
  // Scoped to the demo user only — real-user graphs continue to use
  // Prisma's @default(cuid()) at ingest time.
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
      if (fixtureChunk) {
        chunkIdByChunkKey.set(fixtureChunk.chunkKey, chunk.id);
      }
    }
  }

  // Upsert nodes with deterministic IDs (see comment above).
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

  // Create edges. Prior rows were deleted above via node cascade.
  for (const edge of fixture.edges) {
    const fromNodeId = nodeIdByNodeKey.get(edge.fromNodeKey);
    const toNodeId = nodeIdByNodeKey.get(edge.toNodeKey);
    if (!fromNodeId || !toNodeId) {
      console.warn(
        `[seedDemoNavigableRecord] skipping edge with unresolved node(s): ${edge.fromNodeKey} -> ${edge.toNodeKey}`,
      );
      continue;
    }
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

  // Insert TopicPage rows directly from the committed fixture. No LLM
  // calls at seed time — the demo is deterministic by construction.
  const topicFixture = loadDemoTopicFixture();
  const registryKeys = new Set(listTopicKeys());

  for (const entry of topicFixture.topics) {
    if (!registryKeys.has(entry.topicKey)) {
      console.warn(
        `[seedDemoNavigableRecord] fixture has topicKey '${entry.topicKey}' that's not in the current registry — skipping.`,
      );
      continue;
    }
    await prisma.topicPage.upsert({
      where: { userId_topicKey: { userId, topicKey: entry.topicKey } },
      update: {
        status: 'full',
        rendered: JSON.stringify(entry.output),
        graphRevisionHash: entry.graphRevisionHash,
        compileError: null,
      },
      create: {
        userId,
        topicKey: entry.topicKey,
        status: 'full',
        rendered: JSON.stringify(entry.output),
        graphRevisionHash: entry.graphRevisionHash,
        compileError: null,
      },
    });
  }

  console.log(
    `[seedDemoNavigableRecord] seeded ${topicFixture.topics.length} TopicPage row(s) from fixture (generated ${topicFixture.generatedAt}).`,
  );

  // Coverage check: once the fixture has been populated (>= 1 topic),
  // it must cover every key in the registry. A missing topic means the
  // registry was extended without regenerating the fixture — warn but
  // don't fail the seed; the demo still renders whatever is present.
  //
  // The empty-starter state (topics: []) is treated as a known-pending
  // bootstrap, not a drift error. The optional /api/health/demo route
  // surfaces this as `status: 'broken'` for monitoring.
  if (topicFixture.topics.length > 0) {
    const fixtureKeys = new Set(topicFixture.topics.map((t) => t.topicKey));
    const missing = listTopicKeys().filter((k) => !fixtureKeys.has(k));
    if (missing.length > 0) {
      console.warn(
        `[seedDemoNavigableRecord] registry/fixture drift — fixture missing: ${missing.join(', ')}. Run pnpm demo:regenerate-topics to refresh.`,
      );
    }
  }
}

/**
 * Tiny seedable PRNG (mulberry32) so demo data stays stable across runs.
 * The seed string is hashed to a 32-bit int so any human-readable seed
 * works. Demo content stability matters because screenshots, the live
 * demo URL, and docs all reference the same dataset.
 */
function createSeededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
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
