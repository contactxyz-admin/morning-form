/**
 * Source-document node attribute contract.
 *
 * The `source_document` node type is a graph-layer wrapper around a
 * SourceDocument row (used by importance scoring as a type placeholder —
 * see src/lib/graph/importance.test.ts). Not written by any ingest path
 * today; passthrough keeps future integrations unblocked.
 */
import { z } from 'zod';

export const SourceDocumentAttributesSchema = z.object({}).passthrough();

export type SourceDocumentAttributes = z.infer<typeof SourceDocumentAttributesSchema>;
