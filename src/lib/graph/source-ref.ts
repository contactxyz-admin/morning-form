/**
 * Structured `sourceRef` contract (T5 decision D4).
 *
 * `SourceDocument.sourceRef` stays a nullable `String?` column on Prisma,
 * but anything we write from now on should be the JSON-serialised form of
 * `SourceRef` below. Legacy rows held free-form strings (filenames, URLs);
 * `parseSourceRef` tolerates those so queries don't throw during the
 * migration window.
 *
 * `SourceSystem` uses a pattern-based enum: fixed values (`nhs_app`,
 * `patients_know_best`, `apple_health`, `user_upload`, `assistant_entry`)
 * plus two namespaced prefixes (`terra:*` for wearable providers behind
 * Terra, `private_lab:*` for consumer lab brands). The prefix escape hatch
 * avoids re-releasing a migration every time a new provider shows up.
 */
import { z } from 'zod';

export const FIXED_SOURCE_SYSTEMS = [
  'nhs_app',
  'patients_know_best',
  'apple_health',
  'user_upload',
  'assistant_entry',
] as const;
export type FixedSourceSystem = (typeof FIXED_SOURCE_SYSTEMS)[number];

const NAMESPACE_RE = /^(terra|private_lab):[a-z0-9][a-z0-9_]*$/;

const SourceSystemSchema = z.string().refine(
  (v) => (FIXED_SOURCE_SYSTEMS as readonly string[]).includes(v) || NAMESPACE_RE.test(v),
  {
    message:
      'system must be one of the fixed values or match "terra:<slug>" / "private_lab:<slug>" (lowercase snake_case slug)',
  },
);
export type SourceSystem = z.infer<typeof SourceSystemSchema>;

export const SourceRefSchema = z
  .object({
    system: SourceSystemSchema,
    recordId: z.string().min(1).max(200).optional(),
    externalUrl: z.string().url().optional(),
    pulledAt: z.string().datetime({ offset: true, message: 'pulledAt must be an ISO-8601 datetime' }),
    authorClinician: z.string().min(1).max(200).optional(),
  })
  .strict();

export type SourceRef = z.infer<typeof SourceRefSchema>;

/**
 * Encode a structured `SourceRef` to the JSON string stored in
 * `SourceDocument.sourceRef`. Validates first so callers can't write garbage.
 */
export function encodeSourceRef(ref: SourceRef): string {
  return JSON.stringify(SourceRefSchema.parse(ref));
}

export type ParsedSourceRef =
  | { kind: 'structured'; value: SourceRef }
  | { kind: 'legacy'; value: string }
  | { kind: 'empty' };

/**
 * Read-tolerant decoder for the `sourceRef` column. Structured writes round
 * trip. Legacy strings (filenames, URLs) are preserved as `legacy`. Empty /
 * null surfaces as `empty`. Never throws.
 */
export function parseSourceRef(raw: string | null | undefined): ParsedSourceRef {
  if (!raw) return { kind: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'legacy', value: raw };
  }
  const result = SourceRefSchema.safeParse(parsed);
  if (result.success) return { kind: 'structured', value: result.data };
  return { kind: 'legacy', value: raw };
}

export function isKnownSourceSystem(system: string): system is SourceSystem {
  return (FIXED_SOURCE_SYSTEMS as readonly string[]).includes(system) || NAMESPACE_RE.test(system);
}
