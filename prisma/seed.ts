import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { DEMO_NAVIGABLE_RECORD } from './fixtures/demo-navigable-record';
import type { DemoRecordFixture } from './fixtures/demo-navigable-record';
import { compileTopic } from '../src/lib/topics/compile';
import { listTopicKeys } from '../src/lib/topics/registry';
import { TopicCompileLintError } from '../src/lib/topics/types';
import { LLMClient } from '../src/lib/llm/client';
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

  await prisma.protocol.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      version: 1,
      status: 'active',
      rationale:
        'Morning activation support, midday transition buffering, and structured evening downshift for sustained output with better sleep onset.',
      confidence: 'high',
      items: {
        create: [
          {
            timeSlot: 'morning',
            timeLabel: 'Morning — Activation Support',
            compounds: 'L-Tyrosine + Alpha-GPC',
            dosage: '500mg + 300mg',
            timingCue: 'Before breakfast',
            mechanism: 'Supports dopamine and acetylcholine synthesis for sustained focus.',
            evidenceTier: 'strong',
            sortOrder: 0,
          },
          {
            timeSlot: 'afternoon',
            timeLabel: 'Afternoon — Transition Buffer',
            compounds: 'L-Theanine',
            dosage: '200mg',
            timingCue: 'After lunch',
            mechanism: 'Smooths the cortisol curve without sedation.',
            evidenceTier: 'strong',
            sortOrder: 1,
          },
          {
            timeSlot: 'evening',
            timeLabel: 'Evening — Downshift Protocol',
            compounds: 'Magnesium L-Threonate + Apigenin',
            dosage: '200mg + 50mg',
            timingCue: '90 minutes before bed',
            mechanism: 'Supports GABA activity and melatonin onset.',
            evidenceTier: 'strong',
            sortOrder: 2,
          },
        ],
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

  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });

  for (const date of dates) {
    const dateKey = date.toISOString().split('T')[0];
    await prisma.checkIn.create({
      data: {
        userId: user.id,
        type: 'morning',
        date: dateKey,
        responses: JSON.stringify({
          sleepQuality: ['ok', 'well', 'great'][Math.floor(Math.random() * 3)],
          currentFeeling: ['flat', 'steady', 'sharp'][Math.floor(Math.random() * 3)],
        }),
      },
    });

    await prisma.checkIn.create({
      data: {
        userId: user.id,
        type: 'evening',
        date: dateKey,
        responses: JSON.stringify({
          focusQuality: ['variable', 'good', 'locked-in'][Math.floor(Math.random() * 3)],
          afternoonEnergy: ['dipped', 'steady', 'strong'][Math.floor(Math.random() * 3)],
          protocolAdherence: ['mostly', 'fully'][Math.floor(Math.random() * 2)],
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
          value: 58 + Math.round(Math.random() * 15),
          unit: 'ms',
          timestamp: date,
        },
        {
          userId: user.id,
          provider: 'oura',
          category: 'sleep',
          metric: 'duration',
          value: 6.8 + Math.random() * 1.2,
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
 * Seed the `/r/demo-navigable-record` graph.
 *
 * Wipe-and-recreate pattern: every SourceDocument and GraphNode owned by
 * the demo user is fixture-derived, so we nuke the lot before inserting.
 * A prior contentHash-filtered wipe left v1 rows with `contentHash = null`
 * behind (Postgres: `NULL IN (list)` evaluates to NULL, not true), which
 * then violated `@@unique([userId, contentHash])` on re-seed and also
 * leaked stale chunks into later provenance queries.
 *
 * Compile is best-effort: if `ANTHROPIC_API_KEY` is missing and `MOCK_LLM`
 * isn't set (typical CI), we skip compile. The graph still lands, and the
 * `/r/demo-navigable-record` page falls back to the "Nothing here yet"
 * card — which is fine for CI environments where we're not trying to
 * render live topics.
 */
async function seedDemoNavigableRecord(userId: string, fixture: DemoRecordFixture) {
  // Wipe every fixture-owned row for this user.
  // SourceChunks cascade from SourceDocument; GraphEdges cascade from GraphNode.
  await prisma.sourceDocument.deleteMany({ where: { userId } });
  await prisma.graphNode.deleteMany({ where: { userId } });

  // Insert sources with deterministic contentHash so re-seeds don't churn.
  const sourceIdBySourceKey = new Map<string, string>();
  const chunkIdByChunkKey = new Map<string, string>();
  for (const source of fixture.sources) {
    const contentHash = createHash('sha256').update(source.sourceKey).digest('hex');
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
      if (fixtureChunk) {
        chunkIdByChunkKey.set(fixtureChunk.chunkKey, chunk.id);
      }
    }
  }

  // Upsert nodes.
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

  // Best-effort compile. Skip quietly if no LLM access in this environment.
  const canCompile = Boolean(process.env.ANTHROPIC_API_KEY) || process.env.MOCK_LLM === 'true';
  if (!canCompile) {
    console.log(
      '[seedDemoNavigableRecord] skipping topic compile — ANTHROPIC_API_KEY missing and MOCK_LLM not set.',
    );
    return;
  }

  const llm = new LLMClient();
  const failures: Array<{ topicKey: string; error: string; violations?: unknown }> = [];
  for (const topicKey of listTopicKeys()) {
    try {
      const result = await compileTopic({ db: prisma, llm, userId, topicKey });
      console.log(
        `[seedDemoNavigableRecord] compiled ${topicKey} → ${result.status}${result.cached ? ' (cached)' : ''}`,
      );
    } catch (error) {
      if (error instanceof TopicCompileLintError) {
        console.warn(
          `[seedDemoNavigableRecord] compile failed for ${topicKey}: ${error.message}\n` +
            `  violations: ${JSON.stringify(error.violations, null, 2)}`,
        );
        failures.push({ topicKey, error: error.message, violations: error.violations });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[seedDemoNavigableRecord] compile failed for ${topicKey}: ${message}`);
        failures.push({ topicKey, error: message });
      }
    }
  }
  if (failures.length > 0) {
    // Emit a structured summary so downstream readers (CI, scripts) can
    // parse the outcome without scraping log prose. Exit non-zero so CI
    // pipelines surface the failure instead of marking the seed green.
    console.error(
      `[seedDemoNavigableRecord] compile-summary ${JSON.stringify({
        total: listTopicKeys().length,
        failed: failures.length,
        failures,
      })}`,
    );
    process.exitCode = 1;
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
