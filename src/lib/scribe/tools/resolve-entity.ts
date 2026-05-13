/**
 * `resolve_entity` — map a stable canonical key to the underlying graph
 * node, so external agents can navigate the vault by the same primitive
 * humans deep-link through.
 *
 * Pairs with the URL-state pattern in `<VaultLayout>`: humans share
 * `/record?entity=ferritin` links, agents call
 * `resolve_entity({ canonicalKey: "ferritin" })` to get the node id. Both
 * paths land on the same entity, with the canonical key as the
 * address-space primitive.
 *
 * Returns `{ found: false }` for unknown keys rather than throwing; an
 * external client typo or stale link shouldn't shape the MCP error
 * envelope. User-scoping is enforced at the query layer — cross-user
 * canonicalKey lookups return `{ found: false }`, never the other user's
 * node id (so the API can't be used to probe whether someone else's
 * vault contains a given entity).
 */
import { z } from 'zod';
import type { NodeType } from '@/lib/graph/types';
import type { ToolContext, ToolHandler } from './types';

export const resolveEntitySchema = z.object({
  canonicalKey: z.string().min(1).max(200),
});
export type ResolveEntityArgs = z.infer<typeof resolveEntitySchema>;

export interface ResolvedEntity {
  found: true;
  node: {
    id: string;
    type: NodeType;
    canonicalKey: string;
    displayName: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface UnresolvedEntity {
  found: false;
}

export type ResolveEntityResult = ResolvedEntity | UnresolvedEntity;

export const resolveEntityHandler: ToolHandler<
  ResolveEntityArgs,
  ResolveEntityResult
> = {
  name: 'resolve_entity',
  description:
    'Look up a graph node by its canonical key (e.g. "ferritin", "fatigue", "creatine_monohydrate"). Returns the node id + display metadata when found, `{ found: false }` otherwise. Use after `list_graph_index` or `search_graph_nodes` to address an entity for follow-up calls like `get_node_detail`.',
  parameters: resolveEntitySchema,
  async execute(ctx: ToolContext, args: ResolveEntityArgs) {
    // canonicalKey is lowercase-by-convention (see src/lib/intake/biomarkers.ts
    // for the write-side normalization on lab data). External agents passing
    // human-typed strings like 'Ferritin' must resolve to the stored
    // 'ferritin' row. Normalize on the read side rather than depending on
    // caller discipline.
    const canonicalKey = args.canonicalKey.toLowerCase();
    const row = await ctx.db.graphNode.findFirst({
      where: { userId: ctx.userId, canonicalKey },
      select: {
        id: true,
        type: true,
        canonicalKey: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) return { found: false };
    return {
      found: true,
      node: {
        id: row.id,
        type: row.type as NodeType,
        canonicalKey: row.canonicalKey,
        displayName: row.displayName,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  },
};
