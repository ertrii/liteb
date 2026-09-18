import cron from 'node-cron';
import { Routine } from '../templates/routine';

/**
 * When a {@link Routine} runs.
 *
 * The argument IS a cron expression, so the decorator says so. Five fields
 * (`minute hour day month weekday`) or six with seconds first.
 *
 * `timezone` is worth setting on purpose: without it the expression is read in
 * the timezone of whatever machine the process ended up on, which is how a
 * "7am" routine ends up running at 2am on a server abroad.
 *
 * @example
 * \@Cron('0 7 * * *', { timezone: 'America/Lima' })
 * export default class DailySummary extends Routine { ... }
 */
export const CRON = Symbol('__cron__');

export interface CronMetadata {
  expression: string;
  options: cron.ScheduleOptions;
}

export function Cron(expression: string, options: cron.ScheduleOptions = {}) {
  return function (target: new () => Routine) {
    Reflect.defineMetadata(
      CRON,
      { expression, options } as CronMetadata,
      target,
    );
  };
}
