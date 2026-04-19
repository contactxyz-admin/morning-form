/**
 * Typed errors for the Health Graph write-path.
 */
import type { ZodError } from 'zod';
import type { EdgeType, NodeType } from './types';

export class NodeAttributesValidationError extends Error {
  readonly nodeType: NodeType;
  readonly canonicalKey: string;
  readonly issues: ZodError['issues'];

  constructor(nodeType: NodeType, canonicalKey: string, issues: ZodError['issues']) {
    const summary = issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    super(
      `Invalid attributes for ${nodeType} "${canonicalKey}": ${summary}`,
    );
    this.name = 'NodeAttributesValidationError';
    this.nodeType = nodeType;
    this.canonicalKey = canonicalKey;
    this.issues = issues;
  }
}

/**
 * Thrown when an edge is written with a node-type combination the edge
 * contract doesn't allow. Read-path stays tolerant of legacy rows; only
 * new writes raise this.
 */
export class EdgeEndpointViolation extends Error {
  readonly edgeType: EdgeType;
  readonly fromType: NodeType;
  readonly toType: NodeType;
  readonly reason: 'invalid_from' | 'invalid_to';

  constructor(
    edgeType: EdgeType,
    fromType: NodeType,
    toType: NodeType,
    reason: 'invalid_from' | 'invalid_to',
  ) {
    super(
      `Edge ${edgeType} cannot connect ${fromType} → ${toType} (${reason})`,
    );
    this.name = 'EdgeEndpointViolation';
    this.edgeType = edgeType;
    this.fromType = fromType;
    this.toType = toType;
    this.reason = reason;
  }
}
