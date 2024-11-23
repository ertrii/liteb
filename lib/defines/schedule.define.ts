import cron from 'node-cron';
import { Task } from '../templates/task';

export const SCHEDULE = Symbol('__schedule__');

export interface ScheduleMetadata {
  expression: string;
  options: cron.ScheduleOptions;
}

//
// ===========================================
// PARAMS
// ===========================================
//

export function defineSchedule(
  target: new () => Task,
  metadata: ScheduleMetadata,
) {
  Reflect.defineMetadata(SCHEDULE, metadata, target);
}

export function getSchedule(
  target: new () => Task,
): ScheduleMetadata | undefined {
  return Reflect.getMetadata(SCHEDULE, target);
}
