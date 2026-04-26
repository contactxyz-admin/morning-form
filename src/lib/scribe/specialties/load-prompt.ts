/**
 * Specialty system-prompt loader.
 *
 * The specialty registry stores `systemPromptPath` as a repo-relative path
 * rather than the prompt text itself, so prompts can be edited as plain
 * markdown without a code change. This loader resolves that path against
 * the project root and returns the prompt text.
 *
 * Caching: prompts are read once per process and memoized. Tests that need
 * to swap a prompt should call `clearSpecialtyPromptCache()`.
 *
 * Resolution: only paths that match the canonical pattern
 * `src/lib/scribe/specialties/<key>/system-prompt.md` are accepted. This
 * keeps the registry honest — a specialty's prompt is co-located with its
 * other code under its own folder, not somewhere arbitrary on disk.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSpecialty } from './registry';

const PROMPT_CACHE = new Map<string, string>();

const ALLOWED_PATH_PATTERN =
  /^src\/lib\/scribe\/specialties\/[a-z][a-z0-9-]*\/system-prompt\.md$/;

/**
 * Read the system prompt for a specialty by key. Returns `undefined` for
 * unregistered keys, stub specialties (no prompt yet), or any specialty
 * whose `systemPromptPath` is null. The caller should fall back to the
 * default prompt built from the safety policy (`buildSystemPrompt` in
 * `src/lib/scribe/execute.ts`).
 *
 * Throws if a registered specialty has a prompt path that points outside
 * the canonical specialties folder, or if the file is missing — both are
 * registry bugs that should fail loud rather than silently degrade.
 */
export function loadSpecialtySystemPrompt(key: string): string | undefined {
  const specialty = getSpecialty(key);
  if (!specialty || specialty.systemPromptPath === null) return undefined;

  const path = specialty.systemPromptPath;
  if (!ALLOWED_PATH_PATTERN.test(path)) {
    throw new Error(
      `loadSpecialtySystemPrompt: '${key}' has invalid systemPromptPath '${path}' (must match ${ALLOWED_PATH_PATTERN})`,
    );
  }

  const cached = PROMPT_CACHE.get(path);
  if (cached !== undefined) return cached;

  const projectRoot = process.cwd();
  const absolute = join(projectRoot, path);
  let content: string;
  try {
    content = readFileSync(absolute, 'utf8');
  } catch (err) {
    throw new Error(
      `loadSpecialtySystemPrompt: failed to read '${path}' for specialty '${key}': ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  PROMPT_CACHE.set(path, content);
  return content;
}

export function clearSpecialtyPromptCache(): void {
  PROMPT_CACHE.clear();
}
