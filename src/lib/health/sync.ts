/**
 * Health Data Sync Orchestrator
 * Normalizes data from all providers into a unified format.
 */

import type { HealthConnection as PrismaHealthConnection } from '@prisma/client';
import type { HealthProvider, HealthDataPoint, HealthSummary } from '@/types';
import { prisma } from '@/lib/db';
import { TerraClient } from './terra';
import { WhoopClient } from './whoop';
import { OuraClient } from './oura';
import { FitbitClient } from './fitbit';
import { GoogleFitClient } from './google-fit';
import { DexcomClient } from './dexcom';
import { LibreClient } from './libre';
import { pointFromCanonical } from './normalize';
import { captureRawPayload } from './raw-payload';

export interface SyncProviderOptions {
  userId?: string;
  traceId?: string;
}

export class HealthSyncService {
  private terra: TerraClient;
  private whoop: WhoopClient;
  private oura: OuraClient;
  private fitbit: FitbitClient;
  private googleFit: GoogleFitClient;
  private dexcom: DexcomClient;
  private libre: LibreClient;

  constructor() {
    this.terra = new TerraClient();
    this.whoop = new WhoopClient();
    this.oura = new OuraClient();
    this.fitbit = new FitbitClient();
    this.googleFit = new GoogleFitClient();
    this.dexcom = new DexcomClient();
    this.libre = new LibreClient();
  }

