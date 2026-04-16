/**
 * Domain types for the Health Graph (U1 schema). Strings are constrained to
 * the canonical-registry pattern used elsewhere (HEALTH_PROVIDERS, canonical
 * metric registry) so callers branch on stable values, not free-form strings.
 *
 * Stored attributes/metadata are JSON-serialised into the underlying String?
 * columns; helpers in queries.ts / mutations.ts handle parse/stringify.
 */

export const NODE_TYPES = [
  'symptom',
  'biomarker',
  'condition',
  'medication',
  'intervention',
  'lifestyle',
  'metric_window',
  'mood',
  'energy',
  'source_document',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  'SUPPORTS',
  'ASSOCIATED_WITH',
  'CAUSES',
  'CONTRADICTS',
  'TEMPORAL_SUCCEEDS',
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const SOURCE_DOCUMENT_KINDS = [
  'lab_pdf',
  'gp_record',
  'intake_text',
  'wearable_window',
  'checkin',
  'protocol',
] as const;
export type SourceDocumentKind = (typeof SOURCE_DOCUMENT_KINDS)[number];

export interface AddSourceDocumentInput {
  kind: SourceDocumentKind;
  sourceRef?: string;
  contentHash?: string;
  capturedAt: Date;
  storagePath?: string;
  metadata?: Record<string, unknown>;
}

export interface AddSourceChunkInput {
  index: number;
  text: string;
  offsetStart: number;
  offsetEnd: number;
  pageNumber?: number;
  metadata?: Record<string, unknown>;
}

export interface AddNodeInput {
  type: NodeType;
  canonicalKey: string;
  displayName: string;
  attributes?: Record<string, unknown>;
  confidence?: number;
  promoted?: boolean;
}

export interface AddEdgeInput {
  type: EdgeType;
  fromNodeId: string;
  toNodeId: string;
  fromChunkId?: string;
  fromDocumentId?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Topic registry config (U8 owns the registry; queries.ts only consumes this
 * shape). canonicalKeyPatterns are matched as case-insensitive substrings
 * against canonicalKey — keep them targeted.
 */
export interface TopicSubgraphSpec {
  types: NodeType[];
  canonicalKeyPatterns: string[];
  /** Hops out from seed nodes to expand. Defaults to 2 in callers. */
  depth: number;
}

export interface ProvenanceItem {
  chunkId: string;
  documentId: string;
  documentKind: SourceDocumentKind;
  text: string;
  offsetStart: number;
  offsetEnd: number;
  pageNumber: number | null;
  capturedAt: Date;
}

export interface SubgraphResult {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
}

export interface GraphNodeRecord {
  id: string;
  userId: string;
  type: NodeType;
  canonicalKey: string;
  displayName: string;
  attributes: Record<string, unknown>;
  confidence: number;
  promoted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GraphEdgeRecord {
  id: string;
  userId: string;
  type: EdgeType;
  fromNodeId: string;
  toNodeId: string;
  fromChunkId: string | null;
  fromDocumentId: string | null;
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface IngestExtractionInput {
  document: AddSourceDocumentInput;
  chunks: AddSourceChunkInput[];
  /**
   * Nodes to upsert. `supportingChunkIndices` references chunk indices in the
   * same payload (NOT chunk ids — those don't exist yet). Mutation resolves
   * indices to chunk ids inside the transaction so callers don't need to know
   * the persisted ids.
   */
  nodes: Array<AddNodeInput & { supportingChunkIndices?: number[] }>;
  /**
   * Edges to add (non-SUPPORTS). `from`/`to` reference node canonicalKeys in
   * the same payload OR existing nodes with that canonicalKey. Resolution
   * happens inside the transaction.
   */
  edges: Array<{
    type: EdgeType;
    fromCanonicalKey: string;
    fromType: NodeType;
    toCanonicalKey: string;
    toType: NodeType;
    weight?: number;
    metadata?: Record<string, unknown>;
  }>;
  /**
   * Topic-stub keys to upsert inside the same transaction as the graph writes.
   * TopicPage.status is preserved on existing rows (a compiled `ready` topic
   * never regresses to `stub` just because a new extraction cited it). Kept
   * here rather than on the route so partial-write windows (graph persisted,
   * stubs missing) are impossible.
   */
  tentativeTopicStubs?: string[];
}

export interface IngestExtractionResult {
  documentId: string;
  chunkIds: string[];
  nodeIds: string[];
  edgeIds: string[];
  /** Count of edges silently skipped (unresolvable refs, out-of-range chunk indices). */
  droppedEdges: number;
}
