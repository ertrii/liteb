import cron from 'node-cron';
import { Task } from '../templates/task';

export const SCHEDULE = Symbol('__schedule__');

export interface ScheduleMetadata {
  expression: string;
  options: cron.ScheduleOptions;
}

export function Schedule(
  expression: string,
  options: cron.ScheduleOptions = {},
) {
  return function (target: new () => Task) {
    Reflect.defineMetadata(
      SCHEDULE,
      { expression, options } as ScheduleMetadata,
      target,
    );
  };
}
