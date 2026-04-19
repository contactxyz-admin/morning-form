/**
 * Typed errors for the Health Graph write-path.
 */
import type { ZodError } from 'zod';
import type { NodeType } from './types';

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
