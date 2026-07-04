/**
 * Pure helpers for board-client.tsx, split out into their own module (no
 * React/CSS imports) so they're importable from a plain Vitest test without
 * needing a DOM/CSS-module test environment this repo doesn't otherwise use.
 */
import type { OpsTaskDto } from './board-client';

export function dueDateInputValue(dueDate: string | null): string {
  return dueDate ? dueDate.slice(0, 10) : '';
}

/**
 * Grouped by phase text (not array-adjacency) so a newly created task
 * (always appended at the end of local state) merges into its existing
 * phase group instead of starting a duplicate header for the same phase.
 */
export function groupTasksByPhase(tasks: OpsTaskDto[]): { phase: string; rows: OpsTaskDto[] }[] {
  const groupMap = new Map<string, OpsTaskDto[]>();
  for (const t of tasks) {
    const rows = groupMap.get(t.phase);
    if (rows) rows.push(t);
    else groupMap.set(t.phase, [t]);
  }
  return Array.from(groupMap.entries(), ([phase, rows]) => ({ phase, rows }));
}
