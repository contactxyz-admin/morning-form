/**
 * Scribe tool catalog — the single source of truth for the six handlers a
 * specialist-GP scribe can call during compile-time or runtime execution.
 *
 * The catalog exposes two views of each handler:
 *   - `handlers` — the typed `ToolHandler` instances the executor dispatches to
 *   - `definitions` — a provider-agnostic { name, description, parameters }
 *     triple the executor converts into whatever tool-definition shape the
 *     underlying LLM SDK expects (Anthropic `tools`, OpenAI `tools`, etc.)
 *
 * Names are deliberately stable (`search_graph_nodes`, …) — they land in
 * `ScribeAudit.toolCalls`, so renaming is a breaking change for the audit
 * trail. Keep the snake_case convention the plan specifies.
 */
import type { ZodType } from 'zod';
import { compareToReferenceRangeHandler } from './tools/compare-to-reference-range';
import { getNodeDetailHandler } from './tools/get-node-detail';
import { getNodeProvenanceHandler } from './tools/get-node-provenance';
import { recognizePatternInHistoryHandler } from './tools/recognize-pattern-in-history';
import { referToSpecialistHandler } from './tools/refer-to-specialist';
import { routeToGpPrepHandler } from './tools/route-to-gp-prep';
import { searchGraphNodesHandler } from './tools/search-graph-nodes';
import type { AnyToolHandler } from './tools/types';

export const SCRIBE_TOOL_HANDLERS = [
  searchGraphNodesHandler,
  getNodeDetailHandler,
  getNodeProvenanceHandler,
  compareToReferenceRangeHandler,
  recognizePatternInHistoryHandler,
  routeToGpPrepHandler,
  referToSpecialistHandler,
] as const satisfies ReadonlyArray<AnyToolHandler>;

export type ScribeToolName = (typeof SCRIBE_TOOL_HANDLERS)[number]['name'];

export interface ScribeToolDefinition {
  name: string;
  description: string;
  parameters: ZodType<unknown>;
}

const HANDLERS_BY_NAME: Record<string, AnyToolHandler> = Object.fromEntries(
  SCRIBE_TOOL_HANDLERS.map((h) => [h.name, h as AnyToolHandler]),
);

export function getToolHandler(name: string): AnyToolHandler | undefined {
  return HANDLERS_BY_NAME[name];
}

export function listToolDefinitions(): ScribeToolDefinition[] {
  return SCRIBE_TOOL_HANDLERS.map((h) => ({
    name: h.name,
    description: h.description,
    parameters: h.parameters as ZodType<unknown>,
  }));
}

export function listToolNames(): string[] {
  return SCRIBE_TOOL_HANDLERS.map((h) => h.name);
}
