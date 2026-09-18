import { Cron, CRON, CronMetadata } from './cron.decorator';

/**
 * `@Schedule` described the effect; `@Cron` describes what it takes, which is
 * a cron expression. Kept working while applications move to {@link Cron}, and
 * goes away in 2.0 final.
 */

/** @deprecated Renamed to `CRON`. */
export const SCHEDULE = CRON;

/** @deprecated Renamed to {@link CronMetadata}. */
export type ScheduleMetadata = CronMetadata;

/** @deprecated Renamed to {@link Cron}. */
export const Schedule = Cron;
