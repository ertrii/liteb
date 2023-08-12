import { ScheduleMetadata } from '../metadata/interfaces/schedule-metadata';
import { saveTask } from '../metadata/services/schedule';
import cron from 'node-cron';

export default function scheduler(scheduleMetadata: ScheduleMetadata) {
  scheduleMetadata.methods.forEach((method) => {
    const task = cron.schedule(
      method.metadata.cron.expression,
      method.func,
      method.metadata.cron.options,
    );

    saveTask(scheduleMetadata.Schedule, method.name, task);
  });
}