  async syncProvider(
    provider: HealthProvider,
    startDate: string,
    endDate: string,
    opts: SyncProviderOptions = {}
  ): Promise<HealthDataPoint[]> {
    const points: HealthDataPoint[] = [];
    const now = new Date().toISOString();

    // Capture each raw provider response BEFORE pointFromCanonical runs so we
    // can replay or diff when a vendor silently changes shape. Best-effort:
    // fire-and-forget so a slow debug write never extends sync latency. Any
    // capture error is already swallowed inside captureRawPayload; the extra
    // .catch here is belt-and-braces against a surprise throw before the
    // helper's own try/catch is reached.
    const capture = async <T>(method: string, fn: () => Promise<T>): Promise<T> => {
      const data = await fn();
      if (opts.userId) {
        void captureRawPayload({
          userId: opts.userId,
          provider,
          source: 'pull',
          payload: { method, startDate, endDate, data },
          traceId: opts.traceId,
        }).catch(() => {});
      }
      return data;
    };

    switch (provider) {
      case 'whoop': {
        const [recovery, sleep] = await Promise.all([
          capture('getRecovery', () => this.whoop.getRecovery(startDate, endDate)),
          capture('getSleep', () => this.whoop.getSleep(startDate, endDate)),
        ]);
        recovery.forEach(r => {
          const at = { timestamp: r.created_at, provider: 'whoop' as const };
          points.push(
            pointFromCanonical('recovery_score', r.score.recovery_score, at),
            pointFromCanonical('resting_hr', r.score.resting_heart_rate, at),
            pointFromCanonical('hrv', r.score.hrv_rmssd_milli, at),
          );
        });
        sleep.forEach(s => {
          const at = { timestamp: s.start, provider: 'whoop' as const };
          points.push(
            pointFromCanonical('duration', s.score.stage_summary.total_in_bed_time_milli / 3600000, at),
            pointFromCanonical('efficiency', s.score.sleep_efficiency_percentage, at),
            pointFromCanonical('deep_sleep', s.score.stage_summary.total_slow_wave_sleep_time_milli / 3600000, at),
            pointFromCanonical('rem_sleep', s.score.stage_summary.total_rem_sleep_time_milli / 3600000, at),
          );
        });
        break;
      }
      case 'oura': {
        const [sleep, readiness] = await Promise.all([
          capture('getSleep', () => this.oura.getSleep(startDate, endDate)),
          capture('getReadiness', () => this.oura.getReadiness(startDate, endDate)),
        ]);
        sleep.forEach(s => {
          const at = { timestamp: s.bedtime_start, provider: 'oura' as const };
          points.push(
            pointFromCanonical('duration', s.total_sleep_duration / 3600, at),
            pointFromCanonical('efficiency', s.efficiency, at),
            pointFromCanonical('hrv', s.average_hrv, at),
            pointFromCanonical('temperature_delta', s.temperature_delta, at),
          );
        });
        readiness.forEach(r => {
          points.push(pointFromCanonical('readiness_score', r.score, { timestamp: now, provider: 'oura' }));
        });
        break;
      }
      case 'fitbit': {
        const [sleep, activity, heartRate] = await Promise.all([
          capture('getSleep', () => this.fitbit.getSleep(startDate, endDate)),
          capture('getActivity', () => this.fitbit.getActivity(startDate, endDate)),
          capture('getHeartRate', () => this.fitbit.getHeartRate(startDate, endDate)),
        ]);

        sleep.forEach((s) => {
          const at = { timestamp: s.startTime, provider: 'fitbit' as const };
          points.push(
            pointFromCanonical('duration', s.minutesAsleep / 60, at),
            pointFromCanonical('efficiency', s.efficiency, at),
            pointFromCanonical('deep_sleep', s.levels.summary.deep.minutes / 60, at),
            pointFromCanonical('rem_sleep', s.levels.summary.rem.minutes / 60, at),
          );
        });

        activity.forEach((a) => {
          const at = { timestamp: now, provider: 'fitbit' as const };
          points.push(
            pointFromCanonical('steps', a.steps, at),
            pointFromCanonical('calories', a.calories, at),
            pointFromCanonical('active_minutes', a.activeMinutes, at),
          );
        });

        heartRate.forEach((hr) => {
          const at = { timestamp: now, provider: 'fitbit' as const };
          points.push(
            pointFromCanonical('resting_hr', hr.resting, at),
            pointFromCanonical('avg_hr', hr.average, at),
            pointFromCanonical('max_hr', hr.max, at),
          );
        });
        break;
      }
      case 'google_fit': {
        const [steps, sleep, heartRate] = await Promise.all([
          capture('getSteps', () => this.googleFit.getSteps(startDate, endDate)),
          capture('getSleep', () => this.googleFit.getSleep(startDate, endDate)),
          capture('getHeartRate', () => this.googleFit.getHeartRate(startDate, endDate)),
        ]);

        points.push(pointFromCanonical('steps', steps, { timestamp: now, provider: 'google_fit' }));

        sleep.forEach((s) => {
          points.push(
            pointFromCanonical('duration', s.duration_minutes / 60, { timestamp: s.start, provider: 'google_fit' }),
          );
        });

        const at = { timestamp: now, provider: 'google_fit' as const };
        points.push(
          pointFromCanonical('avg_hr', heartRate.avg, at),
          pointFromCanonical('resting_hr', heartRate.min, at),
          pointFromCanonical('max_hr', heartRate.max, at),
        );
        break;
      }
      case 'dexcom': {
        const egvs = await capture('getEgvs', () => this.dexcom.getEgvs(startDate, endDate));
        egvs.forEach((r) => {
          points.push(
            pointFromCanonical('glucose', r.value, { timestamp: r.systemTime, provider: 'dexcom' }),
          );
        });
        break;
      }
      case 'libre': {
        const readings = await capture('getGlucoseGraph', () =>
          this.libre.getGlucoseGraph('mock_patient', undefined, startDate),
        );
        readings.forEach((r) => {
          points.push(
            pointFromCanonical('glucose', r.value, { timestamp: r.timestamp, provider: 'libre' }),
          );
        });
        break;
      }
      case 'apple_health':
      case 'garmin': {
        // These go through Terra
        const terraData = await capture('getDaily', () =>
          this.terra.getDaily('user', startDate, endDate)
        );
        terraData.forEach(d => {
          const at = { timestamp: `${d.date}T12:00:00Z`, provider };
          points.push(
            pointFromCanonical('steps', d.steps, at),
            pointFromCanonical('resting_hr', d.resting_hr, at),
            pointFromCanonical('hrv', d.avg_hrv, at),
          );
          if (d.recovery_score) {
            points.push(pointFromCanonical('recovery_score', d.recovery_score, at));
          }
        });
        break;
      }
      default:
        break;
    }

    return points;
  }

