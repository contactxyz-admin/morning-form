/**
 * Capture raw provider payloads before normalization.
 *
 * When a provider (Whoop, Libre, ...) silently changes shape, the canonical
 * mapper produces empty / wrong points and the rule engine quietly stops
 * firing. Capturing the unparsed response gives us something to grep, replay,
 * and diff after the fact.
 *
 * v1 keeps it boring: one row per provider call, payload as a JSON string,
 * sizeBytes for quick triage. No S3, no separate event hierarchy, no
 * background pruning — that's debug data, we'll cull manually if it grows.
 *
 * Capture is best-effort. A failed write must NEVER break sync.
 */

import { prisma } from '@/lib/db';

export type RawPayloadSource = 'pull' | 'push' | 'sdk';

export interface CaptureRawPayloadInput {
  userId: string;
  provider: string;
  source: RawPayloadSource;
  payload: unknown;
  traceId?: string;
}

function isTestEnv(): boolean {
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
}

export async function captureRawPayload(input: CaptureRawPayloadInput): Promise<void> {
  if (isTestEnv()) return;

  try {
    const json = JSON.stringify(input.payload ?? null);
    await prisma.rawProviderPayload.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        source: input.source,
        payload: json,
        sizeBytes: Buffer.byteLength(json, 'utf8'),
        traceId: input.traceId,
      },
    });
  } catch (err) {
    console.error('[raw-payload] capture failed (continuing):', err);
  }
}
