import { defineSchedule } from '../defines/schedule.define';
import cron from 'node-cron';
import { Task } from '../templates/task';

export function Schedule(expression: string, options?: cron.ScheduleOptions) {
  return function (target: new () => Task) {
    defineSchedule(target, {
      expression,
      options,
    });
  };
}
