import { ScheduledTask } from 'node-cron';
import { CRON, TASK } from '../keys';
import { ClassSchedule } from '../../scheduler/types';
import { CronMetadata } from '../interfaces/schedule-metadata';

export function getCronMetadata(
  schedule: Record<string, any>,
  propertyValue?: string,
): CronMetadata | undefined {
  return Reflect.getMetadata(CRON, schedule, propertyValue);
}

export function saveTask(
  Schedule: ClassSchedule,
  propertyKey: string,
  task: ScheduledTask,
) {
  Reflect.defineMetadata(TASK, task, Schedule.prototype, propertyKey);
}

export function getTask(
  Schedule: ClassSchedule,
  propertyKey: string,
): ScheduledTask | undefined {
  return Reflect.getMetadata(TASK, Schedule.prototype, propertyKey);
}
