/**
 * Health Data Sync Orchestrator
 * Normalizes data from all providers into a unified format.
 */

import type { HealthProvider, HealthDataPoint, HealthSummary } from '@/types';
import { TerraClient } from './terra';
import { WhoopClient } from './whoop';
import { OuraClient } from './oura';

export class HealthSyncService {
  private terra: TerraClient;
  private whoop: WhoopClient;
  private oura: OuraClient;

  constructor() {
    this.terra = new TerraClient();
    this.whoop = new WhoopClient();
    this.oura = new OuraClient();
  }

  async syncProvider(provider: HealthProvider, startDate: string, endDate: string): Promise<HealthDataPoint[]> {
    const points: HealthDataPoint[] = [];
    const now = new Date().toISOString();

    switch (provider) {
      case 'whoop': {
        const [recovery, sleep] = await Promise.all([
          this.whoop.getRecovery(startDate, endDate),
          this.whoop.getSleep(startDate, endDate),
        ]);
        recovery.forEach(r => {
          points.push(
            { category: 'recovery', metric: 'recovery_score', value: r.score.recovery_score, unit: '%', timestamp: r.created_at, provider: 'whoop' },
            { category: 'heart', metric: 'resting_hr', value: r.score.resting_heart_rate, unit: 'bpm', timestamp: r.created_at, provider: 'whoop' },
            { category: 'recovery', metric: 'hrv', value: r.score.hrv_rmssd_milli, unit: 'ms', timestamp: r.created_at, provider: 'whoop' },
          );
        });
        sleep.forEach(s => {
          points.push(
            { category: 'sleep', metric: 'duration', value: s.score.stage_summary.total_in_bed_time_milli / 3600000, unit: 'hours', timestamp: s.start, provider: 'whoop' },
            { category: 'sleep', metric: 'efficiency', value: s.score.sleep_efficiency_percentage, unit: '%', timestamp: s.start, provider: 'whoop' },
            { category: 'sleep', metric: 'deep_sleep', value: s.score.stage_summary.total_slow_wave_sleep_time_milli / 3600000, unit: 'hours', timestamp: s.start, provider: 'whoop' },
            { category: 'sleep', metric: 'rem_sleep', value: s.score.stage_summary.total_rem_sleep_time_milli / 3600000, unit: 'hours', timestamp: s.start, provider: 'whoop' },
          );
        });
        break;
      }
      case 'oura': {
        const [sleep, readiness] = await Promise.all([
          this.oura.getSleep(startDate, endDate),
          this.oura.getReadiness(startDate, endDate),
        ]);
        sleep.forEach(s => {
          points.push(
            { category: 'sleep', metric: 'duration', value: s.total_sleep_duration / 3600, unit: 'hours', timestamp: s.bedtime_start, provider: 'oura' },
            { category: 'sleep', metric: 'efficiency', value: s.efficiency, unit: '%', timestamp: s.bedtime_start, provider: 'oura' },
            { category: 'recovery', metric: 'hrv', value: s.average_hrv, unit: 'ms', timestamp: s.bedtime_start, provider: 'oura' },
            { category: 'body', metric: 'temperature_delta', value: s.temperature_delta, unit: '°C', timestamp: s.bedtime_start, provider: 'oura' },
          );
        });
        readiness.forEach(r => {
          points.push(
            { category: 'recovery', metric: 'readiness_score', value: r.score, unit: 'score', timestamp: now, provider: 'oura' },
          );
        });
        break;
      }
      case 'apple_health':
      case 'garmin': {
        // These go through Terra
        const terraData = await this.terra.getDaily('user', startDate, endDate);
        terraData.forEach(d => {
          points.push(
            { category: 'activity', metric: 'steps', value: d.steps, unit: 'steps', timestamp: `${d.date}T12:00:00Z`, provider },
            { category: 'heart', metric: 'resting_hr', value: d.resting_hr, unit: 'bpm', timestamp: `${d.date}T12:00:00Z`, provider },
            { category: 'recovery', metric: 'hrv', value: d.avg_hrv, unit: 'ms', timestamp: `${d.date}T12:00:00Z`, provider },
          );
          if (d.recovery_score) {
            points.push({ category: 'recovery', metric: 'recovery_score', value: d.recovery_score, unit: '%', timestamp: `${d.date}T12:00:00Z`, provider });
          }
        });
        break;
      }
      default:
        break;
    }

    return points;
  }

  async syncAllProviders(connectedProviders: HealthProvider[], startDate: string, endDate: string): Promise<HealthDataPoint[]> {
    const results = await Promise.allSettled(
      connectedProviders.map(p => this.syncProvider(p, startDate, endDate))
    );
    return results
      .filter((r): r is PromiseFulfilledResult<HealthDataPoint[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);
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
    };
  }
}
