/**
 * `get_topic_overview` — return the `TopicStatus` row for a single topic.
 *
 * Same shape `/api/record` returns inside `topics[]`, projected to one
 * topic at a time. Lets an agent ask "is the iron topic compiled? how
 * many sources back it?" without pulling the whole graph index.
 *
 * Requires a `topicKey` argument (this is the topic-scoped tool of the
 * trio added in U3). User-scoping is enforced via `ctx.userId`; unknown
 * topic keys return the stub state (matches `aggregateRecord`'s behavior
 * when a topic isn't yet compiled).
 */
import { z } from 'zod';
import { listTopicConfigs } from '@/lib/topics/registry';
import {
  getFullGraphForUser,
  getLatestSupportCapturedAt,
} from '@/lib/graph/queries';
import { aggregateRecord } from '@/lib/record/aggregate';
import type { TopicStatus } from '@/lib/record/types';
import type { ToolContext, ToolHandler } from './types';

export const getTopicOverviewSchema = z.object({
  topicKey: z.string().min(1).max(100),
});
export type GetTopicOverviewArgs = z.infer<typeof getTopicOverviewSchema>;

export type GetTopicOverviewResult =
  | { found: true; topic: TopicStatus }
  | { found: false; knownTopics: string[] };

export const getTopicOverviewHandler: ToolHandler<
  GetTopicOverviewArgs,
  GetTopicOverviewResult
> = {
  name: 'get_topic_overview',
  description:
    'Return the status row for a single topic — status (stub/full/error), nodeCount, sourceCount, hasEvidence, updatedAt. Returns `{ found: false, knownTopics: [...] }` when the topicKey is not in the registry, so the agent can discover the valid set.',
  parameters: getTopicOverviewSchema,
  async execute(ctx: ToolContext, args: GetTopicOverviewArgs) {
    const configs = listTopicConfigs();
    const known = configs.find((c) => c.topicKey === args.topicKey);
    if (!known) {
      return {
        found: false,
        knownTopics: configs.map((c) => c.topicKey),
      };
    }

    const [{ nodes, edges }, sources, topics] = await Promise.all([
      getFullGraphForUser(ctx.db, ctx.userId),
      ctx.db.sourceDocument.findMany({
        where: { userId: ctx.userId },
        select: { id: true, kind: true, capturedAt: true, createdAt: true },
      }),
      ctx.db.topicPage.findMany({
        where: { userId: ctx.userId },
        select: { topicKey: true, status: true, updatedAt: true },
      }),
    ]);
    const recencyMap =
      nodes.length > 0
        ? await getLatestSupportCapturedAt(
            ctx.db,
            ctx.userId,
            nodes.map((n) => n.id),
          )
        : undefined;

    const index = aggregateRecord({ topics, nodes, sources, edges, recencyMap });
    const topic = index.topics.find((t) => t.topicKey === args.topicKey);
    // `aggregateRecord` produces one TopicStatus per registered topic, so a
    // known topicKey always resolves. The `?? null` is belt-and-suspenders.
    if (!topic) return { found: false, knownTopics: configs.map((c) => c.topicKey) };

    return { found: true, topic };
  },
};
