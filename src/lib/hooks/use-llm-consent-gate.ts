'use client';

/**
 * Bridges `412 { requiresConsent: true }` responses from LLM-bearing
 * routes to the `<LlmConsentModal>`. Each caller owns its own retry —
 * the hook stores it and replays after the user accepts.
 *
 * Two intake shapes:
 *   - `checkResponse(res, retry)` — caller has a `Response`, hook peeks
 *     the cloned body for `requiresConsent: true` and arms the retry.
 *     Returns true so the caller can skip its normal error path.
 *   - `armRetry(retry)` — caller has already classified the 412 (e.g.
 *     inside `useChatStream`) and just needs the modal raised.
 *
 * Wire the returned `{ open, onAccepted, onCancel }` straight onto
 * `<LlmConsentModal>`. On accept, the consent POST is owned by the
 * modal; this hook only handles the retry side.
 */
import { useCallback, useState } from 'react';

interface ConsentBody {
  requiresConsent?: unknown;
}

export interface LlmConsentGate {
  open: boolean;
  armRetry: (retry: () => void) => void;
  checkResponse: (res: Response, retry: () => void) => Promise<boolean>;
  onAccepted: () => void;
  onCancel: () => void;
}

export function useLlmConsentGate(): LlmConsentGate {
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);

  const armRetry = useCallback((retry: () => void) => {
    setPendingRetry(() => retry);
  }, []);

  const checkResponse = useCallback(
    async (res: Response, retry: () => void): Promise<boolean> => {
      if (res.status !== 412) return false;
      try {
        const body = (await res.clone().json()) as ConsentBody;
        if (body?.requiresConsent === true) {
          setPendingRetry(() => retry);
          return true;
        }
      } catch {
        // Not JSON or not the consent shape — fall through to caller's
        // existing 412 handling (currently none, since 412 is reserved
        // for this gate).
      }
      return false;
    },
    [],
  );

  const onAccepted = useCallback(() => {
    const retry = pendingRetry;
    setPendingRetry(null);
    retry?.();
  }, [pendingRetry]);

  const onCancel = useCallback(() => {
    setPendingRetry(null);
  }, []);

  return {
    open: pendingRetry !== null,
    armRetry,
    checkResponse,
    onAccepted,
    onCancel,
  };
}
