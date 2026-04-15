/**
 * Typed errors for LLMClient. Mirrors the LibreAuthError / LibreRateLimitError /
 * LibreTransientError pattern in src/lib/health/libre.ts so callers can branch
 * on response category rather than string-matching.
 *
 * LLMValidationError carries the raw model output so failures during a
 * structured-output call are debuggable without reproducing the request.
 */

export class LLMAuthError extends Error {
  constructor(message = 'anthropic auth failed') {
    super(message);
    this.name = 'LLMAuthError';
  }
}

export class LLMRateLimitError extends Error {
  constructor(public retryAfterSeconds?: number) {
    super('anthropic rate limited');
    this.name = 'LLMRateLimitError';
  }
}

export class LLMTransientError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `anthropic transient error: ${status}`);
    this.name = 'LLMTransientError';
  }
}

export class LLMValidationError extends Error {
  constructor(
    public rawOutput: unknown,
    public zodMessage: string,
  ) {
    super(`anthropic structured output failed schema validation: ${zodMessage}`);
    this.name = 'LLMValidationError';
  }
}
