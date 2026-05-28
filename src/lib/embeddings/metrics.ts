/**
 * Embedding metrics surface (PR 2).
 *
 * Reuses the pragmatic in-memory counter + structured logging pattern from:
 *   - src/lib/funnel/event.ts (fire-and-forget writes, MAX_* caps, safe stringify)
 *   - src/lib/mcp/audit.ts (swallow on failure, console.error with stable keys)
 *   - src/lib/metrics/activation-funnel*.ts (stage counters)
 *
 * PR2 exports the counters for:
 *   - embedding_tokens_total
 *   - embedding_latency_ms (last + implicit via calls)
 *   - embedding_cache_hits (surface prepared for PR4/5 in-mem LRU)
 *   - cost tracking (totalCostUsd)
 *
 * No DB side effects. Production can later wire these to the existing funnel
 * or a dedicated metrics sink. Tests call reset() between cases.
 *
 * Cold-start note (plan): acceptable on Vercel for low-volume ingest/query paths.
 */

export interface EmbeddingMetricsSnapshot {
  tokensTotal: number;
  callsTotal: number;
  errorsTotal: number;
  cacheHits: number;
  lastLatencyMs: number;
  totalCostUsd: number;
}

const state: EmbeddingMetricsSnapshot = {
  tokensTotal: 0,
  callsTotal: 0,
  errorsTotal: 0,
  cacheHits: 0,
  lastLatencyMs: 0,
  totalCostUsd: 0,
};

export const EmbeddingMetrics = {
  /** Current counters (read-only view for tests & debug). */
  get snapshot(): EmbeddingMetricsSnapshot {
    return { ...state };
  },

  /** Reset all counters (test hygiene; also useful for scripted backfill dry-runs later). */
  reset(): void {
    state.tokensTotal = 0;
    state.callsTotal = 0;
    state.errorsTotal = 0;
    state.cacheHits = 0;
    state.lastLatencyMs = 0;
    state.totalCostUsd = 0;
  },

  /** Record tokens + derived cost for a batch or single embed. */
  recordTokens(tokens: number, costUsd: number): void {
    if (tokens > 0) state.tokensTotal += Math.floor(tokens);
    if (costUsd > 0) state.totalCostUsd += costUsd;
  },

  /**
   * Record a completed call (latency from first attempt start).
   * `cached` increments the cache hit surface (even if real caching lands in PR 4+).
   */
  recordCall(latencyMs: number, cached = false): void {
    state.callsTotal += 1;
    state.lastLatencyMs = Math.max(0, Math.floor(latencyMs));
    if (cached) state.cacheHits += 1;
  },

  recordError(): void {
    state.errorsTotal += 1;
  },

  /**
   * Structured log for observability (ingest + query paths).
   * Mirrors mcp audit / funnel "log on failure, info on success" posture.
   */
  logBatch(params: {
    model: string;
    batchSize: number;
    tokens: number;
    costUsd: number;
    latencyMs: number;
    cached?: boolean;
    error?: string;
  }): void {
    const { model, batchSize, tokens, costUsd, latencyMs, cached, error } = params;
    if (error) {
      console.error('[embeddings] batch failed', {
        model,
        batchSize,
        tokens,
        latencyMs,
        error,
      });
      return;
    }
    console.info('[embeddings] batch', {
      model,
      batchSize,
      tokens,
      costUsd: Number(costUsd.toFixed(6)),
      latencyMs,
      cached: !!cached,
    });
  },
};
