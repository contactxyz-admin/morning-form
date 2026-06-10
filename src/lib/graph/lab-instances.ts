/**
 * Pure predicate for lab-reading history instances (longitudinal plan
 * 2026-06-10-002).
 *
 * An `observation` node that is INSTANCE_OF a `biomarker` concept is a dated
 * trajectory point, not a graph concept. Such instances surface via marker
 * trajectories and the panel diff, and are excluded from concept-level reads
 * (canvas payload, topic subgraphs, scribe search) so they don't flood
 * prompts or the node cap. Standalone vital-sign observations (no INSTANCE_OF
 * to a biomarker) are never matched.
 *
 * Lives in its own DOM/DB-free module so both the read layer
 * (`queries.getSubgraphForTopic`) and the aggregator (`record/aggregate`) can
 * share it without the aggregator taking a dependency on the Prisma read
 * layer (which route tests mock).
 */
export function computeLabInstanceNodeIds(
  nodes: ReadonlyArray<{ id: string; type: string }>,
  edges: ReadonlyArray<{ type: string; fromNodeId: string; toNodeId: string }>,
): Set<string> {
  const typeById = new Map(nodes.map((n) => [n.id, n.type]));
  const ids = new Set<string>();
  for (const e of edges) {
    if (e.type !== 'INSTANCE_OF') continue;
    if (typeById.get(e.fromNodeId) === 'observation' && typeById.get(e.toNodeId) === 'biomarker') {
      ids.add(e.fromNodeId);
    }
  }
  return ids;
}
