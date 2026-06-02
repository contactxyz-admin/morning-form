/**
 * Deferred direct Garmin client stub.
 *
 * Live Garmin support is routed through Terra. Do not import this from
 * production routes or sync paths; it remains only as a reminder that a future
 * direct-Garmin implementation would need its own partner approval, OAuth
 * lifecycle, and API parser work.
 */

export interface GarminSleep {
  summaryId: string;
  calendarDate: string;
  durationInSeconds: number;
  deepSleepSeconds: number;
  lightSleepSeconds: number;
  remSleepSeconds: number;
  awakeSleepSeconds: number;
  averageHR: number;
  lowestHR: number;
  averageHRV: number;
}

export interface GarminActivity {
  activityId: number;
  activityName: string;
  startTimeGMT: string;
  duration: number;
  averageHR: number;
  maxHR: number;
  calories: number;
  steps: number;
}

export class GarminClient {
  private consumerKey: string;
  private consumerSecret: string;

  constructor(consumerKey?: string, consumerSecret?: string) {
    this.consumerKey = consumerKey || process.env.GARMIN_CONSUMER_KEY || '';
    this.consumerSecret = consumerSecret || process.env.GARMIN_CONSUMER_SECRET || '';
  }

  getAuthUrl(callbackUrl: string): string {
    return `https://connect.garmin.com/oauthConfirm?oauth_callback=${encodeURIComponent(callbackUrl)}`;
  }

  async getSleep(startDate: string, endDate: string): Promise<GarminSleep[]> {
    return [{
      summaryId: 'garmin_sleep_1', calendarDate: startDate, durationInSeconds: 27000,
      deepSleepSeconds: 5400, lightSleepSeconds: 13200, remSleepSeconds: 5400, awakeSleepSeconds: 3000,
      averageHR: 54, lowestHR: 46, averageHRV: 62,
    }];
  }

  async getActivities(startDate: string, endDate: string): Promise<GarminActivity[]> {
    return [{
      activityId: 1, activityName: 'Running', startTimeGMT: `${startDate}T07:00:00Z`,
      duration: 3600, averageHR: 142, maxHR: 172, calories: 580, steps: 7200,
    }];
  }
}