  async refreshConnectionIfNeeded(connection: PrismaHealthConnection): Promise<PrismaHealthConnection> {
    const expiresAt = connection.expiresAt ? new Date(connection.expiresAt) : null;
    const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() + 60_000 : false;

    // Libre is credential-auth (no refresh token). An expired session can
    // only be recovered by asking the user to re-enter their password, so
    // we flag the connection as `error` and let the settings UI surface a
    // reconnect prompt.
    if (isExpired && connection.provider === 'libre') {
      return prisma.healthConnection.update({
        where: { id: connection.id },
        data: {
          status: 'error',
          metadata: JSON.stringify({
            ...(this.parseMetadata(connection.metadata) || {}),
            syncError: 'libre_session_expired_reconnect_required',
            lastSyncFailedAt: new Date().toISOString(),
          }),
        },
      });
    }

    if (!isExpired || !connection.refreshToken) {
      return connection;
    }

    let refreshed:
      | { access_token: string; refresh_token: string; expires_in: number }
      | undefined;

    switch (connection.provider as HealthProvider) {
      case 'whoop':
        refreshed = await this.whoop.refreshToken(connection.refreshToken);
        break;
      case 'oura':
        refreshed = await this.oura.refreshToken(connection.refreshToken);
        break;
      case 'fitbit':
        refreshed = await this.fitbit.refreshToken(connection.refreshToken);
        break;
      case 'google_fit':
        refreshed = await this.googleFit.refreshToken(connection.refreshToken);
        break;
      case 'dexcom':
        refreshed = await this.dexcom.refreshToken(connection.refreshToken);
        break;
      default:
        return connection;
    }

    return prisma.healthConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || connection.refreshToken,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        metadata: JSON.stringify({
          ...(this.parseMetadata(connection.metadata) || {}),
          lastTokenRefreshAt: new Date().toISOString(),
        }),
      },
    });
  }

  async syncConnection(connection: PrismaHealthConnection, userId: string, startDate: string, endDate: string) {
    const provider = connection.provider as HealthProvider;

    try {
      await prisma.healthConnection.update({
        where: { id: connection.id },
        data: {
          status: 'syncing',
          metadata: JSON.stringify({
            ...(this.parseMetadata(connection.metadata) || {}),
            syncError: null,
            syncStartedAt: new Date().toISOString(),
          }),
        },
      });

      const refreshedConnection = await this.refreshConnectionIfNeeded(connection);
      const points = await this.syncProvider(provider, startDate, endDate, { userId });
      const dedupedPoints = this.deduplicateData(points);

      if (dedupedPoints.length > 0) {
        await prisma.healthDataPoint.createMany({
          data: dedupedPoints.map((point) => ({
            userId,
            provider: point.provider,
            category: point.category,
            metric: point.metric,
            value: point.value,
            unit: point.unit,
            timestamp: new Date(point.timestamp),
            metadata: JSON.stringify({ importedAt: new Date().toISOString() }),
          })),
        });
      }

      await prisma.healthConnection.update({
        where: { id: refreshedConnection.id },
        data: {
          status: 'connected',
          lastSyncAt: new Date(),
          metadata: JSON.stringify({
            ...(this.parseMetadata(refreshedConnection.metadata) || {}),
            syncError: null,
            lastSyncCount: dedupedPoints.length,
            lastSuccessfulSyncAt: new Date().toISOString(),
          }),
        },
      });

      return { provider, ok: true, count: dedupedPoints.length, points: dedupedPoints };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sync error';

      await prisma.healthConnection.update({
        where: { id: connection.id },
        data: {
          status: 'error',
          metadata: JSON.stringify({
            ...(this.parseMetadata(connection.metadata) || {}),
            syncError: message,
            lastSyncFailedAt: new Date().toISOString(),
          }),
        },
      });

      return { provider, ok: false, count: 0, points: [] as HealthDataPoint[], error: message };
    }
  }

  async syncAllProviders(connectedProviders: HealthProvider[], startDate: string, endDate: string): Promise<HealthDataPoint[]> {
    const results = await Promise.allSettled(
      connectedProviders.map(p => this.syncProvider(p, startDate, endDate))
    );
    return results
      .filter((r): r is PromiseFulfilledResult<HealthDataPoint[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }

  deduplicateData(points: HealthDataPoint[]): HealthDataPoint[] {
    const seen = new Set<string>();
    return points.filter((point) => {
      const key = [point.provider, point.metric, point.timestamp, point.value].join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  parseMetadata(metadata?: string | null): Record<string, unknown> | null {
    if (!metadata) return null;
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  aggregateToSummary(points: HealthDataPoint[]): HealthSummary {
    const latest = (metric: string) => {
      const matching = points.filter(p => p.metric === metric).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      return matching[0]?.value ?? null;
    };

    return {
      sleep: {
        duration: latest('duration') as number | null,
        quality: latest('efficiency') as number | null,
        deepSleep: latest('deep_sleep') as number | null,
        remSleep: latest('rem_sleep') as number | null,
        restingHR: latest('resting_hr') as number | null,
      },
      activity: {
        steps: latest('steps') as number | null,
        calories: latest('calories') as number | null,
        activeMinutes: latest('active_minutes') as number | null,
        strain: latest('strain') as number | null,
      },
      recovery: {
        hrv: latest('hrv') as number | null,
        recoveryScore: latest('recovery_score') as number | null,
        respiratoryRate: latest('respiratory_rate') as number | null,
      },
      heart: {
        restingHR: latest('resting_hr') as number | null,
        maxHR: latest('max_hr') as number | null,
        avgHR: latest('avg_hr') as number | null,
      },
      metabolic: {
        glucose: latest('glucose') as number | null,
      },
    };
  }
}
